import assert from 'node:assert/strict';
import { smoothFacing, facingFromMovement, cameraFollowAnchor } from '../client/arena/homefront-presentation-smoothing.mjs';
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
console.log('Homefront presentation smoothing: 30/60/120 FPS, wrap, analog, release, shared camera anchor passed');
