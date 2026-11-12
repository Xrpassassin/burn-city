import assert from 'node:assert/strict';
import { propBudget, shopLocal, layoutShops, doorStep, pigeonHomes, pigeonStep, flyPos, duckPos, SPOOK, FLY_TIME, REST } from './cityprops-core.mjs';
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
// phone budget is the smallest
assert.equal(propBudget('high', true), propBudget('low', false));
assert.ok(propBudget('high', false).ducks > propBudget('x', true).ducks);
// shop-local frame matches citylife's door formula (x + cos*2.6 - sin*.2)
const sh = { id: 'mart', x: 10, z: -4, yaw: 0.7 };
const d = shopLocal(sh, 2.6, -.2); near(d.x, 10 + Math.cos(.7) * 2.6 - Math.sin(.7) * .2); near(d.z, -4 - Math.sin(.7) * 2.6 - Math.cos(.7) * .2);
const shops = ['mart', 'smoke', 'disp', 'coffee', 'arcade'].map((id, i) => ({ id, x: i * 12, z: 0, yaw: 0 }));
const L = layoutShops(shops);
assert.equal(L.doors.length, 5); assert.equal(L.vending.length, 3); assert.equal(L.arcade.length, 3);
assert.deepEqual(L.vending.map(v => v.shop), ['mart', 'smoke', 'coffee']);
for (const p of [...L.vending, ...L.arcade]) { near(p.yaw, Math.PI); assert.ok(p.z < 0, 'street side'); }
assert.equal(layoutShops(undefined).doors.length, 0);
// door eases open then closed, clamped to [0,1]
let o = 0; for (let i = 0; i < 60; i++) o = doorStep(o, 2, 1 / 30); assert.equal(o, 1);
for (let i = 0; i < 200; i++) o = doorStep(o, 20, 1 / 30); assert.equal(o, 0);
// pigeons: homes are deterministic and on the street side
const H = pigeonHomes(shops, propBudget('medium', false), [{ x: 0, z: 40 }, { x: 5, z: 40 }]);
assert.equal(H.length, 5 * 3 + 2 * 4); assert.deepEqual(H, pigeonHomes(shops, propBudget('medium', false), [{ x: 0, z: 40 }, { x: 5, z: 40 }]));
for (const h of H.slice(0, 15)) assert.ok(h.z < -2 && h.z > -3.5);
const b = { x: 0, z: 0, yaw: 1, state: 'perch' };
assert.equal(pigeonStep(b, .1, 20, false), null); assert.equal(b.state, 'perch');
assert.equal(pigeonStep(b, .1, SPOOK - .1, false), 'spooked'); assert.equal(b.state, 'fly');
const p0 = flyPos({ ...b, t: 0 }), p1 = flyPos({ ...b, t: FLY_TIME }); assert.ok(p1.y > p0.y + 10); assert.ok(Math.hypot(p1.x, p1.z) > 25);
pigeonStep(b, FLY_TIME + .1, 3, false); assert.equal(b.state, 'gone');
pigeonStep(b, REST + 1, 3, false); assert.equal(b.state, 'gone', 'stays away while someone is close');
pigeonStep(b, .1, 30, false); assert.equal(b.state, 'perch');
const c = { x: 0, z: 0, yaw: 0, state: 'perch' }; pigeonStep(c, .1, 30, true); assert.equal(c.state, 'fly', 'flock follows');
// ducks stay on their circle
const dk = { x: 3, z: 4, r: 2.5, w: .2, ph: 1 }; for (const t of [0, 5, 33]) { const p = duckPos(dk, t); near(Math.hypot(p.x - 3, p.z - 4), 2.5); assert.ok(Math.abs(p.bob) <= .025); }
console.log('cityprops-core: ok');
