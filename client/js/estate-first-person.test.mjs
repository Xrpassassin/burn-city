// First-person estate interiors (t448u): eye height, eye collision, centre-reticle aim, head-bob,
// and wiring into the island controller. Runs against the real layouts of all five home tiers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FP, eyeHeightFor, eyeFromHead, resolveEyeCollision, aimInteraction, headBob, createEstateFirstPerson } from './estate-first-person.mjs';
import { createEstateHomeLayout } from './estates-home-layout.mjs';
import { resolveSecretRoomMotion, createSecretRoomLayout } from './estates-secret-layout.mjs';
import { HOME_FLOORS } from './estates-home-plans.mjs';

// eye height follows the skin, within sane bounds
assert.equal(eyeHeightFor(NaN), FP.defaultEye);
assert.ok(Math.abs(eyeHeightFor(1.8) - 1.656) < 1e-9);
assert.equal(eyeHeightFor(3.0), 1.9); assert.equal(eyeHeightFor(1.0), 1.05);
assert.equal(eyeFromHead(1.83), 1.86); assert.equal(eyeFromHead(NaN), null); assert.equal(eyeFromHead(3), null);
// head-bob: gentle, zero when still or under reduced motion
assert.deepEqual(headBob(1.2, 4.5, true), { y: 0, side: 0 });
assert.deepEqual(headBob(1.2, 0, false), { y: 0, side: 0 });
for (let ph = 0; ph < 7; ph += .3) { const b = headBob(ph, 7.2, false); assert.ok(Math.abs(b.y) <= FP.bobRun && Math.abs(b.side) <= FP.bobSide); }

// near-plane footprint at the FP fov on the widest phone landscape aspect
const nearHalf = FP.near * Math.tan(FP.fov * Math.PI / 360) * Math.hypot(1, 2.4);
assert.ok(nearHalf < FP.eyeRadius, 'eye capsule covers the near plane');

const dist = (p, o) => Math.max(Math.abs(p.x - o.x) - o.halfX, Math.abs(p.z - o.z) - o.halfZ);
let rooms = 0, aimed = 0;
for (const tier of ['trailer', 'apartment', 'starter', 'family', 'mansion']) {
  for (let floor = 0; floor < HOME_FLOORS[tier]; floor++) {
    const L = createEstateHomeLayout({ tier, floor }); rooms++;
    assert.ok(L.height - FP.ceilingGap > 1.9, `${tier}/${floor}: room is tall enough for the tallest eye`);
    // random walk with the room's own 0.35 m capsule: the eye never needs correcting and never
    // gets closer to a wall or a solid piece than the near-plane footprint
    let p = { x: L.spawn.x, z: L.spawn.z }, seed = 7 + rooms;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1500; i++) {
      p = resolveSecretRoomMotion(p, { x: (rnd() - .5) * .6, z: (rnd() - .5) * .6 }, L);
      const e = resolveEyeCollision(L, p);
      assert.ok(Math.abs(e.x - p.x) < 1e-9 && Math.abs(e.z - p.z) < 1e-9, `${tier}/${floor}: eye stays on the capsule`);
      assert.ok(L.bounds.x - Math.abs(e.x) >= nearHalf && L.bounds.z - Math.abs(e.z) >= nearHalf, 'clear of the shell');
      for (const o of L.obstacles) assert.ok(dist(e, o) >= nearHalf - 1e-9, `${tier}/${floor}: clear of ${o.id}`);
    }
    // an eye forced inside furniture is pushed out
    if (L.obstacles.length) { const o = L.obstacles[0], e = resolveEyeCollision(L, { x: o.x, z: o.z }); assert.ok(dist(e, o) >= FP.eyeRadius - 1e-6 || L.obstacles.some(q => q !== o && dist(e, q) < FP.eyeRadius)); }
    // centre reticle: every interaction is aimable from somewhere within reach, and looking away misses
    for (const it of L.interactions) {
      let hit = false;
      for (let a = 0; a < 80 && !hit; a++) {
        const ang = (a % 16) * Math.PI / 8, r = [.8, 1.1, 1.4, 1.8, 2.1][Math.floor(a / 16)], from = resolveSecretRoomMotion({ x: it.x, z: it.z }, { x: 0, z: 0 }, L);
        const eye0 = { x: it.x + Math.cos(ang) * r, z: it.z + Math.sin(ang) * r };
        if (Math.abs(eye0.x) > L.bounds.x - .35 || Math.abs(eye0.z) > L.bounds.z - .35) continue;
        if (L.obstacles.some(o => dist(eye0, o) < .35)) continue;
        const eye = { x: eye0.x, y: L.walkHeight + 1.6, z: eye0.z };
        const dx = it.x - eye.x, dz = it.z - eye.z, dy = (L.walkHeight + 1.0) - eye.y, n = Math.hypot(dx, dy, dz);
        const got = aimInteraction(L, eye, { x: dx / n, y: dy / n, z: dz / n });
        if (got?.id === it.id) { hit = true; aimed++; }
        const away = aimInteraction(L, eye, { x: -dx / n, y: 0, z: -dz / n });
        assert.notEqual(away?.id, it.id, 'looking away never aims at it');
        void from;
      }
      assert.ok(hit, `${tier}/${floor}: ${it.id} reachable by the centre reticle`);
    }
  }
}
assert.ok(rooms >= 7 && aimed >= rooms * 2);
// standing on a trigger: the reticle doesn't claim it (proximity + exit arming handle it)
{ const L = createEstateHomeLayout({ tier: 'apartment' }), ex = L.interactions.find(i => i.id === 'exit');
  assert.equal(aimInteraction(L, { x: ex.x, y: 1.7, z: ex.z }, { x: 0, y: 0, z: 1 })?.id === 'exit', false); }
// private (non-home) rooms work too
{ const L = createSecretRoomLayout('arcade'); const e = resolveEyeCollision(L, { x: 99, z: -99 }); assert.ok(Math.abs(e.x) <= L.bounds.x && Math.abs(e.z) <= L.bounds.z); }

// controller: saves/restores camera, clamps pitch, keeps the eye under the ceiling
{
  let yaw = 0, pitch = 1.29, projected = 0;
  const camera = { fov: 58, near: .3, far: 4000, position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, lookAt() {}, updateProjectionMatrix() { projected++; } };
  const fp = createEstateFirstPerson({ camera, getYaw: () => yaw, setYaw: y => { yaw = y; }, getPitch: () => pitch, setPitch: p => { pitch = p; }, doc: null, win: null });
  fp.enter();
  assert.equal(camera.fov, FP.fov); assert.equal(camera.near, FP.near); assert.ok(pitch <= .15, 'arrival gaze is level');
  pitch = 1.29;
  const L = createEstateHomeLayout({ tier: 'trailer' }), origin = { x: 1000, y: -50, z: 0 };
  fp.tick({ layout: L, origin, local: L.spawn, dt: 1 / 60, moved: 0 });
  assert.equal(pitch, FP.pitchMax, 'pitch clamped');
  assert.ok(camera.position.y - origin.y <= L.height - FP.ceilingGap + 1e-9 && camera.position.y - origin.y > 1, 'eye under the ceiling');
  fp.exit();
  assert.deepEqual([camera.fov, camera.near, camera.far], [58, .3, 4000], 'third-person camera restored');
  assert.ok(projected >= 2);
}

// wiring
const src = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const live = src('./estates-island-live.mjs'), app = src('./app.js'), css = src('../ui-forge.css'), lane = src('./notify-lane.mjs');
assert.match(live, /player\.fp=true;player\.onGround=true;[\s\S]{0,120}firstPerson\.enter\(\);/, 'entering an interior switches to first person');
assert.match(live, /firstPerson\.exit\(\);\s*player\.vel\?\.set\(0,0,0\);player\.fp=fpPrevious;/, 'exit restores the previous view');
assert.match(live, /let trigger=\(secretExitArmed&&aimed\)\|\|secretInterior\.interaction\(moved\);/, 'reticle aim first after arrival, proximity still works');
assert.match(live, /secretInterior\.tickReveal\(dt\);/, 'entrance light reveal still runs in first person');
assert.match(app, /getPitch:\(\)=>yp\.pitch,setPitch:p=>\{yp\.pitch=p\},domElement:R\.domElement,/);
assert.match(app, /if\(island\.interiorActive\)\{[\s\S]{0,600}avatar\.visible=!P\.fp;/, 'own body hidden in first person');
assert.match(css, /#bcFpReticle\.hot/); assert.match(lane, /'#bcFpReticle\.on'/, 'toasts keep off the reticle');
assert.ok(!/continuous/i.test(src('./estate-first-person.mjs')), 'does not touch the continuous-movement flag');
console.log(`Estate first person: ${rooms} home floors, eye collision, ${aimed} reticle aims, pitch clamp, restore`);
