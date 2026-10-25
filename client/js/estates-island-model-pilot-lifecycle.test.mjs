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

 // Repeated estate tiers must load one asset but install distinct scene instances.
const repeatNodes=['estate-lot-02-building-blockout','estate-lot-02-front-path'].map(name=>({name,visible:true}));
const repeatedRoot={children:[],add(o){this.children.push(o);o.parent=this;},remove(o){this.children=this.children.filter(x=>x!==o);o.parent=null;},getObjectByName(){return null;},traverse(fn){[...nodes,...repeatNodes].forEach(fn);}};
let fetches=0,clones=0;
const source={clone(deep){assert.equal(deep,true);clones++;return {name:'',scale:{multiplyScalar(){}},position:{set(){}},traverse(){},parent:null};}};
const repeated=await installEstateModelPilot({
 THREE:{Box3,Vector3},root:repeatedRoot,
 manifest:{lots:[manifest.lots[0],{...manifest.lots[0],id:'estate-lot-02',position:{x:20,y:0,z:0}}]},
 loader:{async loadAsync(){fetches++;return {scene:source};}},
 registry:{starter:{url:'./assets/estates/starter.glb',license:'CC0',attribution:'Author'}}
});
assert.equal(fetches,1,'shared tier asset should load once');
assert.equal(clones,2,'each lot needs an independent scene clone');
assert.equal(repeated.installedCount,2);
assert.notEqual(repeatedRoot.children[0],repeatedRoot.children[1]);
assert.equal(repeatedRoot.children[0].name,'estate-lot-01-reviewed-model');
assert.equal(repeatedRoot.children[1].name,'estate-lot-02-reviewed-model');
assert.equal(repeated.dispose(),true);
assert.equal(repeatedRoot.children.length,0);
assert.ok(repeatNodes.every(n=>n.visible));
console.log('Estate repeated-tier GLB cache and instance isolation checks passed');
