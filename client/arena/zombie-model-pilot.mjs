// Opt-in animated zombie model pilot. Uses locally vendored Three.js utilities and a bundled MIT-licensed GLB.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';

const MAX_MODELS = 8;
const TARGET_HEIGHT = 1.72;
const MODEL_URL = new URL('./assets/zombies/zombie-ash.glb', import.meta.url).href;

function animationFor(z, clips) {
  if (z.ch && clips.has('Idle_Attack')) return 'Idle_Attack';
  if (z.cr || z.ty === 5) return clips.has('Crawl') ? 'Crawl' : 'Walk';
  if (z.ty === 1 || z.ty === 4) return clips.has('Run') ? 'Run' : 'Walk';
  return 'Walk';
}

export async function createZombieModelPilot(scene) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(MODEL_URL);
  if (!gltf.scene || !gltf.animations?.length) throw new Error('Zombie model has no scene or animation clips');
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const scale = TARGET_HEIGHT / height;
  const active = new Map();

  function setAnimation(item, name) {
    const clip = clips.get(name) || clips.get('Idle') || gltf.animations[0];
    if (!clip || item.clipName === clip.name) return;
    const next = item.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    item.action?.fadeOut(0.12);
    item.action = next;
    item.clipName = clip.name;
  }

  const palettes = [0xb6b7a1, 0x91a47c, 0xa77a68, 0x8293a5, 0xaaa38b, 0x758078];

  function createInstance(z) {
    const visual = SkeletonUtils.clone(gltf.scene);
    // Each clone owns its material instances, so per-type tinting never bleeds across zombies.
    const tint = new THREE.Color(palettes[Math.abs(z.ty || 0) % palettes.length]);
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
    group.scale.setScalar(scale);
    visual.position.y = -bounds.min.y;
    group.add(visual);
    scene.add(group);
    const mixer = new THREE.AnimationMixer(visual);
    const item = { group, mixer, action: null, clipName: '' };
    setAnimation(item, animationFor(z, clips));
    return item;
  }

  function remove(id) {
    const item = active.get(id);
    if (!item) return;
    scene.remove(item.group);
    item.mixer.stopAllAction();
    active.delete(id);
  }

  return {
    update(zombies, dt, me) {
      const candidates = [...zombies].sort((a, b) =>
        Math.hypot(a.x - (me?.x || 0), a.z - (me?.z || 0)) -
        Math.hypot(b.x - (me?.x || 0), b.z - (me?.z || 0))
      ).slice(0, MAX_MODELS);
      const chosen = new Set(candidates.map(z => z.id));
      for (const id of active.keys()) if (!chosen.has(id)) remove(id);
      for (const z of candidates) {
        let item = active.get(z.id);
        if (!item) {
          try { item = createInstance(z); active.set(z.id, item); }
          catch { continue; }
        }
        setAnimation(item, animationFor(z, clips));
        item.group.position.set(z.x, z.y || 0, z.z);
        item.group.rotation.set(0, z.yaw || 0, 0);
        item.mixer.update(Math.min(0.05, Math.max(0, dt)));
      }
      return new Set(active.keys());
    },
    clear() {
      for (const id of [...active.keys()]) remove(id);
    }
  };
}
