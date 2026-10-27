import assert from 'node:assert/strict';
import {nearbyEstatesFishingSpot} from './estates-lake-fishing-adapter.mjs';
const spots=[
 {id:'public',access:'public',position:{x:1,z:2}},
 {id:'private',access:'property-rights',propertyId:'mansion-1',position:{x:20,z:2}}
];
assert.equal(nearbyEstatesFishingSpot({spots,position:{x:1,z:2},activeIsland:true})?.spot.id,'public');
assert.equal(nearbyEstatesFishingSpot({spots,position:{x:20,z:2},activeIsland:true}),null);
assert.equal(nearbyEstatesFishingSpot({spots,position:{x:20,z:2},activeIsland:true,verifiedPropertyIds:['mansion-1']})?.spot.id,'private');
assert.equal(nearbyEstatesFishingSpot({spots,position:{x:1,z:2},activeIsland:false}),null);
assert.throws(()=>nearbyEstatesFishingSpot({spots,position:{x:NaN,z:2},activeIsland:true}),TypeError);
console.log('Estates fishing proximity policy passed');
