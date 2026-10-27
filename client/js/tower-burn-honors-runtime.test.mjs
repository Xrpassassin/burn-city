import assert from 'node:assert/strict';
import { createTowerHonorsRuntime } from './tower-burn-honors-runtime.mjs';
const objects = new Set(), scene = { add:o=>objects.add(o), remove:o=>objects.delete(o) };
let disposed = 0, creations = 0;
const createAvatar = () => {
 creations++;
 const object = {position:{set(x,y,z){this.x=x;this.y=y;this.z=z}},rotation:{y:0}};
 return {object,dispose:()=>{disposed++}};
};
const rt = createTowerHonorsRuntime({
 scene,tower:{x:0,z:0},createAvatar,
 isWalkable:(x)=>x>0,heightAt:()=>3
});
const honorees = [
 {rank:1,wallet:'rOne',nftId:'A'.repeat(64),collectionKey:'racc'},
 {rank:2,wallet:'rTwo',nftId:'B'.repeat(64),collectionKey:'589'}
];
assert.equal(rt.refresh({status:'partial',honorees}),0);
assert.equal(creations,0);
assert.equal(rt.refresh({status:'verified',honorees}),1);
assert.equal(objects.size,1);
assert.equal([...objects][0].position.y,3);
assert.equal(rt.refresh({status:'verified',honorees}),1);
assert.equal(disposed,1);
assert.equal(rt.refresh({status:'unverified',honorees}),0);
assert.equal(disposed,2);
assert.equal(objects.size,0);
console.log('tower-burn-honors-runtime: all tests passed');
