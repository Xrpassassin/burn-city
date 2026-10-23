import { DEFAULT_TERRAIN_SEED, terrainHeight, valueNoise2D } from './homefront-terrain-generation.mjs';
import { CHUNK_SIZE } from './homefront-world-streaming.mjs';

const BIOMES = Object.freeze([
  { id: 'ashland', label: 'Ashland', ground: 0x4b4b42, vegetation: 0x55594a, moisture: 0.25 },
  { id: 'deadwood', label: 'Deadwood', ground: 0x343b30, vegetation: 0x303d2b, moisture: 0.72 },
  { id: 'urban-rubble', label: 'Urban Rubble', ground: 0x494743, vegetation: 0x4d5145, moisture: 0.4 },
  { id: 'marsh', label: 'Marsh', ground: 0x333d37, vegetation: 0x4a5943, moisture: 0.95 }
]);

function hash01(x, z, seed) {
  let h = (Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function biomeAt(x, z, seed = DEFAULT_TERRAIN_SEED) {
  if (![x, z, seed].every(Number.isFinite)) throw new TypeError('biomeAt expects finite coordinates and seed');
  const moisture = (valueNoise2D(x + 613, z - 271, 96, seed ^ 0x4f1bbcdc) + 1) / 2;
  const heat = (valueNoise2D(x - 81, z + 443, 150, seed ^ 0x7f4a7c15) + 1) / 2;
  const urban = (valueNoise2D(x + 1000, z + 1000, 42, seed ^ 0x3c6ef372) + 1) / 2;
  let biome;
  if (moisture > 0.79 && heat < 0.58) biome = BIOMES[3];
  else if (moisture > 0.56 && heat > 0.34) biome = BIOMES[1];
  else if (urban > 0.53) biome = BIOMES[2];
  else biome = BIOMES[0];
  return { id: biome.id, label: biome.label, ground: biome.ground, vegetation: biome.vegetation, moisture: Math.round(moisture * 100) / 100, heat: Math.round(heat * 100) / 100, urban: Math.round(urban * 100) / 100 };
}

/** Deterministic candidate props. They are visual suggestions, not authoritative loot or collision. */
export function environmentalCandidates(cx, cz, { chunkSize = CHUNK_SIZE, seed = DEFAULT_TERRAIN_SEED, density = 0.22 } = {}) {
  if (![cx, cz, chunkSize, seed, density].every(Number.isFinite) || chunkSize <= 0 || density < 0 || density > 1) {
    throw new TypeError('environmentalCandidates expects finite chunk inputs and density between zero and one');
  }
  const cellSize = 8;
  const cells = Math.max(1, Math.floor(chunkSize / cellSize));
  const candidates = [];
  for (let gz = 0; gz < cells; gz++) for (let gx = 0; gx < cells; gx++) {
    const worldCellX = cx * cells + gx;
    const worldCellZ = cz * cells + gz;
    if (hash01(worldCellX, worldCellZ, seed ^ 0x12a4f3) > density) continue;
    const x = cx * chunkSize + (gx + 0.2 + hash01(worldCellX, worldCellZ, seed ^ 0x67ab91) * 0.6) * chunkSize / cells;
    const z = cz * chunkSize + (gz + 0.2 + hash01(worldCellX, worldCellZ, seed ^ 0x9981de) * 0.6) * chunkSize / cells;
    const biome = biomeAt(x, z, seed);
    const height = terrainHeight(x, z, seed);
    const roll = hash01(worldCellX, worldCellZ, seed ^ 0x9e3779b9);
    const type = biome.id === 'marsh' ? (roll < 0.55 ? 'dead_reed' : 'standing_water') :
      biome.id === 'deadwood' ? (roll < 0.62 ? 'dead_tree' : 'fallen_log') :
      biome.id === 'urban-rubble' ? (roll < 0.68 ? 'rubble' : 'abandoned_vehicle') :
      (roll < 0.58 ? 'burnt_shrub' : 'stone_debris');
    candidates.push({ id: 'env:' + worldCellX + ',' + worldCellZ, type, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, y: height, biome: biome.id });
  }
  return candidates;
}

export function biomeManifest(cx, cz, { chunkSize = CHUNK_SIZE, seed = DEFAULT_TERRAIN_SEED, samples = 5 } = {}) {
  if (!Number.isInteger(samples) || samples < 2) throw new TypeError('biome manifest needs at least two samples per axis');
  const counts = {};
  for (let z = 0; z < samples; z++) for (let x = 0; x < samples; x++) {
    const biome = biomeAt(cx * chunkSize + (x / (samples - 1)) * chunkSize, cz * chunkSize + (z / (samples - 1)) * chunkSize, seed);
    counts[biome.id] = (counts[biome.id] || 0) + 1;
  }
  return { chunkId: cx + ',' + cz, dominantBiome: Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0], counts };
}
