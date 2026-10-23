import assert from 'node:assert/strict';
import { biomeAt, biomeManifest, environmentalCandidates } from './homefront-world-generation.mjs';

assert.deepEqual(biomeAt(120, -65, 42), biomeAt(120, -65, 42), 'biomes are stable for a seed and world coordinate');
assert.notDeepEqual(biomeAt(120, -65, 42), biomeAt(120, -65, 43), 'seed changes can alter biome selection');
assert.throws(() => biomeAt(Infinity, 0), TypeError);
const candidatesA = environmentalCandidates(-2, 3, { seed: 777, density: 0.7 });
const candidatesB = environmentalCandidates(-2, 3, { seed: 777, density: 0.7 });
assert.deepEqual(candidatesA, candidatesB, 'environment props are deterministic');
assert(candidatesA.length > 0 && candidatesA.length < 64);
assert.equal(new Set(candidatesA.map(item => item.id)).size, candidatesA.length, 'prop IDs remain unique within a chunk');
assert(candidatesA.every(item => Number.isFinite(item.x) && Number.isFinite(item.z) && Number.isFinite(item.y)));
assert(candidatesA.every(item => item.x >= -128 && item.x < -64 && item.z >= 192 && item.z < 256));
const manifest = biomeManifest(0, 0, { seed: 42, samples: 7 });
assert.equal(manifest.chunkId, '0,0');
assert.equal(Object.values(manifest.counts).reduce((sum, n) => sum + n, 0), 49);
assert(manifest.dominantBiome);
assert.throws(() => environmentalCandidates(0, 0, { density: 1.5 }), TypeError);
console.log('Homefront world generation tests passed');
