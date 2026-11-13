import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';

const assetRoot = new URL('../assets/players/', import.meta.url);
const MODEL_FILES = Object.freeze({
  thirdPerson: 'gas-mask-guy.gltf',
  thirdPersonLod: 'gas-mask-guy-lod.gltf',
  firstPerson: 'gas-mask-guy-body.gltf'
});
// Flip these on only when the optimized glTFs are committed beside this loader.
const MODEL_AVAILABLE = Object.freeze({ thirdPerson: true, thirdPersonLod: true, firstPerson: true });
const sources = new Map();

function isPhoneQuality() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('tex') === '512') return true;
    if (q.get('tex') === '1024') return false;
    const w = window;
    return !!(w.matchMedia?.('(pointer:coarse)').matches || w.innerWidth < 900 || (w.devicePixelRatio < 2 && w.innerWidth < 1100));
  } catch {
    return false;
  }
}

function loaderFor(variant) {
  const manager = new THREE.LoadingManager();
  if (isPhoneQuality()) manager.setURLModifier(u => u.replace(/-tex\//, '-tex-512/'));
  return new GLTFLoader(manager);
}

function loadModel(variant) {
  if (!MODEL_AVAILABLE[variant]) return Promise.resolve(null);
  if (!sources.has(variant)) sources.set(variant, loaderFor(variant).loadAsync(
    new URL(MODEL_FILES[variant], assetRoot).href
  ).then(gltf => {
    const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
    let skinned = false;
    gltf.scene.traverse(node => { if (node.isSkinnedMesh) skinned = true; });
    if (!skinned || !['Idle', 'Walk'].every(name => clips.get(name)?.duration > 0)) return null;
    return { scene: gltf.scene, clips };
  }).catch(() => null));
  return sources.get(variant);
}

function cloneMaterials(root) {
  root.traverse(node => {
    if (!node.isMesh || !node.material) return;
    if (Array.isArray(node.material)) node.material = node.material.map(m => m.clone());
    else node.material = node.material.clone();
  });
}

function applyTint(root, tint) {
  if (tint == null || tint === false) return;
  const color = new THREE.Color(tint);
  root.traverse(node => {
    if (!node.isMesh) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      if (mat?.color) mat.color.lerp(color, .42);
    }
  });
}

function clipFor(clips, seated, state) {
  if (seated) return clips.get('Ride') || clips.get('Sit') || clips.get('Idle');
  if (state === 'Run') return clips.get('Run') || clips.get('Walk') || clips.get('Idle');
  if (state === 'Jump') return clips.get('Jump') || clips.get('Idle');
  if (state === 'Sit') return clips.get('Sit') || clips.get('Ride') || clips.get('Idle');
  return clips.get(state) || clips.get('Idle');
}

const mounted = new WeakMap();

// The caller owns position, facing, collision, camera and gameplay equipment.
export function mountDefaultPlayerAvatar(root, {
  height = 2, yaw = 0, offset = [0, 0, 0], seated = false,
  variant = 'thirdPerson', lod = false, tint, fallback
} = {}) {
  if (mounted.has(root)) return mounted.get(root);
  let visual, mixer, current, clips, disposed = false, hidden = false, requestedLod = !!lod;
  const using = () => (variant === 'thirdPerson' && requestedLod && MODEL_AVAILABLE.thirdPersonLod) ? 'thirdPersonLod' : variant;

  function attach(asset) {
    if (disposed || !asset || hidden) return;
    if (seated && !(asset.clips.get('Ride')?.duration > 0) && !(asset.clips.get('Sit')?.duration > 0)) return;
    if (visual) {
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(visual);
      root.remove(visual);
      visual = mixer = current = null;
    }
    visual = clone(asset.scene);
    cloneMaterials(visual);
    applyTint(visual, tint);
    visual.name = 'gas-mask-guy';
    visual.scale.setScalar(height / 1.8);
    // The exports face +Z. Match the shared walker’s -Z before applying the mode’s yaw.
    visual.rotation.y = Math.PI + yaw;
    visual.position.set(...offset);
    visual.traverse(node => {
      node.userData.sharedAsset = true;
      if (node.isSkinnedMesh) node.frustumCulled = false;
    });
    root.add(visual);
    clips = asset.clips;
    mixer = new THREE.AnimationMixer(visual);
    handle.update(0);
    fallback?.(false);
  }

  const handle = {
    get ready() { return !!visual; },
    update(dt, state = 'Idle') {
      if (!mixer || !clips) return;
      const clip = clipFor(clips, seated, state);
      if (clip && clip !== current?.getClip()) {
        current?.fadeOut(.16);
        const next = mixer.clipAction(clip).reset().setEffectiveWeight(1).play();
        if (current) next.fadeIn(.16);
        current = next;
      }
      mixer.update(Math.min(.1, Math.max(0, dt || 0)));
    },
    setLod(useFar) {
      const next = !!useFar;
      if (next === requestedLod) return;
      requestedLod = next;
      if (variant !== 'thirdPerson') return;
      loadModel(using()).then(asset => { if (!disposed) attach(asset); });
    },
    setVisible(show) {
      hidden = !show;
      if (visual) visual.visible = !!show;
      if (!show) fallback?.(true);
      else if (visual) fallback?.(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer?.stopAllAction();
      if (visual) {
        mixer.uncacheRoot(visual);
        root.remove(visual);
        const skeletons = new Set();
        visual.traverse(node => {
          if (node.isSkinnedMesh) skeletons.add(node.skeleton);
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const mat of mats) mat?.dispose?.();
        });
        for (const skeleton of skeletons) skeleton.dispose();
        visual = mixer = current = null;
        fallback?.(true);
      }
      mounted.delete(root);
    }
  };
  mounted.set(root, handle);
  loadModel(using()).then(asset => { if (!disposed) attach(asset); });
  return handle;
}
