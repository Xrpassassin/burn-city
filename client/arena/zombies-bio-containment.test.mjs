import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as THREE from './vendor/three.module.min.js';
import {planZombiesBioContainment,zombiesBioSpecialIdentity} from './zombies-bio-containment-plan.mjs';
import {addZombiesBioContainment,tissueTexture,lobeGeometry} from './zombies-bio-containment.mjs';
import {createZombieOriginalFallback} from './zombies-original-body-horror.mjs';
const require=createRequire(import.meta.url);
const {gen}=require('../../server/mapgen.js');
const {Room}=require('../../server/game');
const Cod=require('../../server/cod');
assert.equal(zombiesBioSpecialIdentity(8),'mutant-nurse');
assert.equal(zombiesBioSpecialIdentity(5),'living-flesh-blob');
assert.equal(zombiesBioSpecialIdentity(7),null);
assert.equal(zombiesBioSpecialIdentity(0),null);
const ownTex=tissueTexture();
assert(ownTex.isDataTexture&&ownTex.image.data.length===128*128*4);
ownTex.dispose();
const smooth=lobeGeometry();assert(smooth.attributes.position.count>250);
smooth.dispose();
for(const type of [5,8]){
 const fx=createZombieOriginalFallback(type);
 assert(fx.group.isGroup&&fx.group.userData.originalZombieConcept);
 assert.equal(fx.hidesBaseModel,type===5);
 assert(fx.group.children.length>=5,'organic anatomy and medical costume must not be a simplistic cube');
 let triangles=0;
 for(const mesh of fx.group.children){
  assert(mesh.isMesh);
  const shape=mesh.geometry;
  triangles+=shape.index?shape.index.count/3:shape.getAttribute('position').count/3;
  assert(mesh.material.roughness>=.5,'no shiny low-poly plastic');
 }
 assert(triangles>800,'real smooth anatomy detail, not primitive block creatures');
 for(let i=0;i<8;i++)fx.update(.1);
 fx.react('HitReact');fx.update(.1);
 fx.react('Death');fx.update(.1);
 fx.update(NaN);fx.update(-4);
 assert(fx.group.children.every(x=>x.scale.toArray().every(Number.isFinite)));
 fx.dispose();assert.equal(fx.group.children.length,0,'deterministic disposal');
}
assert.equal(createZombieOriginalFallback(0),null);

function check(layout,low=false){
 const before=JSON.stringify(layout);
 const sites=planZombiesBioContainment(layout,{low});
 assert.deepEqual(sites,planZombiesBioContainment(layout,{low}));
 assert.equal(JSON.stringify(layout),before,'never mutate authoritative server layout');
 assert(sites.length<= (low?4:8));
 const seen=new Set();
 for(const site of sites){
  assert(!seen.has(site.zone));seen.add(site.zone);
  assert.equal(layout.grid[site.r]?.[site.c],site.zone);
  assert.equal(layout.grid[site.r+site.dr]?.[site.c+site.dc],-1,
   'nests must only be bolted onto real walls');
  assert(['surgical-ward','cryogenic-breach','biofurnace','overflow-chamber',
   'quarantine-control','memorial-husk','sealed-infirmary'].includes(site.kind));
  assert(Number.isFinite(site.x)&&Number.isFinite(site.z));
 }
 if(!sites.length)return {sites:[],drawCalls:0};
 const group=new THREE.Group(),geos=[];
 const view=addZombiesBioContainment(group,layout,{low,g:geo=>(geos.push(geo),geo)});
 assert.equal(view.sites.length,sites.length);
 assert(view.instances>=sites.length*8);
 assert(view.drawCalls>0&&view.drawCalls<=6);
 assert(group.children.every(x=>x.isInstancedMesh&&x.userData.cosmeticOnly));
 const lobes=group.getObjectByName('zombies-bio-containment-lobe');
 assert(lobes&&lobes.count>=sites.length*3);
 assert(lobes.material.map?.image?.data?.length===128*128*4);
 assert(lobes.material.roughness>=.5&&lobes.geometry.attributes.normal.count>250);
 const beforeMatrix=lobes.instanceMatrix.array.slice();
 for(let t=0;t<8;t++)view.update(.06);
 assert(lobes.instanceMatrix.array.some((v,i)=>Math.abs(v-beforeMatrix[i])>.00001),
  'actual living tissue should pulse in the scene');
 assert.equal(view.drawCalls,group.children.length,'pulsation never allocates another draw');
 view.update(-1);view.update(Infinity);view.update(NaN);
 assert(lobes.instanceMatrix.array.every(Number.isFinite));
 view.dispose();
 for(const geo of geos)geo.dispose();
 return view;
}
let checked=0,withScenes=0;
for(let seed=1;seed<=80;seed++){
 const generated=gen(seed);if(!generated)continue;
 const layout={...generated,kind:'proc',grid:generated.grid,cell:2,gw:40,gh:32};
 const high=check(layout,false),mobile=check(layout,true);
 assert(mobile.sites.length<=high.sites.length);
 if(high.sites.length)withScenes++;
 checked++;
}
assert(checked>=70&&withScenes>=60,'bio horror needs to show on real generated levels');
for(const [name,mapId] of [['refinery','refinery'],['cosmodrome','cosmodrome'],['procedural',null]]){
 const room=new Room('bio-horror-'+name,'zombie',mapId==='cosmodrome'?null:mapId);
 if(name==='cosmodrome')room.mapId='cosmodrome';
 if(name==='procedural')room.seedT=9827;
 room.reset();Cod.bind(room);
 const layout=Cod.layout(),view=check(layout,false);
 assert(view.sites.length>0,'bio containment must actually appear in '+name);
 check(layout,true);
}
const pilot=readFileSync(new URL('./zombie-model-pilot.mjs',import.meta.url),'utf8');
assert.match(pilot,/model\.definition\.special\?null/);
assert.match(pilot,/createZombieOriginalFallback\(z\.ty/);
assert.match(pilot,/adornment\.hidesBaseModel/);
assert.match(pilot,/adornment\?\.dispose/);
const source=readFileSync(new URL('./community-art-intake.mjs',import.meta.url),'utf8');
assert(source.includes("entry('mutant-nurse'")&&source.includes("entry('living-flesh-blob'"));
assert(!/entry\('mutant-nurse'[\s\S]*?installed:true/.test(source.split("entry('living-flesh-blob'")[0]),
 'original artist model must remain disabled until official authenticated acquisition');
console.log('Original Zombies bio containment passed:',checked,
 'procedural seeds, real Refinery/Cosmodrome, PBR mass silhouettes, medic concept fallback, six batched renders, unchanged server rules.');
