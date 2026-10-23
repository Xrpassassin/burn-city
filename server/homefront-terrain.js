'use strict';
// Server-side mirror of client/arena/homefront-terrain-generation.mjs.
// Keep the sampling constants and integer hash operations in lockstep; parity is tested.
const DEFAULT_SEED = 0xB17C17;
const UINT32_RANGE = 4294967296;
const TERRAIN_ELEVATION_SCALE = 0.42;
function hashLattice(x, z, seed) {
  let h = (Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / UINT32_RANGE;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
function valueNoise2D(x, z, scale = 32, seed = DEFAULT_SEED) {
  if (![x, z, scale, seed].every(Number.isFinite) || scale <= 0) throw new TypeError('valueNoise2D expects finite coordinates/seed and a positive scale');
  const gx = x / scale, gz = z / scale;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const tx = smooth(gx - x0), tz = smooth(gz - z0);
  const a = hashLattice(x0, z0, seed), b = hashLattice(x0 + 1, z0, seed);
  const c = hashLattice(x0, z0 + 1, seed), d = hashLattice(x0 + 1, z0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz) * 2 - 1;
}
function terrainHeight(x, z, seed = DEFAULT_SEED) {
  if (![x, z, seed].every(Number.isFinite)) throw new TypeError('terrainHeight expects finite coordinates and seed');
  const broad = valueNoise2D(x, z, 48, seed) * 1.15;
  const detail = valueNoise2D(x, z, 13, seed ^ 0x6d2b79f5) * 0.42;
  const ridge = Math.max(0, valueNoise2D(x + 173.4, z - 91.7, 72, seed ^ 0x45d9f3b) - 0.2) * 0.35;
  // Match the client terrain's road-grid flattening exactly.
  const roadDistance = value => Math.abs((((value - 10) % 20) + 30) % 20 - 10);
  const roadBlend = value => { const t = Math.max(0, Math.min(1, roadDistance(value) / 4.5)); return t * t * (3 - 2 * t); };
  const roadFactor = Math.min(roadBlend(x), roadBlend(z));
  return Math.round((broad + detail + ridge) * roadFactor * 1000) / 1000;
}
function terrainElevation(x, z, seed = DEFAULT_SEED) { return terrainHeight(x, z, seed) * TERRAIN_ELEVATION_SCALE; }
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
module.exports = { DEFAULT_SEED, TERRAIN_ELEVATION_SCALE, valueNoise2D, terrainHeight, terrainElevation, canTraverse };
