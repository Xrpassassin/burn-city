import * as THREE from 'three';
import { planCityNature } from './city-nature-plan.mjs';
// Instanced ground tufts (two draws at most), no per-object updates or physics.
export function installCityNature({scene,nodes,onRoad,colliders,tier='medium'}) {
 const placements=planCityNature({nodes,onRoad,colliders,tier});
 const meshes=[];const dummy=new THREE.Object3D();
 // Varied blade-cluster silhouettes share geometry; no new draw calls.
 const geo=new THREE.ConeGeometry(.22,1,3);
 const types=[placements.filter(p=>!p.flower),placements.filter(p=>p.flower)];
 for(let t=0;t<types.length;t++){
  const group=types[t];if(!group.length)continue;
  const mat=new THREE.MeshLambertMaterial({color:t?0xb39a57:0x557e48,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(geo,mat,group.length);
  group.forEach((p,i)=>{dummy.position.set(p.x,p.height*.5-.045,p.z);dummy.rotation.set(0,p.rotation,0);
   const variation=.75+.25*Math.sin(i*2.399963229728653);
   dummy.scale.set((t?.65:1)*variation,p.height,(t?.65:1)*(1.15-variation*.2));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});
  mesh.instanceMatrix.needsUpdate=true;
  // InstancedMesh's initial bounds describe the untransformed cone, not scattered tufts.
  // Recompute so frustum culling doesn't make distant vegetation disappear abruptly.
  mesh.computeBoundingSphere();
  mesh.receiveShadow=false;mesh.castShadow=false;
  scene.add(mesh);meshes.push(mesh);
 }
 return {count:placements.length,draws:meshes.length,dispose(){for(const mesh of meshes){scene.remove(mesh);mesh.material.dispose()}geo.dispose()}};
}
