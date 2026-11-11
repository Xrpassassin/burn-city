// Field-worn, original 3D survival kit layered on the shared animated walker.
// Deliberately Homefront-only: it neither changes the city/NFT avatar artwork
// nor replaces the existing walking joints, input, AI, hitboxes or equipment.
const CACHE=new WeakMap();
function resources(THREE){
 let cached=CACHE.get(THREE);
 if(cached)return cached;
 const mat=(color,roughness=.93)=>new THREE.MeshStandardMaterial({color,roughness,metalness:0});
 const geometry={
  vest:new THREE.CylinderGeometry(.276,.235,.59,10),
  helmet:new THREE.SphereGeometry(.213,12,10,0,Math.PI*2,0,Math.PI*.57),
  brim:new THREE.BoxGeometry(.37,.032,.21),
  frontPanel:new THREE.BoxGeometry(.38,.29,.035),
  pouch:new THREE.BoxGeometry(.16,.13,.078),
  shoulder:new THREE.SphereGeometry(.115,9,6),
  knee:new THREE.BoxGeometry(.16,.135,.08),
  strap:new THREE.BoxGeometry(.052,.42,.048),
  collar:new THREE.CylinderGeometry(.126,.112,.13,10),
  mask:new THREE.BoxGeometry(.16,.075,.06)
 };
 const material={
  jacket:mat(0x565b47),vest:mat(0x42483b),hard:mat(0x3e463d),
  webbing:mat(0x77705c),canvas:mat(0x6a6554),cloth:mat(0x4c5545)
 };
 cached={geometry,material};CACHE.set(THREE,cached);return cached;
}
export function applyHomefrontFieldLook(THREE,walker,{lite=false}={}){
 if(!THREE?.Group||!THREE?.Mesh||!walker?.userData)return {added:0,reused:false};
 const u=walker.userData;
 if(u.homefrontFieldLook)return {added:0,reused:true};
 if(!u.torso||!u.head||!Array.isArray(u.arms)||!Array.isArray(u.legs))
   return {added:0,reused:false};
 const {geometry:g,material:m}=resources(THREE);
 let added=0;
 const add=(parent,geo,mat,x,y,z)=>{
   const mesh=new THREE.Mesh(g[geo],m[mat]);
   mesh.name='homefront-field-'+geo;
   mesh.position.set(x,y,z);
   mesh.castShadow=false;mesh.receiveShadow=false;
   mesh.userData.homefrontCosmetic=true;
   parent.add(mesh);added++;
   return mesh;
 };
 // A vanilla BURN walker wears glowing visor, belt and chest-core pieces.
 // Hide only *this instance's meshes*: their shared materials are never mutated.
 if(u.visor)u.visor.visible=false;
 for(const child of u.torso.children)if(child.isMesh&&child.material?.isMeshBasicMaterial)
   child.visible=false;
 const vest=add(u.torso,'vest','vest',0,.38,0);
 vest.scale.z=.76;
 add(u.torso,'frontPanel','jacket',0,.39,-.209);
 const helmet=add(u.head,'helmet','hard',0,.044,0);
 helmet.scale.set(1.06,.94,1.12);
 add(u.head,'brim','cloth',0,-.002,-.165);
 add(u.torso,'collar','cloth',0,.71,0);
 if(!lite){
   for(const side of [-1,1]){
     add(u.torso,'pouch','canvas',side*.155,.24,-.234);
     add(u.arms[side===-1?0:1],'shoulder','jacket',0,-.09,0).scale.set(1.12,.73,1);
     const leg=u.legs[side===-1?0:1],pivot=leg.userData?.knee||leg;
     const pad=add(pivot,'knee','hard',0,leg.userData?.knee?-.17:-.44,-.092);
     pad.rotation.x=-.14;
   }
   for(const side of [-1,1]){
     const strap=add(u.torso,'strap','webbing',side*.23,.39,-.19);
     strap.rotation.z=side*.11;
   }
 }else{
   add(u.head,'mask','cloth',0,-.09,-.18);
 }
 // Preserve caller-owned locomotion state and existing rig references.
 u.homefrontFieldLook={added,quality:lite?'mobile':'full'};
 return {added,reused:false};
}
