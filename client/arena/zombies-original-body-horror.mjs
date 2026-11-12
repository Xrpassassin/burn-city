// Artist-GLB-safe, ORIGINAL interim enemy silhouettes for the original Zombies.
// The exact Sketchfab nurse and blob are not installed yet; keep credits and
// licensed source integration separate. Both use server type-8 Warden and
// type-5 crawler mechanics unchanged, with no fake network entities.
import * as THREE from './vendor/three.module.min.js';
import {tissueTexture,lobeGeometry} from './zombies-bio-containment.mjs';
import {zombiesBioSpecialIdentity} from './zombies-bio-containment-plan.mjs';

function hospitalTexture(){
 const size=128,arr=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  const brown=Math.sin(u*47+v*29)*Math.cos(u*17-v*61);
  const blood=((Math.sin(u*9.4+Math.sin(v*13)*2.2)*Math.sin(v*14-u*5))>.66&&v>.33);
  const i=(y*size+x)*4,soil=.72+brown*.12;
  arr[i]=blood?80:Math.round(206*soil+26);
  arr[i+1]=blood?26:Math.round(206*soil+25);
  arr[i+2]=blood?35:Math.round(197*soil+28);
  arr[i+3]=255;
 }
 const texture=new THREE.DataTexture(arr,size,size,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
 texture.needsUpdate=true;
 return texture;
}
function tornGown(){
 const geo=new THREE.CylinderGeometry(.29,.52,1.13,28,14,true);
 const p=geo.getAttribute('position');
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const fold=Math.sin(Math.atan2(z,x)*9+y*5)*.038;
  const torn=Math.max(0,(-y-.22)/.35)*Math.sin(Math.atan2(z,x)*17)*.075;
  const scale=1+fold+torn;
  p.setXYZ(i,x*scale,y,z*scale);
 }
 geo.computeVertexNormals();
 return geo;
}
export function createZombieOriginalFallback(type,{low=false}={}){
 const identity=zombiesBioSpecialIdentity(type);
 if(!identity)return null;
 const group=new THREE.Group(),geometries=[],materials=[],textures=[];
 const geo=shape=>(geometries.push(shape),shape);
 const mat=m=>(materials.push(m),m);
 const tex=identity==='mutant-nurse'?hospitalTexture():tissueTexture();
 textures.push(tex);
 const flesh=mat(new THREE.MeshStandardMaterial({
  map:identity==='living-flesh-blob'?tex:null,
  color:identity==='mutant-nurse'?0x55242b:0xd8b1a8,
  roughness:.68,metalness:0}));
 const cloth=mat(new THREE.MeshStandardMaterial({
  color:0xd7d1c7,map:identity==='mutant-nurse'?tex:null,
  roughness:.94,metalness:0,side:THREE.DoubleSide}));
 const dark=mat(new THREE.MeshStandardMaterial({
  color:0x3b151d,roughness:.83,metalness:0}));
 const lobes=[],vrms=[];
 if(identity==='living-flesh-blob'){
  // Unequal, connected, smooth biomass lobes. No goblin, robot, box or
  // low-resolution substitute: original 3D body with marbled tissue.
  const bulb=geo(lobeGeometry());
  for(let i=0;i<(low?4:7);i++){
   const m=new THREE.Mesh(bulb,flesh);
   m.position.set(Math.sin(i*2.22)*.40,.31+Math.sin(i*1.7)*.10,
    Math.cos(i*2.22)*.36);
   const width=i===0?.63:.27+(i%3)*.058;
   m.scale.set(width,i===0?.37:.22+i%3*.05,width*(.85+i%2*.18));
   m.userData.initialScale=m.scale.clone();
   m.userData.phase=i*.91;
   group.add(m);lobes.push(m);
  }
  // Rooted, hooked veins crawl toward the floor, never behaving as colliders.
  for(let i=0;i<(low?3:6);i++){
   const t=i*Math.PI/3,vec=[
    new THREE.Vector3(Math.cos(t)*.20,.41,Math.sin(t)*.17),
    new THREE.Vector3(Math.cos(t+.4)*.55,.31,Math.sin(t+.4)*.57),
    new THREE.Vector3(Math.cos(t+.9)*.82,.12,Math.sin(t+.9)*.76)];
   const tube=new THREE.Mesh(geo(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(vec),16,.032,6,false)),dark);
   tube.userData.phase=t;group.add(tube);vrms.push(tube);
  }
 }else{
  // The existing licensed, skinned infected human is still visible underneath
  // this blood-weathered surgical gown: recognizable medical identity without
  // claiming to be KrimzonHaze's unretrieved artist model.
  const apron=new THREE.Mesh(geo(tornGown()),cloth);
  apron.position.set(0,1.00,.035);group.add(apron);
  const hem=new THREE.Mesh(geo(new THREE.TorusGeometry(.41,.028,5,25)),
   dark);
  hem.rotation.x=Math.PI/2;hem.position.set(0,.45,.03);group.add(hem);
  const cowl=new THREE.Mesh(geo(new THREE.SphereGeometry(.33,22,12,0,Math.PI*2,0,Math.PI/2)),
   cloth);
  cowl.position.set(0,1.68,0);group.add(cowl);
  const capHem=new THREE.Mesh(geo(new THREE.TorusGeometry(.33,.029,6,25)),dark);
  capHem.rotation.x=Math.PI/2;capHem.position.set(0,1.68,0);group.add(capHem);
  // Dislocated, tendon-like shoulder growths telegraph the special charge.
  for(let side of [-1,1]){
   const pts=[
    new THREE.Vector3(side*.24,1.44,-.05),
    new THREE.Vector3(side*.58,1.54,.04),
    new THREE.Vector3(side*.7,1.18,.15)];
   const strand=new THREE.Mesh(geo(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts),15,.055,7,false)),flesh);
   group.add(strand);vrms.push(strand);
  }
 }
 let t=0,dead=false,hitTime=0;
 group.name='Original Zombies '+identity+' concept fallback';
 group.userData.originalZombieConcept=true;
 group.userData.cosmeticOnly=true;
 return {identity,group,hidesBaseModel:identity==='living-flesh-blob',
  update(dt){
   if(!Number.isFinite(dt)||dt<=0)return;
   t+=Math.min(.05,dt);
   const decay=dead?Math.max(.05,1-(t-hitTime)*1.5):1;
   for(const l of lobes){
    const k=1+.055*Math.sin(t*2.9+l.userData.phase);
    l.scale.copy(l.userData.initialScale).multiplyScalar(k*decay);
   }
   for(const tube of vrms)tube.rotation.y=Math.sin(t*1.8+tube.userData.phase)*.07;
  },
  react(kind){
   if(kind==='Death'){dead=true;hitTime=t;}
   else if(kind==='HitReact')hitTime=t;
  },
  dispose(){
   for(const x of geometries)x.dispose();
   for(const x of materials)x.dispose();
   for(const x of textures)x.dispose();
   group.clear();
  }
 };
}
