import assert from 'node:assert/strict';
import {createRequire}from 'node:module';
import {vehicleCorridorAt,CITY_DRIVE_HALF_WIDTH} from '../client/arena/homefront-vehicle-corridors.mjs';
import {environmentalCandidates} from '../client/arena/homefront-world-generation.mjs';
const require=createRequire(import.meta.url);
const Collision=require('../server/homefront-collision');
const Vehicles=require('../server/homefront-vehicles');
assert.equal(vehicleCorridorAt(0,45),true,'city grid has continuous north-south streets');
assert.equal(vehicleCorridorAt(45,0),true,'city grid has continuous east-west streets');
assert.equal(vehicleCorridorAt(10,10),false,'ruined city blocks remain full of scenery');
assert.equal(vehicleCorridorAt(-35,-68),true,'Pine Crossing logging road is drivable');
assert.equal(vehicleCorridorAt(-23,-60),false,'creek route stays a narrow footpath');
assert.ok(CITY_DRIVE_HALF_WIDTH>Vehicles.VEHICLE_RADIUS*2,
  'an articulated turn must have margin around rover-width roads');
let offroad=0,road=0;
for(let cx=-2;cx<=1;cx++)for(let cz=-2;cz<=1;cz++){
 const scenery=environmentalCandidates(cx,cz,{density:0.18});
 for(const obj of scenery){
  if(vehicleCorridorAt(obj.x,obj.z))road++;else offroad++;
 }
}
assert.equal(road,0,'procedural scene no longer plants obstacles inside reserved drive corridors');
assert.ok(offroad>10,'road reservation must not erase immersive roadside scenery');
let passable=0,total=0;
for(let x=-80;x<=80;x+=20)for(let z=-70;z<=70;z+=3.5){
 if(Math.hypot(x,z)>90)continue;
 total++;
 if(Collision.isSafePosition(x,z,{radius:Vehicles.VEHICLE_RADIUS}))passable++;
}
assert.ok(passable/total>0.6,'most tested drivable grid-lane samples must have actual server clearance');
for(const o of Collision.OBSTACLES){
 if(o.id.startsWith('vehicle:')||o.id.startsWith('log:')||o.id.startsWith('debris:')){
  assert.equal(vehicleCorridorAt(o.x,o.z),false,
    'vehicle wreck/debris/log collision catalog must match the cleared roads');
 }
}
console.log('Homefront terrain: shared corridor width matches server collision; most streets clear; dense offroad clutter retained');
