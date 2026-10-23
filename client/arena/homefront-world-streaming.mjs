// Deterministic spatial chunk planner for Homefront's browser-rendered world.
// Presentation only: server movement bounds and authoritative positions remain unchanged.
export const CHUNK_SIZE = 64;
export const WORLD_HALF_EXTENT = 100;
export const STREAM_RADIUS = 1;

export function chunkKey(cx, cz) {
  return `homefront:${cx},${cz}`;
}

export function chunkCoords(x, z, chunkSize = CHUNK_SIZE) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new TypeError('chunkCoords expects finite coordinates and a positive chunk size');
  }
  return { x: Math.floor(x / chunkSize), z: Math.floor(z / chunkSize) };
}

export function chunkBounds(cx, cz, chunkSize = CHUNK_SIZE) {
  const minX = cx * chunkSize;
  const minZ = cz * chunkSize;
  return { minX, minZ, maxX: minX + chunkSize, maxZ: minZ + chunkSize, centerX: minX + chunkSize / 2, centerZ: minZ + chunkSize / 2 };
}

export function visibleChunkSet(x, z, radius = STREAM_RADIUS, chunkSize = CHUNK_SIZE) {
  if (!Number.isInteger(radius) || radius < 0) throw new TypeError('chunk radius must be a non-negative integer');
  const center = chunkCoords(x, z, chunkSize);
  const keys = new Set();
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) keys.add(chunkKey(center.x + dx, center.z + dz));
  }
  return keys;
}

export function worldChunkManifest(halfExtent = WORLD_HALF_EXTENT, chunkSize = CHUNK_SIZE) {
  if (!Number.isFinite(halfExtent) || halfExtent <= 0 || !Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new TypeError('world extent and chunk size must be positive');
  }
  const min = Math.floor(-halfExtent / chunkSize);
  const max = Math.floor(halfExtent / chunkSize);
  const chunks = [];
  for (let x = min; x <= max; x++) {
    for (let z = min; z <= max; z++) {
      const bounds = chunkBounds(x, z, chunkSize);
      chunks.push({ id: chunkKey(x, z), cx: x, cz: z, ...bounds });
    }
  }
  return chunks;
}
