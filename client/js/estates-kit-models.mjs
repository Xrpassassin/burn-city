// Shared Kenney CC0 furniture and yard props (see client/assets/estates-kit/ATTRIBUTION.md).
// Loaded lazily, geometries shared, fully disposed with the cache. Box primitives stay as fallbacks.
export const ESTATE_KIT_FURNITURE=Object.freeze([
 'lamp-floor','lamp-table','lamp-ceiling','lamp-table-square','lamp-floor-square',
 'rug-rect','rug-round','rug-square','plant-potted','plant-small-a','plant-small-b','plant-small-c',
 'table-coffee','table-coffee-square','side-table','side-table-drawers','books','lounge-chair',
 'lounge-sofa','tv-modern','ceiling-fan','chair','desk','coat-rack','pillow','stool','bookcase','fridge-small'
]);
export const ESTATE_KIT_YARD=Object.freeze([
 'fence-simple','fence-low','fence-planks','fence-corner','path-stone','path-stone-end','path-wood',
 'bush','bush-small','bush-detailed','flower-red','flower-yellow','flower-purple','pot','rock','rock-flat',
 'path-tile','path-straight','grass'
]);
const FURNITURE=new URL('../assets/estates-kit/furniture/',import.meta.url);
const YARD=new URL('../assets/estates-kit/yard/',import.meta.url);
function folder(id){return ESTATE_KIT_YARD.includes(id)?YARD:FURNITURE;}
function bboxFrom(geometry){
 const a=geometry?.attributes?.position?.array;if(!a||a.length<3)return {min:[0,0,0],max:[0,0,0],size:[1,1,1],center:[0,0,0]};
 let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
 for(let i=0;i<a.length;i+=3){const x=a[i],y=a[i+1],z=a[i+2];
  if(x<minX)minX=x;if(y<minY)minY=y;if(z<minZ)minZ=z;if(x>maxX)maxX=x;if(y>maxY)maxY=y;if(z>maxZ)maxZ=z;}
 return {min:[minX,minY,minZ],max:[maxX,maxY,maxZ],size:[maxX-minX,maxY-minY,maxZ-minZ],center:[(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2]};
}
function unionBox(boxes){
 if(!boxes.length)return {min:[0,0,0],max:[0,0,0],size:[1,1,1],center:[0,0,0]};
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const b of boxes)for(let i=0;i<3;i++){min[i]=Math.min(min[i],b.min[i]);max[i]=Math.max(max[i],b.max[i]);}
 return {min,max,size:[max[0]-min[0],max[1]-min[1],max[2]-min[2]],center:[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2]};
}
export function estateKitUrl(id){return new URL(id+'.glb',folder(id)).href;}
export function createEstateKitCache(THREE,{loader=null}={}){
 const loaded=new Map(),pending=new Map();let gl=loader,generation=0;
 async function getLoader(){
  if(gl)return gl;
  try{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');gl=new GLTFLoader();}catch{gl=null;}
  return gl;
 }
 async function load(ids){
  const want=[...new Set(ids)].filter(id=>ESTATE_KIT_FURNITURE.includes(id)||ESTATE_KIT_YARD.includes(id)),gen=generation;
  const l=await getLoader();
  if(l)await Promise.all(want.map(id=>{
   if(loaded.has(id))return null;
   if(!pending.has(id))pending.set(id,l.loadAsync(estateKitUrl(id)).then(gltf=>{
    if(gen!==generation)return;
    gltf.scene.updateMatrixWorld(true);
    const parts=[],boxes=[];
    gltf.scene.traverse(node=>{
     if(!node.isMesh||!node.geometry)return;
     const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);
     const material=node.material;if(material?.map&&THREE.SRGBColorSpace)material.map.colorSpace=THREE.SRGBColorSpace;
     const box=bboxFrom(geometry);boxes.push(box);
     parts.push({geometry,material,box});
    });
    // Recentre XZ and sit on y=0 so instancing and room placement share one frame.
    const all=unionBox(boxes);
    const dx=-all.center[0],dy=-all.min[1],dz=-all.center[2];
    if(dx||dy||dz)for(const part of parts){
     part.geometry.translate?.(dx,dy,dz);
     part.box=bboxFrom(part.geometry);
    }
    if(parts.length)loaded.set(id,{parts,bbox:unionBox(parts.map(p=>p.box))});
    gltf.scene.traverse(n=>{if(n.isMesh&&!parts.some(p=>p.geometry===n.geometry))n.geometry.dispose?.();});
   }).catch(()=>{}).finally(()=>pending.delete(id)));
   return pending.get(id);
  }));
  return new Map(want.filter(id=>loaded.has(id)).map(id=>[id,loaded.get(id)]));
 }
 function dispose(){
  generation++;
  for(const rec of loaded.values())for(const {geometry,material} of rec.parts){
   geometry.dispose?.();
   for(const m of Array.isArray(material)?material:[material]){m?.map?.dispose?.();m?.dispose?.();}
  }
  loaded.clear();
 }
 return {load,dispose,peek:id=>loaded.get(id),get size(){return loaded.size;}};
}
// Scale a recentred kit model so it fits a target box (w,h,d) standing on the box floor.
export function fitEstateKitScale(bbox,w,h,d,{floor=true}={}){
 const sx=w/Math.max(.01,bbox.size[0]),sy=h/Math.max(.01,bbox.size[1]),sz=d/Math.max(.01,bbox.size[2]);
 // Rugs are almost flat: allow non-uniform XZ, keep the authored thickness.
 if(bbox.size[1]<.25&&h<.35)return {x:sx,y:Math.max(.4,Math.min(sy,1.8)),z:sz,floor:true};
 const s=Math.min(sx,sy,sz);
 return {x:s,y:s,z:s,floor};
}
export function estatesLowGraphics(){
 try{
  const q=new URLSearchParams(location.search).get('q')||localStorage.getItem('bc_quality')||'auto';
  if(q==='low')return true;if(q==='high'||q==='medium')return false;
  const mobile=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches||/Mobi|Android|iPhone|iPad/.test(navigator.userAgent||'');
  return mobile&&(navigator.hardwareConcurrency||4)<=4;
 }catch{return false;}
}
