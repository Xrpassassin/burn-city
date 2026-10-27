import assert from 'node:assert/strict';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {createEstatesIslandNavigation} from './estates-island-navigation.mjs';
const manifest=buildEstatesIslandScene({catalog:{tiers:[],properties:[]},seed:20261024});
const nav=createEstatesIslandNavigation({manifest});
for(const landmark of manifest.landmarks){
 const approach=nav.accessibleApproach(landmark.position,3);
 assert(approach,'landmark must have an accessible perimeter: '+landmark.id);
 assert(nav.isWalkable(approach),'landmark approach must not intersect collision: '+landmark.id);
 assert(Math.hypot(approach.x-landmark.position.x,approach.z-landmark.position.z)<=landmark.interactionRadius,'landmark approach must be within interaction range: '+landmark.id);
}
assert.equal(nav.accessibleApproach({x:0,z:220}),null,'water outside island must not produce false approach');
assert.throws(()=>nav.accessibleApproach({x:NaN,z:0}),TypeError);
console.log('Estates public landmark approach tests passed');
