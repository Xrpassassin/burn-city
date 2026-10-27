import assert from 'node:assert/strict';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {createEstatesIslandNavigation} from './estates-island-navigation.mjs';
const manifest=buildEstatesIslandScene({catalog:{
 tiers:[{id:'mansion'}],
 properties:[{id:'mansion-01',tier:'mansion',address:'Lakefront Estate'}]
}});
const nav=createEstatesIslandNavigation({manifest});
const lot=manifest.lots[0];
const approach={x:lot.position.x+9,y:0,z:lot.position.z};
assert(nav.isWalkable(approach),'exterior approach is traversable');
assert.equal(nav.nearbyProperty(approach,3)?.propertyId,'mansion-01');
assert.equal(nav.nearbyProperty({x:lot.position.x+25,y:0,z:lot.position.z},3),null);
console.log('Estates exterior inspection reachability passed');
