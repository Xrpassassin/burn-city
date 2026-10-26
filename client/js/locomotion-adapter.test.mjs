import assert from 'node:assert/strict';
import {createLocomotionAdapter} from './locomotion-adapter.mjs';
let movement=[],animations=[];
const adapter=createLocomotionAdapter({
 toWorld:({x,z})=>({x:-z,z:x}),
 applyMovement:frame=>movement.push(frame),
 onAnimation:(state)=>animations.push(state)
});
assert.throws(()=>createLocomotionAdapter(),TypeError);
const f=adapter.step({keys:new Set(['w','d']),dt:1/60,run:true});
assert.ok(Math.abs(Math.hypot(f.world.x,f.world.z)-1)<1e-9);
assert.equal(f.state,'run');
assert.equal(movement.length,1);
assert.deepEqual(animations,['run']);
assert.equal(adapter.step({grounded:false}).state,'jump');
assert.throws(()=>adapter.step({dt:Infinity}),RangeError);
assert.throws(()=>adapter.step({dt:-1}),RangeError);
assert.throws(()=>adapter.step({dt:1}),RangeError);
adapter.dispose();
assert.equal(adapter.disposed,true);
assert.throws(()=>adapter.step(),/disposed/);
const broken=createLocomotionAdapter({toWorld:()=>({x:NaN,z:0}),applyMovement:()=>{}});
assert.throws(()=>broken.step(),TypeError);
console.log('Shared locomotion adapter contract tests passed');
