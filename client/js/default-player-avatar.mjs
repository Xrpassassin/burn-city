import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';
import { GAIT_CLIPS, LOCOMOTION, gaitWeights, blendedStride, advancePhase } from './player-gait.mjs';

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

// Locomotion is distance-driven (as the city citizens are): Walk, Run and Sprint share one cycle
// phase that advances by ground distance / stride, and are blended by real measured speed, so the
// planted boot never slides at any speed and switching gait never restarts the cycle.
// See client/js/player-gait.mjs (strides, speed bands) and scripts/player-avatar/author_gait.mjs.
const _scale = new THREE.Vector3();
export function naturalSpeed(name) { const g = GAIT_CLIPS[name]; return g ? g.stride / g.duration : 0; }
// Pure: where the locomotion blend should be for this frame. `speed` is world units/s (optional;
// without it Walk/Run play at their authored speed, as older callers expect); `worldScale` = the
// avatar's world size relative to the 1.8-unit model. Returns model-space speed + target weights.
export function locomotionTarget(state, speed, worldScale = 1, out = {}) {
  let v;
  if (Number.isFinite(speed) && speed >= 0) v = speed / Math.max(1e-4, worldScale);
  else v = state === 'Run' ? naturalSpeed('Run') : state === 'Walk' ? naturalSpeed('Walk') : 0;
  out.speed = v;
  out.weights = gaitWeights(v, out.weights);
  return out;
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

function seatClip(clips) { return clips.get('Ride') || clips.get('Sit') || clips.get('Idle'); }
const BLEND_TIME = .12, AIR_TIME = .08;

const mounted = new WeakMap();

// The caller owns position, facing, collision, camera and gameplay equipment.
export function mountDefaultPlayerAvatar(root, {
  height = 2, yaw = 0, offset = [0, 0, 0], seated = false,
  variant = 'thirdPerson', lod = false, tint, fallback
} = {}) {
  if (mounted.has(root)) return mounted.get(root);
  let visual, mixer, clips, actions = null, disposed = false, hidden = false, requestedLod = !!lod;
  let phase = 0, seatAction = null;
  const weights = { Idle: 1, Walk: 0, Run: 0, Sprint: 0, Air: 0 }, target = {};
  const using = () => (variant === 'thirdPerson' && requestedLod && MODEL_AVAILABLE.thirdPersonLod) ? 'thirdPersonLod' : variant;

  function attach(asset) {
    if (disposed || !asset || hidden) return;
    if (seated && !(asset.clips.get('Ride')?.duration > 0) && !(asset.clips.get('Sit')?.duration > 0)) return;
    if (visual) {
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(visual);
      root.remove(visual);
      visual = mixer = actions = seatAction = null;
    }
    visual = clone(asset.scene);
    cloneMaterials(visual);
    applyTint(visual, tint);
    visual.name = 'gas-mask-guy';
    visual.scale.setScalar(height / 1.8);
    // The exports face -Z (the shared walker's forward) since the skin bind fix (fix_bind.mjs), so
    // only the mode's yaw is applied.
    visual.rotation.y = yaw;
    visual.position.set(...offset);
    visual.traverse(node => {
      node.userData.sharedAsset = true;
      if (node.isSkinnedMesh) node.frustumCulled = false;
    });
    root.add(visual);
    clips = asset.clips;
    mixer = new THREE.AnimationMixer(visual);
    if (seated) seatAction = mixer.clipAction(seatClip(clips)).play();
    else {
      // Every gait clip plays at once; weights pick the mix. Locomotion clips are scrubbed by phase.
      actions = {};
      for (const name of ['Idle', ...LOCOMOTION, 'Air']) {
        const clip = clips.get(name) || (name === 'Sprint' ? clips.get('Run') : name === 'Air' ? null : clips.get('Walk'));
        if (!clip || Object.values(actions).some(a => a.getClip() === clip)) continue;
        const action = mixer.clipAction(clip, visual);
        if (LOCOMOTION.includes(name)) action.timeScale = 0;
        action.play().setEffectiveWeight(weights[name] || 0);
        actions[name] = action;
      }
    }
    handle.update(0);
    fallback?.(false);
  }

  const handle = {
    get ready() { return !!visual; },
    // Debug/test view of the blend: shared cycle phase (0..1) and current clip weights.
    get phase() { return phase; },
    get weights() { return { ...weights }; },
    // state: 'Idle' | 'Walk' | 'Run' (legacy hint) | 'Air' / 'Jump' (airborne).
    // speed (world units/s, optional): real ground speed; it alone picks Walk / Run / Sprint.
    update(dt, state = 'Idle', speed) {
      if (!mixer || !clips) return;
      // A NaN/negative step would poison the mixer clock and freeze the pose for good.
      const step = Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0;
      if (seated || !actions) { mixer.update(step); return; }
      const worldScale = visual.getWorldScale(_scale).x;   // height / 1.8 and parent scale (x: a crouch squash only scales y)
      const loco = locomotionTarget(state, speed, worldScale, target), want = loco.weights;
      const air = (state === 'Air' || state === 'Jump') && actions.Air;
      if (air) { for (const k in want) want[k] = 0; want.Air = 1; } else want.Air = 0;
      // Phase advances by distance even while blending out, so feet land where the clip expects.
      phase = advancePhase(phase, loco.speed, step, blendedStride(want));
      const k = step > 0 ? 1 - Math.exp(-step / (air || weights.Air > .5 ? AIR_TIME : BLEND_TIME)) : 1;
      let sum = 0;
      for (const name in weights) { weights[name] += ((want[name] || 0) - weights[name]) * k; if (!actions[name]) weights[name] = 0; sum += weights[name]; }
      for (const name in weights) {
        const action = actions[name]; if (!action) continue;
        const w = sum > 1e-6 ? weights[name] / sum : (name === 'Idle' ? 1 : 0);
        action.enabled = w > 1e-3;
        action.setEffectiveWeight(w);
        if (LOCOMOTION.includes(name)) action.time = phase * action.getClip().duration;
      }
      mixer.update(step);
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
        visual = mixer = actions = seatAction = null;
        fallback?.(true);
      }
      mounted.delete(root);
    }
  };
  mounted.set(root, handle);
  loadModel(using()).then(asset => { if (!disposed) attach(asset); });
  return handle;
}
