import assert from 'node:assert/strict';
import {estateHelipadPosition,createEstateHelicopterFlight,FLIGHT_LIMITS,FLIGHT_ROUTE,HELICOPTER_PRICE_XRP} from './estates-helicopter-flight.mjs';
import {createEstateHelicopterWorld} from './estates-helicopter-world.mjs';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {estateHouseParts} from './estates-house-design.mjs';
const mansion={propertyId:'mansion-01',position:{x:15,y:.15,z:40},tier:'mansion'};
const trailer={propertyId:'trailer-01',position:{x:45,y:.15,z:40},tier:'trailer'};
const pad=estateHelipadPosition(mansion);
assert.equal(HELICOPTER_PRICE_XRP,60);
assert.deepEqual(pad,{x:15,z:40},'large helicopters use the reserved property rooftop, not adjacent plots');
assert.equal(FLIGHT_ROUTE.length,3);
// Clearance QA against the real island's 20×18 lots and authored house roof geometry.
const estateCatalog={tiers:[{id:'family'},{id:'mansion'}],properties:[
 {id:'family-qa',tier:'family',address:'Family QA Lot'},
 {id:'mansion-qa',tier:'mansion',address:'Mansion QA Lot'}]};
const manifest=buildEstatesIslandScene({catalog:estateCatalog,seed:321});
for(const lot of manifest.lots.filter(l=>['family','mansion'].includes(l.tier))){
 const aircraft=createEstateHelicopterFlight(lot),landingPad=estateHelipadPosition(lot);
 const rotorRadius=4.1,padRadius=4.3;
 assert(Math.abs(landingPad.x-lot.position.x)+padRadius<=lot.dimensions.width/2,
  'helicopter pad stays within lot horizontal bounds');
 assert(Math.abs(landingPad.z-lot.position.z)+padRadius<=lot.dimensions.depth/2,
  'helicopter pad stays within lot longitudinal bounds');
 assert(rotorRadius<=padRadius,'rotor fits the helipad disc');
 const top=Math.max(...estateHouseParts(lot).map(p=>p.y+p.height/2));
 assert(lot.position.y+aircraft.position.altitude-1.4+.18>lot.position.y+top,
  'helipad deck clears the highest authored roof/chimney geometry');
 assert(aircraft.land(),'roof pad starts ready to land for both eligible property tiers');
}
const flight=createEstateHelicopterFlight(mansion);
assert.equal(flight.position.altitude,9.4,'mansion helicopter starts on the roof, not ground level');
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
// Descending outside the landing disc must never teleport back to the property.
const awayPosition={...flight.position};
assert(Math.hypot(awayPosition.x-pad.x,awayPosition.z-pad.z)>10,'cruise test reached the island away from its pad');
let previousAlt=flight.position.altitude;
for(let i=0;i<550;i++){
 const s=flight.tick({dt:.05,descend:1,yaw:0});
 assert(Math.abs(s.position.altitude-previousAlt)<=.451,'vertical position changes smoothly per 50ms step');
 previousAlt=s.position.altitude;
}
assert.equal(flight.position.altitude,FLIGHT_LIMITS.minCruiseAltitude,
 'outside the private pad cannot descend into neighboring houses');
assert(Math.hypot(flight.position.x-pad.x,flight.position.z-pad.z)>10,
 'minimum-cruise-altitude recovery never snaps the helicopter home');
// Departing the rooftop at low altitude must remain inside the hover disc.
// Reproduces low-altitude momentum after releasing the throttle on approach.
const lowHover=createEstateHelicopterFlight(mansion);
let lowPrev=lowHover.position.altitude;
for(let i=0;i<160;i++){
 const step=lowHover.tick({dt:.05,yaw:0,ascend:i<10?1:0,descend:i>=10?1:0,forward:1});
 assert(Math.abs(step.position.altitude-lowPrev)<=.451,'no sudden climb when leaving roof hover disc');
 if(step.position.altitude<FLIGHT_LIMITS.minCruiseAltitude)
  assert(Math.hypot(step.position.x-pad.x,step.position.z-pad.z)<=3.6,
   'below obstacle-clearance altitude aircraft stays inside safe roof hover area');
 lowPrev=step.position.altitude;
}
flight.reset();
assert.deepEqual(flight.position,{...pad,altitude:9.4});
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
class Material{constructor(options){this.options=options;this.color={value:options.color,setHex(hex){this.value=hex;}};}dispose(){this.disposed=true;}}
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
assert.equal(aircraft.position.y,8.15,'premium estate helipad sits atop its roof');
assert(aircraft.children.some(x=>x.name==='roof-helipad-support'));
assert(aircraft.children.some(x=>x.name==='luxury-utility-helicopter'));
assert.equal(world.setStyle('mansion-01',{paint:'royal',trim:'copper',callsign:'DRAGON ONE'}),true);
const aircraftModel=aircraft.children.find(x=>x.name==='luxury-utility-helicopter');
const fuselage=aircraftModel.children.find(x=>x.name==='fuselage');
const roof=aircraftModel.children.find(x=>x.name==='roof');
assert.equal(fuselage.material.color.value,0x55426f,'paint recolors fuselage');
assert.equal(roof.material.color.value,0xd1784d,'trim recolors accent');
assert.equal(world.setStyle('mansion-01',{paint:'forged',trim:'brass'}),false,'invalid owner paint choice cannot affect aircraft');
assert.equal(world.board('mansion-01')?.position.altitude,9.4);
assert.equal(world.board('mansion-01'),null,'only one flight session per local world');
world.tick({propertyId:'mansion-01',position:{x:pad.x,z:pad.z,altitude:11},rotor:1.1,heading:.7,dt:.05});
assert.equal(world.park(),true);
assert.equal(world.activeProperty,null);
assert.equal(world.setVerified([]),true);
assert.equal(world.hasHelicopter('mansion-01'),false);
assert.equal(world.dispose(),true);assert.equal(root.children.length,0);
assert.equal(world.dispose(),false);
console.log('Estates helicopters: 60 XRP aircraft, tier-gated geometry, safe takeoff, flight bounds, parking and disposal passed');
