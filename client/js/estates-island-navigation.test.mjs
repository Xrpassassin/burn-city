import assert from 'node:assert/strict';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {createEstatesIslandNavigation} from './estates-island-navigation.mjs';

const catalog={
 tiers:[{id:'trailer'},{id:'apartment'},{id:'starter'},{id:'family'},{id:'mansion'}],
 properties:[
  {id:'starter-01',tier:'starter',address:'Starter Lane 01'},
  {id:'mansion-01',tier:'mansion',address:'Lakefront Estate 01'}
 ]
};
const manifest=buildEstatesIslandScene({catalog,seed:123});
const nav=createEstatesIslandNavigation({manifest});
assert(nav.isWalkable({x:0,y:0,z:0}));
assert.equal(nav.isWalkable({x:0,y:0,z:220}),false,'lake and outside island are not walkable');
assert.equal(nav.isWalkable({x:0,y:0,z:159}),true,'primary bridge corridor is walkable');
assert.equal(nav.isWalkable({x:30,y:0,z:159}),false,'off-bridge water is blocked');
assert.equal(nav.isWalkable({x:-200,y:0,z:188}),true,'city bridge corridor is walkable');
assert.equal(nav.isWalkable({x:-230,y:0,z:188}),false,'outside the city bridge is blocked');

// Walk the complete physical connection in small steps, not merely isolated walkable samples.
let route={x:-195,y:0,z:188};
assert(nav.isWalkable(route),'city-side spawn must be on the bridge deck');
for(const waypoint of [{x:-8,z:188},{x:0,z:188},{x:0,z:159},{x:0,z:118}]) {
  for(let i=0;i<1000&&Math.hypot(waypoint.x-route.x,waypoint.z-route.z)>.01;i++) {
    const before=Math.hypot(waypoint.x-route.x,waypoint.z-route.z);
    const dx=waypoint.x-route.x,dz=waypoint.z-route.z,d=Math.hypot(dx,dz),step=Math.min(.5,d);
    const next=nav.move(route,{x:dx/d*step,y:0,z:dz/d*step});
    route={...next.position};
    assert(nav.isWalkable(route),'continuous bridge route must not strand the player at '+JSON.stringify(route));
    assert(Math.hypot(waypoint.x-route.x,waypoint.z-route.z)<before,'movement must progress toward each bridge waypoint');
  }
  assert(Math.hypot(waypoint.x-route.x,waypoint.z-route.z)<=.01,'waypoint must be reachable: '+JSON.stringify(waypoint));
}
assert(route.z<120,'bridge route must reach the island side of the approach');
assert(nav.collisionCount>0);
assert.equal(nav.buildingColliderCount,2);
assert.equal(nav.treeColliderCount,42);
assert.equal(nav.landmarkColliderCount,11,'public landmark counters, benches, signs, and rails contribute collision shapes');
assert.equal(nav.isWalkable({x:0,y:0,z:101}),false,'welcome kiosk structure blocks player traversal');
assert.equal(nav.isWalkable({x:77,y:0,z:25}),false,'market counter blocks player traversal');
assert.equal(nav.isWalkable({x:0,y:0,z:24}),false,'plaza marker has a physical collision');
assert.equal(nav.isWalkable({x:0,y:0,z:29}),true,'public plaza remains walkable around its marker');
assert.equal(nav.isWalkable({x:75,y:0,z:94}),true,'the overlook deck remains accessible');
assert.equal(nav.isWalkable({x:75+4.35,y:0,z:94}),false,'overlook railing prevents walking off the deck');
assert.equal(nav.isWalkable({x:-79,y:0,z:97}),false,'trailhead signpost has a physical collision');

const start={x:0,y:0,z:0};
const moved=nav.move(start,{x:3,y:0,z:0});
assert(moved.moved);
assert(Math.abs(moved.position.x-3)<1e-8);
assert.equal(moved.position.y,0);
const outside=nav.move({x:0,y:0,z:140},{x:50,y:0,z:0});
assert(Math.abs(outside.position.x)<=140,'movement cannot escape island boundary');
assert(nav.isWalkable(outside.position),'resolved position remains walkable');

const house=manifest.lots.find(l=>l.propertyId==='starter-01');
const inspect=nav.nearbyProperty({x:house.position.x,y:0,z:house.position.z+8},9);
assert.equal(inspect.propertyId,'starter-01');
assert.equal(inspect.assigned,true);
assert.equal(inspect.interaction,'inspect-property');
assert.equal(nav.nearbyProperty({x:0,y:0,z:0},2),null);
const empty=manifest.lots.find(l=>!l.propertyId);
const unassigned=nav.nearbyProperty({x:empty.position.x,y:0,z:empty.position.z},2);
assert.equal(unassigned.assigned,false);
assert.equal(unassigned.propertyId,null);
assert.throws(()=>nav.move({x:NaN,y:0,z:0},{x:1,y:0,z:0}),TypeError);
assert.throws(()=>createEstatesIslandNavigation({manifest,playerRadius:0}),/playerRadius/);
console.log('estates-island-navigation: all tests passed');

// Every purchasable property's public arrival must be walkable and identify
// that home when the visitor inspects it, including large mansions.
for(const lot of manifest.lots.filter(l=>l.propertyId)){
 const arrival=nav.propertyApproach(lot.propertyId);
 assert(arrival&&nav.isWalkable(arrival),'safe arrival for '+lot.propertyId);
 assert.equal(nav.nearbyProperty(arrival)?.propertyId,lot.propertyId,'arrival inspects the selected home');
}
assert.equal(nav.propertyApproach('not-a-real-property'),null);
