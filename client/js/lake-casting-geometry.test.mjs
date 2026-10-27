import assert from 'node:assert/strict';
import {resolveLakeCast,estatesLakeWaterAt,nearEstatesLakeShore} from './lake-casting-geometry.mjs';
assert(estatesLakeWaterAt({x:840,z:0}),'outer shore water exists');
assert(!estatesLakeWaterAt({x:650,z:0}),'island interior is dry');
assert(!estatesLakeWaterAt({x:950,z:0}),'outside lake ring is dry');
const cast=resolveLakeCast({origin:{x:785,z:0},direction:{x:1,z:0},power:0.8,inWater:(x,z)=>estatesLakeWaterAt({x,z})});
assert(cast&&cast.x>790,'shore casts into water');
assert.equal(resolveLakeCast({origin:{x:650,z:0},direction:{x:0,z:1},inWater:()=>false}),null,'no fallback into dry ground');
assert.equal(resolveLakeCast({origin:{x:785,z:0},direction:{x:0,z:0},inWater:()=>true}),null);
for(let i=0;i<32;i++) {
 const a=i*Math.PI/16;
 const x=650+138.5*Math.cos(a), z=141.5*Math.sin(a);
 assert(nearEstatesLakeShore({x,z}),`shore is fishable at angle ${i}`);
}
assert(!nearEstatesLakeShore({x:650,z:0}),'inland area is not shore');
assert(!nearEstatesLakeShore({x:840,z:0}),'water itself is not shoreline');
console.log('Multi-lake casting geometry tests passed');
