import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
const THREE=await import('three');
const {loadEstateUpgradeModels,ESTATE_UPGRADE_MODEL_IDS}=await import('./estates-upgrade-models.mjs');
const {estateUpgradeModelSlots,estateUpgradeExteriorParts,ESTATE_EXTERIOR_ITEM_IDS}=await import('./estates-tycoon-architecture.mjs');
const {createEstateTycoonDecor}=await import('./estates-tycoon-decor.mjs');
const {createEstateHelicopterWorld}=await import('./estates-helicopter-world.mjs');
const dir=new URL('../assets/estates-upgrades/',import.meta.url);
// 1. Licensing + credits: every shipped model is CC BY 4.0 and publicly credited.
const sources=JSON.parse(await readFile(new URL('../../scripts/estates-upgrade-models/sources.json',import.meta.url),'utf8'));
const credits=await readFile(new URL('../city-credits.html',import.meta.url),'utf8');
const assetCredits=await readFile(new URL('CREDITS.md',dir),'utf8');
assert.deepEqual(Object.keys(sources).sort(),[...ESTATE_UPGRADE_MODEL_IDS].sort());
for(const [id,s] of Object.entries(sources)){
 assert.equal(s.licslug,'by',id+' must be CC BY (never NC/ND/Standard/Editorial)');
 assert(credits.includes(s.uid)&&credits.includes(s.title),id+' credited in city-credits.html');
 assert(assetCredits.includes(s.url),id+' credited next to the asset');
}
// 2. Mobile budget: < 5k triangles per item, small textures, small files.
let bytes=0;
for(const id of ESTATE_UPGRADE_MODEL_IDS){
 const info=JSON.parse(await readFile(new URL(id+'.json',dir),'utf8'));
 const tris=Object.values(info.parts).reduce((n,p)=>n+p.tris,0);
 assert(tris>0&&tris<5000,id+' stays low poly ('+tris+')');
 bytes+=(await stat(new URL(id+'.bin',dir))).size+(await stat(new URL(id+'.gltf',dir))).size;
}
for(const f of await readdir(dir,{recursive:true}))if(f.endsWith('.webp'))bytes+=(await stat(new URL(f,dir))).size;
assert(bytes<600*1024,'all upgrade models together stay under 600 KB ('+bytes+')');
// 3. Loader never rejects; a failing loader leaves the primitive fallback.
const failing={loadAsync:async()=>{throw Error('offline');}};
assert.equal((await loadEstateUpgradeModels(THREE,{loader:failing})).size,0);
const fakeScene=()=>{const s=new THREE.Scene(),g=new THREE.Group();g.name='body';g.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()));s.add(g);return {scene:s};};
const okLoader={loadAsync:async()=>fakeScene()};
const models=await loadEstateUpgradeModels(THREE,{loader:okLoader,ids:['fire-pit','camera','gnome']});
assert.equal(models.get('fire-pit').parts.get('body').length,1);
// 4. Slots: inside the lot and clear of every other item's visible primitives.
const footprints={trailer:[6,5,3],apartment:[7,8,10],starter:[8,7,5],family:[10,9,6],mansion:[13,11,8]};
for(const [tier,[width,depth,height]]of Object.entries(footprints)){
 const lot={tier,propertyId:'qa-'+tier,position:{x:0,y:0,z:0},dimensions:{width:20,depth:18},buildingFootprint:{width,depth,height}};
 const slots=estateUpgradeModelSlots(lot,ESTATE_EXTERIOR_ITEM_IDS),hidden=new Set(slots.flatMap(s=>s.replaces));
 const parts=estateUpgradeExteriorParts(lot,ESTATE_EXTERIOR_ITEM_IDS).filter(p=>!hidden.has(p.name)&&p.mat!=='glow');
 for(const s of slots){
  assert(Math.abs(s.x)+s.w/2<=10&&Math.abs(s.z)+s.d/2<=9,tier+' '+s.model+' slot inside lot');
  for(const p of parts){
   if(p.id===s.id)continue;
   const hit=Math.abs(s.x-p.x)<(s.w+p.w)/2-.001&&Math.abs(s.y+s.h/2-p.y)<(s.h+p.h)/2-.001&&Math.abs(s.z-p.z)<(s.d+p.d)/2-.001;
   assert(!hit,tier+' '+s.model+' slot clips '+p.name);
  }
 }
}
// 5. Decor swaps primitives for instanced models, and back again.
const parent=new THREE.Group(),lot={tier:'starter',propertyId:'p1',position:{x:0,y:0,z:0},dimensions:{width:20,depth:18},buildingFootprint:{width:8,depth:7,height:5}};
const decor=createEstateTycoonDecor({THREE,parent,lots:[lot]});
decor.setUpgrades([{propertyId:'p1',unlockedItemIds:['fire-pit','flower-garden']}]);
const names=()=>decor.root.children.map(c=>c.name);
assert(!names().some(n=>n.includes('model')),'primitives first');
decor.setModels(models);
assert(names().includes('estates-upgrades-model-fire-pit-body-0'),'fire pit model instanced');
assert(names().includes('estates-upgrades-model-gnome-body-0'),'gnome added to flower garden');
assert.equal(decor.animating,false,'swapping in models is not a new purchase');
const fireModel=decor.root.children.find(c=>c.name==='estates-upgrades-model-fire-pit-body-0');
decor.setModels(new Map());
assert(!names().some(n=>n.includes('model')),'empty map restores primitives');
assert.equal(fireModel.geometry.attributes.position!==undefined,true,'shared model geometry is not disposed by a rebuild');
decor.dispose();
// 6. Helicopter keeps rotor groups and Hangar paint with the authored model.
const heliParts=new Map([['body',[{geometry:new THREE.BoxGeometry(2,2,8),material:new THREE.MeshStandardMaterial()}]],
 ['paint',[{geometry:new THREE.BoxGeometry(2,1,6),material:new THREE.MeshStandardMaterial({color:0xcc1111})}]],
 ['rotor',[{geometry:new THREE.BoxGeometry(8,.1,.2),material:new THREE.MeshStandardMaterial()}]],
 ['tail',[{geometry:new THREE.BoxGeometry(.1,.8,.2),material:new THREE.MeshStandardMaterial()}]]]);
const fam={tier:'family',propertyId:'f1',position:{x:0,y:0,z:0},dimensions:{width:20,depth:18},buildingFootprint:{width:10,depth:9,height:6}};
const heli=createEstateHelicopterWorld({THREE,parent:new THREE.Group(),lots:[fam]});
heli.setVerified([{propertyId:'f1',unlockedItemIds:['estate-helicopter']}]);
heli.setStyle('f1',{paint:'royal',trim:'ice'});
assert.equal(heli.setModels(new Map([['helicopter',{parts:heliParts,info:{pivots:{rotor:[0,2.6,-1.7],tail:[0,2.4,3.6]}}}]])),true);
let fuselage=null;heli.root.traverse(n=>{if(n.name==='fuselage')fuselage=n;});
assert.equal(fuselage.material.color.getHex(),0x55426f,'Hangar paint recolours the authored fuselage');
assert(heli.root.getObjectByName('main-rotor')&&heli.root.getObjectByName('tail-rotor'),'rotor pivots kept for flight animation');
heli.tick({dt:.05});
assert.equal(heliParts.get('body')[0].material.color.getHex(),0xffffff,'shared model material is never repainted');
heli.dispose();
console.log('Estates upgrade models: CC BY credits, mobile budget, safe fallback, clip-free slots, instancing and helicopter paint passed');
