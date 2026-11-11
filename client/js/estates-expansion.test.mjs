import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import contracts from '../../server/estate-purchase-contract.js';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {createEstatesIslandNavigation} from './estates-island-navigation.mjs';
const catalog=JSON.parse(readFileSync(new URL('../data/estate-catalog.json',import.meta.url),'utf8'));
const scene=buildEstatesIslandScene({catalog});
const oldIds=['trailer-01','trailer-02','apartment-01','starter-01','starter-02',
 'family-01','family-02','mansion-01','mansion-02','trailer-03','trailer-04',
 'apartment-02','apartment-03','starter-03','starter-04','family-03',
 'family-04','mansion-03','mansion-04','cabin-01','cabin-02'];
const oldSites=[[-42,-91],[-14,-99],[14,-99],[42,-91],[-76,-54],[-48,-47],
 [-20,-53],[20,-53],[48,-47],[76,-54],[-91,-12],[-63,-6],[-35,-12],
 [35,-12],[63,-6],[91,-12],[-72,38],[-42,52],[-14,62],[14,62],[48,48]];
const additions=[
 ['trailer-05',-97,17],['trailer-06',-53,-71],['trailer-07',-53,83],
 ['trailer-08',-20,83],['trailer-09',24,83],['trailer-10',46,-71],
 ['starter-05',-31,28],['starter-06',35,28],['starter-07',46,72],
 ['starter-08',46,94],['family-05',-75,61],['family-06',79,50]
];
assert.equal(catalog.properties.length,33);
assert.equal(scene.lots.length,33,'every property has a 3D lot');
assert.equal(scene.streetFurniture.filter(f=>f.kind==='mailbox').length,33,'every property has one mailbox');
assert.equal(scene.streetFurniture.filter(f=>f.kind==='street-light').length,16,'existing lamps remain in place');
const byId=new Map(scene.lots.map(l=>[l.propertyId,l]));
for(let i=0;i<oldIds.length;i++){
 assert.equal(catalog.properties[i].id,oldIds[i],'original property ID/order remains permanent');
 const lot=scene.lots[i];
 assert.equal(lot.propertyId,oldIds[i]);
 assert.equal(lot.position.x,oldSites[i][0]);
 assert.equal(lot.position.z,oldSites[i][1]);
}
for(const [id,x,z]of additions){
 const lot=byId.get(id);
 assert(lot,id+' must appear on the island');
 assert.equal(lot.position.x,x);assert.equal(lot.position.z,z);
 assert(lot.buildingFootprint,'new property has correct tier-specific actual house');
 assert.equal(lot.dimensions.width,20);assert.equal(lot.dimensions.depth,18);
 assert(scene.streetFurniture.some(f=>f.id==='estates-mailbox-'+id&&f.propertyId===id));
}
const counts={};for(const p of catalog.properties)counts[p.tier]=(counts[p.tier]||0)+1;
assert.deepEqual(counts,{trailer:10,apartment:3,starter:10,family:6,mansion:4});
assert.equal(new Set(catalog.properties.map(p=>p.id)).size,33);
assert.equal(new Set(catalog.properties.map(p=>p.lot.x+','+p.lot.z)).size,33);
const expectedPrices={trailer:[3,1],apartment:[15,5],starter:[75,25],family:[150,50],mansion:[300,100]};
for(const p of catalog.properties){
 const quote=contracts.quoteEstate(p.id);
 assert.equal(quote.priceXrp,expectedPrices[p.tier][0],'prices and sale contracts unchanged');
 assert.equal(quote.allocationUnits,expectedPrices[p.tier][1],'share weights unchanged');
 assert.equal(quote.maxPerTierPerWallet,5,'the five-per-tier wallet cap is preserved');
}
const cap=contracts.validateTierCapacity({wallet:'rTest',tierId:'trailer',
 ownedPropertyIds:['trailer-01','trailer-02','trailer-03','trailer-04','trailer-05']});
assert.equal(cap.eligible,false,'expanding the island must NOT weaken the wallet purchase cap');
const intersects=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.z-b.z)<(a.d+b.d)/2;
const allLots=scene.lots.map(l=>({x:l.position.x,z:l.position.z,w:20,d:18,id:l.propertyId}));
for(const [id]of additions){
 const l=byId.get(id),plot={x:l.position.x,z:l.position.z,w:20,d:18};
 for(const other of allLots.filter(x=>x.id!==id))assert(!intersects(plot,other),id+' must not encroach on '+other.id);
 for(const dx of [-10,10])for(const dz of [-9,9]){
  const x=(l.position.x+dx)/139,z=(l.position.z+dz)/149;
  assert(x*x+z*z<1,id+' plot corner must stay inside the island shoreline');
 }
 for(const road of scene.roads){
  const roadBox={x:road.position.x,z:road.position.z,
   w:road.orientation==='x'?road.dimensions.length:road.dimensions.width,
   d:road.orientation==='x'?road.dimensions.width:road.dimensions.length};
  assert(!intersects(plot,roadBox),id+' lot must not block the public road/path '+road.id);
 }
 for(const landmark of scene.landmarks){
  const box={x:landmark.position.x,z:landmark.position.z,w:landmark.dimensions.width,d:landmark.dimensions.depth};
  assert(!intersects(plot,box),id+' must not overlap public landmark '+landmark.id);
 }
 for(const t of scene.vegetation){
  const nearX=Math.abs(t.position.x-l.position.x)-10;
  const nearZ=Math.abs(t.position.z-l.position.z)-9;
  assert(nearX>2||nearZ>2,id+' building plot must not swallow old tree '+t.id);
 }
}
for(const id of ['path-south-grove','path-north-trailers-west','path-north-trailers-east'])
 assert(scene.roads.some(r=>r.id===id&&r.kind==='footpath'),id+' remains public foot access');
const nav=createEstatesIslandNavigation({manifest:scene});
for(const [id]of additions){
 const approach=nav.propertyApproach(id);
 assert(approach&&nav.isWalkable(approach),id+' must have an accessible inspection approach');
}
assert.equal(nav.buildingColliderCount,33,'new homes become physical navigation obstacles');
assert.throws(()=>buildEstatesIslandScene({catalog:{...catalog,properties:[...catalog.properties,{id:'overflow',tier:'trailer'}]}}),RangeError,'future expansion requires another explicit reviewed land plan');
console.log('Estates inventory expansion: 12 new real lots, 8+ trailers unsold at baseline, preserved 21 legacy positions, verified XRP tier prices, 33 mailboxes and clear access tests passed');
