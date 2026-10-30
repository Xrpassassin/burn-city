import assert from 'node:assert/strict';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
const tiers=['trailer','starter','family','apartment','mansion'].map(id=>({id}));
const properties=Array.from({length:21},(_,i)=>({id:'property-'+i,address:'Plot '+i,tier:tiers[i%tiers.length].id}));
const scene=buildEstatesIslandScene({catalog:{tiers,properties}});
assert.equal(scene.lots.length,21);
for(let i=0;i<scene.lots.length;i++) {
  const a=scene.lots[i],f=a.buildingFootprint;
  if(f){assert.ok(f.width<=a.dimensions.width-2);assert.ok(f.depth<=a.dimensions.depth-2);}
  for(let j=i+1;j<scene.lots.length;j++){
    const b=scene.lots[j];
    assert.ok(Math.abs(a.position.x-b.position.x)>=(a.dimensions.width+b.dimensions.width)/2 ||
      Math.abs(a.position.z-b.position.z)>=(a.dimensions.depth+b.dimensions.depth)/2,
      a.id+' overlaps '+b.id);
  }
}
console.log('Estates plot separation tests passed');
