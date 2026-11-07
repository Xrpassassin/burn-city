'use strict';
// One server-owned electric salvage rover per owner, physically parked within
// the shared Graveyard world. No client-selected spawn, rewards or position.
const Collision=require('./homefront-collision');
const Terrain=require('./homefront-terrain');
const {vehicleCorridorAt}=require('../client/arena/homefront-vehicle-corridors.mjs');
const BUILD_COST=Object.freeze({scrap:24,wood:12});
const CHARGE_COST=Object.freeze({scrap:2});
const VEHICLE_RADIUS=1.4; // includes the widest wheels and light collision buffer
const WORLD_BOUND=100;
const NEAR=3.5;
const MAX_SPEED=10; // m/s (36 km/h) on the existing 200m proof-of-concept map
const MAX_TURN=1.7; // radians/s
const STEP_INTERVAL=90;
const MAX_STEP_MS=280;
const MAX_VEHICLES=80;
const finite=(n,a,b,fallback=0)=>Number.isFinite(n)?Math.max(a,Math.min(b,n)):fallback;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function normalize(input){
 const out=Object.create(null);
 if(!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [owner,v] of Object.entries(input).slice(0,MAX_VEHICLES)){
  if(!owner||owner.length>128||!v||v.type!=='scrap_rover'||typeof v!=='object')continue;
  const x=Number(v.x),z=Number(v.z);
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(x,z)>WORLD_BOUND)continue;
  out[owner]={id:'rover:'+owner,type:'scrap_rover',owner,
    x:finite(x,-100,100),z:finite(z,-100,100),
    heading:finite(v.heading,-100000,100000),charge:finite(v.charge,0,100,0),
    driver:typeof v.driver==='string'?v.driver.slice(0,128):null,
    sequence:Number.isSafeInteger(v.sequence)&&v.sequence>=0?v.sequence:-1,
    lastDriveAt:finite(v.lastDriveAt,0,Number.MAX_SAFE_INTEGER,0)};
 }
 return out;
}
function roadClear(x,z,prevX=x,prevZ=z){
 return Collision.canTraverse(prevX,prevZ,x,z,{bounds:WORLD_BOUND,radius:VEHICLE_RADIUS,sampleStep:0.35}) &&
   Terrain.canTraverse(prevX,prevZ,x,z);
}
function segmentDistance(px,pz,x0,z0,x1,z1){
 const dx=x1-x0,dz=z1-z0,len=dx*dx+dz*dz;
 const t=len>0?Math.max(0,Math.min(1,((px-x0)*dx+(pz-z0)*dz)/len)):0;
 return Math.hypot(px-x0-t*dx,pz-z0-t*dz);
}
function dynamicRoadClear(world,account,x,z,prevX,prevZ,now,radius=VEHICLE_RADIUS){
 for(const [owner,other]of Object.entries(world.vehicles||{})){
  if(owner===account)continue;
  if(segmentDistance(other.x,other.z,prevX,prevZ,x,z)<radius+VEHICLE_RADIUS+0.35)return false;
 }
 for(const [id,other]of Object.entries(world.players||{})){
  if(id===account||other?.vehicleId||!Number.isFinite(other?.lastSeen)||
     now-other.lastSeen>45000)continue;
  if(segmentDistance(other.x,other.z,prevX,prevZ,x,z)<radius+0.55)return false;
 }
 // A rover cannot silently drive through a living infected group. Later
 // impacts may cause server-resolved knockdowns; this first slice stops the
 // vehicle instead of creating free zombie kills without combat authority.
 for(const encounter of Object.values(world.encounters||{})){
  if(encounter?.defeated||encounter?.hp<=0)continue;
  for(const infected of encounter.members||[]){
   if(infected.defeated||infected.hp<=0||
      !Number.isFinite(infected.x)||!Number.isFinite(infected.z))continue;
   if(segmentDistance(infected.x,infected.z,prevX,prevZ,x,z)<radius+0.55)return false;
  }
 }
 return true;
}
function parkingSpot(gate,vehicles){
 const offsets=[[0,4],[4,0],[-4,0],[0,-4],[6,0],[-6,0],[0,6],[0,-6],[8,0],[0,8]];
 let fallback=null;
 for(const [dx,dz]of offsets){
  const point={x:gate.x+dx,z:gate.z+dz};
  if(!roadClear(point.x,point.z)||!Collision.isSafePosition(point.x,point.z,{radius:VEHICLE_RADIUS}))continue;
  if(Object.values(vehicles).some(v=>distance(v,point)<4))continue;
  // Prefer road-accessible parking over a nearby bush/empty parcel.
  // Remote Homefront trailheads without a road keep a collision-safe fallback.
  if(vehicleCorridorAt(point.x,point.z))return point;
  fallback ||= point;
 }
 return fallback;
}
function build(world,base,owner,gate,now=Date.now()){
 if(!world?.players?.[owner]||!gate||!Number.isFinite(gate.x)||!Number.isFinite(gate.z))throw Error('no_homefront_vehicle_site');
 const player=world.players[owner];
 if(distance(player,gate)>7)throw Error('return_to_homefront_to_build_vehicle');
 if(world.interiors?.[owner]?.activeLandmarkId)throw Error('leave_building_to_build_vehicle');
 const vehicles=normalize(world.vehicles);
 if(vehicles[owner])throw Error('vehicle_already_owned');
 if(Object.keys(vehicles).length>=MAX_VEHICLES)throw Error('vehicle_capacity_reached');
 if(!base?.resources||Object.entries(BUILD_COST).some(([item,n])=>base.resources[item]<n))throw Error('insufficient_vehicle_materials');
 const position=parkingSpot(gate,vehicles);
 if(!position)throw Error('no_vehicle_parking_clearance');
 for(const [item,n]of Object.entries(BUILD_COST))base.resources[item]-=n;
 const vehicle=vehicles[owner]={id:'rover:'+owner,type:'scrap_rover',owner,
  ...position,heading:0,charge:100,driver:null,sequence:-1,lastDriveAt:0};
 world.vehicles=vehicles;player.lastSeen=now;
 return vehicle;
}
function board(world,account,now=Date.now()){
 const player=world.players?.[account],v=world.vehicles?.[account];
 if(!player||!v)throw Error('no_owned_vehicle');
 if(world.interiors?.[account]?.activeLandmarkId)throw Error('leave_building_to_board');
 if(player.vehicleId||v.driver)throw Error('vehicle_occupied');
 if(distance(player,v)>NEAR)throw Error('too_far_from_vehicle');
 if(!roadClear(v.x,v.z))throw Error('vehicle_parking_blocked');
 v.driver=account;player.vehicleId=v.id;player.x=v.x;player.z=v.z;
 player.lastSeen=now;v.lastDriveAt=0;v.sequence=-1;
 return v;
}
function drive(world,account,input,now=Date.now()){
 const player=world.players?.[account],v=world.vehicles?.[account];
 if(!player||!v||v.driver!==account||player.vehicleId!==v.id)throw Error('not_driving_vehicle');
 if(!input||typeof input!=='object'||Array.isArray(input)||
    !Number.isSafeInteger(input.sequence)||input.sequence!==v.sequence+1||
    !Number.isFinite(input.steer)||Math.abs(input.steer)>1||
    !Number.isFinite(input.throttle)||Math.abs(input.throttle)>1)throw Error('invalid_vehicle_input');
 if(v.lastDriveAt && (now<v.lastDriveAt||now-v.lastDriveAt<STEP_INTERVAL))throw Error('vehicle_input_cooldown');
 const elapsed=v.lastDriveAt?Math.min(MAX_STEP_MS,now-v.lastDriveAt):125;
 const dt=elapsed/1000;
 const heading=v.heading+input.steer*MAX_TURN*dt;
 const step=input.throttle*MAX_SPEED*dt;
 const x=v.x+Math.sin(heading)*step,z=v.z+Math.cos(heading)*step;
 const blocked=Math.abs(step)>0.001&&(!roadClear(x,z,v.x,v.z)||
   !dynamicRoadClear(world,account,x,z,v.x,v.z,now));
 // Even a blocked movement records the input, preventing repeated probes
 // from multiplying travel time or clipping across another frame.
 v.sequence=input.sequence;v.lastDriveAt=now;v.heading=heading;
 if(v.charge<=0&&Math.abs(step)>0.001)throw Error('vehicle_needs_charge');
 if(!blocked&&Math.abs(step)>0.001){
   v.x=Math.round(x*100)/100;v.z=Math.round(z*100)/100;
   v.charge=Math.max(0,Math.round((v.charge-Math.abs(step)*0.42)*100)/100);
 }
 player.x=v.x;player.z=v.z;player.lastSeen=now;player.lastMove=now;
 player.noiseLevel=Math.max(player.noiseLevel||0,48);
 player.noiseX=player.x;player.noiseZ=player.z;player.lastNoiseAt=now;
 return {vehicle:v,blocked,moved:!blocked&&Math.abs(step)>0.001};
}
function dismount(world,account,now=Date.now()){
 const player=world.players?.[account],v=world.vehicles?.[account];
 if(!player||!v||v.driver!==account||player.vehicleId!==v.id)throw Error('not_driving_vehicle');
 // Prefer the right/left doors relative to the actual heading, then try
 // fore/aft clearance. Never place a pedestrian through a wall or live actor.
 const offsets=[[2.1,0],[-2.1,0],[0,2.1],[0,-2.1],[2.1,2.1],[-2.1,-2.1]];
 const sin=Math.sin(v.heading),cos=Math.cos(v.heading);
 const exit=offsets.map(([dx,dz])=>({x:v.x+dx*cos+dz*sin,z:v.z-dx*sin+dz*cos}))
   .find(p=>Collision.isSafePosition(p.x,p.z) &&
     Collision.canTraverse(v.x,v.z,p.x,p.z,{radius:Collision.PLAYER_RADIUS,sampleStep:0.2}) &&
     Terrain.canTraverse(v.x,v.z,p.x,p.z) &&
     dynamicRoadClear(world,account,p.x,p.z,v.x,v.z,now,Collision.PLAYER_RADIUS));
 if(!exit)throw Error('vehicle_exit_blocked');
 v.driver=null;v.lastDriveAt=0;
 player.vehicleId=null;player.x=exit.x;player.z=exit.z;player.lastSeen=now;
 return v;
}
function release(world,account){
 const v=world.vehicles?.[account];
 if(v?.driver===account){v.driver=null;v.lastDriveAt=0;}
 if(world.players?.[account])world.players[account].vehicleId=null;
}
function charge(world,base,account,gate,now=Date.now()){ 
 const p=world.players?.[account],v=world.vehicles?.[account];
 if(!p||!v)throw Error('no_owned_vehicle');
 if(v.driver||distance(p,v)>NEAR)throw Error('park_at_rover_to_charge');
 if(!gate||distance(v,gate)>10)throw Error('return_to_homefront_garage_to_charge');
 if(!base?.resources||base.resources.scrap<CHARGE_COST.scrap)throw Error('insufficient_vehicle_materials');
 if(v.charge>=99.9)throw Error('vehicle_fully_charged');
 base.resources.scrap-=CHARGE_COST.scrap;
 v.charge=Math.min(100,v.charge+25);p.lastSeen=now;
 return v;
}
function publicVehicles(world,viewer,radius=40){
 const p=world.players?.[viewer];
 if(!p)return [];
 return Object.values(normalize(world.vehicles)).filter(v=>distance(v,p)<=radius||v.owner===viewer)
   .map(v=>({id:v.id,type:v.type,x:v.x,z:v.z,heading:v.heading,charge:v.charge,
     occupied:!!v.driver,mine:v.owner===viewer,
     ...(v.owner===viewer?{sequence:v.sequence}:{} )}));
}
module.exports={BUILD_COST,CHARGE_COST,VEHICLE_RADIUS,MAX_SPEED,MAX_VEHICLES,normalize,roadClear,parkingSpot,build,board,drive,dismount,release,charge,publicVehicles};
