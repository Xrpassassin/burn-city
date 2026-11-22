#!/usr/bin/env node
// Gas Mask Guy: repair the skin bind so every joint pivots where its part of the mesh actually is.
//
//   node scripts/player-avatar/fix_bind.mjs           fix the three player glTFs in place (idempotent)
//   node scripts/player-avatar/fix_bind.mjs --check   report only
//
// ROOT CAUSE of the "model gets messed up when walking" bug (Nov 2026): the exported rig root
// `gas-mask-guy_rig` is turned 180 deg about Y, but the inverseBindMatrices were computed without that
// turn, so at rest jointWorld * IBM = Ry(180) instead of identity. A skinned vertex lands at
// jointWorld * IBM * v (glTF spec; three.js does the same), so the visible body was the skeleton
// turned around: the boot weighted to foot.L drew at -X / -Z while the foot.L joint sat at +X / +Z.
// Every joint rotated its part about a pivot on the far side of the body (hip pivots ~33 cm off in
// depth, knees ~7 cm), so legs sheared at the hip, shins folded mid-calf and blended vertices tore
// between bones. Earlier clips hid part of it by keying translations to fake rigid motion.
//
// The fix keeps every mesh byte (POSITION/NORMAL/UV/JOINTS/WEIGHTS/indices), the node tree and rest
// pose, textures and materials, and changes only:
//   1. inverseBindMatrices := IBM * Ry(180)  (now jointWorld * IBM = identity at rest, exactly);
//   2. the legacy Idle/Jump/Sit/Ride clips: each joint's motion (relative to rest, in the rig frame)
//      is turned 180 deg about Y to match the body, so they look as before, now about the right pivots.
// The visible body now faces -Z in the glTF scene (the walker's forward), so the loader no longer
// adds a half turn. Walk/Run/Sprint/Air come from author_gait.mjs, run after this.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const THREE = await import(new URL('client/vendor/three/build/three.module.min.js', ROOT).href);
const { Vector3, Quaternion, Matrix4 } = THREE;
const DIR = new URL('client/assets/players/', ROOT);
export const FILES = ['gas-mask-guy.gltf', 'gas-mask-guy-lod.gltf', 'gas-mask-guy-body.gltf'];
export const LEGACY = ['Idle', 'Jump', 'Sit', 'Ride'];
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TURN = new Matrix4().makeRotationY(Math.PI);

function view(gltf, bin, index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView], n = COMPONENTS[a.type];
  if (a.componentType !== 5126 || (v.byteStride && v.byteStride !== n * 4)) throw new Error('unexpected accessor ' + index);
  return new Float32Array(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
}

// Rest local + world (rig frame, i.e. under the rig root) matrices per node.
function restRig(gltf) {
  const parent = {};
  gltf.nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  const local = gltf.nodes.map(n => new Matrix4().compose(
    new Vector3(...(n.translation || [0, 0, 0])), new Quaternion(...(n.rotation || [0, 0, 0, 1])), new Vector3(...(n.scale || [1, 1, 1]))));
  const world = [];
  const W = i => world[i] || (world[i] = parent[i] == null ? local[i].clone() : W(parent[i]).clone().multiply(local[i]));
  gltf.nodes.forEach((_, i) => W(i));
  return { parent, local, world };
}

// Max deviation of jointWorld * IBM from `target` over all joints.
export function bindError(gltf, bin, target = new Matrix4()) {
  const { world } = restRig(gltf), ibm = view(gltf, bin, gltf.skins[0].inverseBindMatrices);
  let err = 0;
  gltf.skins[0].joints.forEach((j, k) => {
    const m = world[j].clone().multiply(new Matrix4().fromArray(ibm, k * 16));
    for (let i = 0; i < 16; i++) err = Math.max(err, Math.abs(m.elements[i] - target.elements[i]));
  });
  return err;
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

// Pose (local TRS per joint node) of a clip at time t; unkeyed paths stay at rest.
function poseAt(gltf, bin, anim, t) {
  const pose = new Map();
  for (const c of anim.channels) {
    const node = c.target.node, n = gltf.nodes[node];
    if (!pose.has(node)) pose.set(node, { t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] });
    const k = c.target.path === 'rotation' ? 'r' : c.target.path === 'translation' ? 't' : c.target.path === 'scale' ? 's' : null;
    if (k) pose.get(node)[k] = sample(gltf, bin, anim.samplers[c.sampler], t, k === 'r' ? 4 : 3);
  }
  return pose;
}

// The legacy clip pose at t with each joint's rest-relative rotation (rig frame) turned 180 deg about
// Y to match the body. Rotations only: joint positions come from the rest hierarchy, so every part
// now turns about its real pivot. The hips' own displacement (bob/sway) is turned the same way.
const turnQ = q => new Quaternion(-q.x, q.y, -q.z, q.w);   // Ry(180) * q * Ry(180)^-1
function turnedPose(gltf, bin, anim, t, rig) {
  const pose = poseAt(gltf, bin, anim, t), joints = gltf.skins[0].joints, isJoint = new Set(joints);
  const q = i => new Quaternion(...(pose.get(i)?.r || gltf.nodes[i].rotation || [0, 0, 0, 1]));
  const q0 = i => new Quaternion(...(gltf.nodes[i].rotation || [0, 0, 0, 1]));
  const posedW = new Map(), restW = new Map(), newW = new Map(), out = new Map();
  for (const j of joints) {   // skin joint order lists parents first
    const par = rig.parent[j], up = par != null && isJoint.has(par);
    restW.set(j, (up ? restW.get(par).clone() : new Quaternion()).multiply(q0(j)));
    posedW.set(j, (up ? posedW.get(par).clone() : new Quaternion()).multiply(q(j)));
    const delta = posedW.get(j).clone().multiply(restW.get(j).clone().invert());
    newW.set(j, turnQ(delta).multiply(restW.get(j)));
    const local = (up ? newW.get(par).clone().invert() : new Quaternion()).multiply(newW.get(j)).normalize();
    const t0 = gltf.nodes[j].translation || [0, 0, 0];
    let tr = t0;
    if (!up) { const pt = pose.get(j)?.t || t0; tr = [t0[0] - (pt[0] - t0[0]), pt[1], t0[2] - (pt[2] - t0[2])]; }
    out.set(j, { t: tr, r: local.toArray() });
  }
  return out;
}

export function fixBind(gltf, bin) {
  const turnedErr = bindError(gltf, bin, TURN), okErr = bindError(gltf, bin);
  if (okErr < 1e-4) return { changed: false, okErr };
  if (turnedErr > 1e-4) throw new Error(`bind is neither identity nor the 180-degree turn (err ${okErr}, ${turnedErr})`);
  const rig = restRig(gltf);
  // Compute every new legacy-clip value first (reads the old data), then write.
  const writes = [];
  for (const name of LEGACY) {
    const anim = gltf.animations.find(a => a.name === name); if (!anim) continue;
    for (const c of anim.channels) {
      if (c.target.path === 'scale') continue;   // scales are unchanged (and ~1)
      const s = anim.samplers[c.sampler], times = view(gltf, bin, s.input), n = c.target.path === 'rotation' ? 4 : 3;
      const vals = new Float32Array(times.length * n);
      times.forEach((t, k) => {
        const v = turnedPose(gltf, bin, anim, t, rig).get(c.target.node)[c.target.path === 'rotation' ? 'r' : 't'];
        vals.set(v, k * n);
      });
      if (n === 4) for (let k = 1; k < times.length; k++) {   // keep consecutive keys in one hemisphere
        let d = 0; for (let i = 0; i < 4; i++) d += vals[k * 4 + i] * vals[(k - 1) * 4 + i];
        if (d < 0) for (let i = 0; i < 4; i++) vals[k * 4 + i] *= -1;
      }
      writes.push({ anim, c, vals });
    }
  }
  // New accessors appended at the end of the buffer (outputs may be shared between channels).
  const chunks = [bin]; let offset = bin.byteLength;
  const push = (arr, type) => {
    const pad = (4 - offset % 4) % 4; if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    chunks.push(new Uint8Array(arr.buffer.slice(0)));
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength }); offset += arr.byteLength;
    gltf.accessors.push({ bufferView: gltf.bufferViews.length - 1, componentType: 5126, count: arr.length / COMPONENTS[type], type });
    return gltf.accessors.length - 1;
  };
  for (const { anim, c, vals } of writes) {
    const s = anim.samplers[c.sampler];
    anim.samplers.push({ input: s.input, interpolation: s.interpolation, output: push(vals, vals.length % 4 === 0 && c.target.path === 'rotation' ? 'VEC4' : 'VEC3') });
    c.sampler = anim.samplers.length - 1;
  }
  // IBM * Ry(180): flip the x and z columns. The IBM accessor is used by the skin only.
  const ibmOld = view(gltf, bin, gltf.skins[0].inverseBindMatrices), ibm = new Float32Array(ibmOld.length);
  for (let k = 0; k < ibm.length / 16; k++) {
    const m = new Matrix4().fromArray(ibmOld, k * 16).multiply(TURN);
    ibm.set(m.elements, k * 16);
  }
  gltf.skins[0].inverseBindMatrices = push(ibm, 'MAT4');
  const out = new Uint8Array(offset); let o = 0; for (const ch of chunks) { out.set(ch, o); o += ch.byteLength; }
  gltf.buffers[0].byteLength = out.byteLength;
  // Drop samplers no channel uses any more.
  for (const anim of gltf.animations) {
    const used = [...new Set(anim.channels.map(c => c.sampler))].sort((a, b) => a - b), map = new Map(used.map((s, i) => [s, i]));
    anim.samplers = used.map(s => anim.samplers[s]); anim.channels.forEach(c => { c.sampler = map.get(c.sampler); });
  }
  return { changed: true, gltf, bin: out, okErr: bindError(gltf, out) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  for (const file of FILES) {
    const gltf = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));
    const bin = new Uint8Array(readFileSync(new URL(gltf.buffers[0].uri, DIR)));
    if (check) { console.log(file, 'bind error vs identity', bindError(gltf, bin).toExponential(2)); continue; }
    const r = fixBind(gltf, bin);
    if (!r.changed) { console.log(file, 'already fixed'); continue; }
    writeFileSync(new URL(file, DIR), JSON.stringify(r.gltf));
    writeFileSync(new URL(gltf.buffers[0].uri, DIR), r.bin);
    console.log(file, 'bind fixed; residual', r.okErr.toExponential(2));
  }
}
