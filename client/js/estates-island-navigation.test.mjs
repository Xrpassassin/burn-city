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
assert(nav.collisionCount>0);
assert.equal(nav.buildingColliderCount,2);
assert.equal(nav.treeColliderCount,42);

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
