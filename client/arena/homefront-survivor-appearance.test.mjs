import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from './vendor/three.module.min.js';
import {applyHomefrontFieldLook} from './homefront-survivor-appearance.mjs';

function fakeWalker(){
 const walker=new THREE.Group(),torso=new THREE.Group(),head=new THREE.Group();
 const arms=[new THREE.Group(),new THREE.Group()],legs=[new THREE.Group(),new THREE.Group()];
 const originalCore=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial({color:0xff9000}));
 torso.add(originalCore);
 const visor=new THREE.Mesh(new THREE.BoxGeometry(.2,.03,.1),new THREE.MeshBasicMaterial());
 head.add(visor);
 walker.userData={torso,head,arms,legs,visor};
 walker.add(torso,...arms,...legs);
 torso.add(head);
 return {walker,originalCore,visor,arms,legs};
}
for(const lite of [true,false]){
 const {walker,originalCore,visor,arms,legs}=fakeWalker();
 const originalRotation=arms.map(x=>x.rotation.x), originalLegs=walker.userData.legs;
 const added=applyHomefrontFieldLook(THREE,walker,{lite});
 assert(added.added>=5&&added.added<15,'a restrained, bounded amount of original kit is added');
 assert.equal(added.reused,false);
 assert.equal(visor.visible,false,'sci-fi visor is hidden only in this avatar');
 assert.equal(originalCore.visible,false,'neon core is hidden on field explorers');
 assert.strictEqual(originalLegs,walker.userData.legs,'combat/movement references remain original');
 assert.deepEqual(arms.map(x=>x.rotation.x),originalRotation,'existing animations are not reposed');
 const meshes=[];walker.traverse(x=>{if(x.userData.homefrontCosmetic)meshes.push(x)});
 assert.equal(meshes.length,added.added);
 assert(meshes.every(x=>x.isMesh&&!x.castShadow&&!x.receiveShadow));
 assert(meshes.every(x=>x.geometry.getAttribute('position').count<500),
   'each equipment piece remains a small shared rig attachment');
 assert.deepEqual(applyHomefrontFieldLook(THREE,walker,{lite}),{added:0,reused:true},
   'repeated updates cannot accumulate geometry on a walker');
 for(const part of meshes)assert([...part.geometry.getAttribute('position').array].every(Number.isFinite));
}
assert.deepEqual(applyHomefrontFieldLook(THREE,new THREE.Group()),{added:0,reused:false});
const world=readFileSync(new URL('./homefront-graveyard-3d.js',import.meta.url),'utf8');
const refuge=readFileSync(new URL('./homefront.html',import.meta.url),'utf8');
assert(world.includes('applyHomefrontFieldLook(THREE,walker,{lite:LITE_AVATARS || !isLocalPlayer})'));
assert(world.includes('applyHomefrontFieldLook(THREE,npc,{lite:true})'));
assert(refuge.includes("applyHomefrontFieldLook(THREE,walker,{lite:matchMedia('(pointer: coarse)').matches})"));
assert(!readFileSync(new URL('../js/walker.js',import.meta.url),'utf8').includes('homefront-survivor-appearance'),
 'Homefront art must not be applied globally to city/NFT avatars');
console.log('Homefront original field-worn survivor kit: rig isolation, mobile budget, animation safety passed');
