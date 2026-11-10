import assert from 'node:assert/strict';
import {createEstateTycoonDecor} from './estates-tycoon-decor.mjs';
import {readFile} from 'node:fs/promises';
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
assert.equal(parent.children.length,2,'preview layer is separate from server-verified geometry');
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
assert.equal(decor.previewRoot.children.length,0,'initially no speculative preview geometry');
assert.equal(decor.previewUpgrade('trailer-01','cozy-awning'),true,'available catalog upgrade can be previewed');
assert.equal(decor.previewRoot.children.length,1,'preview is added only to separate unverified layer');
const ghost=decor.previewRoot.children[0].children;
assert(ghost.length>=3,'awning preview shows full physical supports, not a single marker');
assert(ghost.every(m=>m.userData.previewOnly&&m.userData.notPurchased),'every preview mesh is visibly non-owned and never enters property state');
assert.equal(parent.children[0].children.length,0,'preview must not install a verified upgrade');
assert.equal(decor.previewUpgrade('trailer-01','estate-helicopter'),false,'aircraft cannot be fake-unlocked through the preview API');
assert.equal(decor.previewRoot.children.length,0,'unsupported preview cannot leave speculative meshes behind');
assert.equal(decor.previewUpgrade('trailer-01','hidden-hatch'),true);
assert.equal(decor.previewUpgrade('trailer-01',null),true,'closing inspection clears the ghost');
assert.equal(decor.previewRoot.children.length,0);
assert.equal(decor.previewUpgrade('other-property','porch-lights'),false,'preview cannot render outside known property slots');
assert.equal(decor.dispose(),true);
assert.equal(parent.children.length,0);
assert.equal(decor.dispose(),false);
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
assert(sw.includes("'js/estates-tycoon-architecture.mjs'"),'offline shell must precache the new exterior geometry dependency');
console.log('Estate tycoon decorations: verified IDs, deterministic updates, concealment and lifecycle passed');
