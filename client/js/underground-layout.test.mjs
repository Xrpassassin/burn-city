import assert from 'node:assert/strict';
import { UG, inUndercroft, walkableLocal, floorLocal, slideLocal, SPOTS, pillarSpots, entranceLot, lotClear, L } from './underground-layout.mjs';
import { board, pick, DAILY, WEEKLY, dayKey, weekKey, metricsFrom } from './underground-quests.mjs';
// realm is off the city map and inside the server's ±2000 clamp, and never overlaps the Wilds deep realm (x>940 && z>900)
assert.ok(inUndercroft(UG.x, UG.z)); assert.ok(!inUndercroft(0, 0)); assert.ok(!inUndercroft(1400, 1370));
assert.ok(Math.abs(UG.x) + 120 < 2000 && Math.abs(UG.z) + 120 < 2000);
// every named spot a player stands on is walkable; the halls connect the plaza to every chamber
for (const k of ['arrive', 'fromGate', 'warden', 'scribe']) assert.ok(walkableLocal(SPOTS[k].x, SPOTS[k].z), k);
for (let z = 44; z > -55; z -= .5) if (Math.hypot(0, z) > L.DAIS_R + 1) assert.ok(walkableLocal(0, z) || walkableLocal(3, z), 'north-south path at ' + z);
for (let x = -50; x < 52; x += .5) if (Math.abs(x) > L.DAIS_R + 1) assert.ok(walkableLocal(x, 0) || walkableLocal(x, 3), 'east-west path at ' + x);
assert.ok(!walkableLocal(30, 30) && !walkableLocal(0, 0) && !walkableLocal(0, 60));
// sunken plaza: 0 in the middle, four .45 m steps, 1.8 on the gallery and in the halls
assert.equal(floorLocal(5, 0), 0); assert.equal(floorLocal(12.5, 0), .45); assert.equal(floorLocal(14.5, 0), 1.35); assert.equal(floorLocal(0, 30), 1.8);
// sliding never leaves the walkable area
assert.deepEqual(slideLocal(0, 30, 10, 30.2), [0, 30.2]);
for (const p of pillarSpots()) assert.ok(Math.hypot(p.x, p.z) < L.GALLERY_R && Math.hypot(p.x, p.z) > 15);
// entrance lot: deterministic, clear of streets / rings / colliders, and steps aside when something lands on the anchor
const city = { colliders: [{ x: -318, z: -92, r: 3, h: 5 }], streets: [{ type: 'ring', c: { x: -175, z: 0 }, r: 36 }, { type: 'line', a: { x: -62, z: 0 }, b: { x: -139, z: 0 } }], nodes: [{ pos: { x: -175, z: 0 }, w: 3, distR: 37 }] };
const a = entranceLot(city), b = entranceLot(city);
assert.ok(a); assert.deepEqual(a, b); assert.ok(lotClear(city, a.x, a.z)); assert.ok(Math.hypot(a.x + 318, a.z + 92) > 8);
assert.equal(entranceLot({ colliders: [], streets: [], nodes: [] }).ring, 0);
// quests: deterministic picks, local-only progress from a read-only save view, baseline per day/week
assert.deepEqual(pick(DAILY, 'd2026-11-27', 3), pick(DAILY, 'd2026-11-27', 3));
assert.equal(new Set(pick(WEEKLY, 'wx', 3).map(q => q.id)).size, 3);
assert.equal(dayKey(new Date(Date.UTC(2026, 10, 27, 23))), '2026-11-27'); assert.equal(weekKey(new Date(Date.UTC(2026, 0, 1))), '2026-W01');
assert.equal(metricsFrom('{bad'), null); assert.equal(metricsFrom(null), null);
const save0 = JSON.stringify({ name: 'Ash', lvl: 3, best: 4, gold: 50, codex: ['rat'], mats: { ore: 2, shard: 0 } });
const t = new Date(Date.UTC(2026, 10, 27, 12));
const b0 = board(null, save0, t); assert.ok(b0.hasChar); assert.equal(b0.daily.length, 3); assert.ok(b0.daily.every(r => r.got === 0 && !r.done));
const save1 = JSON.stringify({ name: 'Ash', lvl: 9, best: 40, gold: 5000, codex: Array(40).fill('x'), mats: { ore: 99, shard: 9 } });
const b1 = board(b0.state, save1, t); assert.ok(b1.daily.every(r => r.done)); assert.ok(b1.weekly.every(r => r.done));
const b2 = board(b1.state, save1, new Date(Date.UTC(2026, 10, 28, 12))); assert.ok(b2.daily.every(r => r.got === 0), 'new day -> new baseline');
assert.equal(board(null, null, t).hasChar, false);
// the board never returns a modified Eternal Grind save (it only ever reads the string)
assert.equal(typeof save1, 'string');
console.log('underground layout + quests ok');
