import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(s,c);}});
const THREE=await import('three');
const {buildEstatesIslandScene}=await import('./estates-island-scene.mjs');
const {createEstateNeighborhoodDecor,estateNeighborhoodParts}=await import('./estates-neighborhood-renderer.mjs');
const {createEstatesIslandNavigation}=await import('./estates-island-navigation.mjs');
const catalog=JSON.parse(await readFile(new URL('../data/estate-catalog.json',import.meta.url)));
const a=buildEstatesIslandScene({catalog}),b=buildEstatesIslandScene({catalog});
assert.deepEqual(a.streetFurniture,b.streetFurniture,'lamp and mailbox positions are deterministic');
const lights=a.streetFurniture.filter(x=>x.kind==='street-light'),mailboxes=a.streetFurniture.filter(x=>x.kind==='mailbox');
assert.equal(lights.length,16,'light the main crossroads and neighborhood loops');
assert.equal(mailboxes.length,a.lots.filter(x=>x.propertyId).length,'one mailbox per assigned estate');
assert.equal(new Set(a.objects.map(x=>x.id)).size,a.objects.length);
for(const item of a.streetFurniture){
 assert(a.objects.includes(item),'furniture must exist in island world manifest');
 assert(item.collisionRadius>0&&item.collisionRadius<.4,'only small collision bases');
 assert(estateNeighborhoodParts(item).length>=4,'furniture must have recognizable modeled pieces');
 const [x,z]=[item.position.x,item.position.z];
 if(item.kind==='mailbox'){
  const lot=a.lots.find(l=>l.propertyId===item.propertyId);
  assert(lot,'every mailbox belongs to a real catalogued lot');
  assert(Math.abs(x-lot.position.x)+item.dimensions.width/2<lot.dimensions.width/2);
  assert(Math.abs(z-lot.position.z)+item.dimensions.depth/2<lot.dimensions.depth/2);
  assert(x-lot.position.x>lot.buildingFootprint.width/2+1,'mailbox must not overlap house shell');
 }
 if(item.kind==='street-light'){
  assert(a.roads.some(road=>road.id===item.roadId),'every pole has a real road corridor');
  for(const lot of a.lots){
   const foot=lot.buildingFootprint;if(!foot)continue;
   const dx=Math.abs(x-lot.position.x)-(foot.width/2+.35);
   const dz=Math.abs(z-lot.position.z)-(foot.depth/2+.35);
   assert(dx>0||dz>0,item.id+' must not block '+lot.id+' house entrance');
  }
 }
}
const root=new THREE.Group(),view=createEstateNeighborhoodDecor({THREE,parent:root,manifest:a});
assert.equal(view.fixtureCount,a.streetFurniture.length);
assert(view.partCount>140);
assert(view.drawBatches<=18,'instancing batches all fixtures by material and geometry');
assert(view.root.children.filter(o=>o.isLight).length<=3,'only three real GPU light sources');
assert(root.children.includes(view.root));
assert(view.root.children.some(x=>x.isInstancedMesh));
const nav=createEstatesIslandNavigation({manifest:a});
assert(nav.collisionCount>=a.streetFurniture.length);
const light=lights[0];
assert(!nav.isWalkable({x:light.position.x,y:.1,z:light.position.z}),'lamp post has a real small collision base');
const publicSpace={x:0,y:.1,z:-30};
assert(nav.isWalkable(publicSpace),'main center road remains walkable');
console.log('Estates street furniture: 16 streetlamps, owned-lot mailboxes, road setbacks, low draws and measured collisions passed');
