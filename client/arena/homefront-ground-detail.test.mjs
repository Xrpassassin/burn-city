import assert from 'node:assert/strict';
import { groundDetailCandidates } from './homefront-ground-detail.mjs';

const a = groundDetailCandidates(-1, 0, { count: 80 });
const b = groundDetailCandidates(-1, 0, { count: 80 });
assert.deepEqual(a, b, 'ground dressing remains stable between rebuilds');
assert.equal(new Set(a.map(item => item.id)).size, a.length, 'ground detail IDs are unique within a chunk');
assert(a.every(item => Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.z) && item.scale > 0));
assert(a.every(item => item.x >= -64 && item.x < 0 && item.z >= 0 && item.z < 64));
assert(a.every(item => item.kind === 'rock' || item.kind === 'tuft'));
assert(a.every(item => Math.hypot(item.x, item.z) >= 14), 'spawn clearing remains uncluttered');
assert.throws(() => groundDetailCandidates(0, 0, { count: 257 }), TypeError);
console.log('Homefront ground detail tests passed');
