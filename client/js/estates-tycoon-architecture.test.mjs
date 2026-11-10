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
console.log('Realistic Estates architecture: five tiers, all 17 exterior items, lot/house clearance, roof supports and no helicopter clash passed');
