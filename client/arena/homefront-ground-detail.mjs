import { terrainElevation } from './homefront-terrain-generation.mjs';
import { biomeAt } from './homefront-world-generation.mjs';

function hash32(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}
function random01(seed, index, lane) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(lane + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Lightweight presentation-only ground dressing. Stable world coordinates let
 * chunks rebuild without popping to a different arrangement after revisits.
 */
export function groundDetailCandidates(cx, cz, { chunkSize = 64, count = 44, seed = 0x51a7 } = {}) {
  if (![cx, cz, chunkSize, count, seed].every(Number.isFinite) || chunkSize <= 0 || count < 0 || count > 256) {
    throw new TypeError('ground detail options are invalid');
  }
  const key = hash32(cx + ',' + cz + ':' + seed);
  const result = [];
  for (let i = 0; i < count; i++) {
    const x = cx * chunkSize + 3 + random01(key, i, 0) * (chunkSize - 6);
    const z = cz * chunkSize + 3 + random01(key, i, 1) * (chunkSize - 6);
    // Keep decorative ground clutter out of the strongest road lanes and spawn clearing.
    if (Math.abs(Math.round(x / 20) * 20 - x) < 3.2 || Math.abs(Math.round(z / 20) * 20 - z) < 3.2) continue;
    if (Math.hypot(x, z) < 14) continue;
    const biome = biomeAt(x, z);
    const kind = biome.id === 'urban-rubble' || random01(key, i, 2) > 0.58 ? 'rock' : 'tuft';
    result.push({
      id: 'micro:' + cx + ',' + cz + ':' + i,
      kind,
      x: Math.round(x * 100) / 100,
      y: terrainElevation(x, z),
      z: Math.round(z * 100) / 100,
      scale: 0.65 + random01(key, i, 3) * 0.9,
      rotation: random01(key, i, 4) * Math.PI * 2,
      tint: biome.id
    });
  }
  return result;
}
