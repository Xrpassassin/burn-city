import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
const THREE=await import('three');
const {estateHouseParts,renderEstateHouses,HOUSE_MATERIALS}=await import('./estates-house-design.mjs');
const {buildEstatesIslandScene}=await import('./estates-island-scene.mjs');
const {createEstatesIslandRenderer}=await import('./estates-island-renderer.mjs');
const {readFile}=await import('node:fs/promises');
const catalog=JSON.parse(await readFile(new URL('../data/estate-catalog.json',import.meta.url)));
const manifest=buildEstatesIslandScene({catalog}),lots=manifest.lots.filter(x=>x.buildingFootprint);
const parent=new THREE.Group(),records=renderEstateHouses(THREE,parent,lots);
assert.equal(records.size,lots.length);
assert(parent.children.length<=Object.keys(HOUSE_MATERIALS).length+3,'neighbourhood batches by material and only three lightweight geometry types');
assert(parent.children.every(x=>x.isInstancedMesh));
assert(parent.children.some(x=>x.name==='estates-houses-leaf-sphere'),'landscape uses curved vegetation geometry');
assert(parent.children.some(x=>x.name==='estates-houses-stone-cylinder'),'mansion entrance has real round columns');
const textured=parent.children.find(x=>x.name==='estates-houses-plaster-box');
assert(textured?.material.map?.image?.data?.length===64*64*4,'masonry has a tiny self-contained procedural material texture');
const signatures=new Map();
for(let level=0;level<=5;level++) for(const original of lots) {
 const lot={...original,prestigeLevel:level};
 const parts=estateHouseParts(lot),f=lot.buildingFootprint;
 const door=parts.find(p=>p.name==='entry-door');
 assert(door);
 const W=f.width-.6;
 assert.equal(door.x,lot.tier==='apartment'?0:-W*.24,lot.id+' door stays on the established entry axis');
 if(level===0 && !String(lot.propertyId||lot.id||'').startsWith('cabin-')){
  const sig=parts.map(p=>p.name).join(',');
  if(!signatures.has(lot.tier))signatures.set(lot.tier,sig);
  else assert.equal(signatures.get(lot.tier),sig,lot.tier+' lots share one construction kit');
 }
 assert.equal(parts.some(p=>p.name==='landmark-crest'),level===5);
 if(level>0)assert(parts.length>estateHouseParts({...lot,prestigeLevel:level-1}).length,'every stage adds visible detail');
 const owned=estateHouseParts({...lot,owned:true});
 assert(owned.some(p=>p.name==='owned-door-plaque'),lot.id+' owned houses show a door plaque');
 assert(!parts.some(p=>p.name==='owned-door-plaque'),'unowned houses do not carry owner hardware');
 for(const p of [...parts,...owned]) {
  const halfX=(Math.abs(Math.cos(p.rz))*p.width+Math.abs(Math.sin(p.rz))*p.height)/2;
  assert(Math.abs(p.x)+halfX<=f.width/2+.001,lot.id+' '+p.name+' must stay within collision width');
  assert(Math.abs(p.z)+p.depth/2<=f.depth/2+.001,lot.id+' '+p.name+' must stay within collision depth');
  assert([p.x,p.y,p.z,p.width,p.height,p.depth].every(Number.isFinite));
 }
}
// All architecture choices keep their realistic collision envelope on each
// tier. The free selector changes real geometry, not only a CSS color label.
for(const tier of new Set(lots.map(x=>x.tier))){
 const lot=lots.find(x=>x.tier===tier);
 const variants=['classic','modern','rustic'].map(architecture=>estateHouseParts({...lot,architecture}));
 const keys=variants.map(parts=>parts.filter(p=>p.name.startsWith('modern-')||p.name.startsWith('rustic-')||p.name.startsWith('classic-')).map(p=>p.name).join('|'));
 assert.equal(new Set(keys).size,3,tier+' free architecture options have visibly different built elements');
 for(const parts of variants)for(const p of parts){
  const halfX=(Math.abs(Math.cos(p.rz))*p.width+Math.abs(Math.sin(p.rz))*p.height)/2;
  assert(Math.abs(p.x)+halfX<=lot.buildingFootprint.width/2+.001,tier+' '+p.name+' may not cross building width');
  assert(Math.abs(p.z)+p.depth/2<=lot.buildingFootprint.depth/2+.001,tier+' '+p.name+' may not cross building depth');
 }
}
const colored=new THREE.Group();
renderEstateHouses(THREE,colored,lots.slice(0,4).map((lot,i)=>({...lot,palette:['original','coastal','forest','charcoal'][i]})));
assert(colored.children.some(x=>x.name.includes('-coastal')),'coastal houses have distinct material batches');
assert(colored.children.some(x=>x.name.includes('-forest')),'forest houses have distinct material batches');
assert(colored.children.some(x=>x.name.includes('-charcoal')),'charcoal houses have distinct material batches');
assert.equal(signatures.size,5,'all five tiers have a distinct design');
assert.equal(new Set(signatures.values()).size,5,'tiers do not share a silhouette');
for(const [tier,prefix] of [['trailer','trailer-'],['apartment','apartment-'],['starter','starter-'],['family','family-'],['mansion','mansion-']]){
 assert(signatures.get(tier).includes(prefix),tier+' has unique architectural members');
}
const cabin=lots.find(l=>String(l.propertyId||l.id||'').startsWith('cabin-'));
if(cabin){
 const names=estateHouseParts({...cabin,prestigeLevel:0}).map(p=>p.name).join(',');
 assert(names.includes('cabin-'),'woodland cabins use a log-cabin silhouette');
 assert.notEqual(names,signatures.get('starter'),'cabins stay visually distinct from starter cottages');
}

const scene=new THREE.Scene(),view=createEstatesIslandRenderer({THREE,scene,manifest});
view.root.updateMatrixWorld(true);
const architecture=view.root.children.find(x=>x.name==='estates-property-architecture'),before=[...architecture.children];
let disposedOld=0;before.forEach(m=>m.geometry.addEventListener('dispose',()=>disposedOld++));
assert(view.setAppearance(lots.map(l=>({propertyId:l.propertyId,level:5}))));
assert.equal(disposedOld,before.length,'a stage refresh releases the replaced geometry');
assert(architecture.children.length<=Object.keys(HOUSE_MATERIALS).length+3);
assert.equal(view.setAppearance(lots.map(l=>({propertyId:l.propertyId,level:5}))),false,'unchanged server state skips rebuilding');
assert(view.setAppearance(lots.map((l,i)=>({propertyId:l.propertyId,level:5,architecture:i%2?'modern':'rustic',palette:i%2?'forest':'charcoal'}))),'free styles can rebuild real house geometry even when prestige levels are unchanged');
assert(view.setAppearance([{propertyId:lots[0].propertyId,level:100}]));
assert.equal(view.setAppearance([]),false,'invalid stages fall back to original architecture');
for(const mesh of parent.children){assert(mesh.boundingSphere&&Number.isFinite(mesh.boundingSphere.radius));}
const oldTexture=architecture.children.find(x=>x.material.map)?.material.map;
assert(oldTexture&&oldTexture.isDataTexture,'architectural surfaces have physically shaded texture breakup');
let disposedTexture=0;oldTexture.addEventListener('dispose',()=>disposedTexture++);
assert(view.setAppearance(lots.map(l=>({propertyId:l.propertyId,level:4}))));
assert.equal(disposedTexture,1,'changing appearance releases old GPU material texture');
assert.equal(view.dispose(),true);assert.equal(view.dispose(),false);
console.log('Estate house architecture: footprint, tier, instancing, and real Three.js renderer checks passed');
