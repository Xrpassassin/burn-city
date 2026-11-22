// Hover Mage: an optional player body (client/js/player-model-choice.mjs) built from "Dark Hooded Robe" by
// maksfrolov947 (Sketchfab, CC BY 4.0; see client/city-credits.html). The model has no rig, so nothing
// walks: the mage floats (a gentle bob), the robe hem sways and trails in a vertex shader weighted by height,
// and the whole body leans into movement and banks into turns. Walk / run / sit / ride map to float speed,
// height and tilt. Same handle as mountDefaultPlayerAvatar (ready, update, setLod, setVisible, dispose).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';

const assetRoot = new URL('../assets/players/hover-mage/', import.meta.url);
// Desktop close-up: 15,000 tris + 1024 webp; phones and far: 5,000 tris + 512 webp (scripts/hover-mage/build.mjs).
export const HOVER_MAGE_FILES = Object.freeze({ near: 'hover-mage.glb', far: 'hover-mage-lod.glb' });
// The export is 1 unit tall (hem at y = 0, hood top at y = 1), faces +Z; the walker faces -Z.
const MODEL_HEIGHT = 1, MODEL_YAW = Math.PI;
const sources = new Map();

function phoneQuality() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('tex') === '512') return true;
    if (q.get('tex') === '1024') return false;
    return !!(matchMedia?.('(pointer:coarse)').matches || innerWidth < 900 || (devicePixelRatio < 2 && innerWidth < 1100));
  } catch { return false; }
}

function load(file) {
  if (!sources.has(file)) sources.set(file, new GLTFLoader().loadAsync(new URL(file, assetRoot).href)
    .then(gltf => { let mesh = false; gltf.scene.traverse(n => { if (n.isMesh) mesh = true; }); return mesh ? gltf.scene : null; })
    .catch(() => null));
  return sources.get(file);
}

// Pure motion model (unit-tested): where the float should be for a state and a body-relative speed.
// v = ground speed in body heights per second. Returns hover (body heights above the root), bob amplitude,
// bob frequency (Hz), forward lean (rad) and hem trail (model units).
export function hoverTarget(state, v, out = {}) {
  const seated = state === 'Sit' || state === 'Ride', air = state === 'Air' || state === 'Jump';
  const n = Math.min(1, Math.max(0, (Number.isFinite(v) ? v : 0) / 4.5));   // ~0.5 walk, 1 = run/sprint
  if (seated) return Object.assign(out, { hover: -.17, bobAmp: .006, bobHz: .8, lean: -.06, trail: 0, n: 0 });
  if (air) return Object.assign(out, { hover: .12, bobAmp: 0, bobHz: 1.2, lean: .12 + .1 * n, trail: .05 + .06 * n, n });
  return Object.assign(out, { hover: .12 + .03 * n, bobAmp: .03 - .012 * n, bobHz: .55 + .45 * n, lean: .22 * n, trail: .085 * n, n });
}

const SWAY_KEY = 'hover-mage-sway-v1';
function addSway(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uMageTime; uniform float uMageSway; uniform vec3 uMageTrail;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // Weight by height: the hem (y = 0) moves most, nothing above the waist (y > 0.55) moves.
        float w = 1.0 - smoothstep(0.0, 0.55, position.y); float w2 = w * w;
        float ph = uMageTime * 2.1 + position.y * 7.0 + position.x * 9.0 + position.z * 5.0;
        transformed.x += sin(ph) * uMageSway * w;
        transformed.z += cos(ph * 0.83 + 1.3) * uMageSway * w;
        transformed += uMageTrail * w2;
        transformed.y += length(uMageTrail.xz) * w2 * 0.35;   // a trailing hem lifts a little
      }`);
  };
  material.customProgramCacheKey = () => SWAY_KEY;
  material.needsUpdate = true;
}

const mounted = new WeakMap();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3();

export function mountHoverMage(root, {
  height = 2, yaw = 0, offset = [0, 0, 0], seated = false, lod = false, fallback
} = {}) {
  if (mounted.has(root)) return mounted.get(root);
  const phone = phoneQuality();
  let farWanted = !!lod, visual = null, model = null, aura = null, disposed = false, hidden = false;
  const uniforms = { uMageTime: { value: 0 }, uMageSway: { value: .006 }, uMageTrail: { value: new THREE.Vector3() } };
  const cur = { hover: .12, bobAmp: .03, bobHz: .55, lean: 0, trail: 0, n: 0, roll: 0, side: 0 }, want = {};
  let t = 0, bobPhase = 0, spd = 0, prevYaw = null, lastState = 'Idle';
  const file = () => HOVER_MAGE_FILES[(phone || farWanted) ? 'far' : 'near'];
  let loadedFile = null;

  // A soft additive glow on the ground under the hem sells the float (no light: lights recompile shaders).
  function makeAura() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(170,140,255,.85)'); g.addColorStop(.45, 'rgba(120,90,240,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false
    }));
    m.name = 'hover-mage-aura'; m.renderOrder = -1; m.scale.setScalar(height * .5); m.position.set(offset[0], offset[1] + .06, offset[2]);
    return m;
  }

  function attach(scene, f) {
    if (disposed || !scene) return;
    if (visual) { root.remove(visual); disposeMaterials(visual); visual = model = null; }
    visual = new THREE.Group(); visual.name = 'hover-mage';
    visual.position.set(...offset); visual.rotation.y = yaw;
    const lean = new THREE.Group(); lean.name = 'hover-mage-lean';
    lean.position.y = height * .5;          // lean / bank about the middle of the body
    visual.add(lean);
    model = scene.clone(true);
    model.scale.setScalar(height * .97 / MODEL_HEIGHT);
    model.rotation.y = MODEL_YAW;
    model.position.y = -height * .5;
    model.traverse(n => {
      n.userData.sharedAsset = true;        // shared geometry/texture: clearGroup must not dispose them
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.roughness = Math.max(n.material.roughness ?? 1, .8);
      addSway(n.material, uniforms);
      n.frustumCulled = false;              // the shader moves the hem outside the static bounds
    });
    lean.add(model);
    visual.userData.lean = lean;
    root.add(visual);
    if (!aura) { aura = makeAura(); root.add(aura); }
    loadedFile = f;
    visual.visible = aura.visible = !hidden;
    handle.update(0, seated ? 'Sit' : lastState, 0);
    fallback?.(hidden);
  }

  function disposeMaterials(obj) {
    obj.traverse(n => { if (!n.isMesh) return; const ms = Array.isArray(n.material) ? n.material : [n.material]; for (const m of ms) m?.dispose?.(); });
  }

  const handle = {
    model: 'hover-mage',
    get ready() { return !!visual; },
    get phase() { return bobPhase; },
    // Loose equivalents of the Gas Mask Guy blend weights for debug overlays.
    get weights() { const n = cur.n; return { Idle: 1 - Math.min(1, n * 2), Walk: Math.max(0, 1 - Math.abs(n * 2 - 1)), Run: Math.max(0, n * 2 - 1), Sprint: 0, Air: lastState === 'Air' || lastState === 'Jump' ? 1 : 0 }; },
    get motion() { return { ...cur, speed: spd }; },
    update(dt, state = 'Idle', speed) {
      const step = Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0;
      if (seated) state = state === 'Ride' ? 'Ride' : 'Sit';
      lastState = state;
      if (!visual) return;
      t += step;
      const unit = root.getWorldScale(_s).x * height;      // world units per body height
      let v;
      if (Number.isFinite(speed) && speed >= 0) v = speed / Math.max(1e-4, unit);
      else v = state === 'Run' ? 3.6 : state === 'Walk' ? 1.6 : 0;
      const k = step > 0 ? 1 - Math.exp(-step / .18) : 1;
      spd += (v - spd) * k;
      hoverTarget(state, spd, want);
      for (const key of ['hover', 'bobAmp', 'bobHz', 'lean', 'trail', 'n']) cur[key] += (want[key] - cur[key]) * k;
      // Bank into turns from the root's real yaw rate (no input coupling, so remote/AI callers work too).
      root.getWorldQuaternion(_q); _e.setFromQuaternion(_q, 'YXZ');
      let yawRate = 0;
      if (prevYaw != null && step > 0) { let d = _e.y - prevYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yawRate = d / step; }
      prevYaw = _e.y;
      const bankWant = Math.max(-.2, Math.min(.2, yawRate * .07 * (.3 + cur.n)));
      cur.roll += (bankWant - cur.roll) * (step > 0 ? 1 - Math.exp(-step / .25) : 1);
      bobPhase = (bobPhase + step * cur.bobHz) % 1;
      const bob = Math.sin(bobPhase * Math.PI * 2) * cur.bobAmp;
      visual.position.y = offset[1] + (cur.hover + bob) * height;
      const lean = visual.userData.lean;
      lean.rotation.x = -cur.lean + Math.sin(bobPhase * Math.PI * 2 + 1) * .015 * (1 - cur.n);   // forward is -Z
      lean.rotation.z = cur.roll;
      // Hem: idle flutter, trails behind (root +Z = model -Z after the half turn) and swings out of turns.
      uniforms.uMageTime.value = t;
      uniforms.uMageSway.value = .006 + .006 * cur.n;
      uniforms.uMageTrail.value.set(cur.roll * .25, 0, -cur.trail);
      if (aura) {
        const lift = Math.max(0, cur.hover + bob);
        aura.material.opacity = .6 + .4 * (1 - Math.min(1, lift / .2));
        aura.scale.setScalar(height * (.62 + lift * .8));
      }
    },
    setLod(useFar) {
      farWanted = !!useFar;
      const f = file();
      if (f !== loadedFile) load(f).then(s => { if (!disposed && file() === f) attach(s, f); });
    },
    setVisible(show) {
      hidden = !show;
      if (visual) visual.visible = !!show;
      if (aura) aura.visible = !!show;
      if (!show) fallback?.(true); else if (visual) fallback?.(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (visual) { root.remove(visual); disposeMaterials(visual); visual = model = null; fallback?.(true); }
      if (aura) { root.remove(aura); aura.geometry.dispose(); aura.material.map?.dispose(); aura.material.dispose(); aura = null; }
      mounted.delete(root);
    }
  };
  mounted.set(root, handle);
  const f = file();
  load(f).then(s => { if (!disposed) attach(s, f); });
  return handle;
}
