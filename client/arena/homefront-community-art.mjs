// Optional, licensed, locally bundled Homefront art upgrade adapter.
// NOT a model downloader. No external URLs, collision, saves, network state,
// payment logic or NPC AI. Existing visuals stay visible until a checked GLB loads.
import { NFT_PLAYER_AVATARS_ENABLED } from '../js/experience-avatar-policy.mjs';
import * as THREE from './vendor/three.module.min.js';
import {enabledCommunityArt} from './community-art-intake.mjs';
let nftApi=null,nftApiPending=null;
function preloadNftArt(){
 if(nftApi)return Promise.resolve(nftApi);
 if(!nftApiPending){
  nftApiPending=import('../js/nftchar.js').then(mod=>{nftApi=mod;return mod;},err=>{nftApiPending=null;throw err});
 }
 return nftApiPending;
}

const ROADSIDES=Object.freeze([
 // Pine Crossing first: physically visible from the real Main Street and
 // roadside approach, not scattered 60+ metres from the opening settlement.
 // Only cosmetics; keep roads, doorways, clinic approach and authored solid
 // roadside obstacles clear. These nodes share the existing 9.8 MB licensed
 // street pack — no new model downloads or server collision rules.
 {x:-51.4,z:-50.4,kind:'dumpster',area:'pine-crossing',mobile:true},
 {x:-41.4,z:-36.7,kind:'bin',area:'pine-crossing',mobile:false},
 {x:-30.3,z:-36.7,kind:'bench',area:'pine-crossing',mobile:true},
 {x:-13.6,z:-35.8,kind:'barrier',area:'pine-crossing',mobile:false},
 {x:-48.7,z:-36.6,kind:'streetlight',area:'pine-crossing',mobile:true},
 {x:-53.0,z:-38.2,kind:'trashbag',area:'pine-crossing',mobile:true},
 // Existing scattered world dressing stays on desktop. Two examples remain
 // on phones so licensed props aren't confined to the starting settlement.
 {x:31.5,z:-26.3,kind:'dumpster'},
 {x:-66.5,z:17.5,kind:'bin',mobile:true},
 {x:63.3,z:43.6,kind:'bench'},
 {x:71.2,z:-8.5,kind:'barrier',mobile:true},
 {x:-6.8,z:67.3,kind:'streetlight'},
 {x:-71.8,z:-17.4,kind:'trashbag'},
 {x:47.3,z:-62.5,kind:'dumpster'},
 {x:-67.1,z:42.8,kind:'barrier'},
 {x:36.5,z:68.4,kind:'streetlight'},
 {x:43.1,z:17.6,kind:'trashbag'}
]);
const PROP_PATTERNS=Object.freeze({
 dumpster:/^Big Bin Body$/i,bin:/^Red Trash Can(?:\.\d+)?$/i,
 bench:/^Wood Bench$/i,barrier:/^Concrete Barrier$/i,
 streetlight:/^Street Light$/i,trashbag:/^Bag 1$/i
});
const targetLandmarks=Object.freeze([
 {archetype:'road_checkpoint',model:'military-control',width:3.8,height:3.4,depth:2.8},
 {archetype:'freight_depot',model:'abandoned-garage',width:5.8,height:3.1,depth:5}
]);
export const HOMEFRONT_COMMUNITY_PROP_SITES=ROADSIDES;
export const HOMEFRONT_COMMUNITY_MOBILE_PROP_SITES=Object.freeze(ROADSIDES.filter(site=>site.mobile));
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
 // Keep the source mesh/bone pivot and all local pack transforms intact.
 // Applying the offset directly to a lone imported mesh used to overwrite
 // its artist-authored position, leaving roadside props several meters away.
 const fit=new THREE.Group();
 fit.name='homefront-community-normalize';
 fit.scale.setScalar(scale);
 fit.position.set(-(bounds.min.x+bounds.max.x)*scale*.5,-bounds.min.y*scale,
  -(bounds.min.z+bounds.max.z)*scale*.5);
 fit.add(model);
 model.traverse(node=>{if(node.isMesh){
  // Existing clearGroup must not dispose shared GLB geometry/textures.
  node.userData.sharedAsset=true;node.castShadow=false;node.receiveShadow=false;
 }});
 group.add(fit);
 group.userData.cosmeticNoCollision=true;
 return {group,model};
}
export function communityPropNameMatches(kind,names){
 const pattern=PROP_PATTERNS[kind];
 return pattern ? names.some(name=>pattern.test(String(name))) : false;
}
function chooseProp(gltf,kind){
 const pattern=PROP_PATTERNS[kind];
 if(!pattern)return null;
 const matches=[];
 gltf.scene.traverse(node=>{
  // GLTFLoader sanitizes names ("Street Light" -> "Street_Light") but keeps
  // the creator's literal glTF node name in userData.name.
  const sourceName=node.userData?.name||node.name||'';
  if(!pattern.test(sourceName))return;
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
 const models=new Map();
 let loaded=false;
 async function load(){
  if(loaded)return models;
  loaded=true;
  const scenery = specs.filter(spec => spec.id !== 'homefront-male-survivor');
  if(!scenery.length)return models; // No browser-only imports or downloads on test runners.
  if(!loader){const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');loader=new GLTFLoader();}
  if(!cloneModel){const util=await import('../vendor/three/examples/jsm/utils/SkeletonUtils.js');cloneModel=util.clone;}
  await Promise.all(scenery.map(async spec=>{
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
   const sites=mobile?HOMEFRONT_COMMUNITY_MOBILE_PROP_SITES:ROADSIDES;
   for(const site of sites){
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
 function clearExplorer(group){
  if(group)delete group.userData.pendingNftLook;
  if(group?.userData?.nftCharacter){
   nftApi?.disposeNftChar(group.userData.nftCharacter);
   group.userData.nftCharacter=null;
  }
  if(group?.userData?.walker)group.userData.walker.visible=true;
 }
 function decorateExplorer(group,walker,{isLocal=false,nft=null,srv=''}={}){
  clearExplorer(group);
  group.userData.look='walker';
  if (!NFT_PLAYER_AVATARS_ENABLED || !nft) return false;
  if(!nftApi){
   const request = {};
   group.userData.pendingNftLook = request;
   preloadNftArt().then(()=>{
    if(group.userData.pendingNftLook === request) decorateExplorer(group,walker,{isLocal,nft,srv});
   }).catch(()=>{});
   return false;
  }
  try{
   const character=nftApi.buildNftChar(nft,{srv,card:true,lite:!!(mobile||!isLocal)});
   character.name='homefront-nft-look';
   if(walker?.scale)character.scale.copy(walker.scale);
   group.add(character);
   if(walker)walker.visible=false;
   group.userData.nftCharacter=character;
   group.userData.look='nft';
   return true;
  }catch(e){
   return false;
  }
 }
 function animateExplorer(explorer,moving,jumpY=0){
  const nft=explorer?.userData?.nftCharacter;
  if(!nft?.userData?.anim)return;
  nft.userData.anim(performance.now()/1000,!!moving,false);
  nft.position.y=Number.isFinite(jumpY)?jumpY:0;
 }
 return {load,attachWorld,decorateExplorer,animateExplorer,clearExplorer,preloadNftArt,models};
}
