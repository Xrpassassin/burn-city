// Shared movement physics (city + Homefront) and the Homefront travel sheet options.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOTION, speedFor, stepVertical, stepGait, turnToward, createMotion, JETPACK, jetHorizontal, jetVertical, stepFuel } from './player-motion.mjs';
import { travelOptions } from '../arena/homefront-travel.mjs';
assert.equal(speedFor(false), 5); assert.equal(speedFor(true), 11);
assert.ok(Math.abs(speedFor(false, 0.68) - 3.4) < 1e-9, 'Homefront yard walk keeps its 3.4 u/s feel');
// Jump arc: peak ≈ v²/2g, lands back on the floor, never sinks below it.
const m = createMotion(0); let peak = 0, steps = 0;
stepVertical(m, 1 / 60, 0, true); while (!m.onGround && steps++ < 600) { stepVertical(m, 1 / 60, 0, false); peak = Math.max(peak, m.y); assert.ok(m.y >= 0); }
assert.ok(m.onGround && Math.abs(peak - MOTION.jump ** 2 / (2 * MOTION.gravity)) < 0.2, 'jump peak ' + peak);
const air = createMotion(0); stepVertical(air, 1 / 60, 0, true); assert.equal(air.onGround, false); stepVertical(air, 1 / 60, 0, true); const vy = air.vy; stepVertical(air, 1 / 60, 0, true); assert.ok(air.vy < vy, 'no double jump mid-air');
const deck = createMotion(0); stepVertical(deck, 1 / 60, 2.4, false); assert.equal(deck.y, 2.4, 'snaps up onto a raised floor');
const g = createMotion(0); stepGait(g, 0.5, 1, false); assert.equal(g.phase, MOTION.walkCadence * 0.5); assert.equal(g.amp, 1);
const t = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 1); assert.ok(Math.abs(Math.atan2(Math.sin(t), Math.cos(t)) - (-Math.PI + 0.1)) < 1e-9, 'turns the short way across ±π');
// The city really imports the shared module (no duplicated literals left behind).
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
assert.match(app, /from '\.\/player-motion\.mjs'/); assert.match(app, /sp=speedFor\(run\)/); assert.match(app, /P\.vel\.y=MOTION\.jump/); assert.doesNotMatch(app, /sp=run\?11:5/);
const hf = readFileSync(new URL('../arena/homefront.html', import.meta.url), 'utf8'), gy = readFileSync(new URL('../arena/homefront-graveyard-3d.js', import.meta.url), 'utf8');
for (const src of [hf, gy]) { assert.match(src, /from '\.\.\/js\/walker\.js'/); assert.match(src, /from '\.\.\/js\/player-motion\.mjs'/); }
// Travel sheet options.
const ids = (...a) => travelOptions(...a).map(o => o.id);
assert.deepEqual(ids(null, { inWorld: true }), ['return']);
assert.deepEqual(ids(null), ['solo', 'party_create', 'party_join']);
const party = { code: 'ABC123', leader: true, members: [{ id: 'survivor-a', you: true, leader: true, where: 'homefront' }, { id: 'survivor-b', you: false, leader: false, where: 'homefront', inYourInstance: false }, { id: 'survivor-c', you: false, where: 'world' }] };
assert.deepEqual(ids({ party, instance: 'own' }), ['solo', 'party', 'visit:survivor-b', 'party_leave']);
assert.deepEqual(ids({ party: { ...party, leader: false }, instance: 'friend' }), ['solo', 'visit:survivor-b', 'home', 'party_leave']);
// City jetpack physics live in player-motion (same numbers the city used inline before).
assert.deepEqual([JETPACK.cruise, JETPACK.boost, JETPACK.steer, JETPACK.brake, JETPACK.climb, JETPACK.dive, JETPACK.lift, JETPACK.ceiling], [16, 26, 4.5, 2.5, 10, -9, 5, 180]);
{ const v = { x: 0, z: 0 }; for (let i = 0; i < 400; i++) jetHorizontal(v, 1 / 60, 5, 0, false); assert.ok(Math.abs(v.x - 16) < 0.01 && Math.abs(v.z) < 1e-9, 'cruise converges to 16 m/s');
  for (let i = 0; i < 400; i++) jetHorizontal(v, 1 / 60, 5, 0, true); assert.ok(Math.abs(v.x - 26) < 0.01, 'boost 26 m/s');
  for (let i = 0; i < 400; i++) jetHorizontal(v, 1 / 60, 0, 0, false); assert.ok(Math.abs(v.x) < 0.01, 'brakes to a stop'); }
{ let vy = 0; for (let i = 0; i < 300; i++) vy = jetVertical(vy, 1 / 60, true, false); assert.ok(Math.abs(vy - 10) < 0.01); for (let i = 0; i < 300; i++) vy = jetVertical(vy, 1 / 60, false, false); assert.ok(Math.abs(vy) < 0.01, 'hover'); }
{ const dt = 1 / 60, a = jetVertical(2, dt, false, true) + MOTION.gravity * dt, b = 2 + (-9 - 2) * (1 - Math.exp(-dt * 5)) + 20 * dt; assert.ok(Math.abs(a - b) < 1e-12, 'identical to the old inline city formula'); }
{ let f = 1, t = 0; while (f > 0 && t < 20) { f = stepFuel(f, 0.1, true, false); t += 0.1; } assert.ok(Math.abs(t - JETPACK.fuelSeconds) < 0.11); assert.equal(stepFuel(0.5, 1, false, false), 0.5, 'no refuel in the air'); assert.equal(stepFuel(0.5, 1, false, true), 1); }
const appSrc = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
assert.ok(/jetHorizontal\(JET\.v,dt,mv\.x,mv\.z,run\)/.test(appSrc) && /jetVertical\(P\.vel\.y,dt,up,dn\)\+MOTION\.gravity\*dt/.test(appSrc), 'the city jetpack uses the shared jet physics');
console.log('Shared player motion + travel options tests passed.');
