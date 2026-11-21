// Lake party barge: low-cost procedural exterior and animated pirate crowd.
// Stage one: scenic vessel; actual Ember Bar bartender and checkout require a
// shared NPC runtime adapter (not duplicated here).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const mat=(color,emissive=0)=>new THREE.MeshStandardMaterial({color,roughness:.8,emissive,emissiveIntensity:emissive?.65:0});
const wood=mat(0x38251c),trim=mat(0x9d6d38),sail=mat(0x31243c),light=mat(0xffb75c,0xff8d27),dark=mat(0x17121a);
function block(g,m,x,y,z,w,h,d){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;}
export function createPiratePartyBarge({scene,inLake,waterY=.22,origin,low=false}={}){
 if(!scene||typeof inLake!=='function'||!origin)return null;
 const radius=30;
 const clear=(x,z)=>{for(let i=0;i<16;i++){const a=i*Math.PI/8;if(!inLake(x+Math.cos(a)*radius,z+Math.sin(a)*radius))return false;}return true;};
 let site=null;
 // Search outward from the existing fishing dock, avoiding shore and bridge.
 for(const dist of [65,85,105,125,145]){for(const side of [-1,1]){const x=origin.x+side*dist,z=origin.z+dist*.28;if(clear(x,z)){site={x,z};break;}}if(site)break;}
 if(!site)return null;
 const root=new THREE.Group();root.name='Blacktide Party Barge';root.position.set(site.x,waterY,site.z);scene.add(root);
 const hull=block(root,wood,0,1,0,22,3.6,48);hull.rotation.z=.01;
 block(root,trim,0,3.1,0,23,1,46);
 block(root,wood,0,5.3,-15,21,3,15);block(root,wood,0,5.3,16,21,3,11);
 block(root,trim,0,7,-15,22,.7,15);
 // Main party floor, railings, mast, sail, and upper-deck tavern counter.
 for(const x of [-11,11])for(let z=-21;z<=21;z+=4)block(root,trim,x,4,z,.45,2.2,.5);
 for(const z of [-23,23])block(root,trim,0,4,z,22,1,.5);
 block(root,wood,0,4,-8,12,1,3);block(root,trim,0,5,-6.4,12,.3,.6);
 block(root,trim,0,15,3,1,25,1);block(root,sail,0,17,3,16,13,.3);
 // Two rows of warm lanterns and a dance-floor perimeter.
 for(const x of [-9,9])for(let z=-17;z<=17;z+=7)block(root,light,x,6.5,z,.65,.85,.65);
 for(const x of [-6,6])for(const z of [-3,8])block(root,light,x,3.8,z,1,.1,1);
 // Reuse the already licensed Ember Bar characters, with mobile LOD.
 const characters=[];
 const loader=new GLTFLoader();
 const assets=new URL('../assets/bar/',import.meta.url);
 const addCharacter=async(id,x,y,z,yaw)=>{
   try {
     const suffix=low?'-lo':'';
     const gltf=await loader.loadAsync(new URL(id+suffix+'.gltf',assets).href);
     const model=gltf.scene;model.position.set(x,y,z);model.rotation.y=yaw;
     root.add(model);
     const mixer=new THREE.AnimationMixer(model);
     const idle=gltf.animations.find(a=>/idle/i.test(a.name))||gltf.animations[0];
     if(idle)mixer.clipAction(idle).play();
     characters.push({model,mixer});
   }catch(error){console.warn('party barge character',id,error);}
 };
 // Local deck positions; not shared with the existing Ember Bar's instance.
 void addCharacter('pirate',0,3.6,-8,Math.PI);
 void addCharacter('blackbeard',-6,3.6,-4,Math.PI/2);
 // Lightweight pirate silhouettes, deliberately not represented as imported NPC assets.
 const pirates=[],count=low?8:18,coat=[mat(0x572e30),mat(0x283f48),mat(0x3d392a)];
 for(let i=0;i<count;i++){const p=new THREE.Group(),a=i*2.399,r=4+(i%4)*2.2;
   p.position.set(Math.cos(a)*r,3.6,Math.sin(a)*r+3);
   block(p,coat[i%3],0,.9,0,.9,1.5,.55);
   const head=new THREE.Mesh(new THREE.SphereGeometry(.35,6,5),mat(0xb58b68));head.position.y=1.9;p.add(head);
   block(p,dark,0,2.25,0,.85,.18,.75);
   root.add(p);pirates.push({p,phase:i*1.7});}
 let elapsed=0;
 function update(dt=0){elapsed+=Math.min(.1,Math.max(0,dt));root.position.y=waterY+Math.sin(elapsed*.7)*.09;root.rotation.z=Math.sin(elapsed*.35)*.008;
  for(const c of characters)c.mixer.update(Math.min(.1,Math.max(0,dt)));
  for(const {p,phase} of pirates){p.rotation.y=Math.sin(elapsed*.6+phase)*.5;p.position.y=3.6+Math.max(0,Math.sin(elapsed*2+phase))*.15;}}
 function dispose(){scene.remove(root);root.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
 return {root,site,update,dispose,scenicOnly:false,characters};
}
