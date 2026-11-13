import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';

const assetRoot = new URL('../assets/players/', import.meta.url);
const MODEL_FILES = Object.freeze({
  thirdPerson: 'gas-mask-guy.gltf',
  thirdPersonLod: 'gas-mask-guy-lod.gltf',
  firstPerson: 'gas-mask-guy-body.gltf',
  firstPersonArmed: 'gas-mask-guy-body.gltf'
});
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

function loaderFor() {
  const manager = new THREE.LoadingManager();
  if (isPhoneQuality()) manager.setURLModifier(u => u.replace(/-tex\//, '-tex-512/'));
  return new GLTFLoader(manager);
}

function loadModel(variant) {
  if (!Object.hasOwn(MODEL_FILES, variant)) return Promise.resolve(null);
  if (!sources.has(variant)) sources.set(variant, loaderFor().loadAsync(
    new URL(MODEL_FILES[variant], assetRoot).href
  ).then(gltf => {
    const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
    let skinned = false;
    gltf.scene.traverse(node => { if (node.isSkinnedMesh) skinned = true; });
    if (!skinned || !['Idle', 'Walk'].every(name => clips.get(name)?.duration > 0)) return null;
    if (variant === 'firstPersonArmed') gltf.scene.traverse(removeWeaponBodyArms);
    return { scene: gltf.scene, clips };
  }).catch(() => null));
  return sources.get(variant);
}

// Zombies has camera-space weapon arms that track aim and recoil. Remove the
// arm-weighted triangles from its world-space body, leaving the shared rig intact.
function removeWeaponBodyArms(node) {
  if (!node.isSkinnedMesh) return;
  const geometry = node.geometry;
  const joints = geometry.getAttribute('skinIndex');
  const weights = geometry.getAttribute('skinWeight');
  const armBones = new Set(node.skeleton.bones.flatMap((bone, i) =>
    /^(upperarm|forearm|hand)[._]?[LR]$/.test(bone.name) ? [i] : []));
  const armVertices = new Set();
  for (let i = 0; i < joints.count; i++) {
    let armWeight = 0;
    for (let j = 0; j < 4; j++) {
      if (armBones.has(joints.getComponent(i, j))) armWeight += weights.getComponent(i, j);
    }
    if (armWeight > .5) armVertices.add(i);
  }
  const index = geometry.getIndex();
  const kept = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (!armVertices.has(a) && !armVertices.has(b) && !armVertices.has(c)) kept.push(a, b, c);
  }
  geometry.setIndex(kept);
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
  let visual, mixer, current, clips, disposed = false, visible = true, requestedLod = !!lod;
  let request = 0;
  const using = () => variant === 'thirdPerson' && requestedLod ? 'thirdPersonLod' : variant;

  function syncVisibility() {
    if (visual) visual.visible = visible;
    fallback?.(visible && !visual);
  }

  function detach() {
    if (!visual) return;
    mixer.stopAllAction();
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
  }

  function loadRequested() {
    const id = ++request;
    loadModel(using()).then(asset => {
      if (!disposed && id === request) attach(asset);
    });
  }

  function attach(asset) {
    if (!asset) return;
    if (seated && !(asset.clips.get('Ride')?.duration > 0) && !(asset.clips.get('Sit')?.duration > 0)) return;
    detach();
    visual = clone(asset.scene);
    cloneMaterials(visual);
    applyTint(visual, tint);
    visual.name = 'gas-mask-guy';
    visual.scale.setScalar(height / 1.8);
    visual.rotation.y = yaw;
    visual.position.set(...offset);
    visual.traverse(node => {
      node.userData.sharedAsset = true;
      if (node.isSkinnedMesh) node.frustumCulled = false;
    });
    root.add(visual);
    clips = asset.clips;
    mixer = new THREE.AnimationMixer(visual);
    handle.update(0);
    syncVisibility();
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
      loadRequested();
    },
    setVisible(show) {
      if (disposed || visible === !!show) return;
      visible = !!show;
      syncVisibility();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      fallback?.(true);
      mounted.delete(root);
    }
  };
  mounted.set(root, handle);
  loadRequested();
  return handle;
}
