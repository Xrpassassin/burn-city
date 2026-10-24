// Shared movement physics (city + Homefront) and the Homefront travel sheet options.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOTION, speedFor, stepVertical, stepGait, turnToward, createMotion } from './player-motion.mjs';
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
console.log('Shared player motion + travel options tests passed.');
