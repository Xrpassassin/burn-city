// Original ARENA Zombies: reuse the bundled animated human-infected GLBs as
// cosmetic replacements. Keep Homefront rendering and gameplay entirely out.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';

import { selectZombieModelCandidates, stableZombieHash } from './zombie-model-selection.mjs';
import {ARENA_ZOMBIE_SKINS,zombieHumanShape} from './zombie-arena-appearance.mjs';
import {ZOMBIE_SKETCHFAB_MODELS,zombieVisualModelId,zombieClipAliases} from './zombie-sketchfab-cast.mjs';
import {createZombieInstancedLOD} from './zombie-instanced-lod.mjs';

const MAX_MODELS = 8;
const MAX_MODEL_DISTANCE = 28;
const TARGET_HEIGHT = 1.72;
const MODEL_URLS=ZOMBIE_SKETCHFAB_MODELS.map(model=>new URL('./assets/zombies/'+model.file,import.meta.url).href);
const PALETTES=ARENA_ZOMBIE_SKINS.map(shades=>shades[0]);
const NAME='original-zombies-real-infected';

function removeHazmatRootMotion(clip){
 if(!clip)return;
 // Animation's hip translation is from a separately exported Mixamo walk;
 // gameplay already moves the infected server-authoritatively. Preserve
 // vertical bounce, suppress duplicate X/Z root travel.
 const candidates=clip.tracks.filter(track=>track.name.endsWith('.position')&&
  /(?:Root|Hips|Armature)/i.test(track.name));
 if(!candidates.length)return;
 const chosen=candidates.find(track=>/Root/i.test(track.name))||candidates[0];
 if(chosen.values?.length>=6){
  const x=chosen.values[0],z=chosen.values[2];
  for(let i=0;i<chosen.values.length;i+=3){chosen.values[i]=x;chosen.values[i+2]=z;}
 }
}


function animationFor(z, clips, moving) {
  if (z.ch && clips.has('Idle_Attack')) return 'Idle_Attack';
  if (!moving && clips.has('Idle')) return 'Idle';
  if (z.cr || z.ty === 5) return clips.has('Crawl') ? 'Crawl' : 'Walk';
  if (z.ty === 6) return clips.has('Run') ? 'Run' : 'Walk';
  if (z.ty === 1 || z.ty === 4) return clips.has('Run') ? 'Run' : 'Walk';
  return moving ? 'Walk' : 'Idle';
}

export async function createZombieModelPilot(scene, options = {}) {
  const maxModels = Number.isFinite(options.maxModels) ? Math.max(1, Math.min(MAX_MODELS, Math.floor(options.maxModels))) : MAX_MODELS;
  const maxDistance = Number.isFinite(options.maxDistance) ? Math.max(8, Math.min(MAX_MODEL_DISTANCE, options.maxDistance)) : MAX_MODEL_DISTANCE;
  const targetHeight = Number.isFinite(options.targetHeight) ? Math.max(0.8, Math.min(3.2, options.targetHeight)) : TARGET_HEIGHT;
  const loader = new GLTFLoader();
  // A malformed optional GLB must not hide all other working zombies.
  const results=await Promise.allSettled(ZOMBIE_SKETCHFAB_MODELS.map(async (definition,i)=>{
    const url=MODEL_URLS[i],gltf=await loader.loadAsync(url);
    if(!gltf.scene||!gltf.animations?.length)throw Error(definition.file+': skinned/animated zombie required');
    let skinCount=0,hasTexture=false;
    gltf.scene.traverse(node=>{
      if(node.isSkinnedMesh)skinCount++;
      if(node.isMesh){
        const materials=Array.isArray(node.material)?node.material:[node.material];
        if(materials.some(m=>m?.map||m?.normalMap||m?.roughnessMap))hasTexture=true;
        node.frustumCulled=false; // animated bounds shift with spine/hip pose
      }
    });
    if(!skinCount||!hasTexture)throw Error(definition.file+': missing textured skinned infected body');
    if(definition.id==='hazmat')removeHazmatRootMotion(gltf.animations.find(x=>x.name==='Zombie_Walk_Root'));
    const aliases=zombieClipAliases(definition,gltf.animations.map(x=>x.name));
    if(!aliases.has('Idle')||!aliases.has('Walk')||!aliases.has('Idle_Attack'))
      throw Error(definition.file+': missing playable locomotion/attack clips');
    const clips=new Map(gltf.animations.map(clip=>[clip.name,clip]));
    for(const [role,name]of aliases)clips.set(role,clips.get(name));
    // Some Sketchfab Blender/FBX exports have *tiny bind-pose geometry
    // bounds* but full-size bones once animation evaluates. Measuring the
    // unposed scene gave Aiden scale=249 and Hazmat scale=192 (!). Measure
    // the actual animated skinned vertices instead; this is independent of
    // animation source units, bone naming and glTF node hierarchies.
    const probe=SkeletonUtils.clone(gltf.scene),
      probeMixer=new THREE.AnimationMixer(probe),
      idle=clips.get('Idle')||gltf.animations[0];
    probeMixer.clipAction(idle).play();
    probeMixer.update(.03);
    probe.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(probe,true),height=bounds.max.y-bounds.min.y;
    probeMixer.stopAllAction();
    if(!Number.isFinite(height)||height<.3||height>20)
      throw Error(definition.file+': invalid skinned animated bounds '+height);
    const width=bounds.max.x-bounds.min.x,depth=bounds.max.z-bounds.min.z;
    if(!Number.isFinite(width)||!Number.isFinite(depth)||width>height*2.4||depth>height*2.4)
      throw Error(definition.file+': malformed animated anatomy');
    return {gltf,clips,id:definition.id,definition,minY:bounds.min.y,
      scale:targetHeight/height,poseHeight:height};
  }));
  const models=results.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!models.length)throw Error('No usable licensed human-infected Zombies model loaded');
  const byId=new Map(models.map(x=>[x.id,x]));
  // The same human/hazmat/thin GLB artwork is also baked into a cheap idle
  // mesh for the rest of the horde. Only nearby characters need skinned rigs.
  let staticLOD=null;
  try{if(options.distantLOD!==false)staticLOD=createZombieInstancedLOD(scene,models,{capacity:48});}
  catch(error){console.warn('[Zombies] Textured distant-infected LOD unavailable; using safe fallback:',error);}

  if(results.some(x=>x.status==='rejected'))
    console.warn('[Zombies] Some original human-infected GLBs failed; still using available licensed models.',
      results.filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||x.reason)));
  const active = new Map();

  function setAnimation(item, name, oneShot = false) {
    const clip = item.model.clips.get(name) || item.model.clips.get('Idle') || item.model.gltf.animations[0];
    if (!clip || (item.clipName === clip.name && !oneShot)) return;
    const next = item.mixer.clipAction(clip);
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (oneShot) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      item.reactionUntil = performance.now() + Math.max(0.25, clip.duration) * 1000;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.fadeIn(0.12).play();
    item.action?.fadeOut(0.12);
    item.action = next;
    item.clipName = clip.name;
  }

  function createInstance(z) {
    const preferred=zombieVisualModelId(z.ty);
    const model=byId.get(preferred)||models[stableZombieHash(z.id)%models.length];
    const visual = SkeletonUtils.clone(model.gltf.scene);
    const tint = new THREE.Color(PALETTES[Math.abs(z.ty || 0) % PALETTES.length]);
    visual.traverse(node => {
      if (!node.isMesh || !node.material) return;
      node.material = Array.isArray(node.material)
        ? node.material.map(material => material.clone())
        : node.material.clone();
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
        if (material.color) material.color.lerp(tint, 0.025); // preserve textured human flesh and hazmat suit; no global slime-green tint
      }
    });
    const group = new THREE.Group();
    group.name='Arena Zombies · '+model.id+' · '+String(z.id);
    group.userData.infectedAssetId=model.id;
    group.scale.setScalar(model.scale * zombieHumanShape(z.ty) * (Number.isFinite(z.v)?z.v:1));
    visual.position.y = -model.minY;
    group.add(visual);
    scene.add(group);
    const mixer = new THREE.AnimationMixer(visual);
    const item = { group, visual, mixer, model, action: null, clipName: '', reactionUntil: 0, deadUntil: 0, proceduralDeath:false, proceduralHit:false, visualYaw:z.yaw||0 };
    setAnimation(item, animationFor(z, model.clips, true));
    return item;
  }

  function remove(id) {
    const item = active.get(id);
    if (!item) return;
    scene.remove(item.group);
    item.mixer.stopAllAction();
    item.visual.traverse(node => {
      if (!node.isMesh || !node.material) return;
      // Materials are cloned per zombie; textures and geometries remain shared with the cached GLB.
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material.dispose();
    });
    active.delete(id);
  }

  return {
    update(zombies, dt, me) {
      const now = performance.now();
      const candidates = selectZombieModelCandidates(zombies, me, maxModels, maxDistance);
      const candidateIds = new Set(candidates.map(z => z.id));
      const chosen = new Set(candidateIds);
      for (const [id, item] of active) if (item.deadUntil > now) chosen.add(id);
      for (const id of active.keys()) if (!chosen.has(id)) remove(id);
      for (const z of candidates) {
        let item = active.get(z.id);
        if (!item) {
          try { item = createInstance(z); active.set(z.id, item); }
          catch { continue; }
        }
        const hasSpeed = Number.isFinite(z.speed);
        const moving = hasSpeed ? z.speed > 0.15
          : Math.hypot(z.x - item.group.position.x, z.z - item.group.position.z) > 0.012;
        item.group.position.set(z.x, z.y || 0, z.z);
        item.group.rotation.set(0,z.yaw||0,0);
        if(item.proceduralDeath&&item.deadUntil>now){
          const u=1-Math.min(1,(item.deadUntil-now)/850);
          item.visual.rotation.x=-1.32*(u*u*(3-2*u));
          item.visual.position.y=-item.model.minY-Math.max(0,u-.55)*.2;
        }else if(item.proceduralHit&&item.reactionUntil>now){
          const u=1-Math.min(1,(item.reactionUntil-now)/300);
          item.visual.rotation.z=.2*Math.sin(u*Math.PI);
        }else{
          item.visual.rotation.x=0;item.visual.rotation.z=0;
          item.visual.position.y=-item.model.minY;
        }
        if (item.deadUntil > now || item.reactionUntil > now) {
          item.mixer.update(Math.min(0.05, Math.max(0, dt)));
          continue;
        }
        item.reactionUntil = 0;
        setAnimation(item, animationFor(z, item.model.clips, moving));
        if (hasSpeed && item.action) {
          const locomotion = moving && !z.ch;
          const running = z.ty === 1 || z.ty === 4 || z.ty === 6;
          item.action.setEffectiveTimeScale(locomotion
            ? Math.max(0.45, Math.min(1.65, z.speed / (running ? 3.5 : 1.4))) : 1);
        }
        item.mixer.update(Math.min(0.05, Math.max(0, dt)));
      }
      for (const [id, item] of active) {
        if (candidateIds.has(id)) continue;
        if (item.deadUntil > now) item.mixer.update(Math.min(0.05, Math.max(0, dt)));
        else if (item.deadUntil) remove(id);
      }
      const animated=new Set(active.keys());
      if(!staticLOD)return animated;
      const distant=staticLOD.update(zombies,animated,now*.001);
      return new Set([...animated,...distant]);
    },
    react(id,kind='HitReact'){
      const item=active.get(id);
      if(!item)return false;
      const now=performance.now();
      if(item.model.clips.has(kind)){
        setAnimation(item,kind,true);
        if(kind==='Death')item.deadUntil=item.reactionUntil;
        return true;
      }
      // Aiden Studios and LxNazarov do not supply HitReact or Death.
      // Fall/jerk the VISUAL skeleton without modifying gameplay damage,
      // network events, collision, score or corpse lifetime.
      if(kind==='Death'){
        item.proceduralDeath=true;
        item.proceduralHit=false;
        item.deadUntil=now+850;
        item.reactionUntil=item.deadUntil;
        return true;
      }
      if(kind==='HitReact'){
        item.proceduralHit=true;
        item.reactionUntil=now+300;
        return true;
      }
      return false;
    },
    clear() {
      for (const id of [...active.keys()]) remove(id);
      staticLOD?.dispose();staticLOD=null;
    }
  };
}
