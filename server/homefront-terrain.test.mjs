import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DEFAULT_TERRAIN_SEED, terrainHeight, terrainElevation, terrainChunkSamples } from '../client/arena/homefront-terrain-generation.mjs';
const require = createRequire(import.meta.url);
const serverTerrain = require('./homefront-terrain.js');

for (let x = -100; x <= 100; x += 7.25) {
  for (let z = -100; z <= 100; z += 9.5) {
    assert.equal(serverTerrain.terrainHeight(x, z), terrainHeight(x, z), `client/server terrain mismatch at ${x},${z}`);
    assert.equal(serverTerrain.terrainElevation(x, z), terrainElevation(x, z));
    assert.equal(serverTerrain.TERRAIN_ELEVATION_SCALE, 0.42);
  }
}
for (const roadCenter of [-90, -70, -50, -30, -10, 10, 30, 50, 70, 90]) {
  for (let z = -100; z <= 100; z += 10) {
    assert.equal(terrainHeight(roadCenter, z), 0, 'road centerline must be level with the ground mesh');
    assert.equal(terrainHeight(z, roadCenter), 0, 'cross-road centerline must be level with the ground mesh');
  }
}
assert.equal(serverTerrain.canTraverse(0, 0, 12, 8), true, 'the current gentle terrain should be traversable');
assert.equal(serverTerrain.canTraverse(0, 0, 12, 8, { maxRisePer2Units: 1e-10 }), false, 'grade guard must reject a deliberately restrictive threshold');
assert.throws(() => serverTerrain.canTraverse(0, 0, 1, 1, { maxRisePer2Units: 0 }), TypeError);
const a = terrainChunkSamples(0, 0, { segments: 8, seed: DEFAULT_TERRAIN_SEED });
const b = terrainChunkSamples(1, 0, { segments: 8, seed: DEFAULT_TERRAIN_SEED });
for (let row = 0; row <= 8; row++) assert.equal(a[row * 9 + 8].y, b[row * 9].y, 'chunk seam height must match');
console.log('Homefront client/server terrain parity tests passed');
