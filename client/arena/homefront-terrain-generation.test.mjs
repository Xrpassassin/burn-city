import assert from 'node:assert/strict';
import { DEFAULT_TERRAIN_SEED, terrainChunkSamples, terrainHeight, valueNoise2D } from './homefront-terrain-generation.mjs';

assert.equal(valueNoise2D(12.5, -8.25), valueNoise2D(12.5, -8.25));
assert.equal(terrainHeight(17.25, -40.5), terrainHeight(17.25, -40.5));
assert.notEqual(terrainHeight(17.25, -40.5, DEFAULT_TERRAIN_SEED), terrainHeight(17.25, -40.5, DEFAULT_TERRAIN_SEED + 1));
assert.throws(() => terrainHeight(NaN, 0), TypeError);
assert.throws(() => valueNoise2D(0, 0, 0), TypeError);

const left = terrainChunkSamples(0, 0, { chunkSize: 64, segments: 8, seed: 123 });
const right = terrainChunkSamples(1, 0, { chunkSize: 64, segments: 8, seed: 123 });
// The right edge of chunk 0 and left edge of chunk 1 must be identical at every shared vertex.
for (let row = 0; row <= 8; row++) {
  const leftEdge = left[row * 9 + 8];
  const rightEdge = right[row * 9];
  assert.equal(leftEdge.x, rightEdge.x);
  assert.equal(leftEdge.z, rightEdge.z);
  assert.equal(leftEdge.y, rightEdge.y);
}
const sample = terrainChunkSamples(-1, 2, { chunkSize: 64, segments: 16, seed: 99 });
assert.equal(sample.length, 17 * 17);
assert(sample.every(point => Number.isFinite(point.y) && Math.abs(point.y) < 3));
console.log('Homefront deterministic terrain generation tests passed');
