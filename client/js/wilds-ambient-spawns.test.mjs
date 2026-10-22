import assert from 'node:assert/strict';
import { createAmbientWildsSpawns } from './wilds-ambient-spawns.mjs';

const center = { x: 1400, z: 1370 };
const authored = [{ x: 1340, z: 1104 }, { x: 1530, z: 1714 }, { x: 1432, z: 1632 }];
const clearings = [[1340, 1104, 16], [1400, 1690, 24]];
const opts = {
  center, authoredSpawns: authored, clearings,
  dEll: (x, z) => Math.hypot((x - center.x) / 420, (z - center.z) / 420),
  dTrail: () => 100, dCreek: () => 100,
};
const a = createAmbientWildsSpawns(opts);
const b = createAmbientWildsSpawns(opts);
assert.deepEqual(a, b, 'ambient positions are deterministic');
assert.equal(a.length, 20, 'all requested ambient slots can be placed in open terrain');
assert.equal(a.filter(s => s.sp === 'mirehare' && !s.hostile).length, 8);
assert.equal(a.filter(s => s.sp === 'ashfang' && s.hostile).length, 6);
assert.equal(a.filter(s => s.hostile).length, 9, 'predator and territorial slots are marked hostile');
for (const s of a) {
  assert.ok(opts.dEll(s.x, s.z) <= .82, 'spawns remain inside the safe world ellipse');
  assert.ok(opts.dTrail(s.x, s.z) >= 10 && opts.dCreek(s.x, s.z) >= 9, 'spawns avoid trails and creek');
  assert.ok(!clearings.some(([x, z, r]) => Math.hypot(s.x - x, s.z - z) < r + 8), 'spawns avoid protected clearings');
  assert.ok(!authored.some(p => Math.hypot(s.x - p.x, s.z - p.z) < 28), 'spawns stay away from authored encounters');
}
for (let i = 0; i < a.length; i++) for (let k = i + 1; k < a.length; k++) {
  assert.ok(Math.hypot(a[i].x - a[k].x, a[i].z - a[k].z) >= 30, 'ambient spawn slots are spatially separated');
}
assert.throws(() => createAmbientWildsSpawns({}), TypeError, 'invalid placement inputs fail clearly');
console.log('wilds-ambient-spawns: all tests passed');
