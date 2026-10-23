// Deterministic, coordinate-based terrain sampling for Homefront.
// Pure math only: safe to share between client generation and future server validation.
// Keep terrain subtle until authoritative movement and collision consume the same height function.
const DEFAULT_SEED = 0xB17C17;
const UINT32_RANGE = 4294967296;
export const TERRAIN_ELEVATION_SCALE = 0.42;

function hashLattice(x, z, seed) {
  let h = (Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / UINT32_RANGE;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth value noise sampled in world coordinates, independent of chunk load order. */
export function valueNoise2D(x, z, scale = 32, seed = DEFAULT_SEED) {
  if (![x, z, scale, seed].every(Number.isFinite) || scale <= 0) {
    throw new TypeError('valueNoise2D expects finite coordinates/seed and a positive scale');
  }
  const gx = x / scale;
  const gz = z / scale;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const tx = smooth(gx - x0), tz = smooth(gz - z0);
  const a = hashLattice(x0, z0, seed);
  const b = hashLattice(x0 + 1, z0, seed);
  const c = hashLattice(x0, z0 + 1, seed);
  const d = hashLattice(x0 + 1, z0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz) * 2 - 1;
}

/**
 * Conservative first-pass height profile in world units. Output is intentionally
 * shallow (roughly -1.8..1.8) so existing structures remain readable while
 * server movement/collision are still planar.
 */
export function terrainHeight(x, z, seed = DEFAULT_SEED) {
  if (![x, z, seed].every(Number.isFinite)) {
    throw new TypeError('terrainHeight expects finite coordinates and seed');
  }
  const broad = valueNoise2D(x, z, 48, seed) * 1.15;
  const detail = valueNoise2D(x, z, 13, seed ^ 0x6d2b79f5) * 0.42;
  const ridge = Math.max(0, valueNoise2D(x + 173.4, z - 91.7, 72, seed ^ 0x45d9f3b) - 0.2) * 0.35;
  // The authored road grid is spaced every 20 units, centered at 10 + 20n.
  // Blend terrain to zero at road centers so the road mesh and ground cannot disagree.
  const roadDistance = value => Math.abs((((value - 10) % 20) + 30) % 20 - 10);
  const roadBlend = value => { const t = Math.max(0, Math.min(1, roadDistance(value) / 4.5)); return t * t * (3 - 2 * t); };
  const roadFactor = Math.min(roadBlend(x), roadBlend(z));
  const height = Math.round((broad + detail + ridge) * roadFactor * 1000) / 1000;
  return height === 0 ? 0 : height;
}

/** Stable chunk sample descriptor; neighboring chunks share the same world-space edge samples. */
export function terrainChunkSamples(cx, cz, { chunkSize = 64, segments = 16, seed = DEFAULT_SEED } = {}) {
  if (![cx, cz, chunkSize, segments, seed].every(Number.isFinite) || chunkSize <= 0 || !Number.isInteger(segments) || segments < 1) {
    throw new TypeError('terrainChunkSamples expects finite chunk coordinates, positive size and integer segments');
  }
  const samples = [];
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      const worldX = cx * chunkSize + (x / segments) * chunkSize;
      const worldZ = cz * chunkSize + (z / segments) * chunkSize;
      samples.push({ x: worldX, z: worldZ, y: terrainHeight(worldX, worldZ, seed) });
    }
  }
  return samples;
}

export function terrainElevation(x, z, seed = DEFAULT_SEED) {
  return terrainHeight(x, z, seed) * TERRAIN_ELEVATION_SCALE;
}

export const DEFAULT_TERRAIN_SEED = DEFAULT_SEED;
