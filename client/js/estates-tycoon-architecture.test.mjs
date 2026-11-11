import assert from 'node:assert/strict';
import {estateUpgradeExteriorParts,ESTATE_EXTERIOR_ITEM_IDS} from './estates-tycoon-architecture.mjs';
import {estateHouseParts} from './estates-house-design.mjs';
const footprints={
 trailer:{width:6,depth:5,height:3},apartment:{width:7,depth:8,height:10},
 starter:{width:8,depth:7,height:5},family:{width:10,depth:9,height:6},
 mansion:{width:13,depth:11,height:8}
};
const all=ESTATE_EXTERIOR_ITEM_IDS;
assert.equal(new Set(all).size,17,'exactly 17 visual exterior IDs; the helicopter uses its dedicated renderer');
const eps=1e-5;
for(const [tier,buildingFootprint]of Object.entries(footprints)){
 const lot={propertyId:tier+'-01',tier,position:{x:20,y:.15,z:40},dimensions:{width:20,depth:18},buildingFootprint};
 const parts=estateUpgradeExteriorParts(lot,all);
 const names=parts.map(p=>p.name);
 assert.equal(new Set(names).size,names.length,tier+' architectural detail names must be unambiguous');
 for(const id of all)assert(parts.some(p=>p.id===id),tier+' purchase '+id+' has a durable exterior expression');
 for(const p of parts){
  assert(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
  assert(p.w>0&&p.h>0&&p.d>0,p.name+' must have physical dimensions');
  assert(Math.abs(p.x)+p.w/2<=10+eps,p.name+' must remain inside 20 m lot width');
  assert(Math.abs(p.z)+p.d/2<=9+eps,p.name+' must remain inside 18 m lot depth');
  assert(p.y-p.h/2>=-eps,p.name+' is above ground or attached to supported architecture');
  if(p.placement==='yard'){
   const overlapsHouseX=Math.abs(p.x)<buildingFootprint.width/2+p.w/2-.001;
   const overlapsHouseZ=Math.abs(p.z)<buildingFootprint.depth/2+p.d/2-.001;
   assert(!(overlapsHouseX&&overlapsHouseZ),p.name+' must not penetrate the property shell');
  }
 }
 assert(names.some(n=>n.startsWith('cozy-awning-veranda-post-')),tier+' veranda requires supporting posts');
 const fenceH=tier==='mansion'?1.82:tier==='family'?1.6:1.3;
 const fence=parts.find(p=>p.name==='privacy-fence-side--1-rail-upper');
 assert(fence&&fence.h<.12,'fence must be a slim real crossrail, never a solid wall');
 assert.equal(fence.mat,tier==='mansion'?'metal':tier==='apartment'?'metal':'wood',
  tier+' privacy panels use plausible timber/metal infill');
 const fencePost=parts.find(p=>p.name==='privacy-fence-side--1-post-0');
 assert.equal(fencePost.mat,tier==='mansion'?'stone':tier==='apartment'?'metal':'wood');
 assert.equal(fencePost.h,fenceH,tier+' fence posts reach their authored height');
 assert(parts.filter(p=>p.name.startsWith('privacy-fence-side--1-slat-')).length>=16,
  'boundary must read as separate slats with daylight instead of a solid slab');
 const doorX=tier==='apartment'?0:-(buildingFootprint.width-.6)*.24;
 const left=parts.find(p=>p.name==='privacy-fence-front-left-rail-upper');
 const right=parts.find(p=>p.name==='privacy-fence-front-right-rail-upper');
 assert(left&&right&&left.x+left.w/2<=doorX-1.64,
  'left front rail stays clear of the actual tier-specific entrance');
 assert(right.x-right.w/2>=doorX+1.64,
  'right front rail stays clear of the actual tier-specific entrance');
 const pavers=parts.filter(p=>p.name.startsWith('porch-lights-entry-paver-'));
 assert(pavers.length>=2,'paid porch lighting includes an actual stone pedestrian approach');
 assert(pavers.every(p=>Math.abs(p.x-doorX)<eps),'approach must align with entry door');
 assert(parts.some(p=>p.shape==='sphere'&&p.name.startsWith('flower-garden-flower-bloom-')),
  'garden blossoms use curved meshes where the renderer supports them');
 assert(parts.some(p=>p.shape==='cylinder'&&p.name.startsWith('porch-lights-path-light-')),
  'bollard lenses have rounded form instead of box-only lights');
 // Boundary fences and the busiest yard features must never share the same
 // physical ground footprint (all are present after a fully upgraded purchase).
 const fenceParts=parts.filter(p=>p.id==='privacy-fence');
 for(const object of parts.filter(p=>['fire-pit','garden-pond','reinforced-floor','underground-bunker','bunker-arcade'].includes(p.id))){
  for(const rail of fenceParts){
   const collideX=Math.abs(object.x-rail.x)<(object.w+rail.w)/2-.001;
   const collideZ=Math.abs(object.z-rail.z)<(object.d+rail.d)/2-.001;
   assert(!(collideX&&collideZ),tier+' '+object.name+' intersects fence '+rail.name);
  }
 }
 const awning=parts.find(p=>p.name==='cozy-awning-roof-deck');
 assert.equal(awning.mat,['trailer','apartment','mansion'].includes(tier)?'slate':'wood',
  tier+' doorway shelter must match house finishes');
 assert(names.some(n=>n==='hidden-hatch-hatch'),tier+' hatch must have steel hardware');
 assert(names.some(n=>n==='game-lounge-arcade-entrance-badge'),tier+' interior upgrades have a subtle public indication');
 assert(names.some(n=>n==='hobby-workshop-utility-door'),tier+' workshop must be legible from public exterior');
 assert(names.some(n=>n==='bunker-arcade-utility-housing'),tier+' bunker arcade remains concealed');
 // Keep actual roof garden/terrace out of the helicopter's central rooftop disk.
 const roof=parts.filter(p=>p.id==='roof-garden');
 if(['apartment','mansion'].includes(tier)){
  assert(roof.some(p=>p.name.includes('flat-roof-box')),tier+' flat-roof planters exist');
  assert(roof.every(p=>p.placement==='roof'),'flat roof gardens are roof-mounted, not ground props');
  const top=Math.max(...estateHouseParts(lot).map(p=>p.y+p.height/2));
  assert(roof.every(p=>p.y>buildingFootprint.height*.65),'roof planters cannot float at ground elevation');
  assert(top>0);
  if(tier==='mansion')for(const p of roof){
   // conservative closest point of each projected roof part to central 4.3 m helipad disk
   const nearestX=Math.max(0,Math.abs(p.x)-p.w/2),nearestZ=Math.max(0,Math.abs(p.z)-p.d/2);
   assert(Math.hypot(nearestX,nearestZ)>4.3,p.name+' must not overlap the central helipad');
  }
 }else{
  assert(roof.some(p=>p.name==='roof-garden-supported-terrace'),tier+' pitched roof needs real terrace support');
  assert(roof.some(p=>p.name.startsWith('roof-garden-terrace-post-')),tier+' pitched roof terrace cannot float');
  assert(!roof.some(p=>p.name.includes('flat-roof-box')));
 }
 // Preview individual purchase has only its own visible geometry.
 const one=estateUpgradeExteriorParts(lot,['porch-lights']);
 assert(one.length>0&&one.every(p=>p.id==='porch-lights'));
 assert.deepEqual(estateUpgradeExteriorParts(lot,all),estateUpgradeExteriorParts(lot,[...all].reverse()),'unlock order does not alter scene geometry');
}
assert.throws(()=>estateUpgradeExteriorParts({buildingFootprint:{width:15,depth:16,height:5},dimensions:{width:20,depth:18}},all),/footprint/);
assert.throws(()=>estateUpgradeExteriorParts({buildingFootprint:{width:6,depth:5,height:3}},'invalid'),/upgrade_ids_required/);
console.log('Realistic Estates architecture: five tiers, 17 exterior items, door-aligned slatted fences, rounded details and roof clearance passed');
