'use strict';
// Deterministic server-side occupancy mirror for Homefront's Graveyard scene.
// Keep generation constants aligned with client/arena/homefront-graveyard-3d.js.
const Terrain = require('./homefront-terrain');
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
  return out;
}
const OBSTACLES = buildObstacles();
function pointBlocked(x, z, radius = PLAYER_RADIUS) {
  for (const o of OBSTACLES) {
    if (Math.abs(x - o.x) > (o.type === 'rect' ? o.halfX + radius : o.radius + radius) ||
        Math.abs(z - o.z) > (o.type === 'rect' ? o.halfZ + radius : o.radius + radius)) continue;
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.radius + radius) return o;
    } else if (Math.abs(x - o.x) < o.halfX + radius && Math.abs(z - o.z) < o.halfZ + radius) return o;
  }
  return null;
}
function canTraverse(x0, z0, x1, z1, { radius = PLAYER_RADIUS, bounds = WORLD_SIZE, sampleStep = 0.75 } = {}) {
  if (![x0,z0,x1,z1,radius,bounds,sampleStep].every(Number.isFinite) || radius < 0 || bounds <= 0 || sampleStep <= 0) {
    throw new TypeError('canTraverse expects finite coordinates and valid collision options');
  }
  const distance = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(distance / sampleStep));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (Math.abs(x) > bounds || Math.abs(z) > bounds || Math.hypot(x, z) > bounds || pointBlocked(x, z, radius)) return false;
  }
  return true;
}
function isSafePosition(x, z, options = {}) {
  const bounds = Number.isFinite(options.bounds) ? options.bounds : WORLD_SIZE;
  return Terrain.isSafePosition(x, z, options) && !pointBlocked(x, z, options.radius ?? PLAYER_RADIUS) &&
    canTraverse(x, z, x, z, { bounds, radius: options.radius ?? PLAYER_RADIUS });
}
function findPath(startX, startZ, goalX, goalZ, options = {}) {
  return Terrain.findTerrainPath(startX, startZ, goalX, goalZ, {
    ...options, edgeAllowed: (x0, z0, x1, z1) => canTraverse(x0, z0, x1, z1, { bounds: options.bounds ?? WORLD_SIZE })
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
module.exports = { WORLD_SIZE, PLAYER_RADIUS, OBSTACLES, pointBlocked, canTraverse, isSafePosition, findPath, findSafePosition };
