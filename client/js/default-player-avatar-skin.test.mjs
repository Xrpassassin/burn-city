// Gas Mask Guy skin: no deformation from the rig itself. Loads the three player glTFs through
// three.js (GLTFLoader + AnimationMixer, as the game does) and checks:
//  - the bind is exact: at rest every skinned vertex stays where the mesh puts it, and each limb's
//    joint sits inside that limb (the old export was off by a half turn: joints on the far side);
//  - joint separation: at every joint the parent's and the child's skin carry the joint point to the
//    same place in every frame of every clip, so limbs bend at the joint instead of tearing apart;
//  - the gait clips are smooth (quaternions continuous, no flips) and bend knees the human way;
//  - the body faces -Z (the walker's forward) and Sit puts the thighs forward.
//   node client/js/default-player-avatar-skin.test.mjs
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
  for (const m of g.materials || []) { if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; } delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture; }
  return { json: g, gltf: await new Promise((ok, no) => new GLTFLoader().parse(JSON.stringify(g), '', ok, no)) };
}

const LIMBS = [['hips', 'thighL'], ['thighL', 'shinL'], ['shinL', 'footL'], ['hips', 'thighR'], ['thighR', 'shinR'], ['shinR', 'footR'],
  ['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['chest', 'upperarmL'], ['upperarmL', 'forearmL'], ['forearmL', 'handL'], ['chest', 'upperarmR'], ['upperarmR', 'forearmR'], ['forearmR', 'handR']];

for (const file of ['gas-mask-guy.gltf', 'gas-mask-guy-lod.gltf', 'gas-mask-guy-body.gltf']) {
  const { json, gltf } = await load(file);
  const scene = gltf.scene; let mesh; scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  scene.updateMatrixWorld(true);
  const sk = mesh.skeleton, P = mesh.geometry.attributes.position, J = mesh.geometry.attributes.skinIndex, W = mesh.geometry.attributes.skinWeight;
  const bone = n => sk.bones.findIndex(b => b.name === n);
  const skinM = i => new THREE.Matrix4().multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]);

  // 1. exact bind
  let restErr = 0;
  for (let i = 0; i < sk.bones.length; i++) { const m = skinM(i).elements; for (let k = 0; k < 16; k++) restErr = Math.max(restErr, Math.abs(m[k] - (k % 5 === 0 ? 1 : 0))); }
  assert(restErr < 1e-4, `${file}: jointWorld * inverseBind must be identity at rest (got ${restErr.toExponential(2)})`);
  for (const name of ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'upperarmL', 'handL', 'upperarmR', 'handR', ...(file.includes('body') ? [] : ['head'])]) {   // the first-person body has no head
    const bi = bone(name), jp = sk.bones[bi].getWorldPosition(new THREE.Vector3()), c = new THREE.Vector3(), v = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < P.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (J.getComponent(i, k) === bi) w += W.getComponent(i, k); if (w > .5) { v.fromBufferAttribute(P, i); mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); if (v.distanceTo(jp) < .16) { c.add(v); n++; } } }
    assert(n > 10, `${file}: ${name} has skinned vertices near its joint (the boot / glove / leg drawn where its joint is)`);
    c.divideScalar(n);
    assert(Math.abs(c.x - jp.x) < .06, `${file}: ${name} joint sits inside its limb (x off ${(c.x - jp.x).toFixed(3)})`);
  }
  // facing: the backpack (and the bulk of the torso) is on +Z, so the chest and mask face -Z
  { let back = 0, front = 0;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i), x = P.getX(i), z = P.getZ(i); if (y > 1.1 && y < 1.45 && Math.abs(x) < .12) { if (z > .2) back++; else if (z < -.2) front++; } }
    assert(back > 4 * front, `${file}: backpack on +Z, body faces -Z (back ${back}, front ${front})`); }

  // 2. joint separation in every clip
  const pts = LIMBS.map(([, c]) => sk.bones[bone(c)].getWorldPosition(new THREE.Vector3()));
  const mixer = new THREE.AnimationMixer(scene);
  for (const clip of gltf.animations) {
    const act = mixer.clipAction(clip).play(); let worst = 0, at = '';
    for (let k = 0; k < 48; k++) {
      mixer.setTime(clip.duration * k / 48); scene.updateMatrixWorld(true);
      LIMBS.forEach(([p, c], i) => { const d = pts[i].clone().applyMatrix4(skinM(bone(p))).distanceTo(pts[i].clone().applyMatrix4(skinM(bone(c)))); if (d > worst) { worst = d; at = `${p}>${c}`; } });
      for (const b of sk.bones) for (const e of b.matrixWorld.elements) assert(Number.isFinite(e), `${file} ${clip.name}: finite pose`);
    }
    assert(worst < 1e-3, `${file} ${clip.name}: joints stay together (worst ${(worst * 1000).toFixed(1)} mm at ${at})`);
    if (file === 'gas-mask-guy.gltf') console.log(`${file} ${clip.name.padEnd(6)}: worst joint separation ${(worst * 1000).toFixed(2)} mm`);
    act.stop(); mixer.uncacheAction(clip);
  }

  // 3. gait clips: continuous quaternions, bounded angular step, knees bend backwards
  const bin = Buffer.from(json.buffers[0].uri.split(',')[1], 'base64');
  const acc = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]; return new Float32Array(bin.buffer.slice(bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0) + a.count * n * 4)); };
  for (const name of ['Walk', 'Run', 'Sprint', 'Air']) {
    const a = json.animations.find(x => x.name === name);
    for (const c of a.channels.filter(c => c.target.path === 'rotation')) {
      const s = a.samplers[c.sampler], o = acc(s.output), stride = s.interpolation === 'CUBICSPLINE' ? 12 : 4, off = s.interpolation === 'CUBICSPLINE' ? 4 : 0;
      for (let k = 1; k < o.length / stride; k++) {
        let d = 0; for (let j = 0; j < 4; j++) d += o[k * stride + off + j] * o[(k - 1) * stride + off + j];
        assert(d > 0, `${file} ${name} ${json.nodes[c.target.node].name}: consecutive keys in one hemisphere (no flip)`);
        assert(2 * Math.acos(Math.min(1, d)) < 1.0, `${file} ${name} ${json.nodes[c.target.node].name}: no rotation jump between keys`);
      }
    }
  }
  const kneeCheck = (clipName, N = 24) => {
    const clip = gltf.animations.find(c => c.name === clipName), act = mixer.clipAction(clip).play();
    for (let k = 0; k < N; k++) {
      mixer.setTime(clip.duration * k / N); scene.updateMatrixWorld(true);
      for (const sd of ['L', 'R']) {
        const hip = sk.bones[bone('thigh' + sd)].getWorldPosition(new THREE.Vector3()), knee = sk.bones[bone('shin' + sd)].getWorldPosition(new THREE.Vector3()), ankle = sk.bones[bone('foot' + sd)].getWorldPosition(new THREE.Vector3());
        // knee in front (-Z) of the hip-ankle line, never behind it (+ a little slack for a straight leg)
        const t = (knee.y - hip.y) / (ankle.y - hip.y), lineZ = hip.z + (ankle.z - hip.z) * t;
        assert(knee.z < lineZ + .03, `${file} ${clipName} t=${k}: ${sd} knee bends forward like a human knee`);
      }
    }
    act.stop(); mixer.uncacheAction(clip);
  };
  for (const n of ['Walk', 'Run', 'Sprint', 'Air', 'Sit', 'Ride']) kneeCheck(n);
  { // Sit: thighs forward of the hips
    const clip = gltf.animations.find(c => c.name === 'Sit'), act = mixer.clipAction(clip).play();
    mixer.setTime(clip.duration / 2); scene.updateMatrixWorld(true);
    for (const sd of ['L', 'R']) {
      const hip = sk.bones[bone('thigh' + sd)].getWorldPosition(new THREE.Vector3()), knee = sk.bones[bone('shin' + sd)].getWorldPosition(new THREE.Vector3());
      assert(knee.z < hip.z - .2, `${file} Sit: ${sd} thigh points forward`);
    }
    act.stop();
  }
}
console.log('Gas Mask Guy skin: exact bind, joints stay together in every clip, smooth gait keys, human knees, body faces -Z');
