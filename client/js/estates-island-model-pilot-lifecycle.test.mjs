import assert from 'node:assert/strict';
import {installEstateModelPilot} from './estates-island-model-pilot.mjs';
class Vector3 { constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} }
class Box3 {
  setFromObject(){return this;}
  getSize(){return new Vector3(6,4,5);}
  getCenter(){return new Vector3(0,2,0);}
  get min(){return new Vector3(0,0,0);}
}
const nodes=['building-blockout','roof-blockout','door','window-0-1','front-path','shrub-1','boundary'].map(s=>({name:'estate-lot-01-'+s,visible:true}));
const root={children:[],add(o){this.children.push(o);},remove(o){this.children=this.children.filter(x=>x!==o);},
  getObjectByName(n){return nodes.find(x=>x.name===n);},traverse(fn){nodes.forEach(fn);}};
const model={name:'',scale:{multiplyScalar(){}},position:{set(){}},traverse(){}};
const manifest={lots:[{id:'estate-lot-01',tier:'starter',position:{x:0,y:0,z:0},buildingFootprint:{width:8,height:5,depth:7}}]};
const pilot=await installEstateModelPilot({
 THREE:{Box3,Vector3},root,manifest,loader:{async loadAsync(){return {scene:model};}},
 registry:{starter:{url:'./assets/estates/starter.glb',license:'CC0',attribution:'Author'}},
 onStatus(){throw Error('UI unavailable');}
});
assert.equal(pilot.installedCount,1);
for(const node of nodes) assert.equal(node.visible,['front-path','shrub-1','boundary'].some(s=>node.name.endsWith(s)));
assert.equal(pilot.dispose(),true);
assert.equal(root.children.length,0);
assert.ok(nodes.every(n=>n.visible));
assert.equal(pilot.dispose(),false);
console.log('Estate GLB pilot replacement and restoration checks passed');
