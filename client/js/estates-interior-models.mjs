// Walk-in home furniture models (CC BY 4.0 Sketchfab sources, credited in
// client/city-credits.html and client/assets/estates-interiors/CREDITS.md).
// Loaded lazily only when a player steps inside a home, and fully disposed
// (geometry, materials, textures) on exit. If three's GLTFLoader or any file is
// unavailable, the box primitives from estates-home-plans.mjs stay in place.
export const ESTATE_INTERIOR_MODEL_IDS=Object.freeze(['sofa','armchair','bed','bookshelf','kitchen','fridge','monstera','snake','tvstand','dining','chandelier']);
const ASSETS=new URL('../assets/estates-interiors/',import.meta.url);
export function createEstateInteriorModelCache(THREE,{base=ASSETS,loader=null}={}){
 const loaded=new Map(),pending=new Map();let gl=loader,generation=0;
 async function getLoader(){
  if(gl)return gl;
  try{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');gl=new GLTFLoader();}catch{gl=null;}
  return gl;
 }
 // Resolves to Map<id,[{geometry,material}]> for the requested ids; never rejects.
 async function load(ids){
  const want=[...new Set(ids)].filter(id=>ESTATE_INTERIOR_MODEL_IDS.includes(id)),gen=generation;
  const l=await getLoader();
  if(l)await Promise.all(want.map(id=>{
   if(loaded.has(id))return null;
   if(!pending.has(id))pending.set(id,l.loadAsync(new URL(id+'.gltf',base).href).then(gltf=>{
    if(gen!==generation)return;  // the player already left: do not keep it
    gltf.scene.updateMatrixWorld(true);const parts=[];
    gltf.scene.traverse(node=>{
     if(!node.isMesh)return;
     const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);
     const material=node.material;
     if(material?.map&&THREE.SRGBColorSpace)material.map.colorSpace=THREE.SRGBColorSpace;
     parts.push({geometry,material});
    });
    node_dispose(gltf.scene,parts);
    if(parts.length)loaded.set(id,parts);
   }).catch(()=>{}).finally(()=>pending.delete(id)));
   return pending.get(id);
  }));
  return new Map(want.filter(id=>loaded.has(id)).map(id=>[id,loaded.get(id)]));
 }
 // Original loader geometries are replaced by baked clones; free them now.
 function node_dispose(scene,keep){
  const kept=new Set(keep.map(p=>p.geometry));
  scene.traverse(n=>{if(n.isMesh&&!kept.has(n.geometry))n.geometry.dispose?.();});
 }
 function dispose(){
  generation++;
  for(const parts of loaded.values())for(const {geometry,material} of parts){
   geometry.dispose?.();
   for(const m of Array.isArray(material)?material:[material]){m?.map?.dispose?.();m?.dispose?.();}
  }
  loaded.clear();
 }
 return {load,dispose,get size(){return loaded.size;}};
}
