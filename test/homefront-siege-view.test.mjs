// Live siege presentation: mobile caps, pooled tracers/explosions (no per-shot scene growth),
// client mirror of the server rules, extrapolation stops at the wall.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from '../client/arena/vendor/three.module.min.js';
import { createSiegeView, devicePreset, extrapolate, mortarAimCheck, aimFromHeading, SIEGE_UI, buildEmplacement } from '../client/arena/homefront-siege.mjs';
const require = createRequire(import.meta.url);
const Siege = require('../server/homefront-siege.js');
assert.equal(SIEGE_UI.wallRadius, Siege.RULES.wallRadius);
assert.equal(SIEGE_UI.mortarMinRange, Siege.MORTAR.minRange);
assert.equal(SIEGE_UI.mortarMaxRange, Siege.MORTAR.maxRange);
assert.equal(SIEGE_UI.mortarDangerClose, Siege.MORTAR.dangerClose);
assert.equal(SIEGE_UI.mortarCooldownMs, Siege.MORTAR.cooldownMs);
assert.ok(SIEGE_UI.fireMs >= 900 && SIEGE_UI.pollMs >= 900, 'client cadence respects the 120 req/min world limit');
assert.ok(60000 / SIEGE_UI.fireMs <= 70, 'firing + polling never needs more than ~70 requests/min');
const touch = devicePreset(true), desk = devicePreset(false);
assert.deepEqual([touch.tracers, desk.tracers], [12, 32], 'tracer pools: 12 touch / 32 desktop');
assert.ok(touch.members <= Siege.RULES.compactMaxMembers && desk.members >= Siege.RULES.maxMembers);
// Extrapolation matches the server closed form and never passes the wall.
const plan = Siege.planHorde({ seed: 99, level: 4, threat: 12, now: 0 });
for (const m of plan.members) {
  const at = Siege.memberPos(m, 5000), snap = { ...at, dx: m.dx, dz: m.dz, speed: m.speed };
  const server = Siege.memberPos(m, 15000), client = extrapolate(snap, 5000, 15000);
  assert.ok(Math.hypot(server.x - client.x, server.z - client.z) < 0.05, 'client extrapolation tracks the server');
  const late = extrapolate(snap, 5000, 500000); assert.ok(Math.hypot(late.x, late.z) >= SIEGE_UI.wallRadius - 0.01);
}
assert.equal(mortarAimCheck({ x: 0, z: 7 }, 0, 12), 'mortar_too_close');
assert.equal(mortarAimCheck({ x: 0, z: 7 }, 0, 70), 'mortar_out_of_range');
assert.equal(mortarAimCheck({ x: 0, z: 7 }, 0, -30), null);
const aim = aimFromHeading(0, 0, 0, 30); assert.equal(aim.z, 30);
// Pools: a long siege never grows the scene graph.
const scene = new THREE.Scene();
for (const coarse of [true, false]) {
  const view = createSiegeView(THREE, scene, { coarse });
  const members = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, pack: 'p1', x: 50, z: i, dx: -1, dz: 0, speed: 1.2, arriveAt: 1e12, hp: 34, maxHp: 34, brute: i % 5 === 4 }));
  view.setSnapshot({ status: 'active', serverNow: Date.now(), packs: [{ id: 'p1', angle: 0, spawnR: 50 }], members, guards: [{ post: 'b1' }], impacts: [] }, [{ id: 'b1', type: 'gun_platform', x: 5, z: -5, rotation: 0, hp: 200 }]);
  view.update(0.016);
  const cfg = devicePreset(coarse);
  const bodies = view.root.children.find(c => c.isInstancedMesh);
  assert.equal(bodies.count, Math.min(40, cfg.members), 'instanced horde capped for the device');
  const before = view.root.children.length;
  for (let i = 0; i < 300; i++) { view.gunFire({ from: { x: 0, y: 3.9, z: 0 }, rounds: 5, hits: [] }, { x: 30, z: 0 }); view.mortarFire({ impact: { at: i, x: 30, z: i % 7 }, splash: 3.2 }); view.update(0.05); }
  assert.equal(view.root.children.length, before, 'tracers + explosions are pooled');
  assert.ok(view.tracers.capacity === cfg.tracers);
}
const g = new THREE.Group(); const block = (p, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d)); m.position.set(x, y, z); p.add(m); return m; };
assert.ok(buildEmplacement(THREE, g, { type: 'gun_platform' }, block, 0x806144) && g.children.length > 8);
assert.ok(buildEmplacement(THREE, new THREE.Group(), { type: 'mortar_pit' }, block, 0));
assert.equal(buildEmplacement(THREE, new THREE.Group(), { type: 'wall' }, block, 0), false);
console.log('Homefront siege view tests passed.');
setTimeout(() => process.exit(0), 300);
