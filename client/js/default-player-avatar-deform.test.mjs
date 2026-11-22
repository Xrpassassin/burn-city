// Gas Mask Guy deformation: the skin holds its shape in every clip (fix_limb_joints.mjs + fix_weights.mjs).
// Skins all three player glTFs on the CPU exactly as three.js does (GLTFLoader + AnimationMixer) and checks:
//  - weights are clean: no static neutral_bone influence, <= 4 influences, sum 1, UV-seam twins identical;
//  - pivots sit in the middle of their limbs (hips/knees/ankles/shoulders/elbows within 3.5 cm of the
//    limb's own cross-section centre), so a bending limb turns about itself instead of sweeping through the body;
//  - the air tanks / pack stay rigid on the ribcage (< 1 mm from the chest's own motion) in every frame;
//  - volume is preserved (85-108% of rest in every frame; it was 70-116%), and almost no edge more than
//    doubles in length (< 2.5% of edges per clip; up to 9% before);
//  - Sit and Ride put the boots on the floor (lowest point within -2..+6 cm of y = 0; they hung 20 cm below).
//   node client/js/default-player-avatar-deform.test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({ resolve(specifier, context, next) { if (specifier === 'three') return { url: new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, shortCircuit: true }; return next(specifier, context); } });
globalThis.document ??= { createElement: () => ({ getContext: () => null, style: {} }), createElementNS: () => ({ style: {} }) };
globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };
const THREE = await import('three');
const { GLTFLoader } = await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');

const dir = new URL('../assets/players/', import.meta.url);
async function load(file) {
  const g = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  g.buffers = g.buffers.map(b => ({ ...b, uri: 'data:application/octet-stream;base64,' + readFileSync(new URL(b.uri, dir)).toString('base64') }));
  delete g.images; delete g.textures; delete g.samplers;
  for (const m of g.materials || []) { if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture; }
  const gltf = await new Promise((ok, no) => new GLTFLoader().parse(JSON.stringify(g), '', ok, no));
  let mesh; gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  gltf.scene.updateMatrixWorld(true);
  return { gltf, mesh, scene: gltf.scene };
}
const fmt = x => (x * 100).toFixed(1) + '%';
const mainJoints = {};

for (const file of ['gas-mask-guy.gltf', 'gas-mask-guy-lod.gltf', 'gas-mask-guy-body.gltf']) {
  const { gltf, mesh, scene } = await load(file);
  const geo = mesh.geometry, P = geo.attributes.position, J = geo.attributes.skinIndex, W = geo.attributes.skinWeight, idx = geo.index.array, n = P.count;
  const sk = mesh.skeleton, names = sk.bones.map(b => b.name), bone = nm => names.indexOf(nm);
  const rest = Float32Array.from(P.array);

  // 1. clean weights
  const twin = new Map();
  for (let i = 0; i < n; i++) {
    let sum = 0, prev = Infinity;
    for (let k = 0; k < 4; k++) {
      const w = W.getComponent(i, k); sum += w;
      if (w > 0) { assert.notEqual(names[J.getComponent(i, k)], 'neutral_bone', `${file}: vertex ${i} has no static neutral_bone weight`); assert(w <= prev + 1e-7, `${file}: influences sorted`); prev = w; }
    }
    assert(Math.abs(sum - 1) < 1e-5, `${file}: vertex ${i} weights sum to 1 (${sum})`);
    const key = `${rest[i * 3].toFixed(5)},${rest[i * 3 + 1].toFixed(5)},${rest[i * 3 + 2].toFixed(5)}`, sig = [0, 1, 2, 3].map(k => J.getComponent(i, k) + ':' + W.getComponent(i, k).toFixed(5)).join();
    if (twin.has(key)) assert.equal(sig, twin.get(key), `${file}: UV-seam twins at ${key} share weights (no crack)`); else twin.set(key, sig);
  }

  // 2. pivots inside their limbs (vertex space = rig world at rest), measured on the full-detail mesh; the LOD
  // and the first-person body carry the very same rig.
  const jp = nm => sk.bones[bone(nm)].getWorldPosition(new THREE.Vector3());
  if (file !== 'gas-mask-guy.gltf') for (const b of names) assert(jp(b).distanceTo(mainJoints[b]) < 1e-5, `${file}: ${b} rest pivot matches the full model`);
  else { for (const b of names) mainJoints[b] = jp(b);
  const slice = (sign, y0, y1, x0, x1) => { let z0 = Infinity, z1 = -Infinity; for (let i = 0; i < n; i++) { const x = rest[i * 3] * sign, y = rest[i * 3 + 1], z = rest[i * 3 + 2]; if (y > y0 && y < y1 && x > x0 && x < x1) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); } } return (z0 + z1) / 2; };
  for (const s of ['L', 'R']) {
    const sg = Math.sign(jp('foot' + s).x), hip = jp('thigh' + s), knee = jp('shin' + s), ankle = jp('foot' + s), sh = jp('upperarm' + s), el = jp('forearm' + s);
    for (const [nm, p, z] of [['hip', hip, slice(sg, .60, .68, .02, .3)], ['knee', knee, slice(sg, knee.y - .05, knee.y + .05, .02, .3)], ['ankle', ankle, slice(sg, .15, .24, .02, .3)],
      ['shoulder', sh, slice(Math.sign(sh.x), 1.30, 1.36, .2, .4)], ['elbow', el, slice(Math.sign(el.x), el.y - .04, el.y + .04, .235, .42)]])
      assert(Math.abs(p.z - z) < .035, `${file}: ${s} ${nm} pivot sits in the limb (${((p.z - z) * 100).toFixed(1)} cm off its centre)`);
  } }

  // 3. skin every frame
  const edges = [], seen = new Set();
  for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
    const k = Math.min(a, b) * n + Math.max(a, b); if (seen.has(k)) continue; seen.add(k);
    const l = Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]); if (l > .005) edges.push(a, b, l);
  }
  const volume = p => { let v = 0; for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3; v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]); } return v / 6; };
  const pack = []; for (let i = 0; i < n; i++) { const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2]; if (z > .14 && y > .97 && y < 1.55 && Math.abs(x) < .22) pack.push(i); }
  assert(pack.length > 300, `${file}: pack region found (${pack.length} verts)`);
  const v0 = volume(rest), pos = new Float32Array(n * 3), chest = bone('chest'), mixer = new THREE.AnimationMixer(scene);
  const report = [];
  for (const clip of gltf.animations) {
    const act = mixer.clipAction(clip).play(); let vmin = Infinity, vmax = 0, long = 0, tot = 0, packErr = 0, low = Infinity;
    for (let f = 0; f < 24; f++) {
      mixer.setTime(clip.duration * f / 24); scene.updateMatrixWorld(true);
      const M = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]).elements);
      for (let i = 0; i < n; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2]; let X = 0, Y = 0, Z = 0;
        for (let k = 0; k < 4; k++) { const w = W.getComponent(i, k); if (!w) continue; const m = M[J.getComponent(i, k)]; X += w * (m[0] * x + m[4] * y + m[8] * z + m[12]); Y += w * (m[1] * x + m[5] * y + m[9] * z + m[13]); Z += w * (m[2] * x + m[6] * y + m[10] * z + m[14]); }
        pos[i * 3] = X; pos[i * 3 + 1] = Y; pos[i * 3 + 2] = Z; low = Math.min(low, Y);
      }
      const c = M[chest];
      for (const i of pack) { const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2]; packErr = Math.max(packErr, Math.hypot(c[0] * x + c[4] * y + c[8] * z + c[12] - pos[i * 3], c[1] * x + c[5] * y + c[9] * z + c[13] - pos[i * 3 + 1], c[2] * x + c[6] * y + c[10] * z + c[14] - pos[i * 3 + 2])); }
      const r = volume(pos) / v0; vmin = Math.min(vmin, r); vmax = Math.max(vmax, r);
      for (let e = 0; e < edges.length; e += 3) { const a = edges[e] * 3, b = edges[e + 1] * 3; tot++; if (Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) > 2 * edges[e + 2]) long++; }
    }
    assert(packErr < .001, `${file} ${clip.name}: the pack stays rigid on the chest (off by ${(packErr * 1000).toFixed(1)} mm)`);
    assert(vmin > .85 && vmax < 1.08, `${file} ${clip.name}: volume preserved (${fmt(vmin)}-${fmt(vmax)} of rest)`);
    assert(long / tot < .025, `${file} ${clip.name}: ${fmt(long / tot)} of edges more than double (must be < 2.5%)`);
    if (clip.name === 'Sit' || clip.name === 'Ride') assert(low > -.02 && low < .06, `${file} ${clip.name}: boots on the floor (lowest point ${(low * 100).toFixed(1)} cm)`);
    report.push(`${clip.name} vol ${fmt(vmin)}-${fmt(vmax)} >2x ${fmt(long / tot)}`);
    act.stop(); mixer.uncacheAction(clip);
  }
  console.log(`${file}: ${report.join(', ')}`);
}
console.log('Gas Mask Guy deformation: clean weights, pivots in the limbs, rigid pack, volume kept, no torn edges, seated boots on the floor');
