import assert from 'node:assert/strict';
import {zombieModelPolicy as decide} from './zombie-model-policy.mjs';
const high=decide({hardwareConcurrency:12,deviceMemory:16,userAgent:'Mozilla/5.0 desktop'});
assert.equal(high.enabled,true);
assert.equal(high.maxModels,8);
assert.equal(high.maxDistance,28);
assert.equal(high.proceduralHordeFallback,true);
const weak=decide({hardwareConcurrency:2,deviceMemory:2,userAgent:'Mozilla/5.0 desktop'});
assert.equal(weak.enabled,false);
assert.equal(weak.maxModels,0);
const mobile=decide({hardwareConcurrency:8,deviceMemory:6,userAgent:'Mozilla/5.0 iPhone Mobile'});
assert.equal(mobile.enabled,true);
assert.equal(mobile.maxModels,3);
assert.equal(mobile.maxDistance,20);
assert.equal(decide({hardwareConcurrency:8,deviceMemory:2,userAgent:'Android Mobile'}).enabled,false);
for(const state of [
 {low:true},{saveData:true},{reducedMotion:true},{search:'?zombieModels=0'}
]){
 assert.equal(decide({...state,hardwareConcurrency:12,deviceMemory:16}).enabled,false);
}
assert.equal(decide({search:'?zombieModels=1',hardwareConcurrency:2,deviceMemory:2,low:true}).enabled,true);
assert.equal(decide({search:'?zombieModels=1',hardwareConcurrency:2,deviceMemory:2,low:true}).maxModels,3);
assert.equal(decide({search:'?zombieModels=1',hardwareConcurrency:2,deviceMemory:2,low:true,userAgent:'iPhone Mobile'}).maxModels,2);
assert.equal(decide({search:'?zombieModels=0',hardwareConcurrency:16,deviceMemory:32}).reason,'manual_off');
assert.equal(decide({hardwareConcurrency:undefined,deviceMemory:undefined}).enabled,true);
assert.equal(decide({hardwareConcurrency:undefined,deviceMemory:undefined,userAgent:'Android Mobile'}).enabled,false);
const safari=decide({hardwareConcurrency:6,deviceMemory:undefined,userAgent:'Mozilla/5.0 iPhone Safari'});
assert.equal(safari.enabled,true,'modern iOS should not force bad-looking procedural-only hordes because deviceMemory is private');
assert.equal(safari.maxModels,2,'unknown RAM limits the new skinned zombie models to two close characters');
assert.equal(safari.maxDistance,16,'unknown RAM has a safe close-up distance');
assert.equal(decide({hardwareConcurrency:4,deviceMemory:undefined,userAgent:'iPhone'}).enabled,false,'older mobiles remain in low-cost mode');
assert.equal(decide({hardwareConcurrency:6,deviceMemory:undefined,userAgent:'iPhone',low:true}).enabled,false,'low graphics remains an explicit performance override');
assert.equal(decide({hardwareConcurrency:6,deviceMemory:undefined,userAgent:'iPhone',reducedMotion:true}).enabled,false,'accessibility preference wins');
assert.equal(decide({hardwareConcurrency:6,deviceMemory:undefined,userAgent:'iPhone',saveData:true}).enabled,false,'data saver wins');

console.log('Adaptive Zombies animation policy: desktop, mobile, accessibility, data saver, manual override and procedural fallback checks passed');
