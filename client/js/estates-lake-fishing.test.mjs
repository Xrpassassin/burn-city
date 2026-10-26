import assert from 'node:assert/strict';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {buildEstatesLakeFishingSpots,canUseEstatesFishingSpot} from './estates-lake-fishing.mjs';
const manifest=buildEstatesIslandScene({catalog:{
 tiers:[{id:'mansion'},{id:'starter'}],
 properties:[{id:'mansion-01',tier:'mansion',address:'Mansion 1'},{id:'starter-01',tier:'starter',address:'Starter 1'}]
}});
const spots=buildEstatesLakeFishingSpots(manifest);
assert(spots.some(s=>s.shore==='island'&&s.access==='public'));
assert(spots.some(s=>s.shore==='outer'&&s.access==='public'));
assert(spots.filter(s=>s.kind==='private-dock').every(s=>s.propertyId&&s.access==='property-rights'));
assert(spots.filter(s=>s.kind==='private-dock').every(s=>!canUseEstatesFishingSpot(s)));
assert(spots.filter(s=>s.kind==='private-dock').every(s=>canUseEstatesFishingSpot(s,{hasVerifiedPropertyAccess:true})));
assert(spots.filter(s=>s.access==='public').every(s=>canUseEstatesFishingSpot(s)));
assert(!spots.some(s=>s.propertyId==='starter-01'));
assert.throws(()=>buildEstatesLakeFishingSpots(null),TypeError);
console.log('Estates dual-shore fishing station policy tests passed');
