'use strict';
const assert=require('node:assert/strict');
const {handle}=require('../server/homefront');
const data=new Map();
const store={
 load(name,fallback){return structuredClone(data.has(name)?data.get(name):fallback);},
 save(name,value){data.set(name,structuredClone(value));}
};
const call=async(method,path,acct,payload={})=>{
 const response={};
 await handle({method},response,new URL('http://local'+path),{
  json:(_res,status,body)=>Object.assign(response,{status,body}),
  gate:()=>false,ip:'127.0.0.1',body:async()=>payload,
  who:()=>acct?{acct}:null,store
 });
 return response;
};
const W='/api/homefront/world';
(async()=>{
 const previous=process.env.HOMEFRONT_VEHICLES_ENABLED;
 try{
  delete process.env.HOMEFRONT_VEHICLES_ENABLED;
  assert.equal((await call('POST',W+'/vehicle/build','A')).status,501,
   'production vehicle actions remain locked without explicit rollout');
  process.env.HOMEFRONT_VEHICLES_ENABLED='1';
  assert.equal((await call('POST',W+'/vehicle/build',null)).status,401);
  assert.equal((await call('POST',W+'/enter','A')).status,200);
  assert.equal((await call('POST',W+'/enter','B')).status,200);
  const initial=store.load('homefront.json',{});
  const scrap=initial.A.resources.scrap,wood=initial.A.resources.wood;
  const built=await call('POST',W+'/vehicle/build','A',{x:0,z:0,type:'fifty_cal'});
  assert.equal(built.status,200,JSON.stringify(built.body));
  assert.equal(built.body.vehicle.type,'scrap_rover');
  assert.equal(built.body.vehicleResult.action,'build');
  assert.equal(store.load('homefront.json',{}).A.resources.scrap,scrap-24);
  assert.equal(store.load('homefront.json',{}).A.resources.wood,wood-12);
  assert.equal((await call('POST',W+'/vehicle/build','A')).body.error,'vehicle_already_owned',
   'duplicate requests do not grant another rover or withdraw resources');
  const state=store.load('homefront-world.json',{});
  assert.equal(Object.keys(state.vehicles).length,1);
  assert.equal((await call('POST',W+'/vehicle/board','B')).body.error,'no_owned_vehicle',
   'other survivors cannot steal the owner-locked first rover');
  state.players.A.x=built.body.vehicle.x;state.players.A.z=built.body.vehicle.z;
  state.players.B.x=built.body.vehicle.x;state.players.B.z=built.body.vehicle.z;
  store.save('homefront-world.json',state);
  const view=await call('GET',W,'B');
  assert.equal(view.body.world.vehicles.length,1,'same rover is visible to stranger at same map coordinates');
  assert.equal(view.body.world.vehicles[0].mine,false);
  const board=await call('POST',W+'/vehicle/board','A');
  assert.equal(board.status,200,JSON.stringify(board.body));
  assert.equal(board.body.selfVehicle.id,'rover:A');
  assert.equal((await call('POST',W+'/move','A',{x:0,z:0})).body.error,'exit_vehicle_before_walking');
  assert.equal((await call('POST',W+'/vehicle/drive','B',{sequence:0,throttle:1,steer:0})).body.error,'not_driving_vehicle');
  assert.equal((await call('POST',W+'/vehicle/drive','A',{sequence:0,throttle:500,steer:0})).body.error,'invalid_vehicle_input');
  const movement=await call('POST',W+'/vehicle/drive','A',{sequence:0,throttle:1,steer:0,x:99,z:99});
  assert.equal(movement.status,200,JSON.stringify(movement.body));
  assert.equal(movement.body.vehicle.sequence,0);
  assert.ok(Math.hypot(movement.body.self.x-board.body.self.x,movement.body.self.z-board.body.self.z)<=1.26,
   'forged coordinates cannot teleport beyond the first server drive step');
  const exited=await call('POST',W+'/vehicle/dismount','A');
  assert.equal(exited.status,200,JSON.stringify(exited.body));
  assert.equal(exited.body.selfVehicle,null);
  assert.equal(store.load('homefront-world.json',{}).vehicles.A.driver,null);
  const left=await call('POST',W+'/leave','A');
  assert.equal(left.status,200);
  assert.ok(store.load('homefront-world.json',{}).vehicles.A,
   'parking and leaving does not erase the rover from the shared overworld');
  console.log('Rover HTTP API: guest guard, crafting cost, authoritatively capped drive, anti-theft, dismount and persistence');
 }finally{
  if(previous===undefined)delete process.env.HOMEFRONT_VEHICLES_ENABLED;
  else process.env.HOMEFRONT_VEHICLES_ENABLED=previous;
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
