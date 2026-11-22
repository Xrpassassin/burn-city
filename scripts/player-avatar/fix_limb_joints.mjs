#!/usr/bin/env node
// Gas Mask Guy: move the hip, knee, ankle and shoulder pivots to the middle of the limbs they bend.
//
//   node scripts/player-avatar/fix_limb_joints.mjs           fix the three player glTFs in place (idempotent)
//   node scripts/player-avatar/fix_limb_joints.mjs --check   report where the pivots are vs the mesh
//
// Why (Nov 2026): the auto rig put each hip joint ~16 cm in front of the thigh it drives (at the front of
// the groin), the knees ~6 cm forward, the ankles ~6-8 cm forward of the boot shaft and the shoulders
// inside the upper chest, ~10 cm in from the arm. A limb turning about a pivot that far off sweeps the
// flesh beside it through the body: in Walk the back of the thigh rose ~11 cm into the seat of the coat,
// in Sit/Ride ~25 cm, and no skin weighting can hide that. Each pivot moves to the centre of its limb's
// cross-section measured on the full-detail mesh (trouser leg at 0.60-0.68 m for the hip, the knee slice,
// the boot shaft at 0.15-0.24 m for the ankle, the sleeve under the shoulder cap for the shoulder, the
// sleeve at elbow height for the elbow); the
// knee, ankle and elbow keep their height, wrists stay. The same pivots go into all three
// files. Run after fix_bind.mjs, before fix_weights.mjs and author_gait.mjs (which re-authors
// Walk/Run/Sprint/Air on the new pivots).
//
// Changes, and nothing else:
//   - rest TRS of thigh.*, shin.*, foot.*, upperarm.*, forearm.*, hand.* (each bone's +Y still points at its
//     child, twist kept; the hands only re-expressed under the moved forearm, same world placement);
//   - their inverseBindMatrices (jointWorld * IBM stays exactly identity at rest);
//   - the legacy Idle/Jump/Sit/Ride limb channels, retargeted by two-bone IK so every boot and glove keeps
//     exactly the world placement it had (ground contact, grip unchanged) and each knee / elbow stays in the
//     plane it bent in before. Exception, Sit and Ride legs: since fix_bind.mjs turned those clips the boots hung
//     ~20 cm below the floor, so they are re-posed as a real seat (shins upright, soles flat on y = 0 under the
//     knees, thighs forward); the pelvis, torso, arms and head of every clip are unchanged.
// Mesh bytes (POSITION/NORMAL/UV/indices), weights, textures and every other joint/channel are untouched.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const THREE = await import(new URL('client/vendor/three/build/three.module.min.js', ROOT).href);
const { Vector3, Quaternion, Matrix4 } = THREE;
const DIR = new URL('client/assets/players/', ROOT);
export const FILES = ['gas-mask-guy.gltf', 'gas-mask-guy-lod.gltf', 'gas-mask-guy-body.gltf'];
const LEGACY = ['Idle', 'Jump', 'Sit', 'Ride'], SEATED = ['Sit', 'Ride'];
const MARK = 'fix_limb_joints v1';
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAY = { 5126: Float32Array, 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array };

function view(gltf, bin, index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView], n = COMPONENTS[a.type], T = ARRAY[a.componentType];
  if (v.byteStride && v.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('interleaved accessor ' + index);
  return new T(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
}
const trs = n => new Matrix4().compose(new Vector3(...(n.translation || [0, 0, 0])), new Quaternion(...(n.rotation || [0, 0, 0, 1])), new Vector3(...(n.scale || [1, 1, 1])));
function parents(gltf) { const p = {}; gltf.nodes.forEach((n, i) => (n.children || []).forEach(c => { p[c] = i; })); return p; }
// World matrices for a pose: local(i) gives node i's local matrix.
function worlds(gltf, local) {
  const par = parents(gltf), out = [];
  const W = i => out[i] || (out[i] = par[i] == null ? local(i).clone() : W(par[i]).clone().multiply(local(i)));
  gltf.nodes.forEach((_, i) => W(i)); return out;
}

// Cross-section of a limb from the mesh. Vertex space is the rig's world space at rest (exact bind).
function slice(P, sign, y0, y1, x0 = 0.02, x1 = 0.30) {
  let zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < P.length; i += 3) { const x = P[i] * sign, y = P[i + 1], z = P[i + 2]; if (y > y0 && y < y1 && x > x0 && x < x1) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); } }
  if (!(zmax > zmin)) throw new Error('empty slice ' + y0);
  return { x: sign * (xmin + xmax) / 2, z: (zmin + zmax) / 2 };
}

// Chains [root, mid, end] with the new rest position of each joint.
export function limbTargets(gltf, bin) {
  const P = view(gltf, bin, gltf.meshes[0].primitives[0].attributes.POSITION);
  const by = Object.fromEntries(gltf.nodes.map((n, i) => [n.name, i])), W = worlds(gltf, i => trs(gltf.nodes[i]));
  const pos = name => new Vector3().setFromMatrixPosition(W[by[name]]);
  const out = [];
  for (const s of ['L', 'R']) {
    const sign = Math.sign(pos('foot.' + s).x), hip = pos('thigh.' + s), knee = pos('shin.' + s), ankle = pos('foot.' + s);
    const h = slice(P, sign, 0.60, 0.68);
    out.push({ key: 'leg.' + s, bones: ['thigh', 'shin', 'foot'].map(b => b + '.' + s), was: [hip, knee, ankle],
      to: [new Vector3(h.x, hip.y, h.z), new Vector3(knee.x, knee.y, slice(P, sign, knee.y - 0.04, knee.y + 0.04).z), new Vector3(ankle.x, ankle.y, slice(P, sign, 0.15, 0.24).z)] });
    // Shoulder: the sleeve just under the shoulder cap (outside the torso, |x| > 0.2) gives the arm's centre;
    // the pivot sits 6 cm above that slice, inside the deltoid.
    const sh = pos('upperarm.' + s), elbow = pos('forearm.' + s), wrist = pos('hand.' + s), aS = Math.sign(wrist.x), a = slice(P, aS, 1.30, 1.36, 0.20, 0.40);
    out.push({ key: 'arm.' + s, bones: ['upperarm', 'forearm', 'hand'].map(b => b + '.' + s), was: [sh, elbow, wrist],
      to: [new Vector3(a.x, 1.39, a.z), (e => new Vector3(e.x, elbow.y, e.z))(slice(P, aS, elbow.y - 0.035, elbow.y + 0.035, 0.235, 0.42)), wrist.clone()] });
  }
  return out;
}

function sample(gltf, bin, sampler, t, n) {
  const times = view(gltf, bin, sampler.input), out = view(gltf, bin, sampler.output);
  if (sampler.interpolation === 'CUBICSPLINE') throw new Error('legacy clips are STEP/LINEAR');
  let i = 0; while (i < times.length - 1 && times[i + 1] <= t + 1e-6) i++;
  const a = Array.from(out.subarray(i * n, i * n + n));
  if (sampler.interpolation === 'STEP' || i >= times.length - 1 || t <= times[i] + 1e-6) return a;
  const b = Array.from(out.subarray((i + 1) * n, (i + 1) * n + n)), f = (t - times[i]) / (times[i + 1] - times[i]);
  if (n === 4) return new Quaternion(...a).slerp(new Quaternion(...b), f).toArray();
  return a.map((v, k) => v + (b[k] - v) * f);
}
// Local matrix of node i in `anim` at time t, on a rig whose rest TRS is `nodes`.
function poseLocal(gltf, bin, anim, t, nodes) {
  const ch = new Map(); for (const c of anim?.channels || []) { if (!ch.has(c.target.node)) ch.set(c.target.node, {}); ch.get(c.target.node)[c.target.path] = anim.samplers[c.sampler]; }
  return i => { const n = nodes[i], c = ch.get(i) || {};
    return new Matrix4().compose(new Vector3(...(c.translation ? sample(gltf, bin, c.translation, t, 3) : n.translation || [0, 0, 0])),
      new Quaternion(...(c.rotation ? sample(gltf, bin, c.rotation, t, 4) : n.rotation || [0, 0, 0, 1])),
      new Vector3(...(c.scale ? sample(gltf, bin, c.scale, t, 3) : n.scale || [1, 1, 1]))); };
}
const dec = m => { const p = new Vector3(), q = new Quaternion(), s = new Vector3(); m.decompose(p, q, s); return { p, q, s }; };

// `T`: pivots measured on the full-detail mesh (limbTargets of gas-mask-guy.gltf), shared by all three files so
// the LOD and first-person body keep one identical rig.
export function fixLimbJoints(gltf, bin, T) {
  if (gltf.asset?.extras?.limbJoints === MARK) return { changed: false };
  const by = Object.fromEntries(gltf.nodes.map((n, i) => [n.name, i])), par = parents(gltf);
  const oldNodes = gltf.nodes.map(n => ({ ...n })), oldW = worlds(gltf, i => trs(oldNodes[i]));
  // New rest: positions from T, each bone's world rotation turned minimally so +Y still aims at its child.
  const newWorld = oldW.map(m => m.clone());
  for (const C of T) {
    const chain = C.bones.map(b => by[b]), p = C.to;
    chain.forEach((i, k) => {
      const { q, s: sc } = dec(oldW[i]);
      let nq = q;
      if (k < 2) {
        const was = new Vector3(0, 1, 0).applyQuaternion(q), want = p[k + 1].clone().sub(p[k]).normalize();
        nq = new Quaternion().setFromUnitVectors(was, want).multiply(q);
      }
      newWorld[i] = new Matrix4().compose(p[k], nq, sc);
    });
    for (const i of chain) {
      const L = newWorld[par[i]].clone().invert().multiply(newWorld[i]), d = dec(L);
      gltf.nodes[i] = { ...gltf.nodes[i], translation: d.p.toArray(), rotation: d.q.normalize().toArray() };
    }
  }
  const legNodes = new Set(T.flatMap(C => C.bones.map(b => by[b])));

  // Legacy clips: IK retarget of each leg so the boot keeps its world transform exactly.
  const chunks = [bin]; let offset = bin.byteLength;
  const push = (arr, type) => {
    const pad = (4 - offset % 4) % 4; if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    chunks.push(new Uint8Array(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)));
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength }); offset += arr.byteLength;
    const acc = { bufferView: gltf.bufferViews.length - 1, componentType: 5126, count: arr.length / COMPONENTS[type], type };
    if (type === 'SCALAR') { acc.min = [Math.min(...arr)]; acc.max = [Math.max(...arr)]; }
    gltf.accessors.push(acc); return gltf.accessors.length - 1;
  };
  const report = {}, pending = [];
  for (const name of LEGACY) {
    const anim = gltf.animations.find(a => a.name === name); if (!anim) continue;
    let worst = 0;
    for (const C of T) {
      const [ti, si, fi] = C.bones.map(b => by[b]);
      const chainNodes = [ti, si, fi]; for (let a = par[ti]; a != null; a = par[a]) chainNodes.push(a);   // the chain and every ancestor
      const used = anim.channels.filter(c => chainNodes.includes(c.target.node) && c.target.path !== 'scale');
      const times = [...new Set(used.flatMap(c => Array.from(view(gltf, bin, anim.samplers[c.sampler].input))))].sort((a, b) => a - b);
      const linear = used.some(c => anim.samplers[c.sampler].interpolation === 'LINEAR');
      const rot = { [ti]: new Float32Array(times.length * 4), [si]: new Float32Array(times.length * 4), [fi]: new Float32Array(times.length * 4) };
      times.forEach((t, k) => {
        const oldP = worlds(gltf, poseLocal(gltf, bin, anim, t, oldNodes));
        // boot: newFoot * IBMnew = oldFoot * IBMold  =>  newFoot = oldFoot * oldRest^-1 * newRest
        let footW = oldP[fi].clone().multiply(oldW[fi].clone().invert()).multiply(newWorld[fi]);
        const hipsW = oldP[par[ti]];
        const hip = new Vector3().setFromMatrixPosition(hipsW.clone().multiply(new Matrix4().makeTranslation(...gltf.nodes[ti].translation)));
        const a = C.to[1].distanceTo(C.to[0]), b = C.to[2].distanceTo(C.to[1]);
        let oldKnee = new Vector3().setFromMatrixPosition(oldP[si]);
        if (SEATED.includes(name) && C.key.startsWith('leg')) {
          // Seated legs: shin upright, sole flat on the floor (y = 0) under the knee, thigh reaching forward (-Z) from
          // the hip. Since the bind fix turned these clips the boots hung ~20 cm through the floor (Pyretheum lounge seat).
          const ay = C.to[2].y, ax = C.to[2].x, kneeY = ay + b, dz2 = a * a - (hip.y - kneeY) ** 2 - (hip.x - ax) ** 2;
          const kz = hip.z - Math.sqrt(Math.max(0, dz2));
          footW = newWorld[fi].clone().setPosition(ax, ay, kz);
          oldKnee = new Vector3(ax, kneeY, kz);
        }
        const ankle = new Vector3().setFromMatrixPosition(footW);
        const ray = ankle.clone().sub(hip), dist = ray.length(), dir = ray.clone().normalize(), reach = Math.min(dist, a + b - 1e-5);
        worst = Math.max(worst, dist - reach);
        const along = (a * a - b * b + reach * reach) / (2 * reach);
        let bend = oldKnee.clone().sub(hip); bend.sub(dir.clone().multiplyScalar(bend.dot(dir)));
        if (bend.lengthSq() < 1e-10) bend = new Vector3(0, 0, -1).applyQuaternion(dec(hipsW).q); bend.normalize();
        const knee = hip.clone().addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
        // thigh world rotation: old pose's thigh turned minimally so the bone aims hip -> knee; same for the shin.
        const aimQ = (oldWorldQ, restLocalQ, from, to) => {
          const q0 = oldWorldQ.clone();
          const axis = new Vector3(0, 1, 0).applyQuaternion(q0);
          return new Quaternion().setFromUnitVectors(axis, to.clone().sub(from).normalize()).multiply(q0);
        };
        // start from the old posed world rotation re-expressed for the new rest (keeps twist)
        const reRest = i => dec(oldP[i]).q.multiply(dec(oldW[i]).q.invert()).multiply(dec(newWorld[i]).q);
        const tq = aimQ(reRest(ti), null, hip, knee);
        const sq = aimQ(reRest(si), null, knee, ankle.clone().sub(knee).length() > 1e-6 ? hip.clone().addScaledVector(dir, reach) : ankle);
        const fq = dec(footW).q;
        const hq = dec(hipsW).q;
        const tl = hq.clone().invert().multiply(tq).normalize(), sl = tq.clone().invert().multiply(sq).normalize(), fl = sq.clone().invert().multiply(fq).normalize();
        rot[ti].set(tl.toArray(), k * 4); rot[si].set(sl.toArray(), k * 4); rot[fi].set(fl.toArray(), k * 4);
      });
      pending.push({ anim, times, linear, rot, nodes: [ti, si, fi] });
    }
    report[name] = worst;
  }
  for (const { anim, times, linear, rot, nodes } of pending) {
    const input = push(new Float32Array(times), 'SCALAR');
    for (const node of nodes) {
      const r = rot[node];
      for (let k = 1; k < times.length; k++) { let d = 0; for (let j = 0; j < 4; j++) d += r[k * 4 + j] * r[(k - 1) * 4 + j]; if (d < 0) for (let j = 0; j < 4; j++) r[k * 4 + j] *= -1; }
      const rotS = anim.samplers.push({ input, interpolation: linear ? 'LINEAR' : 'STEP', output: push(r, 'VEC4') }) - 1;
      const tr = new Float32Array(times.length * 3); for (let k = 0; k < times.length; k++) tr.set(gltf.nodes[node].translation, k * 3);
      const trS = anim.samplers.push({ input, interpolation: 'STEP', output: push(tr, 'VEC3') }) - 1;
      let hasR = false, hasT = false;
      for (const c of anim.channels) if (c.target.node === node) {
        if (c.target.path === 'rotation') { c.sampler = rotS; hasR = true; }
        if (c.target.path === 'translation') { c.sampler = trS; hasT = true; }
      }
      if (!hasR) anim.channels.push({ sampler: rotS, target: { node, path: 'rotation' } });
      if (!hasT) anim.channels.push({ sampler: trS, target: { node, path: 'translation' } });
    }
  }
  // Gait clips (Walk/Run/Sprint/Air): their constant translation keys for the moved joints follow the new rest;
  // author_gait.mjs re-authors them on the new pivots afterwards.
  for (const anim of gltf.animations) {
    if (LEGACY.includes(anim.name)) continue;
    for (const c of anim.channels) if (legNodes.has(c.target.node) && c.target.path === 'translation') {
      const s = anim.samplers[c.sampler], n = view(gltf, bin, s.input).length;
      const vals = new Float32Array((s.interpolation === 'CUBICSPLINE' ? 3 : 1) * n * 3);
      for (let k = 0; k < n; k++) { if (s.interpolation === 'CUBICSPLINE') vals.set(gltf.nodes[c.target.node].translation, (k * 3 + 1) * 3); else vals.set(gltf.nodes[c.target.node].translation, k * 3); }
      c.sampler = anim.samplers.push({ input: s.input, interpolation: s.interpolation, output: push(vals, 'VEC3') }) - 1;
    }
  }
  // Inverse binds of the moved joints.
  const skin = gltf.skins[0], ibmOld = view(gltf, bin, skin.inverseBindMatrices), ibm = new Float32Array(ibmOld);
  skin.joints.forEach((node, k) => { if (legNodes.has(node)) ibm.set(newWorld[node].clone().invert().elements, k * 16); });
  skin.inverseBindMatrices = push(ibm, 'MAT4');
  // Drop samplers no channel uses any more.
  for (const anim of gltf.animations) {
    const used = [...new Set(anim.channels.map(c => c.sampler))].sort((a, b) => a - b), map = new Map(used.map((s, i) => [s, i]));
    anim.samplers = used.map(s => anim.samplers[s]); anim.channels.forEach(c => { c.sampler = map.get(c.sampler); });
  }
  const out = new Uint8Array(offset); let o = 0; for (const ch of chunks) { out.set(ch, o); o += ch.byteLength; }
  gltf.buffers[0].byteLength = out.byteLength;
  gltf.asset.extras = { ...(gltf.asset.extras || {}), limbJoints: MARK };
  return { changed: true, gltf, bin: out, unreached: report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const outArg = process.argv.indexOf('--out'), inArg = process.argv.indexOf('--in');
  const inDir = inArg > 0 ? new URL(process.argv[inArg + 1].replace(/\/?$/, '/'), 'file://') : DIR;
  const outDir = outArg > 0 ? new URL(process.argv[outArg + 1].replace(/\/?$/, '/'), 'file://') : DIR;
  const read = file => { const gltf = JSON.parse(readFileSync(new URL(file, inDir), 'utf8')); return { gltf, bin: new Uint8Array(readFileSync(new URL(gltf.buffers[0].uri, inDir))) }; };
  const main = read(FILES[0]);
  if (main.gltf.asset?.extras?.limbJoints === MARK) { console.log('limb joints already moved'); process.exit(0); }
  const T0 = limbTargets(main.gltf, main.bin);
  const fmt = v => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
  for (const C of T0) console.log(C.key.padEnd(6), C.bones.map((b, k) => C.was[k].distanceTo(C.to[k]) < 1e-6 ? `${b} stays` : `${b} ${fmt(C.was[k])} -> ${fmt(C.to[k])}`).join('  '));
  if (check) process.exit(0);
  for (const file of FILES) {
    const { gltf, bin } = read(file);
    const r = fixLimbJoints(gltf, bin, T0);
    writeFileSync(new URL(file, outDir), JSON.stringify(r.gltf));
    writeFileSync(new URL(gltf.buffers[0].uri, outDir), r.bin);
    console.log(file, 'pivots moved; legacy boots/gloves left unreached (m):', Object.entries(r.unreached).map(([k, v]) => k + ' ' + v.toFixed(4)).join(' '));
  }
}
