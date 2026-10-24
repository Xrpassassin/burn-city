'use strict';
// Deterministic server-side occupancy mirror for Homefront's Graveyard scene.
// Keep generation constants aligned with client/arena/homefront-graveyard-3d.js.
const Terrain = require('./homefront-terrain');
const InteriorRules = require('./homefront-interiors');
const InteriorCatalog = require('../client/arena/homefront-interior-world.mjs');
const WORLD_SIZE = 100;
const PLAYER_RADIUS = 0.55;
const ENVIRONMENT_SEED = 8675309;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const hash01 = (x, z, seed) => {
  let h = (Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
function biomeAt(x, z) {
  const moisture = (Terrain.valueNoise2D(x + 613, z - 271, 96, Terrain.DEFAULT_SEED ^ 0x4f1bbcdc) + 1) / 2;
  const heat = (Terrain.valueNoise2D(x - 81, z + 443, 150, Terrain.DEFAULT_SEED ^ 0x7f4a7c15) + 1) / 2;
  const urban = (Terrain.valueNoise2D(x + 1000, z + 1000, 42, Terrain.DEFAULT_SEED ^ 0x3c6ef372) + 1) / 2;
  if (moisture > 0.79 && heat < 0.58) return 'marsh';
  if (moisture > 0.56 && heat > 0.34) return 'deadwood';
  if (urban > 0.53) return 'urban-rubble';
  return 'ashland';
}
function buildObstacles() {
  const out = [];
  // Procedural buildings use the same LCG and grid traversal as the visible scene.
  let seed = ENVIRONMENT_SEED;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let x = -90; x <= 90; x += 10) for (let z = -90; z <= 90; z += 10) {
    if (rand() < 0.27 || Math.abs(x % 20) < 5 || Math.abs(z % 20) < 5) continue;
    const bx = x + (rand() - 0.5) * 2.2, bz = z + (rand() - 0.5) * 2.2;
    if (Math.hypot(bx, bz) < 13) continue;
    const w = 3.4 + rand() * 3.4, d = 3.4 + rand() * 3.4;
    rand(); // height
    rand(); // building material
    const rotation = (rand() - 0.5) * 0.16;
    out.push({ id: 'building:' + x + ',' + z, type: 'rect', x: bx, z: bz,
      halfX: Math.abs(Math.cos(rotation)) * w / 2 + Math.abs(Math.sin(rotation)) * d / 2 + 0.25,
      halfZ: Math.abs(Math.sin(rotation)) * w / 2 + Math.abs(Math.cos(rotation)) * d / 2 + 0.25 });
    if (rand() > 0.45) { rand(); rand(); } // roof cap dimensions/offsets, visual only
    if (rand() > 0.7) rand(); // ember prop
  }
  // Procedural environmental props share the client's 8-unit cells, seed and density.
  const chunkSize = 64, cells = 8, density = 0.18;
  for (let cz = -2; cz <= 1; cz++) for (let cx = -2; cx <= 1; cx++) {
    for (let gz = 0; gz < cells; gz++) for (let gx = 0; gx < cells; gx++) {
      const wx = cx * cells + gx, wz = cz * cells + gz;
      if (hash01(wx, wz, Terrain.DEFAULT_SEED ^ 0x12a4f3) > density) continue;
      const x = cx * chunkSize + (gx + 0.2 + hash01(wx, wz, Terrain.DEFAULT_SEED ^ 0x67ab91) * 0.6) * chunkSize / cells;
      const z = cz * chunkSize + (gz + 0.2 + hash01(wx, wz, Terrain.DEFAULT_SEED ^ 0x9981de) * 0.6) * chunkSize / cells;
      const biome = biomeAt(x, z), roll = hash01(wx, wz, Terrain.DEFAULT_SEED ^ 0x9e3779b9);
      const type = biome === 'marsh' ? (roll < 0.55 ? 'dead_reed' : 'standing_water') :
        biome === 'deadwood' ? (roll < 0.62 ? 'dead_tree' : 'fallen_log') :
        biome === 'urban-rubble' ? (roll < 0.68 ? 'rubble' : 'abandoned_vehicle') :
        (roll < 0.58 ? 'burnt_shrub' : 'stone_debris');
      if (type === 'standing_water') out.push({ id: 'water:' + wx + ',' + wz, type: 'circle', x, z, radius: 1.55 });
      else if (type === 'dead_tree') out.push({ id: 'tree:' + wx + ',' + wz, type: 'circle', x, z, radius: 0.72 });
      else if (type === 'fallen_log') out.push({ id: 'log:' + wx + ',' + wz, type: 'circle', x, z, radius: 0.9 });
      else if (type === 'abandoned_vehicle') out.push({ id: 'vehicle:' + wx + ',' + wz, type: 'rect', x, z, halfX: 1.65, halfZ: 2.25 });
      else if (type === 'rubble' || type === 'stone_debris') out.push({ id: 'debris:' + wx + ',' + wz, type: 'circle', x, z, radius: 0.62 });
    }
  }
  // Loot/rescue marker props have solid crates or shelter bodies at their authoritative POI coordinates.
  const poiProps = [
    { id: 'cache_exchange', x: -32, z: 24, type: 'rect', halfX: 1.15, halfZ: 0.95 },
    { id: 'cache_hospital', x: 19, z: 25, type: 'rect', halfX: 1.15, halfZ: 0.95 },
    { id: 'cache_ironworks', x: -12, z: 18, type: 'rect', halfX: 1.15, halfZ: 0.95 },
    { id: 'stranded_bus', x: 35, z: -42, type: 'rect', halfX: 1.75, halfZ: 1.5 },
    { id: 'collapsed_apartments', x: -22, z: 48, type: 'rect', halfX: 1.75, halfZ: 1.5 },
    { id: 'quarantine_shelter', x: 36, z: 38, type: 'rect', halfX: 1.75, halfZ: 1.5 }
  ];
  out.push(...poiProps.map(p => ({ ...p, halfX: p.halfX + 0.25, halfZ: p.halfZ + 0.25 })));
  // Interior room walls share the authored client floorplan. These obstacles are activated only
  // for the account currently inside that building; closed doors have removable blockers.
  for (const interior of InteriorCatalog.INTERIORS) {
    const landmark = InteriorRules.LANDMARKS[interior.landmarkId];
    if (!landmark) continue;
    for (const room of interior.rooms) {
      for (const side of ['north','south','east','west']) {
        const alongX = side === 'north' || side === 'south';
        const length = alongX ? room.width : room.depth;
        const wallThickness = 0.16, wallHalfHeight = 1.225;
        const fixedX = landmark.x + room.x + (side === 'west' ? -room.width / 2 : side === 'east' ? room.width / 2 : 0);
        const fixedZ = landmark.z + room.z + (side === 'north' ? -room.depth / 2 : side === 'south' ? room.depth / 2 : 0);
        const exit = room.exits.find(item => item.side === side);
        const isExteriorEntry = room.id === interior.entryRoom && side === 'south';
        const hasOpening = !!exit || isExteriorEntry;
        const addWall = (segmentIndex, offset, segmentLength) => {
          const centerX = landmark.x + room.x + (alongX ? offset : (side === 'west' ? -room.width / 2 : room.width / 2));
          const centerZ = landmark.z + room.z + (alongX ? (side === 'north' ? -room.depth / 2 : room.depth / 2) : offset);
          out.push({ id: 'interior-wall:' + interior.landmarkId + ':' + room.id + ':' + side + ':' + segmentIndex,
            type: 'rect', x: centerX, z: centerZ,
            halfX: alongX ? segmentLength / 2 : wallThickness / 2,
            halfZ: alongX ? wallThickness / 2 : segmentLength / 2 });
        };
        if (hasOpening) {
          const gapWidth = 1.8, segment = (length - gapWidth) / 2;
          addWall(0, -(gapWidth + segment) / 2, segment);
          addWall(1, (gapWidth + segment) / 2, segment);
          if (exit) {
            out.push({ id: 'interior-door:' + interior.landmarkId + ':' + exit.id + ':' + room.id,
              type: 'rect', x: alongX ? landmark.x + room.x : fixedX,
              z: alongX ? fixedZ : landmark.z + room.z,
              halfX: alongX ? gapWidth / 2 : 0.22, halfZ: alongX ? 0.22 : gapWidth / 2 });
          }
        } else addWall(0, 0, length);
      }
    }
  }
  return out;
}
const OBSTACLES = buildObstacles();
const INTERIOR_OBSTACLE_IDS = OBSTACLES.filter(o => o.id.startsWith('interior-wall:') || o.id.startsWith('interior-door:')).map(o => o.id);
// Uniform spatial hash over the static obstacle catalog. Each obstacle is filed in every cell its
// footprint (+ GRID_MARGIN) touches, so a query with radius <= GRID_MARGIN only needs its own cell;
// larger radii fall back to the full scan. Results are identical to the brute-force loop.
const GRID_CELL = 6, GRID_MARGIN = 1.5, EMPTY = Object.freeze([]);
const GRID = new Map();
for (const o of OBSTACLES) {
  const hx = (o.type === 'rect' ? o.halfX : o.radius) + GRID_MARGIN, hz = (o.type === 'rect' ? o.halfZ : o.radius) + GRID_MARGIN;
  for (let cx = Math.floor((o.x - hx) / GRID_CELL); cx <= Math.floor((o.x + hx) / GRID_CELL); cx++)
    for (let cz = Math.floor((o.z - hz) / GRID_CELL); cz <= Math.floor((o.z + hz) / GRID_CELL); cz++) {
      const k = cx + ',' + cz; let cell = GRID.get(k); if (!cell) GRID.set(k, cell = []); cell.push(o);
    }
}
function candidatesAt(x, z, radius) {
  return radius <= GRID_MARGIN ? (GRID.get(Math.floor(x / GRID_CELL) + ',' + Math.floor(z / GRID_CELL)) || EMPTY) : OBSTACLES;
}
function pointBlocked(x, z, radius = PLAYER_RADIUS, removedObstacleIds = []) {
  for (const o of candidatesAt(x, z, radius)) {
    if (removedObstacleIds.includes(o.id)) continue;
    if (Math.abs(x - o.x) > (o.type === 'rect' ? o.halfX + radius : o.radius + radius) ||
        Math.abs(z - o.z) > (o.type === 'rect' ? o.halfZ + radius : o.radius + radius)) continue;
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.radius + radius) return o;
    } else if (Math.abs(x - o.x) < o.halfX + radius && Math.abs(z - o.z) < o.halfZ + radius) return o;
  }
  return null;
}
function canTraverse(x0, z0, x1, z1, { radius = PLAYER_RADIUS, bounds = WORLD_SIZE, sampleStep = 0.75, removedObstacleIds = [] } = {}) {
  if (![x0,z0,x1,z1,radius,bounds,sampleStep].every(Number.isFinite) || radius < 0 || bounds <= 0 || sampleStep <= 0) {
    throw new TypeError('canTraverse expects finite coordinates and valid collision options');
  }
  const distance = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(distance / sampleStep));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (Math.abs(x) > bounds || Math.abs(z) > bounds || Math.hypot(x, z) > bounds || pointBlocked(x, z, radius, removedObstacleIds)) return false;
  }
  return true;
}
function isSafePosition(x, z, options = {}) {
  const bounds = Number.isFinite(options.bounds) ? options.bounds : WORLD_SIZE;
  return Terrain.isSafePosition(x, z, options) && !pointBlocked(x, z, options.radius ?? PLAYER_RADIUS, options.removedObstacleIds ?? []) &&
    canTraverse(x, z, x, z, { bounds, radius: options.radius ?? PLAYER_RADIUS, removedObstacleIds: options.removedObstacleIds ?? [] });
}
function findPath(startX, startZ, goalX, goalZ, options = {}) {
  return Terrain.findTerrainPath(startX, startZ, goalX, goalZ, {
    ...options, edgeAllowed: (x0, z0, x1, z1) => canTraverse(x0, z0, x1, z1, { bounds: options.bounds ?? WORLD_SIZE, radius: options.radius ?? PLAYER_RADIUS, removedObstacleIds: options.removedObstacleIds ?? [] })
  });
}
function findSafePosition(x, z, { bounds = WORLD_SIZE, maxRadius = 18, step = 2 } = {}) {
  const candidates = [{ x, z }];
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let offset = -radius; offset <= radius; offset += step) {
      candidates.push({ x: x + offset, z: z - radius }, { x: x + offset, z: z + radius });
      if (Math.abs(offset) < radius) candidates.push({ x: x - radius, z: z + offset }, { x: x + radius, z: z + offset });
    }
  }
  for (const p of candidates) {
    const px = clamp(p.x, -bounds, bounds), pz = clamp(p.z, -bounds, bounds);
    if (isSafePosition(px, pz, { bounds })) return { x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10 };
  }
  return null;
}
module.exports = { WORLD_SIZE, PLAYER_RADIUS, OBSTACLES, INTERIOR_OBSTACLE_IDS, GRID_CELL, GRID_MARGIN, pointBlocked, canTraverse, isSafePosition, findPath, findSafePosition };
