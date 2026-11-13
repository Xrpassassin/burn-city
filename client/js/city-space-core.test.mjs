import assert from 'node:assert/strict';
import { issOrbit, ascentPoint, issSunTint, issLevel, shipLevel, ISS_ORBIT, PAD } from './city-space-core.mjs';

const a = issOrbit(0), b = issOrbit(ISS_ORBIT.period / 4);
assert.ok(Math.abs(Math.hypot(a.pos.x - ISS_ORBIT.cx, a.pos.z - ISS_ORBIT.cz) - ISS_ORBIT.r) < 1e-6);
assert.ok(a.pos.y > 700 && b.pos.y > 700 && b.pos.y < 900 && Math.hypot(a.pos.x, a.pos.z) + 0 < 1400, 'ISS stays high above the City');
assert.ok(Math.abs(Math.hypot(a.dir.x, a.dir.y, a.dir.z) - 1) < 1e-9);
const pad = { x: PAD.x, y: 0, z: PAD.z }, tgt = { x: 100, y: 900, z: 300 };
assert.deepEqual(ascentPoint(pad, tgt, 0), pad);
const end = ascentPoint(pad, tgt, 1);
for (const k of 'xyz') assert.ok(Math.abs(end[k] - tgt[k]) < 1e-9);
const early = ascentPoint(pad, tgt, .15);
assert.ok(early.y > 20 && Math.hypot(early.x - pad.x, early.z - pad.z) < early.y, 'lifts off mostly vertically');
const day = issSunTint(.6), dusk = issSunTint(-.05), night = issSunTint(-.3);
assert.ok(day.r > .95 && day.b > .9 && dusk.b < dusk.r && night.r < .3);
assert.ok(dusk.glint > night.glint && dusk.glint > day.glint, 'brightest glint just after sunset');
assert.equal(issLevel(90), 'near'); assert.equal(issLevel(200), 'lod'); assert.equal(issLevel(1500), 'far');
assert.equal(shipLevel(2000, true), 'near'); assert.equal(shipLevel(400, false), 'lod'); assert.equal(shipLevel(2000, false), 'none');
console.log('City space: ISS orbit, CB1 ascent path, sun tint and LOD levels passed');
