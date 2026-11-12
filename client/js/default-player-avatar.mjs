import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';

const assetRoot = new URL('../assets/players/', import.meta.url);
const MODEL_FILES = Object.freeze({ thirdPerson: 'gas-mask-guy.gltf', firstPerson: 'gas-mask-guy-body.gltf' });
// Turn on each export when its optimized files and in-game checks are in the same change.
const MODEL_AVAILABLE = Object.freeze({ thirdPerson: false, firstPerson: false });
const sources = new Map();

function loadModel(variant) {
  if (!MODEL_AVAILABLE[variant]) return Promise.resolve(null);
  if (!sources.has(variant)) sources.set(variant, new GLTFLoader().loadAsync(
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

const mounted = new WeakMap();

// The caller owns position, facing, collision, camera and gameplay equipment.
export function mountDefaultPlayerAvatar(root, { height = 2, yaw = 0, offset = [0, 0, 0], seated = false, variant = 'thirdPerson', fallback } = {}) {
  if (mounted.has(root)) return mounted.get(root);
  let visual, mixer, current, clips, disposed = false;
  const handle = {
    get ready() { return !!visual; },
    update(dt, state = 'Idle') {
      if (!mixer) return;
      const clip = clips.get(seated ? 'Ride' : state) || (state === 'Run' && clips.get('Walk')) || clips.get('Idle');
      if (clip !== current?.getClip()) {
        current?.fadeOut(.16);
        const next = mixer.clipAction(clip).reset().setEffectiveWeight(1).play();
        if (current) next.fadeIn(.16);
        current = next;
      }
      mixer.update(Math.min(.1, Math.max(0, dt || 0)));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer?.stopAllAction();
      if (visual) {
        mixer.uncacheRoot(visual);
        root.remove(visual);
        const skeletons = new Set();
        visual.traverse(node => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); });
        for (const skeleton of skeletons) skeleton.dispose();
        visual = mixer = current = null;
        fallback?.(true);
      }
      mounted.delete(root);
    }
  };
  mounted.set(root, handle);
  loadModel(variant).then(asset => {
    if (disposed || !asset || (seated && !(asset.clips.get('Ride')?.duration > 0))) return;
    visual = clone(asset.scene);
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
    fallback?.(false);
  });
  return handle;
}
