// Distanced horde LOD for ORIGINAL Arena Zombies. Bake the licensed animated
// human-infected GLBs into one low-cost textured idle pose per mesh and use
// InstancedMesh to draw all far enemies. Their damage, movement, spawning,
// visibility and hitboxes remain server/game-authoritative. No Homefront code.
import * as THREE from './vendor/three.module.min.js';
import * as SkeletonUtils from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';
import {stableZombieHash} from './zombie-model-selection.mjs';
import {zombieHumanShape} from './zombie-arena-appearance.mjs';
import {zombieVisualModelId} from './zombie-sketchfab-cast.mjs';

const v=new THREE.Vector3(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),
      size=new THREE.Vector3(),mat=new THREE.Matrix4(),UP=new THREE.Vector3(0,1,0);

/** Returns geometry with *current skinned pose baked* into static vertices.
 * The glTF skinning matrices are computed once, never each frame.
 */
export function bakeInfectedGeometry(mesh,groundOffset=0) {
 const original=mesh.geometry,copy=original.clone(),a=copy.getAttribute('position');
 for(let i=0;i<a.count;i++){
  v.fromBufferAttribute(a,i);
  if(mesh.isSkinnedMesh&&typeof mesh.applyBoneTransform==='function')mesh.applyBoneTransform(i,v);
  v.applyMatrix4(mesh.matrixWorld);
  a.setXYZ(i,v.x,v.y-groundOffset,v.z);
 }
 // The result is a STATIC baked mesh. Leaving skin/morph target attributes
 // on an InstancedMesh makes WebGL attempt to upload nonexistent rig buffers
 // and crashes Chromium and Safari (undefined array.length).
 copy.deleteAttribute('skinIndex');copy.deleteAttribute('skinWeight');
 copy.morphAttributes={};copy.morphTargetsRelative=false;
 copy.clearGroups();
 a.needsUpdate=true;copy.computeVertexNormals();copy.computeBoundingSphere();return copy;
}

export function createZombieInstancedLOD(scene,models,{capacity=48}={}){
 const max=Math.max(1,Math.min(96,Math.floor(capacity)));
 const byId=new Map();
 const resources=[];
 for(const model of models){
  const source=SkeletonUtils.clone(model.gltf.scene);
  const idle=model.clips.get('Idle');
  const mixer=new THREE.AnimationMixer(source);
  if(idle){mixer.clipAction(idle).play();mixer.update(Math.min(.4,Math.max(0,idle.duration*.15)));}
  source.updateMatrixWorld(true);
  const meshes=[];
  source.traverse(node=>{
   if(!node.isMesh||!node.geometry||!node.material)return;
   const geo=bakeInfectedGeometry(node,model.minY);
   const instance=new THREE.InstancedMesh(geo,node.material,max);
   instance.count=0;instance.frustumCulled=false;
   instance.name='Original Zombies / '+model.id+' / distant textured infected';
   instance.castShadow=false;instance.receiveShadow=false;
   instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   scene.add(instance);meshes.push(instance);resources.push({mesh:instance,geometry:geo});
  });
  mixer.stopAllAction();
  if(meshes.length)byId.set(model.id,{model,meshes});
 }
 const result=new Set();
 const counters=new Map();
 return {
  update(zombies,animatedIds,elapsed=0){
   result.clear();counters.clear();
   for(const [key,group]of byId){counters.set(key,0);for(const part of group.meshes)part.count=0;}
   for(const z of zombies){
    if(animatedIds.has(z.id))continue;
    let group=byId.get(zombieVisualModelId(z.ty));
    if(!group)group=byId.values().next().value;
    if(!group)continue;
    const index=counters.get(group.model.id)||0;
    if(index>=max)continue;
    const scale=group.model.scale*zombieHumanShape(z.ty)*(Number.isFinite(z.v)?z.v:1);
    if(!Number.isFinite(scale)||scale<=0)continue;
    const wobble=.025*Math.sin(elapsed*2.7+(stableZombieHash(z.id)%400)*.01);
    pos.set(z.x||0,z.y||0,z.z||0);
    quat.setFromAxisAngle(UP,(z.yaw||0)+wobble);
    size.setScalar(scale);
    mat.compose(pos,quat,size);
    for(const part of group.meshes)part.setMatrixAt(index,mat);
    counters.set(group.model.id,index+1);
    result.add(z.id);
   }
   for(const [key,group]of byId){
    const count=counters.get(key)||0;
    for(const part of group.meshes){part.count=count;part.instanceMatrix.needsUpdate=count>0;}
   }
   return result;
  },
  get stats(){return {painted:result.size,partDraws:resources.length,models:byId.size}},
  dispose(){
   for(const {mesh,geometry}of resources){scene.remove(mesh);geometry.dispose();}
   byId.clear();result.clear();
  }
 };
}
