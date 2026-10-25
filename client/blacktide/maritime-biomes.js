// Deterministic Caribbean-style maritime encounter descriptors.
// No geometry allocations or network activity; safe for streaming and mobile LOD.
export const MARITIME_BIOMES = Object.freeze({
  lagoon: Object.freeze({ name: 'Turquoise Lagoon', waterTint: 0x38b8b3, waveScale: 0.35, visibility: 1, hazards: ['sandbar', 'coral_reef'], discoveries: ['hidden_cove', 'pearl_bed'] }),
  coast: Object.freeze({ name: 'Island Coast', waterTint: 0x167f9c, waveScale: 0.65, visibility: 0.95, hazards: ['shoal'], discoveries: ['fishing_ground', 'shipwreck'] }),
  open_sea: Object.freeze({ name: 'Open Sea', waterTint: 0x124a78, waveScale: 1, visibility: 1, hazards: ['squall'], discoveries: ['driftwood', 'merchant_route'] }),
  storm_sea: Object.freeze({ name: 'Storm Waters', waterTint: 0x213b50, waveScale: 1.65, visibility: 0.55, hazards: ['squall', 'rogue_wave'], discoveries: ['wreckage'] })
});
function hash(x, z, seed) {
  let h = (Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ (seed | 0)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function getMaritimeCell(x, z, seed = 20261024, cellSize = 256) {
  if (![x, z, seed, cellSize].every(Number.isFinite) || cellSize <= 0) throw new TypeError('Invalid maritime coordinates');
  const cellX = Math.floor(x / cellSize), cellZ = Math.floor(z / cellSize);
  const island = hash(Math.floor(cellX / 3), Math.floor(cellZ / 3), seed);
  const weather = hash(Math.floor(cellX / 5), Math.floor(cellZ / 5), seed ^ 0x13579bdf);
  const biome = island > 0.8 ? 'lagoon' : island > 0.56 ? 'coast' : weather > 0.87 ? 'storm_sea' : 'open_sea';
  const profile = MARITIME_BIOMES[biome];
  const encounter = hash(cellX, cellZ, seed ^ 0x2468ace);
  const discovery = encounter > 0.8 ? profile.discoveries[Math.floor(hash(cellX, cellZ, seed + 1) * profile.discoveries.length)] : null;
  const hazard = encounter < 0.13 ? profile.hazards[Math.floor(hash(cellX, cellZ, seed + 2) * profile.hazards.length)] : null;
  return { cellX, cellZ, biome, discovery, hazard };
}
export function nearbyMaritimeCells(x, z, radius = 1, seed = 20261024, cellSize = 256) {
  if (!Number.isInteger(radius) || radius < 0 || radius > 3) throw new RangeError('Invalid streaming radius');
  const cells = [];
  const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    cells.push(getMaritimeCell((cx + dx) * cellSize, (cz + dz) * cellSize, seed, cellSize));
  }
  return cells;
}
