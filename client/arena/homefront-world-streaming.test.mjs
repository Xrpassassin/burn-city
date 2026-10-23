import assert from 'node:assert/strict';
import { CHUNK_SIZE, chunkBounds, chunkCoords, chunkKey, visibleChunkSet, worldChunkManifest } from './homefront-world-streaming.mjs';

assert.deepEqual(chunkCoords(0, 0), { x: 0, z: 0 });
assert.deepEqual(chunkCoords(63.9, -0.1), { x: 0, z: -1 });
assert.deepEqual(chunkCoords(64, -64), { x: 1, z: -1 });
assert.equal(chunkKey(-2, 3), 'homefront:-2,3');
assert.deepEqual(chunkBounds(1, -1), { minX: 64, minZ: -64, maxX: 128, maxZ: 0, centerX: 96, centerZ: -32 });
assert.equal(visibleChunkSet(0, 0, 1).size, 9);
assert(visibleChunkSet(64, 0, 0).has('homefront:1,0'));
assert(!visibleChunkSet(64, 0, 0).has('homefront:0,0'));
const manifest = worldChunkManifest();
assert(manifest.length > 0);
assert.equal(new Set(manifest.map(chunk => chunk.id)).size, manifest.length);
assert(manifest.some(chunk => chunk.id === 'homefront:0,0'));
assert.throws(() => chunkCoords(NaN, 0), TypeError);
assert.throws(() => visibleChunkSet(0, 0, -1), TypeError);
assert.equal(CHUNK_SIZE, 64);
console.log('Homefront world streaming tests passed');
