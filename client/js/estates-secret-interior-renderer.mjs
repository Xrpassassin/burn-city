// Only one private interior room is built at a time. No external assets or shader stack.
// Authenticated room admission is performed by the live controller before setRoom().
import {createSecretRoomLayout,PRIVATE_ROOM_ORIGIN,resolveSecretRoomMotion,secretRoomInteraction} from './estates-secret-layout.mjs';
const PALETTE={
 concrete:{color:0x575b62,roughness:.96},ceiling:{color:0x272f39,roughness:.92},
 wall:{color:0x3d454e,roughness:.87},steel:{color:0x596977,metalness:.68,roughness:.42},
 metal:{color:0x8296a0,metalness:.72,roughness:.34},accent:{color:0xbd9154,metalness:.25,roughness:.63},
 red:{color:0x7b3b37,roughness:.75},gold:{color:0xb79555,metalness:.65,roughness:.3},
 wood:{color:0x745039,roughness:.84},fabric:{color:0x355266,roughness:1},
 velvet:{color:0x3d2e5b,roughness:.94},rug:{color:0x443c54,roughness:1},
 green:{color:0x3c7454,roughness:.97},water:{color:0x1d8b9e,roughness:.2,metalness:.2,transparent:true,opacity:.82},
 screen:{color:0x1a5f8a,emissive:0x14548b,emissiveIntensity:.67,roughness:.4},
 emissive:{color:0x76edda,emissive:0x31c4a6,emissiveIntensity:1.2,roughness:.3}
};
// Simulated diffuse light bounce: an underground room has no outdoor
// environment map. Physically based walls would otherwise be nearly black in
// browsers with correct light falloff. This adds restrained indirect fill
// without flattening the colored area lights or emergency-power effect.
const INDIRECT_BOUNCE=Object.freeze({
 concrete:{color:0x6b7481,power:.66},wall:{color:0x67798a,power:.68},
 ceiling:{color:0x536174,power:.45},steel:{color:0x52697b,power:.31},
 metal:{color:0x566f80,power:.28},wood:{color:0x6c574c,power:.25},
 fabric:{color:0x5a6b7e,power:.31},rug:{color:0x554d66,power:.27},
 velvet:{color:0x5f5472,power:.28},accent:{color:0x796952,power:.26}
});
function requireThree(THREE){
 for(const name of ['Group','Mesh','BoxGeometry','MeshStandardMaterial'])
  if(typeof THREE?.[name]!=='function')throw TypeError('missing_three_constructor_'+name);
}
export function createEstatesSecretInteriorRenderer({THREE,scene,origin=PRIVATE_ROOM_ORIGIN}={}){
 requireThree(THREE);
 if(typeof scene?.add!=='function'||typeof scene?.remove!=='function')throw TypeError('scene_required');
 const root=new THREE.Group();root.name='estates-secret-private-room';
 root.position.set(origin.x,origin.y,origin.z);root.visible=false;scene.add(root);
 let active=null,materials=new Map(),illumination=[],powerOn=true,disposed=false;
 function disposeRoom(){
  const meshes=new Set(),mats=new Set();
  root.traverse?.(obj=>{if(obj.geometry)meshes.add(obj.geometry);if(obj.material){
   const arr=Array.isArray(obj.material)?obj.material:[obj.material];
   for(const m of arr)mats.add(m);
  }});
  for(const geom of meshes)geom.dispose?.();
  for(const mat of mats)mat.dispose?.();
  for(const child of [...root.children])root.remove(child);
  materials=new Map();illumination=[];active=null;
 }
 function material(name){
  if(!materials.has(name)){
   const options=PALETTE[name]||PALETTE.steel,bounce=INDIRECT_BOUNCE[name];
   materials.set(name,new THREE.MeshStandardMaterial(bounce?
    {...options,emissive:bounce.color,emissiveIntensity:bounce.power}:options));
  }
  return materials.get(name);
 }
 function setPower(value){
  powerOn=!!value;
  for(const lamp of illumination)if('intensity' in lamp)
   lamp.intensity=powerOn?(lamp.userData?.onIntensity??1.2):(lamp.userData?.emergencyIntensity??.08);
  for(const [key,mat] of materials){
   if(key==='emissive'){mat.emissiveIntensity=powerOn?1.2:.08;continue;}
   const bounce=INDIRECT_BOUNCE[key];
   if(bounce)mat.emissiveIntensity=powerOn?bounce.power:Math.min(.16,bounce.power*.35);
  }
  return powerOn;
 }
 function setRoom(roomId){
  if(disposed)throw Error('private_interior_disposed');
  const layout=createSecretRoomLayout(roomId);
  disposeRoom();
  active=layout;
  // Build room only on entry, so island traversal has no interior draw-call burden.
  for(const part of layout.items){
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(part.w,part.h,part.d),material(part.mat));
   mesh.position.set(part.x,part.y,part.z);mesh.name='secret-'+part.id;
   mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);
  }
  // Interior lighting must not depend on the city's sun being visible.
  // The outdoor scene is hidden during private-room traversal, leaving
  // physically based concrete and wood almost black without local fill light.
  // A small hemisphere fill preserves readable surfaces during normal and
  // emergency-power modes; four ceiling-area point lights provide depth.
  if(typeof THREE.HemisphereLight==='function'){
   const fill=new THREE.HemisphereLight(0xd4e9ff,0x53606e,.8);
   fill.name='private-room-indirect-fill';
   fill.userData={onIntensity:.8,emergencyIntensity:.22};
   root.add(fill);illumination.push(fill);
  }
  if(typeof THREE.PointLight==='function'){
   for(const [x,z,c,intensity] of [
    [-4.2,-3.2,0xb5d9ff,2.5],[4.2,-3.2,0xffd5a3,2.3],
    [-4.2,3.5,0xd4e7ff,2.25],[4.2,3.5,0xffd7b3,2.1]
   ]){
    const light=new THREE.PointLight(c,intensity,14,2);
    light.name='private-room-ceiling-area-light';
    light.position.set(x,3.52,z);light.castShadow=false;light.userData={onIntensity:intensity,emergencyIntensity:.08};
    root.add(light);illumination.push(light);
   }
  }
  root.visible=true;setPower(true);
  return layout;
 }
 function tickCamera({camera,localPosition,yaw,dt=1/60}={}){
  if(!active||!camera?.position||!Number.isFinite(yaw))return false;
  const distance=2.8,smooth=1-Math.exp(-Math.max(0,Math.min(.1,dt))*11);
  const x=Math.max(-active.bounds.x+.65,Math.min(active.bounds.x-.65,localPosition.x+Math.sin(yaw)*distance));
  const z=Math.max(-active.bounds.z+.65,Math.min(active.bounds.z-.65,localPosition.z+Math.cos(yaw)*distance));
  const tx=origin.x+x,tz=origin.z+z,ty=origin.y+2.65;
  if(typeof camera.position.lerp==='function'&&typeof THREE.Vector3==='function')
   camera.position.lerp(new THREE.Vector3(tx,ty,tz),smooth);
  else if(typeof camera.position.set==='function')camera.position.set(
   camera.position.x+(tx-camera.position.x)*smooth,camera.position.y+(ty-camera.position.y)*smooth,
   camera.position.z+(tz-camera.position.z)*smooth);
  camera.lookAt?.(origin.x+localPosition.x,origin.y+1.28,origin.z+localPosition.z);
  return true;
 }
 function hide(){root.visible=false;disposeRoom();}
 function dispose(){if(disposed)return false;disposed=true;hide();scene.remove(root);return true;}
 return {
  root,origin,setRoom,hide,dispose,setPower,tickCamera,
  move:(position,delta)=>resolveSecretRoomMotion(position,delta,active),
  interaction:position=>secretRoomInteraction(active,position),
  get layout(){return active;},get powerOn(){return powerOn;},
  get active(){return !!active;},get disposed(){return disposed;}
 };
}
