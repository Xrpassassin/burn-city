import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as THREE from './vendor/three.module.min.js';
import {planZombiesRuinedArchitecture} from './zombies-ruined-architecture-plan.mjs';
import {addZombiesRuinedArchitecture} from './zombies-ruined-architecture.mjs';
const require=createRequire(import.meta.url);
const {gen}=require('../../server/mapgen.js');
const {Room}=require('../../server/game');
const Cod=require('../../server/cod');

const provenance=JSON.parse(readFileSync(new URL('./assets/homefront/surfaces/sources.json',import.meta.url),'utf8'));
const cc0=provenance.files.find(f=>f.file==='concrete_wall_006-color.webp');
assert.equal(provenance.license,'CC0-1.0');
assert(cc0?.sha256&&cc0.bytes<100000);
const bytes=readFileSync(new URL('./assets/homefront/surfaces/concrete_wall_006-color.webp',import.meta.url));
assert.equal(bytes.toString('ascii',0,4),'RIFF');
assert.equal(bytes.toString('ascii',8,12),'WEBP');
assert.equal(bytes.length,cc0.bytes,'reuse actual already-vendored, credited CC0 concrete scan');

function validate(layout,low=false,strict=false){
 const before=JSON.stringify(layout);
 const plan=planZombiesRuinedArchitecture(layout,{low});
 assert.deepEqual(plan,planZombiesRuinedArchitecture(layout,{low}),
  'same map + device budget must yield the exact same ruin geometry');
 assert.equal(JSON.stringify(layout),before,'ruin planner must never mutate the authoritative map');
 assert.equal(plan.source,'authoritative-zombies-grid');
 assert(plan.clusters.length>=1&&plan.clusters.length<=(low?9:18));
 assert(plan.windows.length<=(low?12:36));
 assert(plan.clusters.every(site=>site.roofY>=3.3&&site.roofY<=3.4));
 const windowSites=layout.windows||[];
 for(const w of plan.windows){
  const original=windowSites[w.index];
  assert(original&&w.x===original.x&&w.z===original.z,
    'glass shards must belong to genuine server windows');
  assert(w.y>=2.46,'glass remains inside upper portion of existing window opening');
  assert(w.ax==='x'||w.ax==='z');
 }
 for(const s of plan.clusters){
  assert.equal(layout.grid[s.r]?.[s.c],s.zone);
  assert.equal(layout.grid[s.r+s.dr]?.[s.c+s.dc],-1,
   'ruined roof must be anchored to an existing wall; no floating obstacles');
  assert(['isolation','power','furnace','collapse'].includes(s.kind));
  assert(!layout.windows?.some(w=>Math.abs(w.c-s.c)<=1&&Math.abs(w.r-s.r)<=1),
   'no ceiling anchor should conceal an active zombie window');
 }
 const root=new THREE.Group();
 const geos=[],materials=[];
 const result=addZombiesRuinedArchitecture(root,layout,{
  low,g:geo=>(geos.push(geo),geo),
  basic:(color,options={})=>{
   const mat=new THREE.MeshBasicMaterial({color,...options});
   materials.push(mat);return mat;
  }
 });
 assert.equal(result.clusters.length,plan.clusters.length);
 assert.equal(result.windows.length,plan.windows.length);
 assert(result.drawCalls<=6,
  'roof fragments, beams, pipes, cable, glass and local dust must stay batched');
 assert.equal(root.children.length,result.drawCalls);
 assert(result.instances>=plan.clusters.length*5,
  'damaged slabs, steel beams and conduit should comprise real geometry');
 assert(result.motes<=plan.clusters.length*(low?3:10),
  'local dust budget bounded per mobile and desktop room');
 for(const child of root.children){
  assert(child.userData.cosmeticOnly,'every ruin is decor: not a collider');
  assert(child.isInstancedMesh||child.isPoints);
  if(child.isInstancedMesh){
   assert(child.count<=160);
   assert(child.instanceMatrix.array.every(Number.isFinite));
   assert(child.castShadow===false);
   assert(child.boundingSphere?.radius>0&&Number.isFinite(child.boundingSphere.radius));
  }
 }
 const slab=root.children.find(x=>x.name==='zombies-ruins-slab');
 assert(slab?.geometry?.getAttribute('position')?.count>=15,
  'ceilings are visibly jagged silhouettes, not big rectangular blocks');
 const glass=root.children.find(x=>x.name==='zombies-ruins-glass');
 if(windowSites.length&&plan.windows.length){
  assert(glass?.material.transparent&&glass.material.opacity<.5,
   'actual window remnants cannot become opaque panels');
 }
 if(strict)assert(result.motes>=3);
 const dust=root.children.find(x=>x.name==='zombies-ruins-local-dust');
 assert(dust?.geometry?.getAttribute('position')?.count===result.motes,
  'dust remains exactly one batched point cloud');
 const beforeDust=dust.geometry.attributes.position.array.slice();
 for(let j=0;j<5;j++)result.update(.1);
 const nextDust=dust.geometry.attributes.position.array;
 assert(nextDust.some((v,i)=>Math.abs(v-beforeDust[i])>.00001),
  'ruined-ceiling dust must actually move during gameplay');
 assert(nextDust.every(Number.isFinite),'dust update must be finite after frame-capping');
 assert.equal(root.children.length,result.drawCalls,
  'dust motion must never create more draw calls or particles');
 result.update(-1);result.update(Infinity);result.update(NaN);
 assert(nextDust.every(Number.isFinite),'bad deltas must be ignored');
 result.dispose();
 for(const g of geos)g.dispose();
 for(const m of materials)m.dispose();
 return result;
}
let valid=0,clusters=0,windows=0;
for(let seed=1;seed<=80;seed++){
 const map=gen(seed);
 if(!map)continue;
 const layout={...map,kind:'proc',grid:map.grid,cell:2,gw:40,gh:32,
  windows:(map.windef||[]).map(([c,r,nx,nz,lv])=>({
   x:(c-20)*2+1,z:(r-16)*2+1,c,r,ax:nz?'x':'z',lv:lv||0
  }))};
 const high=validate(layout,false,seed<=10);
 const mobile=validate(layout,true);
 assert(mobile.clusters.length<=high.clusters.length);
 assert(mobile.windows.length<=high.windows.length);
 valid++;clusters+=high.clusters.length;windows+=high.windows.length;
}
assert(valid>=40,'verify 80 independent procedural seeds, not a static screenshot');

for(const [name,mapId] of [['refinery','refinery'],['cosmodrome','cosmodrome'],['random',null]]){
 const room=new Room('zombies-ruins-'+name,'zombie',mapId==='cosmodrome'?null:mapId);
 if(mapId==='cosmodrome')room.mapId='cosmodrome';
 if(name==='random')room.seedT=9827;
 room.reset();
 Cod.bind(room);
 const actual=Cod.layout();
 assert.equal(actual.kind,name==='random'?'proc':name==='refinery'?'classic':'cosmodrome');
 const report=validate(actual,false,true);
 assert(report.drawCalls>=3);
 assert(report.windows.length<=36);
 const mobile=validate(actual,true,true);
 assert(mobile.drawCalls<=6);
}
console.log('Original Zombies CC0 ruined architecture passes:',valid,
 'procedural seeds;',clusters,'overhead ruin anchors;',windows,
 'authentic window remnants; real Refinery/Cosmodrome/procedural layouts;',
 'desktop/mobile <=6 new draw calls');
