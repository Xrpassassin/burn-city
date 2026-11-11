import * as THREE from 'three';
import { planCityNature } from './city-nature-plan.mjs';
import { cityFoliageTriangles } from './city-nature-shapes.mjs';

// Grounded curved-blade silhouettes replace cone grass. Two instanced draws
// at most; no animation, physics, remote assets, shaders or extra lights.
export function installCityNature({scene,nodes,onRoad,colliders,tier='medium'}) {
 const placements=planCityNature({nodes,onRoad,colliders,tier});
 const meshes=[],dummy=new THREE.Object3D(),tint=new THREE.Color();
 const grasses=placements.filter(p=>!p.flower);
 const flowers=placements.filter(p=>p.flower);
 const groups=[grasses,flowers];
 const grassTints=[0x819773,0x758e6b,0x9b9872,0x6d8364,0x8a956f];
 const flowerTints=[0xf3eadb,0xffebd7,0xe8d6c2,0xf3e0c4];
 for(let t=0;t<groups.length;t++){
  const group=groups[t];if(!group.length)continue;
  const {positions,colors}=cityFoliageTriangles({flower:!!t});
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mat=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(geo,mat,group.length);
  mesh.name=t?'city-sparse-wildflowers':'city-ground-blade-clusters';
  group.forEach((p,i)=>{
   const variation=.84+.16*Math.sin(i*2.399963229728653);
   dummy.position.set(p.x,-.028,p.z);
   dummy.rotation.set(0,p.rotation,0);
   dummy.scale.set((t?.65:1)*variation,p.height,(t?.65:1)*(1.16-variation*.12));
   dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   const palette=t?flowerTints:grassTints;
   const colorIndex=(Math.floor(Math.abs(p.x)*13+Math.abs(p.z)*29)+i)%palette.length;
   tint.setHex(palette[colorIndex]);mesh.setColorAt(i,tint);
  });
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.computeBoundingSphere();
  mesh.castShadow=false;mesh.receiveShadow=false;
  scene.add(mesh);meshes.push(mesh);
 }
 return {
  count:placements.length,draws:meshes.length,
  dispose(){for(const mesh of meshes){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}}
 };
}
