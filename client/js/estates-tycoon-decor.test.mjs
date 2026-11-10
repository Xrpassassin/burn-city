import assert from 'node:assert/strict';
import {createEstateTycoonDecor} from './estates-tycoon-decor.mjs';
class Group {
 constructor(){this.children=[];this.position={set(){}};this.name='';}
 add(v){this.children.push(v);v.parent=this;}
 remove(v){this.children=this.children.filter(x=>x!==v);}
 traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
}
class Geometry{dispose(){this.disposed=true;}}
class Material{constructor(x){this.options=x;}dispose(){this.disposed=true;}}
class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={set(){}};}}
const THREE={Group,Mesh,BoxGeometry:Geometry,MeshStandardMaterial:Material};
const parent=new Group(),lot={propertyId:'trailer-01',position:{x:20,y:.15,z:30},buildingFootprint:{width:6,depth:5,height:3}};
const decor=createEstateTycoonDecor({THREE,parent,lots:[lot]});
assert.equal(parent.children.length,1);
assert.equal(decor.setUpgrades([{propertyId:'trailer-01',unlockedItemIds:[]}]),true);
assert.equal(parent.children[0].children.length,0);
assert.equal(decor.setUpgrades([{propertyId:'trailer-01',unlockedItemIds:[]}]),false);
assert.equal(decor.setUpgrades([{propertyId:'trailer-01',unlockedItemIds:['porch-lights','hidden-hatch','grow-lounge']}]),true);
const houseDecor=parent.children[0].children[0];
assert.equal(houseDecor.name,'tycoon-trailer-01');
assert(houseDecor.children.some(x=>x.name.startsWith('porch-lights-wall-lantern-')));
assert(houseDecor.children.some(x=>x.name==='hidden-hatch-hatch'));
assert(houseDecor.children.some(x=>x.name==='grow-lounge-concealed-vent'));
assert.equal(decor.setUpgrades([{propertyId:'trailer-01',unlockedItemIds:['porch-lights','hidden-hatch','grow-lounge']}]),false);
assert.equal(decor.setUpgrades([{propertyId:'trailer-01',unlockedItemIds:['arbitrary-code']}]),true);
assert.equal(parent.children[0].children.length,0,'unknown client-supplied upgrade IDs are ignored');
assert.equal(decor.dispose(),true);
assert.equal(parent.children.length,0);
assert.equal(decor.dispose(),false);
console.log('Estate tycoon decorations: verified IDs, deterministic updates, concealment and lifecycle passed');
