import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from './vendor/three.module.min.js';
import {planZombiesRoomDressing,zombieRoomTheme,ZOMBIES_ROOM_PALETTE,zombieWallFireDecision} from './zombies-room-dressing-plan.mjs';
import {addZombiesRoomDressing} from './zombies-room-dressing.mjs';
const require=createRequire(import.meta.url);
const {gen}=require('../../server/mapgen.js');

for(const [name,kind] of Object.entries({
 'Spawn Bay':'spawn','Main Corridor':'corridor',
 'Control Room':'control','Warehouse':'warehouse','Lab':'lab',
 'Furnace Hall':'furnace','Courtyard':'courtyard','Cold Storage':'cold',
 'Ash Archive':'archive','Slag Pit':'slag','Pump Station':'pump',
 'Generator Room':'generator','Chapel of Cinders':'chapel',
 'Loading Dock':'loading','Deserted Hall':'industrial'
}))assert.equal(zombieRoomTheme(name,kind==='spawn'?0:2),kind,name);
assert(Object.keys(ZOMBIES_ROOM_PALETTE).length>=14);

const fireMap={kind:'proc',seed:8724,zones:[{n:'Spawn Bay'},{n:'Furnace Hall'},{n:'Lab'},{n:'Cold Storage'}]};
const flameDistribution=zone=>{
 let n=0;
 for(let r=0;r<100;r++)for(let c=0;c<100;c++)
  if(zombieWallFireDecision(fireMap,zone,c,r,0,1))n++;
 return n;
};
const industrialFlames=flameDistribution(1),medicalFlames=flameDistribution(2),
 chilledFlames=flameDistribution(3);
assert(industrialFlames>=3000&&industrialFlames<5000,'furnace hall keeps dramatic but localized fire');
assert(medicalFlames>=250&&medicalFlames<650,'labs must not be ablaze on every wall');
assert(chilledFlames>=250&&chilledFlames<650,'cold storage must remain restrained');
assert(industrialFlames>medicalFlames*5,'fire belongs primarily in damaged hot zones');
assert.equal(zombieWallFireDecision(fireMap,1,27,81,-1,0),
 zombieWallFireDecision(fireMap,1,27,81,-1,0),'all clients pick same wall fire');
assert(flameDistribution(0)<2000,'spawn lane cannot become an entire glowing wall grid');

let validated=0,total=0;
for(let seed=1;seed<=80;seed++){
 const original=gen(seed);
 if(!original)continue;
 const layout={...original,kind:'proc',cell:2,gw:40,gh:32};
 const desktop=planZombiesRoomDressing(layout);
 const phone=planZombiesRoomDressing(layout,{low:true});
 assert.deepEqual(desktop,planZombiesRoomDressing(layout),
   'the same server-generated map must produce identical decorative placements');
 assert.deepEqual(phone,planZombiesRoomDressing(layout,{low:true}));
 assert(desktop.length>=3 && desktop.length<=40,
   'seed '+seed+' should render a bounded number of atmospheric fixtures');
 assert(phone.length>=1&&phone.length<=desktop.length,
   'mobile should still see details with lower object count');
 assert(new Set(desktop.map(s=>s.theme)).size>=3,
   'procedural rooms should not all look identical');
 const upper=original.zones.filter(z=>z.lv);
 assert(upper.every(z=>!desktop.some(s=>s.zone===original.zones.indexOf(z))),
   'helipads and ramps remain free of fake decorative obstructions');
 const obstacles=new Set();
 for(const [c0,c1,r0,r1] of original.obst||[])
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)obstacles.add(r*40+c);
 const used=new Set(),byZone=new Map();
 for(const site of desktop){
  assert.equal(original.grid[site.r]?.[site.c],site.zone);
  assert.equal(original.grid[site.r+site.dr]?.[site.c+site.dc],-1,
   'every fixture must mount on an actual server wall, not a floating plane');
  assert(!obstacles.has(site.r*40+site.c),'no wall fixture may overlap an authoritative solid obstacle');
  assert(!original.windef.some(w=>Math.abs(site.c-w[0])<=1&&Math.abs(site.r-w[1])<=1),
    'break-in window lanes must remain unobstructed');
  assert(!original.grid.some((row,r)=>row.some((id,c)=>
    id>=100&&Math.abs(c-site.c)<=2&&Math.abs(r-site.r)<=2)),
    'buyable doorway lanes must stay clear');
  assert(site.variant>=0&&site.variant<4);
  assert(Number.isFinite(site.yaw)&&Number.isFinite(site.x)&&Number.isFinite(site.z));
  const id=site.zone+':'+site.c+':'+site.r+':'+site.dc+':'+site.dr;
  assert(!used.has(id),'no duplicate fixture');used.add(id);
  byZone.set(site.zone,(byZone.get(site.zone)||0)+1);
 }
 for(const count of byZone.values())assert(count<=4);
 const lowByZone=new Map();
 for(const site of phone)lowByZone.set(site.zone,(lowByZone.get(site.zone)||0)+1);
 for(const count of lowByZone.values())assert(count<=2);
 if(seed<=8){
  const root=new THREE.Group();
  const usedGeos=[],usedMats=[];
  const visual=addZombiesRoomDressing(root,layout,{
   g:geo=>(usedGeos.push(geo),geo),
   basic:(c,opts)=>(usedMats.push(new THREE.MeshBasicMaterial({color:c,...opts})),usedMats.at(-1))
  });
  assert.equal(visual.sites.length,desktop.length);
  assert(visual.drawCalls>=3&&visual.drawCalls<=5,'map prop families are batched in <=5 draws');
  assert.equal(root.children.length,visual.drawCalls);
  assert(visual.instances>visual.sites.length*4,'each room fixture contains independently batched details');
  for(const child of root.children){
   assert(child.isInstancedMesh,'all decor uses Three.js instancing');
   assert(child.count>0&&child.count<=600);
   assert(child.userData.cosmeticOnly,'no collision or network effects');
   assert(child.boundingSphere?.radius>0&&Number.isFinite(child.boundingSphere.radius));
  }
  const lamp=root.children.find(x=>x.name==='zombies-room-dressing-lamp');
  assert(lamp?.instanceColor,'scene must retain instanced practical lights');
  const prevLamp=lamp.instanceColor.array.slice();
  visual.update(.1);visual.update(.1);visual.update(.1);
  assert(lamp.instanceColor.array.some((v,i)=>Math.abs(v-prevLamp[i])>0.0001),
   'failed-ballast practical lights change color during actual world ticks');
  assert.equal(visual.drawCalls,root.children.length,
   'light flicker must not add a mesh or postprocessing draw call');
  visual.update(NaN);visual.update(-1);
  assert(lamp.instanceColor.array.every(Number.isFinite),
   'weird frame delta cannot corrupt fixture GPU colors');
  for(const x of usedGeos)x.dispose();
  for(const x of usedMats)x.dispose();
  const lowRoot=new THREE.Group();
  const lowVisual=addZombiesRoomDressing(lowRoot,layout,{low:true});
  assert(lowVisual.sites.length<=desktop.length&&lowVisual.drawCalls<=5);
  lowVisual.update(.1);lowVisual.update(.1);lowVisual.update(.1);
  lowRoot.traverse(x=>{if(x.isMesh){x.geometry.dispose();x.material.dispose();}});
 }
 validated++;total+=desktop.length;
}
assert(validated>=40,'test many independent random server-generated Zombies worlds');
const grid=Array.from({length:12},(_,r)=>Array.from({length:14},(_,c)=>r===0||c===0||r===11||c===13?-1:0));
const fixed={kind:'refinery',name:'The BURN Refinery',grid,gw:14,gh:12,cell:2,zones:[{n:'Furnace Hall',r:[1,12,1,10]}],obst:[],windows:[],doors:[]};
const fixtures=planZombiesRoomDressing(fixed);
assert(fixtures.length>=1,'same system decorates existing handcrafted maps');
assert(fixtures.every(s=>s.theme==='spawn'),'zone 0 is spawn; no gameplay map classification changed');
// Verify integration against the EXACT public layout shape created by the
// live original Zombies server, not only the mapgen input structure.
const {Room}=require('../../server/game');
const Cod=require('../../server/cod');
for(const [name,mapId] of [['refinery','refinery'],['cosmodrome','cosmodrome'],['random',null]]){
 const room=new Room('environment-'+name,'zombie',mapId==='cosmodrome'?null:mapId);
 if(mapId==='cosmodrome')room.mapId='cosmodrome';
 if(mapId===null)room.seedT=9827;
 room.reset();
 Cod.bind(room);
 const actual=Cod.layout();
 assert.equal(actual.kind,name==='random'?'proc':name==='refinery'?'classic':'cosmodrome');
 assert(actual.grid.length===32&&actual.zones.length>0);
 const places=planZombiesRoomDressing(actual);
 assert(places.length>0,'live server '+name+' must place some high-detail fixtures');
 assert(places.every(site=>actual.grid[site.r]?.[site.c]===site.zone));
 const root=new THREE.Group();
 const rendering=addZombiesRoomDressing(root,actual);
 assert(rendering.drawCalls>0&&rendering.drawCalls<=5);
 root.traverse(x=>{if(x.isMesh){x.geometry.dispose();x.material.dispose();}});
}

console.log('Original Zombies atmospheric map dressing passed:',validated,
 'procedurally generated maps,',total,'desktop wall fixtures,',
 '5 or fewer instanced draws per map; handcrafted map compatibility');
