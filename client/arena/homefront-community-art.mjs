// Optional, licensed, locally bundled Homefront art upgrade adapter.
// NOT a model downloader. No external URLs, collision, saves, network state,
// payment logic or NPC AI. Existing visuals stay visible until a checked GLB loads.
import * as THREE from './vendor/three.module.min.js';
import {enabledCommunityArt} from './community-art-intake.mjs';

const ROADSIDES=Object.freeze([
 {x:31.5,z:-26.3,kind:'dumpster'},
 {x:47.3,z:-62.5,kind:'dumpster'},
 {x:-66.5,z:17.5,kind:'bin'},
 {x:63.3,z:43.6,kind:'bench'},
 {x:71.2,z:-8.5,kind:'barrier'},
 {x:-67.1,z:42.8,kind:'barrier'},
 {x:-6.8,z:67.3,kind:'streetlight'},
 {x:36.5,z:68.4,kind:'streetlight'},
 {x:-71.8,z:-17.4,kind:'trashbag'},
 {x:43.1,z:17.6,kind:'trashbag'}
]);
const PROP_PATTERNS=Object.freeze({
 dumpster:/dumpster/i,bin:/trash.?can|garbage.?can|bin/i,
 bench:/bench/i,barrier:/barrier|bollard/i,
 streetlight:/street.?light|lamp.?post/i,trashbag:/trash.?bag|garbage.?bag/i
});
const targetLandmarks=Object.freeze([
 {archetype:'road_checkpoint',model:'military-control',width:3.8,height:3.4,depth:2.8},
 {archetype:'freight_depot',model:'abandoned-garage',width:5.8,height:3.1,depth:5}
]);
export const HOMEFRONT_COMMUNITY_PROP_SITES=ROADSIDES;
export const HOMEFRONT_COMMUNITY_LANDMARKS=targetLandmarks;

export function homefrontAssetQuality(gltf,spec){
 if(!gltf?.scene||!spec)return {valid:false,reason:'missing_scene'};
 let meshes=0,triangles=0,skinned=0;
 gltf.scene.traverse(node=>{
  if(!node.isMesh||!node.geometry)return;
  meshes++;
  if(node.isSkinnedMesh)skinned++;
  const geo=node.geometry;
  triangles+=(geo.index?.count||geo.attributes?.position?.count||0)/3;
 });
 const clips=gltf.animations||[];
 if(!meshes||!Number.isFinite(triangles)||triangles<=0||triangles>spec.triangles*2.5)
  return {valid:false,reason:'mesh_budget',triangles};
 if(spec.rigged&&!skinned)return {valid:false,reason:'missing_skeleton',triangles};
 if(spec.animationRequired&&!clips.some(a=>/walk|run/i.test(a.name)) )
  return {valid:false,reason:'missing_locomotion',triangles};
 const bounds=new THREE.Box3().setFromObject(gltf.scene,true);
 const size=bounds.getSize(new THREE.Vector3());
 if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0.01))
  return {valid:false,reason:'invalid_bounds',triangles};
 return {valid:true,triangles,skinned,clips:clips.map(a=>a.name),size};
}
function fitToBox(source,{width=2,height=2.5,depth=2}={},cloneModel=object=>object.clone(true)){
 const model=cloneModel(source);
 const bounds=new THREE.Box3().setFromObject(model,true);
 const size=bounds.getSize(new THREE.Vector3());
 if(!size.x||!size.y||!size.z)return null;
 const scale=Math.min(width/size.x,height/size.y,depth/size.z);
 if(!Number.isFinite(scale)||scale<.005||scale>150)return null;
 const group=new THREE.Group();
 model.scale.multiplyScalar(scale);
 model.position.set(-(bounds.min.x+bounds.max.x)*scale*.5,-bounds.min.y*scale,
  -(bounds.min.z+bounds.max.z)*scale*.5);
 model.traverse(node=>{if(node.isMesh){
  // Existing clearGroup must not dispose shared GLB geometry/textures.
  node.userData.sharedAsset=true;node.castShadow=false;node.receiveShadow=false;
 }});
 group.add(model);
 group.userData.cosmeticNoCollision=true;
 return {group,model};
}
function chooseProp(gltf,kind){
 const pattern=PROP_PATTERNS[kind];
 if(!pattern)return null;
 const matches=[];
 gltf.scene.traverse(node=>{
  if(!pattern.test(node.name||''))return;
  // Prefer a distinct mesh/group, not the entire scene containing 37 props.
  if(node.isMesh||(node.isGroup&&node.children.some(x=>x.isMesh)))matches.push(node);
 });
 return matches.find(x=>x.isGroup)||matches[0]||null;
}
export function createHomefrontCommunityArt({
 specs=enabledCommunityArt('homefront'),
 loader=null,
 cloneModel=null,
 mobile=false
}={}){
 const models=new Map(),actors=new Set();
 let loaded=false;
 async function load(){
  if(loaded)return models;
  loaded=true;
  if(!specs.length)return models; // No browser-only imports or downloads on test runners.
  if(!loader){const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');loader=new GLTFLoader();}
  if(!cloneModel){const util=await import('../vendor/three/examples/jsm/utils/SkeletonUtils.js');cloneModel=util.clone;}
  await Promise.all(specs.map(async spec=>{
   try{
    const url=new URL('./assets/community/'+spec.file,import.meta.url).href;
    const gltf=await loader.loadAsync(url);
    const quality=homefrontAssetQuality(gltf,spec);
    if(!quality.valid)throw Error(quality.reason);
    models.set(spec.id,{spec,gltf,quality});
   }catch(error){
    console.warn('[Homefront art] Keeping original model for',spec.id,error?.message||error);
   }
  }));
  return models;
 }
 function attachWorld({landmarks,landmarkSetPieces,cityChunkAt,terrainElevation}){
  let replaced=0,props=0;
  for(const target of targetLandmarks){
   const asset=models.get(target.model);
   if(!asset)continue;
   const site=landmarks.find(p=>p.archetype===target.archetype);
   const base=site&&landmarkSetPieces.get(site.id);
   if(!base)continue;
   const visual=fitToBox(asset.gltf.scene,target,cloneModel);
   if(!visual)continue;
   // Keep the original POI, marker and streaming group as authoritative.
   for(const old of base.children)old.visible=false;
   base.add(visual.group);
   visual.group.name='homefront-vendored-'+target.model;
   base.userData.communityArt=target.model;
   replaced++;
  }
  const pack=models.get('street-props-pack');
  if(pack){
   const limit=mobile?5:ROADSIDES.length;
   for(const site of ROADSIDES.slice(0,limit)){
    const node=chooseProp(pack.gltf,site.kind);
    if(!node)continue;
    const visual=fitToBox(node,{width:site.kind==='streetlight'?0.8:1.5,
     height:site.kind==='streetlight'?4.3:1.7,depth:site.kind==='bench'?1.7:1.4},cloneModel);
    if(!visual)continue;
    visual.group.position.set(site.x,terrainElevation(site.x,site.z),site.z);
    visual.group.name='homefront-vendored-street-'+site.kind;
    cityChunkAt(site.x,site.z).add(visual.group);
    props++;
   }
  }
  return {replaced,props};
 }
 function decorateExplorer(group,walker,{isLocal=false}={}){
  const asset=models.get('homefront-male-survivor');
  if(!asset||(mobile&&!isLocal)||actors.size>=8)return false;
  const fitted=fitToBox(asset.gltf.scene,{width:1.5,height:2.85,depth:1.3},cloneModel);
  if(!fitted)return false;
  fitted.group.rotation.y=Math.PI;
  fitted.group.name='homefront-licensed-survivor';
  group.add(fitted.group);
  walker.visible=false;
  const mixer=new THREE.AnimationMixer(fitted.model);
  const animations=asset.gltf.animations||[];
  const idle=animations.find(x=>/idle/i.test(x.name))||animations[0];
  const walk=animations.find(x=>/walk/i.test(x.name))||animations.find(x=>/run/i.test(x.name))||idle;
  const actor={group,visual:fitted.group,mixer,idle,walk,current:null,action:null};
  actors.add(actor);
  group.userData.communityActor=actor;
  return true;
 }
 function animateExplorer(explorer,moving,dt,jumpY=0){
  const actor=explorer?.userData?.communityActor;
  if(!actor)return;
  const clip=moving?actor.walk:actor.idle;
  if(clip&&clip!==actor.current){
   const action=actor.mixer.clipAction(clip);
   action.reset().fadeIn(.16).play();
   actor.action?.fadeOut(.16);
   actor.action=action;actor.current=clip;
  }
  actor.mixer.update(Math.min(.05,Math.max(0,dt)));
  actor.visual.position.y=jumpY;
 }
 function clearActors(){
  for(const actor of actors)actor.mixer.stopAllAction();
  actors.clear();
 }
 return {load,attachWorld,decorateExplorer,animateExplorer,clearActors,models};
}
