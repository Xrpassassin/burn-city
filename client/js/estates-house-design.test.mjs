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
assert(parent.children.length<=Object.keys(HOUSE_MATERIALS).length,'neighbourhood shares one draw call per material');
assert(parent.children.every(x=>x.isInstancedMesh));
const signatures=new Set();
for(let level=0;level<=5;level++) for(const original of lots) {
 const lot={...original,prestigeLevel:level};
 const parts=estateHouseParts(lot),f=lot.buildingFootprint;
 assert(parts.some(p=>p.name==='entry-door'));
 if(level===0)signatures.add(lot.tier+':'+parts.map(p=>p.name).join(','));
 assert.equal(parts.some(p=>p.name==='landmark-crest'),level===5);
 if(level>0)assert(parts.length>estateHouseParts({...lot,prestigeLevel:level-1}).length,'every stage adds visible detail');
 for(const p of parts) {
  const halfX=(Math.abs(Math.cos(p.rz))*p.width+Math.abs(Math.sin(p.rz))*p.height)/2;
  assert(Math.abs(p.x)+halfX<=f.width/2+.001,lot.id+' '+p.name+' must stay within collision width');
  assert(Math.abs(p.z)+p.depth/2<=f.depth/2+.001,lot.id+' '+p.name+' must stay within collision depth');
  assert([p.x,p.y,p.z,p.width,p.height,p.depth].every(Number.isFinite));
 }
}
assert.equal(signatures.size,5,'all five tiers have a distinct design');
const scene=new THREE.Scene(),view=createEstatesIslandRenderer({THREE,scene,manifest});
view.root.updateMatrixWorld(true);
const architecture=view.root.children.find(x=>x.name==='estates-property-architecture'),before=[...architecture.children];
let disposedOld=0;before.forEach(m=>m.geometry.addEventListener('dispose',()=>disposedOld++));
assert(view.setAppearance(lots.map(l=>({propertyId:l.propertyId,level:5}))));
assert.equal(disposedOld,before.length,'a stage refresh releases the replaced geometry');
assert(architecture.children.length<=Object.keys(HOUSE_MATERIALS).length);
assert.equal(view.setAppearance(lots.map(l=>({propertyId:l.propertyId,level:5}))),false,'unchanged server state skips rebuilding');
assert(view.setAppearance([{propertyId:lots[0].propertyId,level:100}]));
assert.equal(view.setAppearance([]),false,'invalid stages fall back to original architecture');
for(const mesh of parent.children){assert(mesh.boundingSphere&&Number.isFinite(mesh.boundingSphere.radius));}
assert.equal(view.dispose(),true);assert.equal(view.dispose(),false);
console.log('Estate house architecture: footprint, tier, instancing, and real Three.js renderer checks passed');
