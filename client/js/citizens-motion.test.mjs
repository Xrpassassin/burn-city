import assert from 'node:assert/strict';
import { initMotion, stepMotion, makeGrid, avoidPush, wrap, MOTION } from './citizens-motion.mjs';
const dt = 1 / 60;
// eases in from standing: no instant full speed, reaches walking pace within ~1.5 s, feet distance = path length
{
  const a = initMotion({ x: 0, z: 0, yaw: 0 }, .5, 0, 0); stepMotion(a, 0, 0, 0, dt);
  let tz = 0, walked = 0; const v = [];
  for (let i = 0; i < 180; i++) { tz += 1.4 * dt; walked += stepMotion(a, 0, tz, 0, dt); v.push(a.v); }
  assert.ok(v[0] < .1, 'starts gently'); assert.ok(v[90] > 1.2, 'up to pace in 1.5 s: ' + v[90]);
  assert.ok(Math.abs(walked - Math.hypot(a.x, a.z)) < .01, 'walk-cycle distance equals ground covered');
  assert.ok(tz - a.z < 1.2, 'keeps up with the crowd target');
}
// a 180° reversal is a stop-and-pivot, never a single-frame snap
{
  const a = initMotion({ x: 0, z: 0, yaw: 0 }, .5, 0, 0); stepMotion(a, 0, 0, 0, dt);
  let tz = 0; for (let i = 0; i < 120; i++) { tz += 1.4 * dt; stepMotion(a, 0, tz, 0, dt); }
  let maxTurn = 0, minV = 9;
  for (let i = 0; i < 240; i++) { tz -= 1.4 * dt; const y0 = a.yaw; stepMotion(a, 0, tz, Math.PI, dt); maxTurn = Math.max(maxTurn, Math.abs(wrap(a.yaw - y0))); minV = Math.min(minV, a.v); }
  assert.ok(maxTurn <= MOTION.turnPivot * dt + 1e-9, 'turn rate limited');
  assert.ok(minV < .3, 'slows right down to pivot');
  assert.ok(Math.abs(wrap(a.yaw - Math.PI)) < .2, 'ends up facing the new way');
  assert.ok(Math.abs(a.z - tz) < 1.5, 'catches back up');
}
// stops ease out instead of freezing
{
  const a = initMotion({ x: 0, z: 0, yaw: 0 }, .5, 0, 0); stepMotion(a, 0, 0, 0, dt);
  let tz = 0; for (let i = 0; i < 120; i++) { tz += 1.4 * dt; stepMotion(a, 0, tz, 0, dt); }
  const v0 = a.v; stepMotion(a, 0, tz, 0, dt); assert.ok(a.v > v0 - .1, 'no instant stop');
  for (let i = 0; i < 120; i++) stepMotion(a, 0, tz, 0, dt);
  assert.ok(a.v < .05 && Math.abs(a.z - tz) < .4, 'comes to rest at the target');
}
// teleports (shop exits) snap instead of sprinting across the map
{
  const a = initMotion({ x: 0, z: 0, yaw: 0 }, .5, 0, 0); stepMotion(a, 0, 0, 0, dt);
  assert.equal(stepMotion(a, 20, 20, 1, dt), 0); assert.equal(a.x, 20);
}
// two people walking head-on sidestep (each to their right) instead of passing through each other
{
  const A = initMotion({ x: 0, z: 0, yaw: 0, hidden: false }, .5, 0, 0), B = initMotion({ x: 0, z: 10, yaw: Math.PI, hidden: false }, .5, .5, 0);
  stepMotion(A, 0, 0, 0, dt); stepMotion(B, 0, 10, Math.PI, dt);
  const g = makeGrid(), pa = {}, pb = {}; let ta = 0, tb = 10, minD = 99;
  for (let i = 0; i < 600; i++) {
    ta += 1.3 * dt; tb -= 1.3 * dt; g.clear(); g.add(A); g.add(B);
    avoidPush(A, g, null, pa); avoidPush(B, g, null, pb);
    stepMotion(A, 0, ta, 0, dt, pa); stepMotion(B, 0, tb, Math.PI, dt, pb);
    minD = Math.min(minD, Math.hypot(A.x - B.x, A.z - B.z));
  }
  assert.ok(minD > .55, 'kept personal space: ' + minD.toFixed(2));
  assert.ok(Math.abs(A.x) < .6 && Math.abs(B.x) < .6, 'back on their lines afterwards');
}
// variety: different paces and phases
{
  const s = new Set(); for (let i = 0; i < 20; i++) { const a = initMotion({}, Math.random(), Math.random(), Math.random()); s.add(a.pace.toFixed(3) + a.ph.toFixed(3)); }
  assert.equal(s.size, 20);
}
console.log('citizens-motion: ok');
