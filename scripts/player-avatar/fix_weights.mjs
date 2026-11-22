#!/usr/bin/env node
// Gas Mask Guy: clean skin weights, computed from the mesh and the rig's rest joints alone.
//
//   node scripts/player-avatar/fix_weights.mjs           rewrite JOINTS_0 / WEIGHTS_0 in the three player glTFs
//   node scripts/player-avatar/fix_weights.mjs --check   compute in memory, print a per-part summary, write nothing
//
// Why: the weights came from a nearest-bone transfer on the remeshed scan (scripts/skin-remesh), so the
// strapped-on air tanks were ~70% weighted to the upper arms (the pack twisted and shredded with every
// arm swing), the coat hem carried hand/forearm and a static `neutral_bone` (pinned at the origin), and
// blends at shoulders/hips were patchy. This script throws those weights away and derives new ones
// deterministically from vertex positions and the rest joint positions only, so it is idempotent and
// does not depend on what was there before:
//   - pack / tanks: rigid to the chest (one influence);
//   - arms: capsule membership around shoulder->elbow->wrist->fingertip with a soft edge, chest->upperarm
//     blend at the shoulder, smooth elbow and wrist falloff; gloves rigid to the hand;
//   - legs: capsule membership around hip->knee->ankle->toe below the coat, soft knee and ankle falloff,
//     boots rigid to the foot; the coat skirt follows the hips at the waist and the thighs partly at the hem;
//   - torso: hips -> spine -> chest -> neck -> head by height with smooth bands; hood and mask on the head;
//   - no influence from neutral_bone; at most 4 influences, sorted, summing to 1.
// UV-seam duplicates share one welded position, so they always get identical weights (no cracks).
// POSITION / NORMAL / TEXCOORD_0 / indices / joints / rest pose / clips / textures are untouched; only
// the JOINTS_0 and WEIGHTS_0 bytes are rewritten in place (same accessor layout).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const THREE = await import(new URL('client/vendor/three/build/three.module.min.js', ROOT).href);
const { Vector3, Quaternion, Matrix4 } = THREE;
const DIR = new URL('client/assets/players/', ROOT);
export const FILES = ['gas-mask-guy.gltf', 'gas-mask-guy-lod.gltf', 'gas-mask-guy-body.gltf'];
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAY = { 5126: Float32Array, 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array };

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function view(gltf, bin, index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView], n = COMPONENTS[a.type], T = ARRAY[a.componentType];
  if (v.byteStride && v.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('interleaved accessor ' + index);
  return new T(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
}

// Rest joint positions in vertex space. Per the glTF spec a skinned vertex lands at sum(w * jointWorld * IBM * v)
// and the bind is exact (jointWorld * IBM = identity, fix_bind.mjs), so vertex space is the rig's world space at
// rest and each joint sits at inverse(IBM) * origin. (Vertex space: body faces -Z, backpack on +Z, foot.L on +X.)
export function restJoints(gltf, bin) {
  const skin = gltf.skins[0], ibm = view(gltf, bin, skin.inverseBindMatrices), out = {};
  skin.joints.forEach((node, k) => { out[gltf.nodes[node].name] = new Vector3().applyMatrix4(new Matrix4().fromArray(ibm, k * 16).invert()); });
  return out;
}

// Distance from p to segment a-b and the clamped parameter along it.
function seg(p, a, b) {
  const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return { d: p.distanceTo(a.clone().addScaledVector(ab, t)), t };
}
// Distance to a polyline (a list of points), plus which segment and the parameter on it.
function chain(p, pts) {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) { const s = seg(p, pts[i], pts[i + 1]); if (s.d < best.d) best = { d: s.d, i, t: s.t }; }
  return best;
}

export function computeWeights(gltf, bin) {
  const prim = gltf.meshes[0].primitives[0], skin = gltf.skins[0];
  const P = view(gltf, bin, prim.attributes.POSITION), n = P.length / 3;
  const names = skin.joints.map(j => gltf.nodes[j].name), bi = Object.fromEntries(names.map((nm, k) => [nm, k]));
  const J = restJoints(gltf, bin);
  const sideOf = x => (x > 0) === (J['foot.L'].x > 0) ? 'L' : 'R';
  // Vertex space: body faces -Z, backpack on +Z, +Y up. Measured on the mesh: torso half-width ~0.24 m
  // at 0.9-1.25 m with the hanging arms starting at ~0.27 m; coat hem ~0.70 m; gloves 0.71-0.88 m.
  const arm = s => { const sg = Math.sign(J['hand.' + s].x);
    return [new Vector3(sg * 0.245, 1.40, 0.01), J['forearm.' + s], J['hand.' + s], J['hand.' + s].clone().add(new Vector3(0, -0.14, -0.02))]; };

  // Weld UV-seam duplicates: identical positions get identical weights.
  const key = i => `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
  const weld = new Map(), wid = new Int32Array(n), rep = [];
  for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) { weld.set(k, rep.length); rep.push(i); } wid[i] = weld.get(k); }

  const rigid = new Uint8Array(rep.length);
  const W = rep.map((i, u) => {
    const p = new Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), ax = Math.abs(p.x), s = sideOf(p.x), w = {};
    const add = (b, x) => { if (x > 1e-6) w[b] = (w[b] || 0) + x; };

    // Pack, tanks, frame and straps behind the shoulder blades: strapped to the ribcage.
    const pack = smooth(0.105, 0.13, p.z) * smooth(0.90, 0.96, p.y) * (1 - smooth(1.57, 1.63, p.y)) * (1 - smooth(0.23, 0.26, ax));

    // Arms hang beside the torso; the shoulder cap is part chest, part upper arm.
    let mA = p.y < 1.27 ? smooth(0.236, 0.268, ax) : smooth(0.19, 0.255, ax) * (1 - smooth(1.36, 1.47, p.y));
    if (p.y < 0.69) mA = 0;   // below the gloves: legs only
    mA *= 1 - pack;
    const ac = chain(p, arm(s)), armW = {};
    if (ac.i === 0) { const e = smooth(0.80, 1.0, ac.t); armW['upperarm.' + s] = 1 - 0.5 * e; armW['forearm.' + s] = 0.5 * e; }
    else if (ac.i === 1) { const e = smooth(0.0, 0.2, ac.t), wr = smooth(0.86, 1.0, ac.t); armW['upperarm.' + s] = 0.5 * (1 - e); armW['forearm.' + s] = 1 - 0.5 * (1 - e) - 0.5 * wr; armW['hand.' + s] = 0.5 * wr; }
    else { const g = ac.i === 2 ? smooth(0.0, 0.3, ac.t) : 1; armW['forearm.' + s] = 0.5 * (1 - g); armW['hand.' + s] = 1 - 0.5 * (1 - g); }

    // Legs below the coat; the skirt hangs from the hips and swings partly with the thigh under it.
    let mL = 1 - smooth(0.68, 0.96, p.y);
    mL *= p.y < 0.68 ? 1 : smooth(0.015, 0.10, ax);   // the centre of the hem and the crotch stay with the pelvis
    const kY = J['shin.' + s].y, legW = {};
    const kb = smooth(kY - 0.065, kY + 0.065, p.y), ab = smooth(0.165, 0.245, p.y);
    legW['foot.' + s] = 1 - ab; legW['shin.' + s] = ab * (1 - kb); legW['thigh.' + s] = ab * kb;

    // Torso by height: hips -> spine -> chest -> neck -> head (hood and mask on the head).
    const yS = J.spine.y, yC = J.chest.y, yN = J.neck.y, yH = J.head.y, torso = {};
    const hs = smooth(yS - 0.09, yS + 0.05, p.y), sc = smooth(yC - 0.07, yC + 0.05, p.y), cn = smooth(yN - 0.06, yN + 0.02, p.y), nh = smooth(yH - 0.03, yH + 0.04, p.y);
    torso.hips = 1 - hs; torso.spine = hs * (1 - sc); torso.chest = sc * (1 - cn); torso.neck = cn * (1 - nh); torso.head = cn * nh;

    const body = 1 - mA;
    for (const [b, x] of Object.entries(armW)) add(b, mA * x);
    for (const [b, x] of Object.entries(legW)) add(b, body * (1 - pack) * mL * x);
    add('chest', body * pack);
    for (const [b, x] of Object.entries(torso)) add(b, body * (1 - pack) * (1 - mL) * x);
    // Rigid pieces keep exactly their bone: pack core, boots, gloves.
    if (pack > 0.999 || (p.y < 0.16 && mL > 0.999) || (mA > 0.999 && ac.i >= 2 && (ac.i === 3 || ac.t > 0.3))) rigid[u] = 1;
    return w;
  });

  // Light smoothing over the welded mesh graph (rigid pieces keep theirs) so no edge jumps between bones.
  const idx = view(gltf, bin, prim.indices), nbr = rep.map(() => new Set());
  for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const u = wid[idx[t + a]], v = wid[idx[t + b]]; if (u !== v) { nbr[u].add(v); nbr[v].add(u); } }
  let cur = W;
  for (let it = 0; it < 2; it++) cur = cur.map((w, u) => {
    if (rigid[u] || !nbr[u].size) return w;
    const out = {}, nb = [...nbr[u]], self = 0.5, k = (1 - self) / nb.length;
    for (const [b, x] of Object.entries(w)) out[b] = (out[b] || 0) + x * self;
    for (const v of nb) for (const [b, x] of Object.entries(cur[v])) out[b] = (out[b] || 0) + x * k;
    return out;
  });

  // Max 4 influences, normalized; joints indexed as in skin.joints.
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
  const packed = cur.map(w => {
    let e = Object.entries(w).filter(([, x]) => x > 0.01).sort((a, b) => b[1] - a[1] || bi[a[0]] - bi[b[0]]).slice(0, 4);
    const s = e.reduce((a, [, x]) => a + x, 0); e = e.map(([b, x]) => [bi[b], x / s]);
    // quantize to 1/1024 so the sum is exact; the remainder goes on the largest
    const q = e.map(([b, x]) => [b, Math.round(x * 1024) / 1024]); q[0][1] += 1 - q.reduce((a, [, x]) => a + x, 0);
    return q.filter(([, x]) => x > 0);
  });
  for (let i = 0; i < n; i++) packed[wid[i]].forEach(([b, x], k) => { joints[i * 4 + k] = b; weights[i * 4 + k] = x; });
  return { joints, weights, names, welded: rep.length };
}

export function fixWeights(gltf, bin) {
  const prim = gltf.meshes[0].primitives[0];
  const jA = gltf.accessors[prim.attributes.JOINTS_0], wA = gltf.accessors[prim.attributes.WEIGHTS_0];
  if (jA.componentType !== 5121 || wA.componentType !== 5126) throw new Error('unexpected JOINTS_0/WEIGHTS_0 layout');
  const { joints, weights, names, welded } = computeWeights(gltf, bin);
  view(gltf, bin, prim.attributes.JOINTS_0).set(joints);
  view(gltf, bin, prim.attributes.WEIGHTS_0).set(weights);
  return { names, welded, joints, weights };
}

function summary(file, r) {
  const mass = {}; let multi = 0, nb = 0; const n = r.joints.length / 4;
  for (let i = 0; i < n; i++) { let c = 0; for (let k = 0; k < 4; k++) { const x = r.weights[i * 4 + k]; if (x > 0) { c++; const b = r.names[r.joints[i * 4 + k]]; mass[b] = (mass[b] || 0) + x; if (b === 'neutral_bone') nb++; } } if (c > 1) multi++; }
  console.log(`${file}: ${n} verts (${r.welded} welded), ${multi} blended, neutral_bone ${nb}; mass ${Object.entries(mass).map(([b, x]) => b + ' ' + x.toFixed(0)).join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const outArg = process.argv.indexOf('--out'), inArg = process.argv.indexOf('--in');
  const outDir = outArg > 0 ? new URL(process.argv[outArg + 1].replace(/\/?$/, '/'), 'file://') : DIR;
  const inDir = inArg > 0 ? new URL(process.argv[inArg + 1].replace(/\/?$/, '/'), 'file://') : DIR;
  for (const file of FILES) {
    const gltf = JSON.parse(readFileSync(new URL(file, inDir), 'utf8'));
    const bin = new Uint8Array(readFileSync(new URL(gltf.buffers[0].uri, inDir)));
    const r = fixWeights(gltf, bin);
    summary(file, r);
    if (check) continue;
    writeFileSync(new URL(file, outDir), JSON.stringify(gltf));
    writeFileSync(new URL(gltf.buffers[0].uri, outDir), bin);
  }
}
