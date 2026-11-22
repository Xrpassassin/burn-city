#!/usr/bin/env node
// Gas Mask Guy locomotion clips, authored straight onto the exported rig. ANIMATION ONLY.
//
//   node scripts/player-avatar/author_gait.mjs           rewrite Walk/Run/Sprint/Air in the three player glTFs
//   node scripts/player-avatar/author_gait.mjs --check   author in memory, print foot-slip report, write nothing
//
// Why this exists: build_player.py bakes clips together with the mesh, rig and skin weights, so
// rerunning it (or a reskin pass) regenerates weights and rest pose, which is how earlier "fixes"
// broke the model. This script never touches meshes, skins, joints, weights, inverseBindMatrices,
// node rest transforms or textures: it reads the rig's rest pose from the glTF nodes, poses the
// skeleton with a physically based, distance-driven gait (IK legs with heel-strike -> foot-flat ->
// heel-rise -> toe-off, swing with knee drive, pelvis rotation/list/shift and vertical bob,
// counter-rotating chest, forward lean, arm swing with elbow lag, head stabilised), and writes only
// new animation samplers/accessors (CUBICSPLINE) into the existing files. Idle/Jump/Sit/Ride are
// copied byte for byte. client/js/default-player-avatar-model.test.mjs proves the model is unchanged.
//
// Every clip starts at left-foot contact and has right-foot contact at half cycle; strides and
// durations come from client/js/player-gait.mjs, which the runtime uses to drive phase by distance.
// Run scripts/player-avatar/fix_bind.mjs, fix_limb_joints.mjs and fix_weights.mjs first (bind, pivots, weights).
// In-house procedural motion (no third-party animation data).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const THREE = await import(new URL('client/vendor/three/build/three.module.min.js', ROOT).href);
const { GAIT_CLIPS } = await import(new URL('client/js/player-gait.mjs', ROOT).href);
const { Vector3, Quaternion, Matrix4, Object3D } = THREE;

const DIR = new URL('client/assets/players/', ROOT);
const FILES = ['gas-mask-guy.gltf', 'gas-mask-guy-lod.gltf', 'gas-mask-guy-body.gltf'];
const AUTHORED = ['Walk', 'Run', 'Sprint', 'Air'];
const FPS = 24;
const TAU = Math.PI * 2;
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);   // model: +Z forward, +X left
const clamp01 = u => Math.min(1, Math.max(0, u));
const smooth = u => { u = clamp01(u); return u * u * (3 - 2 * u); };
const minJerk = u => { u = clamp01(u); return u * u * u * (10 - 15 * u + 6 * u * u); };
const lerp = (a, b, t) => a + (b - a) * t;

// Gait parameters (model units, radians). Pitch > 0 = toes down. Arm swing > 0 = forward.
// footZ: where the mid-foot is at mid-stance, forward of the hip joints. (The hip joints moved 16.5 cm back to
// the middle of the thighs in fix_limb_joints.mjs, Nov 2026; footZ grew by the same amount so the feet land
// exactly where they did.)
const PARAMS = {
  Walk: {
    duty: .62, width: .085, footZ: .045, kneeOut: .06,
    strike: { pivot: 'heel', pitch: -.30, rocker: .13 }, flatUntil: .52, toeOff: .85,
    swing: { kind: 'walk', lift: .085, dorsi: -.16, match: [.4, 1], land: .9, liftPow: .6 },
    bob: { kind: 'pendulum', sink: .018, kneeBase: .9975, kneeLoad: .989 },
    hips: { yaw: .085, list: .055, shift: .016, tilt: .03 },
    spine: { lean: .025, chestUp: .035, chestYaw: .11, chestList: .03, bounce: 0 },
    head: { pitch: -.02 },
    arm: { swing: .34, center: -.04, lag: .05, adduct: .13, elbow: .22, elbowSwing: .30 }
  },
  Run: {
    duty: .27, width: .07, footZ: -.035, kneeOut: .05,
    strike: { pivot: 'heel', pitch: -.13, rocker: .10 }, flatUntil: .40, toeOff: .86,
    swing: { kind: 'run', kick: .42, high: .14, dorsi: -.22, match: [.45, 1], land: .92 },
    bob: { kind: 'spring', amp: .035, kneeMid: .64 },
    hips: { yaw: .11, list: .035, shift: .01, tilt: .09 },
    spine: { lean: .07, chestUp: .02, chestYaw: .12, chestList: .02, bounce: .025 },
    head: { pitch: -.05 },
    arm: { swing: .55, center: .02, lag: .04, adduct: .14, elbow: 1.2, elbowSwing: .28 }
  },
  Sprint: {
    duty: .19, width: .055, footZ: -.055, kneeOut: .04,
    strike: { pivot: 'ball', pitch: .24, settle: .07, settleAt: .35 }, flatUntil: .35, toeOff: 1.0,
    swing: { kind: 'run', kick: .46, high: .2, dorsi: -.24, match: [.35, 1], land: .92 },
    bob: { kind: 'spring', amp: .03, kneeMid: .62 },
    hips: { yaw: .13, list: .025, shift: .006, tilt: .10 },
    spine: { lean: .09, chestUp: 0, chestYaw: .14, chestList: .015, bounce: .03 },
    head: { pitch: -.1 },
    arm: { swing: .85, center: .06, lag: .03, adduct: .14, elbow: 1.4, elbowSwing: .28 }
  }
};

// ---------- glTF in / out ----------
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAY = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array };
function readAccessor(gltf, bin, index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView], T = ARRAY[a.componentType];
  const n = COMPONENTS[a.type], start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || n * T.BYTES_PER_ELEMENT;
  const out = new T(a.count * n);
  for (let i = 0; i < a.count; i++) {
    const row = new T(bin.buffer, bin.byteOffset + start + i * stride, n);
    out.set(row, i * n);
  }
  return out;
}

// The skin bind is exact (jointWorld * IBM = identity at rest, see fix_bind.mjs), so the visible
// mesh sits on the joints and posing the real rig is posing the body. The glTF scene has the body
// facing -Z; the authoring frame below turns it half a turn so model space is +Z forward, +X the
// model's left, +Y up (the boot on foot.L is then on the model's right: names are just labels).
function buildRig(gltf) {
  const objs = gltf.nodes.map(n => {
    const o = new Object3D(); o.name = n.name || '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  gltf.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const root = new Object3D();   // model space = the glTF scene turned 180 deg: +Z forward, +X the model's left, +Y up
  root.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
  for (const i of gltf.scenes[gltf.scene || 0].nodes) root.add(objs[i]);
  root.updateMatrixWorld(true);
  const byName = {};
  objs.forEach((o, i) => { byName[o.name] = { o, i }; });
  return { root, objs, byName };
}

// Heel / ball / toe points of each boot from the skinned mesh in bind pose, in the foot bone's frame.
function soleGeometry(gltf, bin, rig) {
  const skin = gltf.skins[0], prim = gltf.meshes[0].primitives[0];
  const P = readAccessor(gltf, bin, prim.attributes.POSITION);
  const J = readAccessor(gltf, bin, prim.attributes.JOINTS_0);
  const W = readAccessor(gltf, bin, prim.attributes.WEIGHTS_0);
  const IBM = readAccessor(gltf, bin, skin.inverseBindMatrices);
  // A skinned vertex lands at jointWorld * IBM * v (glTF spec, and three.js with its attached bind).
  const jm = skin.joints.map((node, k) => rig.objs[node].matrixWorld.clone().multiply(new Matrix4().fromArray(IBM, k * 16)));
  const out = {};
  for (const side of ['L', 'R']) {
    const node = rig.byName['foot.' + side].i, k = skin.joints.indexOf(node), foot = rig.objs[node];
    const pts = [], v = new Vector3(), acc = new Vector3();
    for (let i = 0; i < P.length / 3; i++) {
      let w = 0; for (let c = 0; c < 4; c++) if (J[i * 4 + c] === k) w += W[i * 4 + c];
      if (w < .5) continue;
      acc.set(0, 0, 0);
      for (let c = 0; c < 4; c++) { const wc = W[i * 4 + c]; if (wc) acc.addScaledVector(v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(jm[J[i * 4 + c]]), wc); }
      pts.push(acc.clone());
    }
    const minY = Math.min(...pts.map(p => p.y));
    const sole = pts.filter(p => p.y < minY + .025);
    const zs = sole.map(p => p.z), heelZ = Math.min(...zs), toeZ = Math.max(...zs);
    const cx = sole.reduce((s, p) => s + p.x, 0) / sole.length;
    const ground = minY;
    const heel = new Vector3(cx, ground, heelZ + .015), toe = new Vector3(cx, ground, toeZ - .01);
    const ball = heel.clone().lerp(toe, .72);
    const inv = new Matrix4().copy(foot.matrixWorld).invert();
    out[side] = {
      ground, heelW: heel, ballW: ball, toeW: toe,
      heel: heel.clone().applyMatrix4(inv), ball: ball.clone().applyMatrix4(inv), toe: toe.clone().applyMatrix4(inv)
    };
  }
  return out;
}

// ---------- posing helpers ----------
const _q = new Quaternion(), _q2 = new Quaternion(), _v = new Vector3(), _v2 = new Vector3();
function worldQ(o, out = new Quaternion()) { return o.getWorldQuaternion(out); }
function setWorldQ(o, q) {
  o.parent.getWorldQuaternion(_q2).invert();
  o.quaternion.copy(_q2.multiply(q));
  o.updateMatrixWorld(true);
}
function rotWorld(o, axis, angle) {
  if (!angle) return;
  const q = new Quaternion().setFromAxisAngle(axis, angle).multiply(worldQ(o));
  setWorldQ(o, q);
}
function aim(o, target) {
  const pos = o.getWorldPosition(new Vector3());
  const cur = new Vector3(0, 1, 0).applyQuaternion(worldQ(o));
  const want = target.clone().sub(pos).normalize();
  setWorldQ(o, new Quaternion().setFromUnitVectors(cur, want).multiply(worldQ(o)));
}

function author(gltf, bin) {
  const rig = buildRig(gltf), B = n => rig.byName[n].o;
  const bones = gltf.skins[0].joints.map(i => rig.objs[i]).filter(o => o.name !== 'neutral_bone');
  const rest = new Map(bones.map(o => [o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }]));
  const restWorldQ = new Map(bones.map(o => [o, worldQ(o)]));
  const restWorldP = new Map(bones.map(o => [o, o.getWorldPosition(new Vector3())]));
  const sole = soleGeometry(gltf, bin, rig);
  const resetRest = () => { for (const [o, r] of rest) { o.position.copy(r.p); o.quaternion.copy(r.q); o.scale.copy(r.s); } rig.root.updateMatrixWorld(true); };
  const len = (a, b) => restWorldP.get(B(a)).distanceTo(restWorldP.get(B(b)));
  const legs = ['L', 'R'].map((sd, i) => ({
    sd, i, sign: Math.sign(restWorldP.get(B('foot.' + sd)).x), thigh: B('thigh.' + sd), shin: B('shin.' + sd), foot: B('foot.' + sd),
    a: len('thigh.' + sd, 'shin.' + sd), b: len('shin.' + sd, 'foot.' + sd),
    ankleRest: restWorldP.get(B('foot.' + sd)), sole: sole[sd]
  }));
  for (const L of legs) {
    // Contact points relative to the ankle with the foot in its rest (flat) orientation, ground at y=0.
    L.rel = {};
    for (const k of ['heel', 'ball', 'toe']) L.rel[k] = L.sole[k + 'W'].clone().sub(L.ankleRest);
    L.rel.mid = L.rel.heel.clone().lerp(L.rel.ball, .5);
    L.ankleY = L.ankleRest.y - L.sole.ground;   // ankle height when the sole is flat on y=0
  }
  const ground = Math.min(sole.L.ground, sole.R.ground);
  const hipZ = (restWorldP.get(B('thigh.L')).z + restWorldP.get(B('thigh.R')).z) / 2;   // hip joints, fore-aft

  // Ankle position when the foot, pitched by `pitch` about its lateral axis, touches the ground at `pivot`.
  function ankleAbout(L, pivotPoint, relKey, pitch) {
    const r = L.rel[relKey].clone().applyAxisAngle(X, pitch);
    return pivotPoint.clone().sub(r);
  }
  function stance(L, P, p, stride) {
    const s = p / P.duty;
    // Mid-foot point slides back at exactly ground speed: stride per cycle.
    const zMid = hipZ + P.footZ + stride * (P.duty / 2 - p);
    const flatAnkle = new Vector3(L.sign * P.width, L.ankleY + ground, zMid - L.rel.mid.z);
    const ground3 = k => flatAnkle.clone().add(L.rel[k]).setY(ground);
    const S = P.strike;
    if (S.pivot === 'ball') {   // forefoot strike: the ball is planted the whole stance
      let pitch;
      if (s < S.settleAt) pitch = lerp(S.pitch, S.settle, smooth(s / S.settleAt));
      else pitch = lerp(S.settle, P.toeOffPitch, Math.pow(smooth((s - S.settleAt) / (1 - S.settleAt)), 1.1));
      return { ankle: ankleAbout(L, ground3('toe'), 'toe', pitch), pitch };
    }
    if (s < S.rocker) { const pitch = S.pitch * (1 - smooth(s / S.rocker)); return { ankle: ankleAbout(L, ground3('heel'), 'heel', pitch), pitch }; }
    if (s < P.flatUntil) return { ankle: flatAnkle, pitch: 0 };
    const pitch = P.toeOffPitch * Math.pow(smooth((s - P.flatUntil) / (1 - P.flatUntil)), 1.15);
    return { ankle: ankleAbout(L, ground3('toe'), 'toe', pitch), pitch };
  }
  function legTarget(L, P, p, stride) {
    if (p < P.duty) return stance(L, P, p, stride);
    const w = (p - P.duty) / (1 - P.duty), S = P.swing;
    const a0 = stance(L, P, P.duty - 1e-6, stride), a1 = stance(L, P, 0, stride);
    // Fore-aft: Hermite with end tangents matched (in part) to the ground speed, so the foot leaves and
    // meets the ground without a jerk: a short back-kick after toe-off and a pull-back before landing.
    const travel = -stride * (1 - P.duty);
    // `land` < 1: the foot reaches the air above its landing spot early and then only drops onto it
    // (no forward skid while the heel skims the floor); it is held still over the ground meanwhile.
    const wl = S.land || 1, ww = Math.min(1, w / wl);
    const z0 = a0.ankle.z, z1 = a1.ankle.z + travel * (wl - 1), m0 = travel * S.match[0] * wl, m1 = travel * S.match[1] * wl;
    const h = [2 * ww ** 3 - 3 * ww * ww + 1, ww ** 3 - 2 * ww * ww + ww, -2 * ww ** 3 + 3 * ww * ww, ww ** 3 - ww * ww];
    const ankle = a0.ankle.clone().lerp(a1.ankle, smooth(ww));
    ankle.z = w < wl ? h[0] * z0 + h[1] * m0 + h[2] * z1 + h[3] * m1 : a1.ankle.z + travel * (w - 1);
    if (S.kind === 'walk') {
      ankle.y += S.lift * Math.sin(Math.PI * Math.pow(w, S.liftPow || .8)) ** 2 * 1.15;   // squared: the foot lifts off and sets down with zero vertical speed
      ankle.x += L.sign * .012 * Math.sin(Math.PI * w);
    } else {
      // Running: heel kicks up toward the seat, then the knee drives through and the shin unfolds to land.
      const t = w, u = 1 - t, y0 = a0.ankle.y, y1 = a1.ankle.y;
      ankle.y = y0 * u * u * u + (y0 + S.kick) * 3 * u * u * t + (y1 + S.high) * 3 * u * t * t + y1 * t * t * t;
      ankle.x += L.sign * .008 * Math.sin(Math.PI * w);
    }
    const pitch = a0.pitch * (1 - smooth(w / .4)) + S.dorsi * Math.sin(Math.PI * clamp01(w / .85)) ** 2 + a1.pitch * smooth((w - .55) / (wl - .55));
    return { ankle, pitch };
  }

  function poseTrunk(P, u, dy) {
    resetRest();
    // s0: side of the leg that lands at u = 0, so "+" below means toward / forward on that side.
    const s0 = legs[0].sign;
    const c = Math.cos(TAU * u) * s0, s = Math.sin(TAU * u) * s0, s2 = Math.cos(2 * TAU * (u - P.duty / 2));
    const hips = B('hips');
    const hp = restWorldP.get(hips).clone().add(new Vector3(P.hips.shift * s, dy, 0));
    hips.position.copy(hips.parent.worldToLocal(hp));
    const R = new Quaternion().setFromAxisAngle(Y, -P.hips.yaw * c)
      .multiply(new Quaternion().setFromAxisAngle(Z, P.hips.list * Math.sin(TAU * (u - .04))))
      .multiply(new Quaternion().setFromAxisAngle(X, P.hips.tilt));
    setWorldQ(hips, R.multiply(restWorldQ.get(hips)));
    const spine = B('spine'), chest = B('chest');
    rotWorld(spine, X, P.spine.lean * .5 - P.hips.tilt * .35);
    rotWorld(spine, Y, .45 * P.spine.chestYaw * c + .5 * P.hips.yaw * c);
    rotWorld(chest, X, P.spine.lean * .5 - P.spine.chestUp + P.spine.bounce * s2);
    rotWorld(chest, Y, .55 * P.spine.chestYaw * c + .5 * P.hips.yaw * c);
    rotWorld(chest, Z, -P.spine.chestList * s);
    // Head: neck takes half the trunk motion back, the head keeps the gaze level and forward.
    const neck = B('neck'), head = B('head');
    setWorldQ(neck, worldQ(neck).slerp(restWorldQ.get(neck), .5));
    const look = new Quaternion().setFromAxisAngle(Y, -.25 * (P.spine.chestYaw - P.hips.yaw) * c)
      .multiply(new Quaternion().setFromAxisAngle(X, -P.head.pitch));
    setWorldQ(head, look.multiply(restWorldQ.get(head)));
  }
  function solveLeg(L, P, target) {
    const hip = L.thigh.getWorldPosition(new Vector3());
    const ray = target.ankle.clone().sub(hip), dist = ray.length(), dir = ray.clone().normalize();
    const reach = Math.min(dist, L.a + L.b - 1e-4);
    const along = (L.a * L.a - L.b * L.b + reach * reach) / (2 * reach);
    const fwd = new Vector3(L.sign * P.kneeOut, 0, 1).normalize();
    const bend = fwd.sub(dir.clone().multiplyScalar(fwd.dot(dir))).normalize();
    const knee = hip.clone().addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, L.a * L.a - along * along)));
    aim(L.thigh, knee);
    aim(L.shin, hip.clone().addScaledVector(dir, reach));
    setWorldQ(L.foot, new Quaternion().setFromAxisAngle(X, target.pitch).multiply(restWorldQ.get(L.foot)));
    return dist - reach;   // > 0: the foot could not be reached (would float)
  }
  function poseArms(P, u) {
    const chest = B('chest');
    const delta = worldQ(chest).multiply(restWorldQ.get(chest).clone().invert());
    const xc = X.clone().applyQuaternion(delta), zc = Z.clone().applyQuaternion(delta);
    for (const sd of ['L', 'R']) {
      const ua = B('upperarm.' + sd), fa = B('forearm.' + sd);
      const sign = Math.sign(restWorldP.get(ua).x), same = sign === legs[0].sign ? 1 : -1;
      const k = -same * Math.cos(TAU * (u - P.arm.lag));          // +1 = this arm fully forward
      const swing = P.arm.center + P.arm.swing * k;
      rotWorld(ua, zc, -sign * P.arm.adduct);
      rotWorld(ua, xc, -swing);
      const lagK = -same * Math.cos(TAU * (u - P.arm.lag - .07));  // the elbow lags the shoulder
      const flex = P.arm.elbow + P.arm.elbowSwing * Math.max(0, lagK) - .06 * Math.max(0, -lagK);
      rotWorld(fa, xc, -flex);   // elbow flexes in the chest's sagittal plane: forearm comes forward and up
      // Running hands come in toward the midline in front of the body.
      if (P.arm.elbow > 1) rotWorld(fa, Y, -sign * .1 * Math.max(0, k));
    }
  }

  // Pelvis height for a clip: largest hip drop that keeps every planted foot reachable (no float).
  function capAt(P, u, stride, kneeFactor) {
    poseTrunk(P, u, 0);
    let lim = Infinity;
    for (const L of legs) {
      const p = ((u - L.i * .5) % 1 + 1) % 1;
      if (p >= P.duty) continue;
      const t = legTarget(L, P, p, stride), hip = L.thigh.getWorldPosition(new Vector3());
      const r = (L.a + L.b) * kneeFactor(p / P.duty);
      const h2 = r * r - (t.ankle.x - hip.x) ** 2 - (t.ankle.z - hip.z) ** 2;
      lim = Math.min(lim, t.ankle.y + Math.sqrt(Math.max(0, h2)) - hip.y);
    }
    return lim;
  }
  const knee = flex => Math.cos(flex / 2);   // hip-ankle distance factor for a knee flexed by `flex` (equal segments)

  function makeClip(name) {
    const P = { ...PARAMS[name] }, G = GAIT_CLIPS[name];
    P.toeOffPitch = P.toeOff;
    const N = 2 * Math.max(12, Math.round(G.duration * FPS / 2)), stride = G.stride;   // even (both steps share one pelvis path), >= 24 keys per cycle
    const cap = [], dys = [];
    if (P.bob.kind === 'pendulum') {
      const kf = s => P.bob.kneeBase - (P.bob.kneeBase - P.bob.kneeLoad) * Math.exp(-(((s - .14) / .09) ** 2));
      for (let k = 0; k < N; k++) cap.push(capAt(P, k / N, stride, kf));
      const sym = cap.map((c, k) => Math.min(c, cap[(k + N / 2) % N]));
      const mid = Math.max(...sym) - P.bob.sink;
      const raw = sym.map(c => Math.min(mid, c));
      for (let k = 0; k < N; k++) {
        let avg = 0; for (const [j, w] of [[-2, .1], [-1, .2], [0, .4], [1, .2], [2, .1]]) avg += raw[(k + j + N) % N] * w;
        dys.push(Math.min(avg, sym[k]) - .002);
      }
    } else {
      // Spring-mass running: lowest at mid-stance (knee flexed ~kneeMid), highest in flight.
      const loose = () => .999;
      for (let k = 0; k < N; k++) cap.push(capAt(P, k / N, stride, loose));
      const midCap = capAt(P, P.duty / 2, stride, () => knee(P.bob.kneeMid));
      const base = midCap + P.bob.amp;
      let raw = [];
      for (let k = 0; k < N; k++) raw.push(Math.min(base - P.bob.amp * Math.cos(2 * TAU * (k / N - P.duty / 2)), cap[k]));
      for (let pass = 0; pass < 3; pass++) {
        raw = raw.map((_, k) => { let a = 0; for (const [j, w] of [[-1, .25], [0, .5], [1, .25]]) a += raw[(k + j + N) % N] * w; return Math.min(a, cap[k]); });
      }
      for (let k = 0; k < N; k++) dys.push(raw[k] - .002);
    }
    // Pelvis height between keys: periodic Catmull-Rom through the solved values.
    const dyAt = x => {
      const i = Math.floor(x), f = x - i, g = j => dys[((i + j) % N + N) % N];
      const p0 = g(-1), p1 = g(0), p2 = g(1), p3 = g(2);
      return .5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
    };
    let float = 0;
    const poseAt = (u, k) => {
      u = (u % 1 + 1) % 1;
      poseTrunk(P, u, dyAt(u * N));
      for (const L of legs) {
        const p = ((u - L.i * .5) % 1 + 1) % 1;
        const miss = solveLeg(L, P, legTarget(L, P, p, stride));
        if (k != null && p < P.duty) { float = Math.max(float, miss); if (process.env.GAIT_DEBUG && miss > .002) console.log(name, k, L.sd, p.toFixed(2), (miss * 1000).toFixed(0) + 'mm'); }
      }
      poseArms(P, u);
      return snapshot();
    };
    // Keys carry exact time derivatives (central difference on the continuous pose), so the cubic
    // curve between keys follows the solved motion and the planted boot stays put between samples too.
    const E = 1e-3, frames = [];
    for (let k = 0; k <= N; k++) {
      const u = (k % N) / N, f = poseAt(u, k);
      f.minus = poseAt(u - E); f.plus = poseAt(u + E); f.dt = 2 * E * G.duration;
      frames.push(f);
    }
    return { name, duration: G.duration, stride, frames, float };
  }

  function makeAir() {
    // Airborne: knees tucked, one leg leading, arms out for balance; a slow breath of motion.
    const N = 24, duration = 1.0, frames = [];
    for (let k = 0; k <= N; k++) {
      const u = (k % N) / N, b = Math.sin(TAU * u);
      resetRest();
      const P = { ...PARAMS.Run, hips: { yaw: .04, list: 0, shift: 0, tilt: .06 }, spine: { lean: .03, chestUp: .02, chestYaw: .05, chestList: 0, bounce: 0 } };
      poseTrunk(P, .25, .02 + .01 * b);
      for (const L of legs) {
        const hip = L.thigh.getWorldPosition(new Vector3());
        const lead = L.i === 0;
        const ankle = hip.clone().add(new Vector3(L.sign * .02, lead ? -.58 + .01 * b : -.6 - .01 * b, lead ? .14 : -.18));
        solveLeg(L, { kneeOut: .05 }, { ankle, pitch: lead ? .18 : .45 });
      }
      const chest = B('chest');
      const delta = worldQ(chest).multiply(restWorldQ.get(chest).clone().invert());
      const xc = X.clone().applyQuaternion(delta), zc = Z.clone().applyQuaternion(delta);
      for (const sd of ['L', 'R']) {
        const ua = B('upperarm.' + sd), fa = B('forearm.' + sd), sign = Math.sign(restWorldP.get(ua).x);
        rotWorld(ua, zc, sign * (.10 + .02 * b));   // arms only slightly out: the scan's sleeves are fused to the coat sides, so a wide spread opens a web of skin
        rotWorld(ua, xc, -(sd === 'L' ? .25 : -.1));
        rotWorld(fa, xc, -.55);
      }
      frames.push(snapshot());
    }
    return { name: 'Air', duration, stride: 0, frames, float: 0 };
  }

  function snapshot() {   // local TRS keys of every skin joint (parents first), straight off the posed rig
    return bones.map(o => ({ name: o.name, q: o.quaternion.toArray(), p: o.position.toArray() }));
  }

  const clips = ['Walk', 'Run', 'Sprint'].map(makeClip);
  clips.push(makeAir());
  return { clips, bones, rig, legs, sole, restWorldQ };
}

// ---------- foot-slip check (model space, body moving forward at stride/duration) ----------
function slipReport(gltf, bin, clip) {
  const rig = buildRig(gltf);
  const feet = ['L', 'R'].map(sd => rig.byName['foot.' + sd].o);
  const sole = soleGeometry(gltf, bin, rig);
  let worst = 0, sumSlip = 0, sumTravel = 0;
  const pts = [];
  const N = clip.frames.length - 1;
  for (let k = 0; k <= N; k++) {
    for (const b of clip.frames[k]) { const o = rig.byName[b.name].o; o.quaternion.fromArray(b.q); o.position.fromArray(b.p); }
    rig.root.updateMatrixWorld(true);
    const travel = clip.stride * k / N;
    pts.push(feet.map((f, i) => {
      const s = sole[i ? 'R' : 'L'], g = Math.min(sole.L.ground, sole.R.ground);
      return ['heel', 'ball', 'toe'].map(key => { const p = s[key].clone().applyMatrix4(f.matrixWorld); return { y: p.y - g, x: p.x, z: p.z + travel }; });
    }));
  }
  // A contact point that is on the ground (< 12 mm) in two consecutive frames must not move.
  for (let k = 0; k < N; k++) for (let i = 0; i < 2; i++) {
    let step = 0, planted = false;
    for (let c = 0; c < 3; c++) {
      const a = pts[k][i][c], b = pts[k + 1][i][c];
      if (a.y < .012 && b.y < .012) { planted = true; step = Math.max(step, Math.hypot(b.x - a.x, b.z - a.z)); }
    }
    if (planted) { worst = Math.max(worst, step); sumSlip += step; sumTravel += clip.stride / N; }
  }
  return { worstStep: worst, slipRatio: sumTravel ? sumSlip / sumTravel : 0 };
}

// ---------- write ----------
function encodeClip(clip, gltf, nodeIndex, pushData) {
  const N = clip.frames.length - 1, dt = clip.duration / N;
  const times = Float32Array.from({ length: N + 1 }, (_, k) => k * dt);
  const timeAcc = pushData(times, 'SCALAR', { min: [0], max: [clip.duration] });
  const twoTimes = pushData(Float32Array.from([0, clip.duration]), 'SCALAR', { min: [0], max: [clip.duration] });
  const channels = [], samplers = [];
  const bones = clip.frames[0].map(b => b.name);
  bones.forEach((name, bi) => {
    // rotation: CUBICSPLINE with Catmull-Rom tangents (periodic), quaternions kept in one hemisphere
    const q = clip.frames.map(f => f[bi].q.slice());
    for (let k = 1; k <= N; k++) { const d = q[k].reduce((s, v, j) => s + v * q[k - 1][j], 0); if (d < 0) q[k] = q[k].map(v => -v); }
    const out = new Float32Array((N + 1) * 12);
    const align = (v, ref) => (v.reduce((s, x, j) => s + x * ref[j], 0) < 0 ? v.map(x => -x) : v);
    for (let k = 0; k <= N; k++) {
      // periodic Catmull-Rom tangent (per second, as glTF CUBICSPLINE expects)
      const f = clip.frames[k];
      const p = f.minus ? align(f.minus[bi].q, q[k]) : align(q[k === 0 ? N - 1 : k - 1], q[k]);
      const n = f.plus ? align(f.plus[bi].q, q[k]) : align(q[k === N ? 1 : k + 1], q[k]);
      const tan = q[k].map((_, j) => (n[j] - p[j]) / (f.minus ? f.dt : 2 * dt));
      out.set(tan, k * 12); out.set(q[k], k * 12 + 4); out.set(tan, k * 12 + 8);
    }
    const rOut = pushData(out, 'VEC4');
    samplers.push({ input: timeAcc, interpolation: 'CUBICSPLINE', output: rOut });
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex[name], path: 'rotation' } });
    // translation: animated on the hips (bob/shift), constant rest elsewhere
    const p = clip.frames.map(f => f[bi].p);
    const moving = p.some(v => Math.hypot(v[0] - p[0][0], v[1] - p[0][1], v[2] - p[0][2]) > 1e-6);
    if (moving) {
      const tout = new Float32Array((N + 1) * 9);
      for (let k = 0; k <= N; k++) {
        const f = clip.frames[k];
        const pv = f.minus ? f.minus[bi].p : p[k === 0 ? N - 1 : k - 1], nv = f.plus ? f.plus[bi].p : p[k === N ? 1 : k + 1];
        const tan = p[k].map((_, j) => (nv[j] - pv[j]) / (f.minus ? f.dt : 2 * dt));
        tout.set(tan, k * 9); tout.set(p[k], k * 9 + 3); tout.set(tan, k * 9 + 6);
      }
      samplers.push({ input: timeAcc, interpolation: 'CUBICSPLINE', output: pushData(tout, 'VEC3') });
    } else {
      samplers.push({ input: twoTimes, interpolation: 'LINEAR', output: pushData(Float32Array.from([...p[0], ...p[0]]), 'VEC3') });
    }
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex[name], path: 'translation' } });
  });
  const extras = { author: 'scripts/player-avatar/author_gait.mjs', cycle: 'left contact at 0, right contact at 0.5' };
  if (clip.stride) extras.stride = clip.stride;
  return { name: clip.name, channels, samplers, extras };
}

function rewrite(gltf, bin, clips) {
  // Drop the old versions of the authored clips, then compact: every remaining accessor keeps its exact bytes.
  const keepAnims = gltf.animations.filter(a => !AUTHORED.includes(a.name));
  const used = new Set();
  for (const m of gltf.meshes) for (const p of m.primitives) { Object.values(p.attributes).forEach(i => used.add(i)); if (p.indices != null) used.add(p.indices); for (const t of p.targets || []) Object.values(t).forEach(i => used.add(i)); }
  for (const s of gltf.skins) if (s.inverseBindMatrices != null) used.add(s.inverseBindMatrices);
  for (const a of keepAnims) for (const s of a.samplers) { used.add(s.input); used.add(s.output); }
  const viewsByImage = new Set((gltf.images || []).filter(i => i.bufferView != null).map(i => i.bufferView));
  const accMap = new Map(), accessors = [], bufferViews = [], chunks = [];
  let offset = 0;
  const align4 = () => { const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; } };
  const viewMap = new Map();
  const copyView = vi => {
    if (viewMap.has(vi)) return viewMap.get(vi);
    const v = gltf.bufferViews[vi]; align4();
    chunks.push(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
    const nv = { ...v, buffer: 0, byteOffset: offset }; offset += v.byteLength;
    bufferViews.push(nv); viewMap.set(vi, bufferViews.length - 1); return bufferViews.length - 1;
  };
  gltf.accessors.forEach((a, i) => {
    if (!used.has(i)) return;
    accessors.push({ ...a, bufferView: copyView(a.bufferView) }); accMap.set(i, accessors.length - 1);
  });
  for (const vi of viewsByImage) copyView(vi);
  const remapImageViews = (gltf.images || []).map(img => img.bufferView != null ? { ...img, bufferView: viewMap.get(img.bufferView) } : img);
  const pushData = (arr, type, mm = {}) => {
    align4();
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(bytes.slice());
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength }); offset += bytes.byteLength;
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: arr.length / COMPONENTS[type], type, ...mm });
    return accessors.length - 1;
  };
  const meshes = gltf.meshes.map(m => ({ ...m, primitives: m.primitives.map(p => ({
    ...p, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, accMap.get(v)])),
    ...(p.indices != null ? { indices: accMap.get(p.indices) } : {}),
    ...(p.targets ? { targets: p.targets.map(t => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, accMap.get(v)]))) } : {})
  })) }));
  const skins = gltf.skins.map(s => ({ ...s, ...(s.inverseBindMatrices != null ? { inverseBindMatrices: accMap.get(s.inverseBindMatrices) } : {}) }));
  const animations = keepAnims.map(a => ({ ...a, samplers: a.samplers.map(s => ({ ...s, input: accMap.get(s.input), output: accMap.get(s.output) })) }));
  const nodeIndex = Object.fromEntries(gltf.nodes.map((n, i) => [n.name, i]));
  for (const c of clips) animations.push(encodeClip(c, gltf, nodeIndex, pushData));
  align4();
  const out = new Uint8Array(offset); let o = 0; for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  const next = { ...gltf, accessors, bufferViews, meshes, skins, animations, images: gltf.images ? remapImageViews : undefined, buffers: [{ ...gltf.buffers[0], byteLength: out.byteLength }] };
  if (!gltf.images) delete next.images;
  return { json: next, bin: out };
}

export function loadPlayer(file) {
  const gltf = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));
  const bin = new Uint8Array(readFileSync(new URL(gltf.buffers[0].uri, DIR)));
  return { gltf, bin };
}
export { author, slipReport, rewrite, PARAMS };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const outDir = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? new URL(process.argv[i + 1].replace(/\/?$/, '/'), 'file://' + process.cwd() + '/') : DIR; })();
  // One authored set (from the full-detail model's boots) goes into all three files, so LOD swaps never pop.
  const main = loadPlayer(FILES[0]);
  const { clips } = author(main.gltf, main.bin);
  for (const c of clips) {
    if (!c.stride) continue;
    const r = slipReport(main.gltf, main.bin, c);
    console.log(`${c.name.padEnd(6)} frames ${c.frames.length - 1} stride ${c.stride} dur ${c.duration}s  float ${(c.float * 1000).toFixed(1)}mm  slip ${(r.slipRatio * 100).toFixed(2)}%  worst ${(r.worstStep * 1000).toFixed(1)}mm/frame`);
  }
  if (!check) for (const file of FILES) {
    const { gltf, bin } = loadPlayer(file);
    const { json, bin: out } = rewrite(gltf, bin, clips);
    writeFileSync(new URL(file, outDir), JSON.stringify(json));
    writeFileSync(new URL(gltf.buffers[0].uri, outDir), out);
    console.log('wrote', file, out.byteLength, 'bytes');
  }
}
