// Opt-in animated zombie model pilot. Uses locally vendored Three.js utilities and bundled MIT-licensed GLBs.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';

import { selectZombieModelCandidates, stableZombieHash } from './zombie-model-selection.mjs';

const MAX_MODELS = 8;
const MAX_MODEL_DISTANCE = 28;
const TARGET_HEIGHT = 1.72;
const MODEL_URLS = [
  new URL('./assets/zombies/zombie-ash.glb', import.meta.url).href,
  new URL('./assets/zombies/zombie-frost.glb', import.meta.url).href,
  new URL('./assets/zombies/zombie-rust.glb', import.meta.url).href,
  new URL('./assets/zombies/quaternius-zombie.glb', import.meta.url).href
];
const PALETTES = [0xb6b7a1, 0x91a47c, 0xa77a68, 0x8293a5, 0xaaa38b, 0x758078];
const VARIANT_BY_TYPE = [0, 2, 0, 1, 2, 1];

function animationFor(z, clips, moving) {
  if (z.ch && clips.has('Idle_Attack')) return 'Idle_Attack';
  if (!moving && clips.has('Idle')) return 'Idle';
  if (z.cr || z.ty === 5) return clips.has('Crawl') ? 'Crawl' : 'Walk';
  if (z.ty === 1 || z.ty === 4) return clips.has('Run') ? 'Run' : 'Walk';
  return moving ? 'Walk' : 'Idle';
}

export async function createZombieModelPilot(scene, options = {}) {
  const targetHeight = Number.isFinite(options.targetHeight) ? Math.max(0.8, Math.min(3.2, options.targetHeight)) : TARGET_HEIGHT;
  const loader = new GLTFLoader();
  const models = await Promise.all(MODEL_URLS.map(async url => {
    const gltf = await loader.loadAsync(url);
    if (!gltf.scene || !gltf.animations?.length) throw new Error('Zombie model has no scene or animation clips');
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    return {
      gltf,
      clips: new Map(gltf.animations.map(clip => [clip.name, clip])),
      minY: bounds.min.y,
      scale: targetHeight / Math.max(0.01, bounds.max.y - bounds.min.y)
    };
  }));
  const active = new Map();

  function setAnimation(item, name, oneShot = false) {
    const clip = item.model.clips.get(name) || item.model.clips.get('Idle') || item.model.gltf.animations[0];
    if (!clip || (item.clipName === clip.name && !oneShot)) return;
    const next = item.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1);
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
    const variant = VARIANT_BY_TYPE[Math.abs(z.ty || 0) % VARIANT_BY_TYPE.length];
    const model = models[(variant + stableZombieHash(z.id) % models.length) % models.length];
    const visual = SkeletonUtils.clone(model.gltf.scene);
    const tint = new THREE.Color(PALETTES[Math.abs(z.ty || 0) % PALETTES.length]);
    visual.traverse(node => {
      if (!node.isMesh || !node.material) return;
      node.material = Array.isArray(node.material)
        ? node.material.map(material => material.clone())
        : node.material.clone();
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
        if (material.color) material.color.lerp(tint, 0.22);
      }
    });
    const group = new THREE.Group();
    group.scale.setScalar(model.scale);
    visual.position.y = -model.minY;
    group.add(visual);
    scene.add(group);
    const mixer = new THREE.AnimationMixer(visual);
    const item = { group, visual, mixer, model, action: null, clipName: '', reactionUntil: 0, deadUntil: 0 };
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
      const candidates = selectZombieModelCandidates(zombies, me, MAX_MODELS, MAX_MODEL_DISTANCE);
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
        item.group.position.set(z.x, z.y || 0, z.z);
        item.group.rotation.set(0, z.yaw || 0, 0);
        if (item.deadUntil > now || item.reactionUntil > now) {
          item.mixer.update(Math.min(0.05, Math.max(0, dt)));
          continue;
        }
        item.reactionUntil = 0;
        const moving = Math.hypot(z.x - item.group.position.x, z.z - item.group.position.z) > 0.012;
        setAnimation(item, animationFor(z, item.model.clips, moving));
        item.mixer.update(Math.min(0.05, Math.max(0, dt)));
      }
      for (const [id, item] of active) {
        if (candidateIds.has(id)) continue;
        if (item.deadUntil > now) item.mixer.update(Math.min(0.05, Math.max(0, dt)));
        else if (item.deadUntil) remove(id);
      }
      return new Set(active.keys());
    },
    react(id, kind = 'HitReact') {
      const item = active.get(id);
      if (!item || !item.model.clips.has(kind)) return false;
      setAnimation(item, kind, true);
      if (kind === 'Death') item.deadUntil = item.reactionUntil;
      return true;
    },
    clear() {
      for (const id of [...active.keys()]) remove(id);
    }
  };
}
