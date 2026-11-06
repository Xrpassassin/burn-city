'use strict';
const {
  DEFAULT_TERRAIN_SEED: DEFAULT_SEED, TERRAIN_ELEVATION_SCALE,
  valueNoise2D, terrainHeight, terrainElevation
} = require('../client/arena/homefront-terrain-generation.mjs');

// A spawn/placement point must be finite, inside the world, and connected to a small
// walkable footprint around its center. This is terrain grounding, not prop collision.
function isSafePosition(x, z, { bounds = 100, clearance = 1.5, maxRisePer2Units = 0.65, seed = DEFAULT_SEED } = {}) {
  if (![x, z, bounds, clearance, maxRisePer2Units, seed].every(Number.isFinite)
      || bounds <= 0 || clearance <= 0 || maxRisePer2Units <= 0) {
    throw new TypeError('isSafePosition expects finite coordinates and positive limits');
  }
  if (Math.abs(x) > bounds || Math.abs(z) > bounds || Math.hypot(x, z) > bounds) return false;
  if (!Number.isFinite(terrainElevation(x, z, seed))) return false;
  const offsets = [[clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance],
    [clearance * 0.7071, clearance * 0.7071], [-clearance * 0.7071, clearance * 0.7071],
    [clearance * 0.7071, -clearance * 0.7071], [-clearance * 0.7071, -clearance * 0.7071]];
  return offsets.every(([dx, dz]) => {
    const nx = x + dx, nz = z + dz;
    return Math.abs(nx) <= bounds && Math.abs(nz) <= bounds && Math.hypot(nx, nz) <= bounds
      && canTraverse(x, z, nx, nz, { maxRisePer2Units, seed });
  });
}
// Sample the proposed traversed segment. The threshold is intentionally permissive for the
// first gentle hills, but prevents future steeper terrain from silently becoming walkable.
function canTraverse(x0, z0, x1, z1, { maxRisePer2Units = 0.65, seed = DEFAULT_SEED } = {}) {
  if (![x0, z0, x1, z1, maxRisePer2Units, seed].every(Number.isFinite) || maxRisePer2Units <= 0) throw new TypeError('canTraverse expects finite coordinates and a positive rise limit');
  const distance = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(distance / 2));
  let previous = terrainElevation(x0, z0, seed);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const current = terrainElevation(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, seed);
    if (Math.abs(current - previous) > maxRisePer2Units) return false;
    previous = current;
  }
  return true;
}

function findTerrainPath(startX, startZ, goalX, goalZ, {
  seed = DEFAULT_SEED, spacing = 4, maxExpanded = 1800, bounds = 100,
  maxRisePer2Units = 0.65, heightAt = (x, z) => terrainElevation(x, z, seed),
  edgeAllowed = () => true
} = {}) {
  if (![startX, startZ, goalX, goalZ, seed, spacing, maxExpanded, bounds, maxRisePer2Units].every(Number.isFinite)
      || spacing <= 0 || maxExpanded < 1 || bounds <= 0 || maxRisePer2Units <= 0
      || typeof heightAt !== 'function' || typeof edgeAllowed !== 'function') throw new TypeError('findTerrainPath expects finite coordinates and valid search options');
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  startX = clamp(startX, -bounds, bounds); startZ = clamp(startZ, -bounds, bounds);
  goalX = clamp(goalX, -bounds, bounds); goalZ = clamp(goalZ, -bounds, bounds);
  const key = (ix, iz) => ix + ',' + iz;
  const coord = i => clamp(i * spacing, -bounds, bounds);
  const toIndex = n => Math.round(n / spacing);
  const canEdge = (x0, z0, x1, z1) => {
    const distance = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(distance / 2));
    let previous = heightAt(x0, z0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, current = heightAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (!Number.isFinite(current) || Math.abs(current - previous) > maxRisePer2Units) return false;
      previous = current;
    }
    return true;
  };
  if (Math.hypot(goalX - startX, goalZ - startZ) < 0.01) return [];
  const edgeIsAllowed = (x0, z0, x1, z1) => canEdge(x0, z0, x1, z1) && edgeAllowed(x0, z0, x1, z1);
  if (edgeIsAllowed(startX, startZ, goalX, goalZ)) return [{ x: goalX, z: goalZ }];
  const sx = toIndex(startX), sz = toIndex(startZ), gx = toIndex(goalX), gz = toIndex(goalZ);
  const worldSteps = Math.ceil(bounds / spacing);
  const heuristic = (ix, iz) => Math.hypot(coord(ix) - goalX, coord(iz) - goalZ);
  // Binary min-heap avoids sorting the entire frontier on every expansion.
  const heap = [];
  const push = item => {
    heap.push(item); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= item.f) break; heap[i] = heap[p]; i = p; }
    heap[i] = item;
  };
  const pop = () => {
    const root = heap[0], tail = heap.pop();
    if (heap.length) {
      let i = 0;
      while (true) { let child = i * 2 + 1; if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
        if (heap[child].f >= tail.f) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = tail;
    }
    return root;
  };
  const gScore = new Map(), parent = new Map(), closed = new Set();
  // Seed from nearby cells that are reachable from the exact, potentially off-grid start.
  for (let ix = Math.max(-worldSteps, sx - 1); ix <= Math.min(worldSteps, sx + 1); ix++) {
    for (let iz = Math.max(-worldSteps, sz - 1); iz <= Math.min(worldSteps, sz + 1); iz++) {
      const x = coord(ix), z = coord(iz), k = key(ix, iz);
      if (edgeIsAllowed(startX, startZ, x, z)) { gScore.set(k, Math.hypot(x - startX, z - startZ)); parent.set(k, null); push({ ix, iz, f: gScore.get(k) + heuristic(ix, iz) }); }
    }
  }
  if (!heap.length) return null;
  const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  let expanded = 0, reached = null;
  while (heap.length && expanded < maxExpanded) {
    const current = pop(), ck = key(current.ix, current.iz);
    if (closed.has(ck)) continue;
    closed.add(ck); expanded++;
    const cx = coord(current.ix), cz = coord(current.iz);
    // Only attach the exact goal from its neighboring grid cells; never shortcut across the search grid.
    if (Math.abs(current.ix - gx) <= 1 && Math.abs(current.iz - gz) <= 1 && edgeIsAllowed(cx, cz, goalX, goalZ)) { reached = ck; break; }
    for (const [dx, dz] of neighbors) {
      const ix = current.ix + dx, iz = current.iz + dz;
      if (Math.abs(ix * spacing) > bounds + spacing || Math.abs(iz * spacing) > bounds + spacing) continue;
      const x = coord(ix), z = coord(iz), nk = key(ix, iz);
      if (closed.has(nk) || !edgeIsAllowed(cx, cz, x, z)) continue;
      const tentative = gScore.get(ck) + Math.hypot(x - cx, z - cz);
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, tentative); parent.set(nk, ck);
      push({ ix, iz, f: tentative + heuristic(ix, iz) });
    }
  }
  if (reached === null) return null;
  const route = [];
  let cursor = reached;
  while (cursor !== null) {
    const [ix, iz] = cursor.split(',').map(Number);
    route.push({ x: coord(ix), z: coord(iz) });
    cursor = parent.get(cursor) ?? null;
  }
  route.reverse();
  // Avoid a redundant waypoint at the start; always end at the exact requested destination.
  while (route.length && Math.hypot(route[0].x - startX, route[0].z - startZ) < 0.01) route.shift();
  if (!route.length || Math.hypot(route[route.length - 1].x - goalX, route[route.length - 1].z - goalZ) > 0.01) route.push({ x: goalX, z: goalZ });
  return route;
}

module.exports = { DEFAULT_SEED, TERRAIN_ELEVATION_SCALE, valueNoise2D, terrainHeight, terrainElevation, canTraverse, isSafePosition, findTerrainPath };
