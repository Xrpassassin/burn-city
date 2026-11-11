import assert from 'node:assert/strict';
import {verifiedGoldFraction,goldCoreRadiusFraction,towerHelixRadius,towerStreamTaper,towerStreamOpacity,easeProfile,towerSpiralLane,towerJunctionGradient,towerJunctionOpacity} from '../client/js/amm-gold-vein-profile.mjs';
assert.equal(verifiedGoldFraction(null),0);
assert.equal(verifiedGoldFraction(undefined),0);
assert.equal(verifiedGoldFraction(NaN),0);
assert.equal(verifiedGoldFraction(-.05),0);
assert.equal(verifiedGoldFraction(1.001),0,'unverified/out-of-range data is never treated as 100% locked');
assert.equal(verifiedGoldFraction(.92),.92);
assert.equal(goldCoreRadiusFraction(0),0);
assert(Math.abs(goldCoreRadiusFraction(.25)-.44)<1e-8,'25% verified lock yields half the 100% bar radius');
assert(Math.abs(goldCoreRadiusFraction(1)-.88)<1e-8,'100% always leaves an activity-colour sheath');
for(let i=0;i<=100;i++){
 const q=i/100,r=goldCoreRadiusFraction(q);
 assert(r>=0&&r<=.88);
 if(i>0)assert(r>goldCoreRadiusFraction((i-1)/100),'more verified LP permanently locked must always widen the gold bar');
}
assert(goldCoreRadiusFraction(.99)>goldCoreRadiusFraction(.5),'relative LP share rather than raw token amount drives width');
assert(Math.abs(easeProfile(0))<1e-8&&Math.abs(easeProfile(1)-1)<1e-8);
const towerRadius=4.5,safe=3.75,results=[...Array(101)].map((_,i)=>towerHelixRadius(towerRadius,safe,i/100));
assert.equal(results[0],towerRadius);
assert(results.every(v=>v>=safe+.12-1e-8&&v<=towerRadius+1e-8),'spiral does not intersect the structure');
assert(results.every((v,i)=>i===0||v<=results[i-1]+1e-8),'spiral settles smoothly toward the wall');
assert(Math.abs(results[0]-results[1])<.00001,'no abrupt radial kink where the bridge connects');
assert(Math.abs(results[99]-results[100])<.001,'the final approach settles at the face');
const taper=[...Array(101)].map((_,i)=>towerStreamTaper(i/100));
const fade=[...Array(101)].map((_,i)=>towerStreamOpacity(i/100));
assert.equal(taper[0],1);assert(Math.abs(taper[100]-.34)<1e-8);
assert.equal(fade[0],1);assert.equal(fade[100],0);
assert(taper.every((v,i)=>i===0||v<=taper[i-1]+1e-8));
assert(fade.every((v,i)=>i===0||v<=fade[i-1]+1e-8));
assert(taper.every(v=>v>=.34-1e-8),'a shrinking gold core is still visible before it fades');
console.log('AMM gold bars: verified LP percentage, conservative unknowns, tangent-safe tower approach and smooth fade passed');

for(let i=1;i<=100;i++){
 const lane=towerSpiralLane(i);
 assert(lane.turns>=1,'every AMM must wrap its connected tower at least once');
 assert(lane.radialOffset>=0,'no wrap lane may pierce its building');
 assert(lane.radialOffset<7,'even 100 connections should not create a giant starburst');
 if(i>1)assert.notDeepEqual([lane.ring,lane.layer],[towerSpiralLane(i-1).ring,towerSpiralLane(i-1).layer]);
}
assert.equal(towerSpiralLane(1).radialOffset,0);
assert.equal(towerSpiralLane(7).layer,1,'beyond the former 6-spiral cap gets a second layer');
assert.equal(towerJunctionGradient(0),0);
assert.equal(towerJunctionGradient(1),1);
assert.equal(towerJunctionOpacity(.85,.22,0),.85,'seam starts with the EXACT rail shell alpha');
assert.equal(towerJunctionOpacity(.95,.45,0),.95,'inner core starts with the EXACT rail core alpha');
assert.equal(towerJunctionOpacity(.85,.22,1),0,'tower seam fades away at the tail');
const gs=Array.from({length:101},(_,i)=>towerJunctionGradient(i/100));
assert(gs.every((v,i)=>i===0||v>=gs[i-1]),'gradient must be monotone and free of steps');
assert(gs.every(v=>v>=0&&v<=1));
assert(Math.abs(gs[1]-gs[0])<.01,'junction gradient has a smooth start');
assert(Math.abs(gs[30]-gs[31])<.01,'junction gradient reaches plateau smoothly');
console.log('AMM endpoint lanes and bridge-to-tower gradient acceptance passed');
