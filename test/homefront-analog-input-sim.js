'use strict';
const assert=require('node:assert/strict');
const World=require('../server/homefront-world');
const Collision=require('../server/homefront-collision');
const Terrain=require('../server/homefront-terrain');
const directions=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
const enter=World.enter(World.defaultWorld(),'precision-walker',1000);
let world=enter.world;
const original=world.players['precision-walker'];
const start={x:original.x,z:original.z};
const direction=directions.find(d=>
 Collision.canTraverse(start.x,start.z,start.x+d.x*2,start.z+d.z*2,{bounds:World.WORLD_SIZE}) &&
 Terrain.canTraverse(start.x,start.z,start.x+d.x*2,start.z+d.z*2));
assert(direction,'fresh expedition has at least one unobstructed short test path');
const command=(sequence,magnitude=0.2,sprint=false)=>({
 sequence,x:direction.x*magnitude,z:direction.z*magnitude,sprint
});
let result=World.moveInput(world,'precision-walker',command(1),2000);
world=result.world;
assert.equal(result.result.inputAck.elapsedMs,0,'first input establishes a new authoritative time baseline');
assert.equal(world.players['precision-walker'].x,start.x);
assert.equal(world.players['precision-walker'].z,start.z);
for(let i=0;i<4;i++){
 const before=world.players['precision-walker'];
 result=World.moveInput(world,'precision-walker',command(i+2),2100+i*100);
 world=result.world;
 const after=world.players['precision-walker'];
 const step=Math.hypot(after.x-before.x,after.z-before.z);
 assert(Math.abs(step-0.16)<1e-7,'20%-deflected analog stick travels precisely 0.16 unit per 100ms');
 assert(step<=0.16000001,'precision cannot exceed the server-derived speed budget');
 assert.equal(result.result.inputAck.sequence,i+2);
 assert.equal(result.result.inputAck.elapsedMs,100);
}
const p=world.players['precision-walker'];
assert(Math.abs(Math.hypot(p.x-start.x,p.z-start.z)-0.64)<1e-7,
 'four smooth analog steps conserve requested travel, rather than repeatedly rounding it to tenths');
assert(
 Math.abs(p.x*10-Math.round(p.x*10))>1e-6 ||
 Math.abs(p.z*10-Math.round(p.z*10))>1e-6,
 'continuous-input coordinates preserve sub-decimeter displacement');
assert.throws(()=>World.moveInput(world,'precision-walker',command(6),2450),/move_cooldown/,
 'high-frequency packets cannot bypass existing server limiter');
assert.throws(()=>World.moveInput(world,'precision-walker',{sequence:6,x:1,z:1,sprint:false},2600),/invalid_movement_vector/);
const beforeStall={x:p.x,z:p.z};
const stalled=World.moveInput(world,'precision-walker',command(6),3500);
assert.equal(stalled.result.inputAck.elapsedMs,0);
assert.equal(stalled.world.players['precision-walker'].x,beforeStall.x,
 'network stalls cannot bank fractional movement');
assert.equal(stalled.world.players['precision-walker'].z,beforeStall.z);
const saved=JSON.parse(JSON.stringify(stalled.world));
assert.equal(saved.players['precision-walker'].lastInputSequence,6,
 'higher coordinate precision is compatible with persistent replay protection');
console.log('Homefront analog movement: 20% stick precision, exact travel budget, input cadence, stalled transport, persistence and replay checks passed');
