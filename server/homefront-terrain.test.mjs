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
assert.equal(serverTerrain.isSafePosition(-8, -82), true, 'authored perimeter spawn is grounded on traversable terrain');
assert.equal(serverTerrain.isSafePosition(100, 100), false, 'placement outside the circular world boundary is rejected');
assert.equal(serverTerrain.isSafePosition(Number.NaN, 0), false, 'non-finite positions are rejected by placement validation');
assert.throws(() => serverTerrain.isSafePosition(0, 0, { clearance: 0 }), TypeError);
assert.equal(serverTerrain.canTraverse(0, 0, 12, 8, { maxRisePer2Units: 1e-10 }), false, 'grade guard must reject a deliberately restrictive threshold');
assert.throws(() => serverTerrain.canTraverse(0, 0, 1, 1, { maxRisePer2Units: 0 }), TypeError);

// A synthetic ridge forces A* to choose a safe detour rather than rejecting movement outright.
const ridgeHeight = (x, z) => Math.abs(x) < 0.75 && Math.abs(z) < 8 ? 5 : 0;
const ridgePath = serverTerrain.findTerrainPath(-12, 0, 12, 0, {
  bounds: 20, spacing: 2, maxExpanded: 1200, heightAt: ridgeHeight, maxRisePer2Units: 0.65
});
assert.ok(Array.isArray(ridgePath) && ridgePath.length > 2, 'pathfinder routes around a steep ridge; returned route=' + JSON.stringify(ridgePath));
assert.ok(ridgePath.some(point => Math.abs(point.z) >= 8), 'detour leaves the blocked ridge corridor');
let previous = { x: -12, z: 0 };
for (const point of ridgePath) {
  const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
  const steps = Math.max(1, Math.ceil(distance / 2));
  let last = ridgeHeight(previous.x, previous.z);
  for (let i = 1; i <= steps; i++) {
    const at = ridgeHeight(previous.x + (point.x - previous.x) * i / steps, previous.z + (point.z - previous.z) * i / steps);
    assert.ok(Math.abs(at - last) <= 0.65, 'every returned route edge respects the grade limit');
    last = at;
  }
  previous = point;
}
assert.deepEqual(ridgePath[ridgePath.length - 1], { x: 12, z: 0 }, 'route reaches the exact requested destination');
const sealedHeight = (x) => Math.abs(x) < 0.75 ? 5 : 0;
assert.equal(serverTerrain.findTerrainPath(-8, 0, 8, 0, {
  bounds: 12, spacing: 2, maxExpanded: 500, heightAt: (x, z) => sealedHeight(x)
}), null, 'pathfinder reports a sealed barrier as unreachable instead of returning an unsafe route');
assert.throws(() => serverTerrain.findTerrainPath(0, 0, 1, 1, { spacing: 0 }), TypeError);
const a = terrainChunkSamples(0, 0, { segments: 8, seed: DEFAULT_TERRAIN_SEED });
const b = terrainChunkSamples(1, 0, { segments: 8, seed: DEFAULT_TERRAIN_SEED });
for (let row = 0; row <= 8; row++) assert.equal(a[row * 9 + 8].y, b[row * 9].y, 'chunk seam height must match');
console.log('Homefront client/server terrain parity tests passed');
