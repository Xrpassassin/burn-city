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
console.log('Adaptive Zombies animation policy: desktop, mobile, accessibility, data saver, manual override and procedural fallback checks passed');
