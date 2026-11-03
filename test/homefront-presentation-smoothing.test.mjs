import assert from 'node:assert/strict';
import { smoothFacing, facingFromMovement, cameraFollowAnchor, releasePredictionBlend } from '../client/arena/homefront-presentation-smoothing.mjs';
import { createContinuousInput, MAX_PREDICTION_LEAD } from '../client/arena/homefront-continuous-input.mjs';
import { worldMove } from '../client/arena/homefront-view.mjs';
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
for(const fps of [30,60,120]){
  let yaw=0;
  for(let i=0;i<fps;i++) yaw=smoothFacing(yaw,Math.PI/2,1/fps);
  assert(Math.abs(delta(yaw,Math.PI/2))<0.001,'stable heading convergence at '+fps+' FPS');
}
assert(Math.abs(delta(smoothFacing(Math.PI-0.02,-Math.PI+0.02,1/60),Math.PI))<0.03,'wrap uses shortest arc');
for(const magnitude of [0.15,0.2,0.5,1]){
  assert(Math.abs(facingFromMovement({x:magnitude,z:0},0)-Math.PI/2)<1e-10,'analog strafe heading');
}
assert.equal(facingFromMovement({x:0,z:0},1.23),1.23,'release retains facing');
assert.equal(facingFromMovement({x:NaN,z:1},1.23),1.23,'invalid input retains facing');
const avatar={position:{x:1.1,z:2.2}};
assert.deepEqual(cameraFollowAnchor(true,avatar,{x:2.4,z:3.4}),{x:1.1,z:2.2},'camera targets presented avatar even during delayed ack');
assert.deepEqual(cameraFollowAnchor(false,avatar,{x:2.4,z:3.4}),{x:2.4,z:3.4},'legacy behavior preserved');
assert.equal(Math.hypot(1.1-2.4,2.2-3.4)<=1.5,false,'test deliberately covers larger-than-lead disagreement');

const rate = Math.PI * 3.5;
for (const fps of [30, 60, 120]) {
  const firstTurn = smoothFacing(0, Math.PI, 1 / fps);
  assert(Math.abs(firstTurn) <= rate / fps + 1e-9,
    'turn velocity is bounded at ' + fps + ' FPS');
}
assert(Math.abs(smoothFacing(0, Math.PI, 1)) <= rate * 0.05 + 1e-9,
  'a resumed browser tab cannot teleport avatar facing');

const cameraStrafe = worldMove({ x: 0.5, y: 0 }, Math.PI / 2);
assert(cameraStrafe, 'camera-relative strafe produces a world-space vector');
assert(Math.abs(delta(facingFromMovement(cameraStrafe, 1), 0)) < 1e-9,
  'strafe facing respects a rotated camera, not the old avatar yaw');
assert.equal(facingFromMovement(worldMove({ x: 0, y: 0 }, 0), 0.9), 0.9,
  'movement release keeps the last heading');

const recovered = [];
for (const fps of [30, 60, 120]) {
  // An unacknowledged command stays in flight to exercise the capped visual
  // prediction without accidentally substituting a successful server move.
  const controller = createContinuousInput({ send: () => new Promise(() => {}) });
  controller.sync({ enabled: true, nextSequence: 0 }, { x: 0, z: 0 }, 0);
  const presented = { position: { x: 0, z: 0 } };
  const dt = 1 / fps;
  for (let frame = 0; frame < fps; frame++) {
    controller.step({ x: 1, z: 0 }, false, 100 + frame * 1000 / fps, dt);
    const point = controller.position();
    assert(Math.hypot(point.x, point.z) <= MAX_PREDICTION_LEAD + 1e-9,
      'server-to-prediction lead stays within 1.5 units at ' + fps + ' FPS');
    const blend = 1 - Math.exp(-8 * dt);
    presented.position.x += (point.x - presented.position.x) * blend;
    presented.position.z += (point.z - presented.position.z) * blend;
    assert.deepEqual(cameraFollowAnchor(true, presented, point),
      { x: presented.position.x, z: presented.position.z },
      'camera and displayed avatar share one anchor during delayed acknowledgement');
  }
  const beforeRelease = controller.position();
  assert(Math.abs(beforeRelease.x - MAX_PREDICTION_LEAD) < 1e-9,
    'unacknowledged walking reaches the same bounded cap');
  for (let frame = 0; frame < fps / 2; frame++) {
    controller.step(null, false, 1100 + frame * 1000 / fps, dt);
  }
  const afterRelease = controller.position();
  recovered.push(afterRelease.x / beforeRelease.x);
  assert(Math.abs(afterRelease.x / beforeRelease.x - Math.exp(-10.5 * 0.5)) < 1e-9,
    'release correction uses elapsed time rather than frames');
  controller.disable('test_end');
}
assert(Math.max(...recovered) - Math.min(...recovered) < 1e-9,
  'prediction recovery has consistent half-second decay at all frame rates');
assert.equal(releasePredictionBlend(NaN), 0, 'invalid frame delta cannot move avatar');
assert.equal(releasePredictionBlend(-1), 0, 'negative frame delta cannot move avatar');

console.log('Homefront presentation smoothing: 30/60/120 FPS, wrap, analog, release, shared camera anchor passed');
