import assert from 'node:assert/strict';
import {estateHelipadPosition,createEstateHelicopterFlight,FLIGHT_LIMITS,FLIGHT_ROUTE,HELICOPTER_PRICE_XRP} from './estates-helicopter-flight.mjs';
import {createEstateHelicopterWorld} from './estates-helicopter-world.mjs';
const mansion={propertyId:'mansion-01',position:{x:15,y:.15,z:40},tier:'mansion'};
const trailer={propertyId:'trailer-01',position:{x:45,y:.15,z:40},tier:'trailer'};
const pad=estateHelipadPosition(mansion);
assert.equal(HELICOPTER_PRICE_XRP,180);
assert(Math.abs(pad.x-6.8)<1e-9&&Math.abs(pad.z-34.5)<1e-9,'helipad position uses floating-point coordinates');
assert.equal(FLIGHT_ROUTE.length,3);
const flight=createEstateHelicopterFlight(mansion);
assert.equal(flight.position.altitude,1.4);
let result=flight.tick({dt:.05,yaw:0,forward:1});
assert.equal(result.position.x,pad.x);
assert.equal(result.position.z,pad.z,'helicopter cannot clip houses before safe cruising height');
for(let i=0;i<120;i++)result=flight.tick({dt:.05,yaw:0,ascend:1});
assert(result.position.altitude>FLIGHT_LIMITS.minCruiseAltitude);
const startZ=result.position.z;
for(let i=0;i<80;i++)result=flight.tick({dt:.05,yaw:0,forward:1});
assert(result.position.z<startZ-10,'flight should travel visibly once airborne');
assert(result.speed>2);
for(let i=0;i<1000;i++)result=flight.tick({dt:.05,yaw:Math.PI/2,forward:1,ascend:1});
assert(result.position.altitude<=FLIGHT_LIMITS.maxAltitude);
assert(result.position.x>=-FLIGHT_LIMITS.radiusX&&result.position.x<=FLIGHT_LIMITS.radiusX);
assert(result.position.z>=-FLIGHT_LIMITS.radiusZ&&result.position.z<=FLIGHT_LIMITS.radiusZ);
assert.equal(flight.land(),false,'cannot remotely land and leave at arbitrary locations');
flight.reset();
assert.deepEqual(flight.position,{...pad,altitude:1.4});
assert.equal(flight.land(),true,'helipad can accept a safe landing');
assert.throws(()=>flight.tick({dt:NaN}),/invalid_flight_input/);
assert.equal(flight.tick({dt:900,ascend:1}).elapsed<=.05,true,'background-tab resume cannot jump 900 seconds');
class Group {
 constructor(){this.children=[];this.position={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.rotation={x:0,y:0,z:0};this.name='';}
 add(x){this.children.push(x);x.parent=this;}
 remove(x){this.children=this.children.filter(a=>a!==x);}
 traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
}
class Geometry{dispose(){this.disposed=true;}}
class Material{constructor(options){this.options=options;}dispose(){this.disposed=true;}}
class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={set(){}};this.rotation={x:0,y:0,z:0};}}
const THREE={Group,Mesh,BoxGeometry:Geometry,CylinderGeometry:Geometry,MeshStandardMaterial:Material};
const root=new Group(),world=createEstateHelicopterWorld({THREE,parent:root,lots:[mansion,trailer]});
assert.equal(root.children.length,1);
assert.equal(world.hasHelicopter('mansion-01'),false);
assert.equal(world.setVerified([{propertyId:'trailer-01',unlockedItemIds:['estate-helicopter']}]),false,
 'invalid property tier may never spawn a helicopter');
assert.equal(world.setVerified([{propertyId:'mansion-01',unlockedItemIds:['unknown']}]),false);
assert.equal(world.setVerified([{propertyId:'mansion-01',unlockedItemIds:['estate-helicopter']}]),true);
assert.equal(world.hasHelicopter('mansion-01'),true);
assert.equal(world.properties.length,1);
const aircraft=root.children[0].children[0];
assert(aircraft.children.some(x=>x.name==='private-helipad'));
assert(aircraft.children.some(x=>x.name==='luxury-utility-helicopter'));
assert.equal(world.board('mansion-01')?.position.altitude,1.4);
assert.equal(world.board('mansion-01'),null,'only one flight session per local world');
world.tick({propertyId:'mansion-01',position:{x:pad.x,z:pad.z,altitude:11},rotor:1.1,heading:.7,dt:.05});
assert.equal(world.park(),true);
assert.equal(world.activeProperty,null);
assert.equal(world.setVerified([]),true);
assert.equal(world.hasHelicopter('mansion-01'),false);
assert.equal(world.dispose(),true);assert.equal(root.children.length,0);
assert.equal(world.dispose(),false);
console.log('Estates helicopters: 180 XRP aircraft, tier-gated geometry, safe takeoff, flight bounds, parking and disposal passed');
