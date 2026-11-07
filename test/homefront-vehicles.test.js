'use strict';
const assert=require('node:assert/strict');
const World=require('../server/homefront-world');
const Core=require('../server/homefront-core');
const Cars=require('../server/homefront-vehicles');
const Collision=require('../server/homefront-collision');
let world=World.defaultWorld();
const entered=World.enter(world,'driver-a',1000);
world=entered.world;
world.encounters={}; // physical infected-blocker test creates one explicitly below
const base=Core.createBase('driver-a',1000),gate=World.ownRefugeGate(world,'driver-a');
assert.ok(gate&&Collision.isSafePosition(gate.x,gate.z));
const initialScrap=base.resources.scrap,initialWood=base.resources.wood;
const rover=Cars.build(world,base,'driver-a',gate,1100);
assert.equal(rover.type,'scrap_rover');
assert.equal(base.resources.scrap,initialScrap-Cars.BUILD_COST.scrap);
assert.equal(base.resources.wood,initialWood-Cars.BUILD_COST.wood);
assert.ok(Cars.roadClear(rover.x,rover.z));
assert.ok(Math.hypot(rover.x-gate.x,rover.z-gate.z)<=10);
assert.throws(()=>Cars.build(world,base,'driver-a',gate,1200),/vehicle_already_owned/);
assert.ok(World.snapshot(world,'driver-a',1100).world.vehicles.some(v=>v.mine));
assert.equal(World.snapshot(world,'driver-a',1100).world.vehicles[0].driver,undefined,
  'driver wallet identity must never be broadcast with a public vehicle');
assert.throws(()=>Cars.board(world,'driver-a',1400),/too_far_from_vehicle|vehicle_parking_blocked/);
world.players['driver-a'].x=rover.x;world.players['driver-a'].z=rover.z;
const board=Cars.board(world,'driver-a',1500);
assert.equal(board.driver,'driver-a');
assert.equal(world.players['driver-a'].vehicleId,board.id);
assert.throws(()=>World.move(world,'driver-a',5,5,2400),/exit_vehicle_before_walking/);
assert.throws(()=>Cars.drive(world,'driver-a',{sequence:0,throttle:100,steer:0},2700),/invalid_vehicle_input/);
assert.throws(()=>Cars.drive(world,'driver-a',{sequence:3,throttle:1,steer:0},2700),/invalid_vehicle_input/);
const before={x:board.x,z:board.z};
const driven=Cars.drive(world,'driver-a',{sequence:0,throttle:1,steer:0},2700);
assert.ok(Math.hypot(driven.vehicle.x-before.x,driven.vehicle.z-before.z)<=Cars.MAX_SPEED*0.125+0.1,
  'cannot move farther than a single capped server movement step');
assert.ok(Cars.roadClear(driven.vehicle.x,driven.vehicle.z));
assert.equal(world.players['driver-a'].x,driven.vehicle.x);
assert.equal(world.players['driver-a'].z,driven.vehicle.z);
assert.throws(()=>Cars.drive(world,'driver-a',{sequence:1,throttle:1,steer:0},2740),/vehicle_input_cooldown/);
const next=Cars.drive(world,'driver-a',{sequence:1,throttle:0,steer:1},2890);
assert.ok(Math.abs(next.vehicle.heading)<1.5);
assert.ok(next.vehicle.charge<=100);
const snapshot=World.snapshot(world,'driver-a',2890);
assert.equal(snapshot.selfVehicle.id,rover.id);
// A live infected directly ahead blocks the rover until the road is cleared;
// collision must not mint free kill rewards or move the server vehicle.
const withInfected=structuredClone(world);
withInfected.encounters={blocking:{
  hp:12,defeated:false,members:[{
    x:withInfected.vehicles['driver-a'].x,
    z:withInfected.vehicles['driver-a'].z+1,
    hp:12,defeated:false
  }]
}};
const beforeInfected=structuredClone(withInfected.vehicles['driver-a']);
const blockedInfected=Cars.drive(withInfected,'driver-a',{sequence:2,throttle:1,steer:0},3100);
assert.equal(blockedInfected.blocked,true,'the rover cannot drive through a living infected');
assert.equal(blockedInfected.vehicle.x,beforeInfected.x);
assert.equal(blockedInfected.vehicle.z,beforeInfected.z);
assert.equal(blockedInfected.vehicle.charge,beforeInfected.charge,
  'blocked driving creates no free battery drain or zombie damage');
const seen=World.enter(world,'driver-b',3000);
world=seen.world;
const ownGateB=World.ownRefugeGate(world,'driver-b');
assert.notDeepEqual(gate,ownGateB);
assert.throws(()=>Cars.board(world,'driver-b',3100),/no_owned_vehicle/);
world.players['driver-b'].x=rover.x;world.players['driver-b'].z=rover.z;world.players['driver-b'].lastSeen=3100;
assert.equal(World.snapshot(world,'driver-b',3100).world.vehicles.length,1,
  'other survivors in physical range see the same rover but cannot claim it');
// The observer steps clear of the driver's seat before the physical exit.
world.players['driver-b'].x=rover.x+3.5;
const left=Cars.dismount(world,'driver-a',3300);
assert.equal(left.driver,null);
assert.equal(world.players['driver-a'].vehicleId,null);
assert.ok(Collision.isSafePosition(world.players['driver-a'].x,world.players['driver-a'].z));
const saved=World.leave(world,'driver-a',3400);
world=saved.world;
assert.ok(world.vehicles['driver-a'],'the rover persists in the shared map when its owner leaves');
assert.equal(world.vehicles['driver-a'].driver,null,'offline driver cannot retain control');
const back=World.enter(world,'driver-a',3600);
world=back.world;
assert.ok(world.vehicles['driver-a'],'returned owner finds the same parked rover');
assert.equal(Cars.normalize({'__proto__':{type:'scrap_rover',x:1,z:1}}).__proto__,undefined);
const copy=World.snapshot(world,'driver-a',3700);
assert.ok(copy.world.vehicles.some(v=>v.mine));
assert.throws(()=>Cars.charge(world,{resources:{scrap:0}},'driver-a',gate,3900),/insufficient_vehicle_materials|park_at_rover_to_charge|vehicle_fully_charged/);
// In a clear road fixture, a live pedestrian occupies the preferred door.
// The driver must leave on the other side, never overlap or teleport through it.
const exitWorld={players:{a:{x:0,z:-40,vehicleId:'rover:a',lastSeen:5000},
 b:{x:2.1,z:-40,lastSeen:5000}},vehicles:{a:{id:'rover:a',x:0,z:-40,heading:0,driver:'a'}},encounters:{}};
Cars.dismount(exitWorld,'a',5100);
assert.ok(Math.hypot(exitWorld.players.a.x-exitWorld.players.b.x,exitWorld.players.a.z-exitWorld.players.b.z)>=1.1,
 'a pedestrian blocks the door and the driver uses another safe exit');
assert.ok(exitWorld.players.a.x<0,'the alternate door is on the other side of this rover');
Object.assign(exitWorld.players.a,{x:0,z:-40,vehicleId:'rover:a'});
exitWorld.vehicles.a.driver='a';
exitWorld.players.b.lastSeen=0; // stale pedestrian no longer occupies the road
exitWorld.vehicles.b={id:'rover:b',x:3.6,z:-40,heading:0,driver:null};
Cars.dismount(exitWorld,'a',51000);
assert.ok(exitWorld.players.a.x<0,'a parked rover blocks the preferred door even without an active driver');
const trapped={players:{a:{x:0,z:-40,vehicleId:'rover:a',lastSeen:5000}},
 vehicles:{a:{id:'rover:a',x:0,z:-40,heading:Math.PI/2,driver:'a'}},encounters:{ambush:{hp:60,members:
 [[0,-42.1],[0,-37.9],[2.1,-40],[-2.1,-40],[2.1,-42.1],[-2.1,-37.9]].map(([x,z])=>({x,z,hp:10}))}}};
const beforeTrapped=structuredClone(trapped);
assert.throws(()=>Cars.dismount(trapped,'a',5100),/vehicle_exit_blocked/,'a surrounded vehicle cannot place its driver inside living infected');
assert.deepEqual(trapped,beforeTrapped,'a failed exit preserves the driver and vehicle state');
trapped.encounters.ambush.members.forEach(m=>m.hp=0);
Cars.dismount(trapped,'a',5200);
assert.equal(trapped.vehicles.a.driver,null,'clearing the ambush makes the same physical exit usable');
assert.equal(trapped.players.a.vehicleId,null);
console.log('Homefront shared rover: built with real resources, capped drive, collision, owner lock, presence, and persistence');
