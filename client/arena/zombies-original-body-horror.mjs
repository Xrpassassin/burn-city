// Temporary ORIGINAL organic crawler concept ONLY for the original Zombies.
// The user-selected KrimzonHaze mutant nurse is NOT approximated with a
// cheap cone costume: keep the authentic skinned infected as the Warden until
// that artist's rig is downloaded through Sketchfab OAuth and retargeted.
import * as THREE from './vendor/three.module.min.js';
import {tissueTexture,lobeGeometry} from './zombies-bio-containment.mjs';

export function createZombieOriginalFallback(type,{low=false}={}){
 if(type!==5)return null;
 const group=new THREE.Group(),geometries=[],materials=[];
 const skin=tissueTexture();
 const flesh=new THREE.MeshStandardMaterial({
  map:skin,color:0xd2bbb6,roughness:.59,metalness:0,
  emissive:0x250709,emissiveIntensity:.03
 });
 const tendon=new THREE.MeshStandardMaterial({
  color:0x491e24,roughness:.76,metalness:0
 });
 materials.push(flesh,tendon);
 const bulb=lobeGeometry();
 geometries.push(bulb);
 const lobes=[],veins=[];
 // Uneven softly shaded connected lobes and trailing tendons form the body,
 // never LEGO blocks or an oversized faceted icosahedron.
 for(let i=0;i<(low?5:8);i++){
  const m=new THREE.Mesh(bulb,flesh);
  m.position.set(Math.sin(i*2.22)*.37,.32+Math.sin(i*1.7)*.09,
   Math.cos(i*2.22)*.31);
  const width=i===0?.60:.24+(i%3)*.064;
  m.scale.set(width,i===0?.37:.21+i%3*.045,width*(.85+i%2*.15));
  m.userData.initialScale=m.scale.clone();
  m.userData.phase=i*.91;
  group.add(m);lobes.push(m);
 }
 for(let i=0;i<(low?3:6);i++){
  const t=i*Math.PI/3,vec=[
   new THREE.Vector3(Math.cos(t)*.18,.40,Math.sin(t)*.18),
   new THREE.Vector3(Math.cos(t+.4)*.54,.29,Math.sin(t+.4)*.53),
   new THREE.Vector3(Math.cos(t+.9)*.77,.13,Math.sin(t+.9)*.74)
  ];
  const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vec),24,.028,8,false);
  geometries.push(geo);
  const tube=new THREE.Mesh(geo,tendon);
  tube.userData.phase=t;group.add(tube);veins.push(tube);
 }
 let t=0,dead=false,hitTime=0;
 group.name='Original Zombies organic crawler (in-house concept)';
 group.userData.originalZombieConcept=true;
 group.userData.cosmeticOnly=true;
 return {identity:'living-flesh-blob',group,hidesBaseModel:true,
  update(dt){
   if(!Number.isFinite(dt)||dt<=0)return;
   t+=Math.min(.05,dt);
   const decay=dead?Math.max(.05,1-(t-hitTime)*1.5):1;
   for(const l of lobes){
    const k=1+.053*Math.sin(t*2.9+l.userData.phase);
    l.scale.copy(l.userData.initialScale).multiplyScalar(k*decay);
   }
   for(const tube of veins)
    tube.rotation.y=Math.sin(t*1.8+tube.userData.phase)*.065;
  },
  react(kind){
   if(kind==='Death'){dead=true;hitTime=t;}
   else if(kind==='HitReact')hitTime=t;
  },
  dispose(){
   for(const x of geometries)x.dispose();
   for(const x of materials)x.dispose();
   skin.dispose();group.clear();
  }
 };
}
