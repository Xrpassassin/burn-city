// Only one private interior room is built at a time. No external assets or shader stack.
// Authenticated room admission is performed by the live controller before setRoom().
import {createSecretRoomLayout,PRIVATE_ROOM_ORIGIN,resolveSecretRoomMotion,secretRoomInteraction} from './estates-secret-layout.mjs';
import {createEstateInteriorModelCache} from './estates-interior-models.mjs';
const PALETTE={
 concrete:{color:0x575b62,roughness:.96},ceiling:{color:0x272f39,roughness:.92},
 wall:{color:0x3d454e,roughness:.87},steel:{color:0x596977,metalness:.68,roughness:.42},
 metal:{color:0x8296a0,metalness:.72,roughness:.34},accent:{color:0xbd9154,metalness:.25,roughness:.63},
 red:{color:0x7b3b37,roughness:.75},gold:{color:0xb79555,metalness:.65,roughness:.3},
 wood:{color:0x745039,roughness:.84},fabric:{color:0x355266,roughness:1},
 velvet:{color:0x3d2e5b,roughness:.94},rug:{color:0x443c54,roughness:1},
 green:{color:0x3c7454,roughness:.97},water:{color:0x1d8b9e,roughness:.2,metalness:.2,transparent:true,opacity:.82},
 'home-wall':{color:0xcbbfae,roughness:.92},
 'home-floor':{color:0x9f8568,roughness:.77},
 'home-ceiling':{color:0xe8dfcf,roughness:.92},
 'home-trim':{color:0xe2d8c5,roughness:.77},
 'home-wood':{color:0x80624a,roughness:.76},
 'home-door':{color:0x6f543f,roughness:.71},
 'home-fabric':{color:0x677f77,roughness:.95},
 'home-leather':{color:0x75604a,roughness:.87},
 'home-cream':{color:0xe4d8c5,roughness:.98},
 'home-rug':{color:0xb3a38c,roughness:1},
 'home-plant':{color:0x597c5a,roughness:.98},
 'home-ceramic':{color:0xaca89b,roughness:.73},
 'home-earth':{color:0x5b534a,roughness:1},
 'home-metal':{color:0x68716d,metalness:.48,roughness:.52},
 'home-glass':{color:0x93b3b2,metalness:.1,roughness:.25,transparent:true,opacity:.76},
 'home-warm':{color:0xffd9a0,emissive:0xffbc78,emissiveIntensity:.7,roughness:.5},
 'home-wall-panel':{color:0xd6cbb6,roughness:.85},'home-wall-sage':{color:0xbdc4ae,roughness:.92},'home-wall-ivory':{color:0xe6dccb,roughness:.9},
 'home-floor-vinyl':{color:0xa98f70,roughness:.7},'home-floor-oak':{color:0x9a7652,roughness:.72},'home-floor-marble':{color:0xc9bfae,roughness:.38},
 'home-tile':{color:0xcfd5d4,roughness:.45},'home-white':{color:0xeeeae2,roughness:.4},'home-dark-wood':{color:0x5a3f2c,roughness:.72},
 'home-brass':{color:0xc6a35d,metalness:.7,roughness:.35},'home-stone':{color:0xb8b0a0,roughness:.6},'home-mat':{color:0x5d4a3a,roughness:1},
 'home-red':{color:0x9c3b30,roughness:.6},'home-steel':{color:0x6f7a80,metalness:.6,roughness:.45},'home-shadow':{color:0x1d1a17,roughness:1},
 'home-pegboard':{color:0xb08a5c,roughness:.9},'home-arcade':{color:0x2a2340,roughness:.55},
 'home-hazard':{color:0xd7a92a,emissive:0x6b4c00,emissiveIntensity:.4,roughness:.6},
 'home-window':{color:0xdfeeff,emissive:0xbfdcff,emissiveIntensity:.95,roughness:.15},
 'home-screen':{color:0x0c1218,emissive:0x1d4466,emissiveIntensity:.45,roughness:.2},
 'home-art-a':{color:0xb5653f,roughness:.9},'home-art-b':{color:0x3f6f8a,roughness:.9},'home-art-c':{color:0xc9a54a,roughness:.9},
 'home-feed':{color:0x335a40,emissive:0x4fae74,emissiveIntensity:.7,roughness:.4},
 'home-neon':{color:0xff6ad5,emissive:0xff3fc4,emissiveIntensity:1.4,roughness:.4},
 'home-grow':{color:0xc58cff,emissive:0xa45cff,emissiveIntensity:1.3,roughness:.4},
 'home-fire':{color:0xffa040,emissive:0xff7a1a,emissiveIntensity:1.8,roughness:.5},
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
 velvet:{color:0x5f5472,power:.28},accent:{color:0x796952,power:.26},
 'home-wall':{color:0x8f806f,power:.24},'home-ceiling':{color:0x9c8e78,power:.22},
 'home-floor':{color:0x675849,power:.12},
 'home-wall-panel':{color:0x8f806f,power:.22},'home-wall-sage':{color:0x7c8270,power:.22},'home-wall-ivory':{color:0x968a76,power:.22},
 'home-floor-vinyl':{color:0x675849,power:.12},'home-floor-oak':{color:0x5e4632,power:.12},'home-floor-marble':{color:0x7d776c,power:.12}
});
function requireThree(THREE){
 for(const name of ['Group','Mesh','BoxGeometry','MeshStandardMaterial'])
  if(typeof THREE?.[name]!=='function')throw TypeError('missing_three_constructor_'+name);
}
export function createEstatesSecretInteriorRenderer({THREE,scene,origin=PRIVATE_ROOM_ORIGIN,modelLoader=null}={}){
 requireThree(THREE);
 if(typeof scene?.add!=='function'||typeof scene?.remove!=='function')throw TypeError('scene_required');
 const root=new THREE.Group();root.name='estates-secret-private-room';
 root.position.set(origin.x,origin.y,origin.z);root.visible=false;scene.add(root);
 let active=null,materials=new Map(),illumination=[],powerOn=true,disposed=false,reveal=0,roomToken=0;
 const models=createEstateInteriorModelCache(THREE,{loader:modelLoader});
 function disposeRoom(){
  const meshes=new Set(),mats=new Set();
  root.traverse?.(obj=>{if(obj.userData?.sharedModel)return;if(obj.geometry)meshes.add(obj.geometry);if(obj.material){
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
 function setRoom(roomId,options={}){
  if(disposed)throw Error('private_interior_disposed');
  const layout=createSecretRoomLayout(roomId,options);
  disposeRoom();
  active=layout;
  // Build room only on entry, so island traversal has no interior draw-call burden.
  const token=++roomToken,fallbacks=[];
  // Homes: merge static furnishing boxes per material (one draw call each) to stay
  // cheap on phones; the shell, windows, lights and model fallbacks stay separate.
  const merge=layout.roomId==='home'&&typeof THREE.BufferGeometry==='function'&&typeof THREE.Matrix4==='function';
  const SHELL=/^(home-|window-|ceiling-)/,batches=new Map();
  for(const part of layout.items){
   if(part.invisible)continue;
   if(merge&&!part.model&&!SHELL.test(part.id)){if(!batches.has(part.mat))batches.set(part.mat,[]);batches.get(part.mat).push(part);continue;}
   const geo=part.shape==='sphere'&&THREE.SphereGeometry?
    new THREE.SphereGeometry(.5,10,7):part.shape==='cylinder'&&THREE.CylinderGeometry?
    new THREE.CylinderGeometry(.5,.5,1,10):new THREE.BoxGeometry(1,1,1);
   geo.scale?.(part.w,part.h,part.d);
   const mesh=new THREE.Mesh(geo,material(part.mat));
   mesh.position.set(part.x,part.y,part.z);
   if(mesh.rotation&&Number.isFinite(part.ry))mesh.rotation.y=part.ry;
   mesh.name='secret-'+part.id;
   mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);
   if(part.model)fallbacks.push([part,mesh]);
  }
  for(const [mat,parts] of batches){
   const pos=[],nor=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),v=new THREE.Vector3(),sc=new THREE.Vector3();
   for(const part of parts){
    let g=part.shape==='sphere'&&THREE.SphereGeometry?new THREE.SphereGeometry(.5,10,7):part.shape==='cylinder'&&THREE.CylinderGeometry?
     new THREE.CylinderGeometry(.5,.5,1,10):new THREE.BoxGeometry(1,1,1);
    if(g.index)g=g.toNonIndexed();
    e.set(0,Number.isFinite(part.ry)?part.ry:0,0);q.setFromEuler(e);
    m.compose(v.set(part.x,part.y,part.z),q,sc.set(part.w,part.h,part.d));g.applyMatrix4(m);
    pos.push(...g.attributes.position.array);nor.push(...g.attributes.normal.array);g.dispose();
   }
   const geo=new THREE.BufferGeometry();
   geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
   const mesh=new THREE.Mesh(geo,material(mat));mesh.name='secret-merged-'+mat;mesh.userData.parts=parts.map(p=>p.id);
   mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);
  }
  // Furniture models load lazily on entry and replace their box fallbacks.
  if(fallbacks.length)void models.load(fallbacks.map(([p])=>p.model.id)).then(found=>{
   if(disposed||token!==roomToken)return;
   for(const [part,mesh] of fallbacks){
    const parts=found.get(part.model.id);if(!parts)continue;
    const group=new THREE.Group();group.name='home-model-'+part.model.id;group.userData.sharedModel=true;
    for(const {geometry,material} of parts){const m=new THREE.Mesh(geometry,material);m.userData.sharedModel=true;m.castShadow=false;m.receiveShadow=false;group.add(m);}
    group.position.set(part.x,part.model.y||0,part.z);group.rotation.y=part.ry||0;group.scale.set(part.model.sx||1,1,1);
    root.add(group);mesh.visible=false;
   }
  });
  // Interior lighting must not depend on the city's sun being visible.
  // The outdoor scene is hidden during private-room traversal, leaving
  // physically based concrete and wood almost black without local fill light.
  // A small hemisphere fill preserves readable surfaces during normal and
  // emergency-power modes; four ceiling-area point lights provide depth.
  const home=Array.isArray(layout.lights);
  if(typeof THREE.HemisphereLight==='function'){
   const fill=home?new THREE.HemisphereLight(0xfff0dc,0x7a6450,1.05):new THREE.HemisphereLight(0xd4e9ff,0x53606e,.8);
   fill.name='private-room-indirect-fill';
   fill.userData={onIntensity:home?1.05:.8,emergencyIntensity:.22};
   root.add(fill);illumination.push(fill);
  }
  if(typeof THREE.PointLight==='function'&&home){
   // Warm room lights (max four, no shadows) for a cosy, mobile-friendly look.
   for(const l of layout.lights.slice(0,4)){
    const light=new THREE.PointLight(l.color,l.intensity,l.distance,2);
    light.name='home-room-light';light.position.set(l.x,l.y,l.z);light.castShadow=false;
    light.userData={onIntensity:l.intensity,emergencyIntensity:.08};root.add(light);illumination.push(light);
   }
  }else if(typeof THREE.PointLight==='function'){
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
  reveal=options.reveal?1:0;applyReveal();
  return layout;
 }
 // Entrance reveal (same idea as the Ember Bar): lights come up over ~1 s.
 function applyReveal(){
  const k=.2+.8*(1-Math.pow(reveal,3));
  for(const lamp of illumination)if('intensity' in lamp&&powerOn)lamp.intensity=(lamp.userData?.onIntensity??1)*k;
 }
 // Entrance light reveal advances every frame whichever camera (third or first person) is active.
 function tickReveal(dt=1/60){if(active&&reveal>0){reveal=Math.max(0,reveal-Math.max(0,Math.min(.1,dt))/1.1);applyReveal();}}
 function tickCamera({camera,localPosition,yaw,dt=1/60}={}){
  if(!active||!camera?.position||!Number.isFinite(yaw))return false;
  tickReveal(dt);
  const smooth=1-Math.exp(-Math.max(0,Math.min(.1,dt))*11);
  let distance=2.8;
  // Homes have interior walls: pull the camera in so it never sits behind a partition.
  if(active.roomId==='home'){
   const walls=active.obstacles.filter(o=>o.id.startsWith('partition-')||o.id.startsWith('stair'));
   for(let d=.3;d<=2.8;d+=.1){const px=localPosition.x+Math.sin(yaw)*d,pz=localPosition.z+Math.cos(yaw)*d;
    if(walls.some(o=>Math.abs(px-o.x)<o.halfX+.18&&Math.abs(pz-o.z)<o.halfZ+.18)){distance=Math.max(.45,d-.15);break;}}
  }
  const x=Math.max(-active.bounds.x+.4,Math.min(active.bounds.x-.4,localPosition.x+Math.sin(yaw)*distance));
  const z=Math.max(-active.bounds.z+.4,Math.min(active.bounds.z-.4,localPosition.z+Math.cos(yaw)*distance));
  const ceiling=Number.isFinite(active.height)?active.height-.3:2.65;
  // Near the front wall (arrival) the clamp squeezes the camera onto the avatar:
  // lift it over the shoulder and look ahead into the room instead of down at the head.
  const eff=Math.hypot(x-localPosition.x,z-localPosition.z),squeeze=Math.max(0,Math.min(1,(1.6-eff)/1.6));
  const tx=origin.x+x,tz=origin.z+z,ty=origin.y+Math.min(2.65,ceiling,1.55+eff*.4+squeeze*1.3);
  if(typeof camera.position.lerp==='function'&&typeof THREE.Vector3==='function')
   camera.position.lerp(new THREE.Vector3(tx,ty,tz),smooth);
  else if(typeof camera.position.set==='function')camera.position.set(
   camera.position.x+(tx-camera.position.x)*smooth,camera.position.y+(ty-camera.position.y)*smooth,
   camera.position.z+(tz-camera.position.z)*smooth);
  camera.lookAt?.(origin.x+localPosition.x-Math.sin(yaw)*squeeze*3.5,origin.y+1.28-squeeze*.35,origin.z+localPosition.z-Math.cos(yaw)*squeeze*3.5);
  return true;
 }
 function hide(){root.visible=false;roomToken++;disposeRoom();models.dispose();}
 function dispose(){if(disposed)return false;disposed=true;hide();scene.remove(root);return true;}
 return {
  root,origin,setRoom,hide,dispose,setPower,tickCamera,tickReveal,
  move:(position,delta)=>resolveSecretRoomMotion(position,delta,active),
  interaction:position=>secretRoomInteraction(active,position),
  get layout(){return active;},get powerOn(){return powerOn;},
  get active(){return !!active;},get disposed(){return disposed;},get loadedModels(){return models.size;},get revealing(){return reveal>0;}
 };
}
