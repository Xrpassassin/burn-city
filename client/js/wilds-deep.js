// BURN City: The Wilds — the deep area: Glassroot Grove, past the threshold arch at the far end of Fernway Verge.
// LAZY: imported by wilds-gate.js only within ~70 m of the threshold (or on the crossing), built behind the "Deeper into the Cinderwilds"
// veil, unloaded ~30 s after you come back out. While you are inside, wilds-gate.js hides + pauses the whole city (cityOff) — this
// module only builds/runs the deep world. It lives in its own realm off the city map (DEEP in wilds-gate.js), ~3.4x Fernway Verge.
// Everything gameplay (creatures AI, inspect / calm / encounters / binding, companion, NPC talk, quests, HUD, journal, save, music)
// is the existing wilds.js system, run against this world through wilds.js `zoneApi` (setZone). Content: wilds-deep-data.js.
// Perf: dense trees are instanced per 80 m chunk (frustum + distance culled), fog closes in at ~100 m, the camera far plane drops to
// 320 m, and tree colliders are pooled around the player (groundAt walks every collider each step).
import * as THREE from 'three';
import { TEST, DEEP, dEll, colorize, solid, jitter, M, canvasTex, signTex } from './wilds-gate.js';
import { mats } from './wilds-creatures.js';
import { buildWalker, poseWalker } from './walker.js';
import * as DD from './wilds-deep-data.js';

const C = () => window.__city;
const S = { ready: false, active: false, loading: null, root: null, chunks: [], npcs: [], picks: [], tags: [], pool: [], poolAt: null, test: {} };
if (TEST) window.__wildsDeep = S;
let Z = null, ctx = null, rs = 4421; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tierN = (lo, med, hi) => { const t = C().TIER; return t === 'low' ? lo : t === 'medium' ? med : hi; };
// polyline distance (trail / creek), hashed like wilds.js
function sample(pts, step = 2) { const o = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step)); for (let k = 0; k < n; k++) o.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]); } o.push(pts[pts.length - 1]); return o; }
function grid(pts) { const G = new Map(), CS = 10; for (const p of pts) { const k = Math.floor(p[0] / CS) + ',' + Math.floor(p[1] / CS); (G.get(k) || G.set(k, []).get(k)).push(p); }
  return (x, z) => { let b = 1e9; const cx = Math.floor(x / CS), cz = Math.floor(z / CS); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const a = G.get((cx + i) + ',' + (cz + j)); if (a) for (const p of a) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < b) b = d; } } return Math.sqrt(b); }; }
const trailS = sample(DD.TRAIL), creekS = sample(DD.CREEK), dTrail = grid(trailS), dCreek = grid(creekS);
const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const FOG_DAY = new THREE.Color(.11, .17, .15), FOG_NIGHT = new THREE.Color(.02, .045, .04), FOGC = new THREE.Color();
// the zone object wilds.js runs against
const ZONE = { name: 'glassroot', root: null, spawns: [], wakeMsg: 'You wake by Orrick\'s campfire, rested. Nothing was lost.',
  keep(x, z) { const e = dEll(x, z); return e > .9 ? [(DEEP.x - x) / DEEP.rx * 3, (DEEP.z - z) / DEEP.rz * 3] : null; },
  respawn() { const P = C().P; P.pos.set(DD.CAMP.fire.x + 2.5, 0, DD.CAMP.fire.z + 2); P.vel.set(0, 0, 0); C().input.yp.yaw = Math.atan2(-(DD.CAMP.fire.x - P.pos.x), -(DD.CAMP.fire.z - P.pos.z)); },
  interactor: p => interactor(p) };

// ---------------------------------------------------------------- build
const colliders = [];   // static deep colliders that always stay (arches, camp, ruins, stones)
function addStatic(x, z, r, h, nc = true) { const c = { x, z, r, h, nc, wildsDeep: 1 }; C().colliders.push(c); colliders.push(c); Z.obAdd({ x, z, r, deep: 1 }); return c; }
async function build(progress) {
  const c = C(), { MAT, GLOW } = mats(); rs = 4421; S.chunks = []; S.trees = []; S.picks = []; S.npcs = []; colliders.length = 0;
  const step = async (p, l) => { progress(p, l); await yieldFrame(); };
  const root = S.root = ZONE.root = new THREE.Group(); root.name = 'wilds-deep'; root.userData.wildsDeep = 1; c.S.add(root); root.visible = false;
  await step(.05, 'The roots turn to glass…');
  // --- floor: one grid mesh, baked colour (dark moss / root litter / trail / glass-vein glints near the creek)
  { const STEP = tierN(8, 6, 5), R = 440, n = Math.round(2 * R / STEP) + 1, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), keep = new Uint8Array(n * n), cc = new THREE.Color();
    const moss = new THREE.Color(0x12201a), litter = new THREE.Color(0x2a2016), dirt = new THREE.Color(0x4a3a2a), glass = new THREE.Color(0x1f5a50), dark = new THREE.Color(0x060a08);
    const nse = (x, z) => Math.sin(x * .05 + Math.sin(z * .07) * 2) * .5 + Math.sin(z * .043 + x * .021) * .3 + Math.sin(x * .19 + z * .23) * .2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i, x = DEEP.x - R + i * STEP, z = DEEP.z - R + j * STEP, e = dEll(x, z), dt = dTrail(x, z), dc = dCreek(x, z);
      keep[k] = e < 1.07 ? 1 : 0; pos[k * 3] = x; pos[k * 3 + 1] = .03; pos[k * 3 + 2] = z;
      cc.copy(moss).lerp(litter, clamp(.5 + nse(x, z) * .6, 0, 1)); cc.lerp(glass, clamp(1 - dc / 9, 0, 1) * .7); cc.lerp(dirt, clamp(1 - (dt - 1) / 2.2, 0, 1) * .9); cc.lerp(dark, clamp((e - .95) / .1, 0, 1));
      col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b; }
    const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, d = a + n, e2 = d + 1; if (keep[a] || keep[b] || keep[d] || keep[e2]) idx.push(a, d, b, b, d, e2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const floor = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); floor.renderOrder = -2; root.add(floor); }
  // --- the glass creek: a teal ribbon (fogged)
  { const cp = [], ci = []; for (let i = 0; i < creekS.length; i++) { const [x, z] = creekS[i], [x2, z2] = creekS[Math.min(creekS.length - 1, i + 1)], [x0, z0] = creekS[Math.max(0, i - 1)]; let dx = x2 - x0, dz = z2 - z0; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const w = 2.6 + Math.sin(i * .3) * .6;
      cp.push(x + dz * w, .06, z - dx * w, x - dz * w, .06, z + dx * w); if (i) { const a = (i - 1) * 2; ci.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); g.setIndex(ci);
    S.creekMat = new THREE.MeshBasicMaterial({ color: 0x2fb8a0, transparent: true, opacity: .55, depthWrite: false }); const m = new THREE.Mesh(g, S.creekMat); m.renderOrder = 1; root.add(m); }
  await step(.18, 'Growing the old trees…');
  // --- dense trees: tall dark pines + glassroot giants (teal root veins) + charred snags; jittered grid, chunked instancing
  const pineG = M([colorize(new THREE.CylinderGeometry(.016, .028, .3, 6).translate(0, .15, 0), cc => cc.set(0x241a12)),
    ...[0, 1, 2, 3, 4, 5].map(k => colorize(jitter(new THREE.ConeGeometry(.17 - k * .022, .26 - k * .018, 8, 1).translate(0, .24 + k * .12, 0), .1), (cc, x, y) => cc.setRGB(.04 + y * .03, .1 + y * .05, .07 + y * .02)))]);
  const glassG = M([colorize(new THREE.CylinderGeometry(.035, .06, .55, 7).translate(0, .27, 0), cc => cc.set(0x2a2018)),
    ...[0, 1, 2, 3].map(k => colorize(new THREE.CylinderGeometry(.008, .02, .2, 4).rotateZ(1.1).rotateY(k * 1.57).translate(Math.cos(k * 1.57) * .06, .03, -Math.sin(k * 1.57) * .06), cc => cc.set(0x2a2018))),
    ...[[0, .7, 0, .25], [.15, .62, .06, .18], [-.15, .64, -.05, .19], [.03, .6, .17, .17], [-.02, .6, -.17, .17], [.02, .84, .02, .16]].map(([x, y, z, r]) => colorize(jitter(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), .25), (cc, px, py, pz, ny) => cc.setRGB(.05 + ny * .03, .14 + ny * .06, .11 + py * .04)))]);
  const veinG = M([0, 1, 2, 3].map(k => solid(new THREE.BoxGeometry(.006, .006, .14).rotateY(k * 1.57).translate(Math.cos(k * 1.57 + 1.57) * .1, .015, Math.sin(k * 1.57 + 1.57) * .1), 0x5ff0d0)).concat([solid(new THREE.BoxGeometry(.005, .3, .005).translate(.03, .2, .03), 0x5ff0d0)]));
  const snagG = M([colorize(new THREE.CylinderGeometry(.02, .045, .8, 6).translate(0, .4, 0), cc => cc.setRGB(.06, .05, .045)), colorize(new THREE.CylinderGeometry(.008, .015, .28, 4).rotateZ(1).translate(.1, .6, 0), cc => cc.setRGB(.06, .05, .045))]);
  const CELL = tierN(9, 7.2, 6.2), R = 452, CH = 80; const clr = DD.CLEARINGS;
  const byChunk = new Map(), tgrid = S.tgrid = new Map(), TCS = 12;
  for (let gx = DEEP.x - R; gx < DEEP.x + R; gx += CELL) for (let gz = DEEP.z - R; gz < DEEP.z + R; gz += CELL) {
    const x = gx + CELL * (.5 + (rnd() - .5) * .8), z = gz + CELL * (.5 + (rnd() - .5) * .8), e = dEll(x, z); const r0 = rnd(), r1 = rnd(), r2 = rnd();
    if (e > 1.06) continue; const dt = dTrail(x, z); if (dt < 4.6 || dCreek(x, z) < 4.2 || clr.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    if (e < .9 && dt > 9 && r0 < .1) continue;   // a few gaps
    const kind = r1 < .14 ? 'snag' : r1 < .44 ? 'glass' : 'pine', h = kind === 'pine' ? 15 + r2 * 13 : kind === 'glass' ? 13 + r2 * 9 : 7 + r2 * 6;
    const t = { x, z, h, w: h * (kind === 'glass' ? 1 + r0 * .3 : .8 + r0 * .3), yaw: r2 * 6.28, tint: .75 + r0 * .4, kind, r: kind === 'pine' ? .022 * h * .9 + .25 : kind === 'glass' ? .05 * h + .25 : .04 * h + .15 };
    const ck = Math.floor((x - DEEP.x + R) / CH) + ',' + Math.floor((z - DEEP.z + R) / CH); (byChunk.get(ck) || byChunk.set(ck, { cx: 0, cz: 0, t: [] }).get(ck)).t.push(t);
    const gk = Math.floor(x / TCS) + ',' + Math.floor(z / TCS); (tgrid.get(gk) || tgrid.set(gk, []).get(gk)).push(t); S.trees.push(t); Z.obAdd({ x, z, r: t.r, deep: 1 });
  }
  const tmat = Z.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), .35, false, 'tree');   // same program as Fernway Verge's trees
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tc = new THREE.Color();
  const inst = (geo, list, mat, sfn, cfn) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length; list.forEach((t, i) => { q.setFromAxisAngle(up, t.yaw); im.setMatrixAt(i, m4.compose(v.set(t.x, 0, t.z), q, sfn(t))); if (cfn) im.setColorAt(i, cfn(t)); }); im.computeBoundingSphere(); return im; };
  for (const ch of byChunk.values()) { let sx = 0, sz = 0; for (const t of ch.t) { sx += t.x; sz += t.z; } ch.cx = sx / ch.t.length; ch.cz = sz / ch.t.length; ch.g = new THREE.Group(); root.add(ch.g);
    const P = ch.t.filter(t => t.kind === 'pine'), Gl = ch.t.filter(t => t.kind === 'glass'), Sn = ch.t.filter(t => t.kind === 'snag');
    if (P.length) ch.g.add(inst(pineG, P, tmat, t => sc.set(t.w, t.h, t.w), t => tc.setRGB(t.tint, t.tint, t.tint)));
    if (Gl.length) { ch.g.add(inst(glassG, Gl, tmat, t => sc.set(t.w, t.h, t.w), t => tc.setRGB(t.tint * .9, t.tint, t.tint))); ch.g.add(inst(veinG, Gl, GLOW, t => sc.set(t.w, t.h, t.w))); }
    if (Sn.length) ch.g.add(inst(snagG, Sn, MAT, t => sc.setScalar(t.h)));
    S.chunks.push(ch); }
  S.treeCount = S.trees.length;
  await step(.5, 'Old conduits, glass, ruins…');
  // --- crystals (glassroot shards) around roots: one instanced glow mesh
  { const shard = M([0, 1, 2].map(k => solid(new THREE.OctahedronGeometry(.16, 0).scale(.5, 1.6 + k * .3, .5).rotateZ((k - 1) * .35).translate((k - 1) * .12, .22 + k * .04, 0), 0x6ff5dc)));
    const L = []; for (let i = 0; i < tierN(160, 260, 380); i++) { const t = S.trees[(rnd() * S.trees.length) | 0]; if (!t || t.kind !== 'glass') continue; const a = rnd() * 6.28, d = t.r + .6 + rnd() * 1.4; L.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d, yaw: rnd() * 6, s: .7 + rnd() * 1.3 }); }
    for (const [x, z] of [[1556, 1336], [1570, 1326], [1548, 1344], [1566, 1350]]) L.push({ x, z, yaw: rnd() * 6, s: 3 + rnd() * 2 });
    const im = inst(shard, L, GLOW, t => sc.setScalar(t.s), t => tc.setRGB(.5 + rnd() * .3, 1, .85 + rnd() * .15)); root.add(im); }
  // --- static set pieces (one merged lit mesh + one merged glow mesh): return arch, Orrick's camp, conduits, ruins, Confluence stones
  const parts = [], glow = [];
  const stone = (w, h, d, x, y, z, ry = 0) => colorize(jitter(new THREE.BoxGeometry(w, h, d, 2, 3, 2), .06).rotateY(ry).translate(x, y, z), (cc, X, Y, Z_, ny) => cc.setRGB(.26 + ny * .05, .27 + ny * .04, .25));
  { const A = DD.RETURN_ARCH; for (const s of [-1, 1]) { parts.push(colorize(jitter(new THREE.CylinderGeometry(.9, 1.3, 8, 9, 5).translate(A.x + s * 4, 4, A.z), .08), (cc, x, y) => cc.setRGB(.14 + y * .006, .1, .08))); glow.push(solid(new THREE.BoxGeometry(.08, 5, .08).translate(A.x + s * 4.8, 3, A.z), 0x5ff0d0)); addStatic(A.x + s * 4, A.z, 1.3, 8, false); }
    parts.push(colorize(jitter(new THREE.TorusGeometry(4, .65, 7, 16, Math.PI).translate(A.x, 7.6, A.z), .1), cc => cc.setRGB(.12, .09, .07)));
    S.retVeil = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 9), new THREE.MeshBasicMaterial({ color: 0x9be37a, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); S.retVeil.position.set(A.x, 4.5, A.z); root.add(S.retVeil);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .85), new THREE.MeshBasicMaterial({ map: signTex([['FERNWAY VERGE  ↓', 56], ['BACK TOWARD BURN CITY', 34, '#c8ffb0']], 1024, 256, '#14201a', '#d8ffe8', '#9be37a'), toneMapped: false, side: THREE.DoubleSide })); sg.position.set(A.x + 6.4, 2.4, A.z + 4); sg.rotation.y = Math.PI; root.add(sg);
    parts.push(solid(new THREE.BoxGeometry(.16, 2.6, .16).translate(A.x + 4.8, 1.3, A.z + 4), 0x3a2a1c), solid(new THREE.BoxGeometry(.16, 2.6, .16).translate(A.x + 8, 1.3, A.z + 4), 0x3a2a1c)); }
  { const F = DD.CAMP.fire; // Orrick's survey camp: tent, crates, a survey tripod, the campfire
    parts.push(colorize(new THREE.ConeGeometry(2.4, 2.6, 4).rotateY(.6).translate(DD.CAMP.x - 6, 1.3, DD.CAMP.z + 4), (cc, x, y) => cc.setRGB(.36 + y * .03, .3 + y * .02, .2)));
    for (const [dx, dz, s] of [[3, -4, 1], [3.9, -3.2, .8], [-2, 6, .9]]) parts.push(colorize(new THREE.BoxGeometry(s, s * .7, s).translate(DD.CAMP.x + dx, s * .35, DD.CAMP.z + dz), cc => cc.set(0x5a4028)));
    for (let k = 0; k < 3; k++) parts.push(solid(new THREE.CylinderGeometry(.03, .03, 1.7, 5).rotateZ(.25).rotateY(k * 2.1).translate(DD.CAMP.x + 1.5 + Math.cos(k * 2.1) * .2, .82, DD.CAMP.z + 7 + Math.sin(k * 2.1) * .2), 0x8a6a40));
    for (let k = 0; k < 8; k++) parts.push(stone(.4, .25, .3, F.x + Math.cos(k / 8 * 6.28) * .9, .12, F.z + Math.sin(k / 8 * 6.28) * .9, k));
    S.fire = new THREE.Group(); S.fire.position.set(F.x, .1, F.z); root.add(S.fire);
    for (const [r, h, col, o] of [[.42, 1.1, 0xff3a08, .55], [.28, .85, 0xff8a1a, .75], [.13, .5, 0xfff0b0, .95]]) S.fire.add(new THREE.Mesh(solid(new THREE.ConeGeometry(r, h, 8, 1, true).translate(0, h / 2, 0), col), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
    addStatic(DD.CAMP.x - 6, DD.CAMP.z + 4, 2, 2.4, false); addStatic(F.x, F.z, .9, .3, true); }
  { const r = DD.RUINS[0]; for (let k = 0; k < 3; k++) { const x = r.x - 10 + k * 10, z = r.z - 6 + k * 3; parts.push(colorize(new THREE.BoxGeometry(.5, 11, .5).translate(x, 5.5, z), cc => cc.set(0x4a3020)), colorize(new THREE.BoxGeometry(5, .3, .3).translate(x, 10.5, z), cc => cc.set(0x5a3a22))); glow.push(solid(new THREE.BoxGeometry(.06, 6, .06).rotateZ(.2).translate(x + .4, 5, z), 0xffb04a)); addStatic(x, z, .5, 11, false); }
    parts.push(colorize(new THREE.CylinderGeometry(.5, .5, 26, 8).rotateZ(Math.PI / 2).rotateY(.3).translate(r.x, .5, r.z - 4), cc => cc.set(0x3a2a20))); }
  { const r = DD.RUINS[2]; for (const [dx, dz, w, h, ry] of [[-6, 0, 8, 4, .2], [4, 5, 6, 3, -.4], [0, -6, 4, 6, 1.2], [7, -3, 3, 2, .8]]) { parts.push(stone(w, h, .8, r.x + dx, h / 2, r.z + dz, ry)); addStatic(r.x + dx, r.z + dz, Math.min(w, 3) * .5, h, false); }
    parts.push(colorize(new THREE.BoxGeometry(6, 2.2, 2.4).rotateY(.5).rotateZ(.12).translate(r.x + 2, 1.1, r.z - 1), cc => cc.set(0x3a4a4a))); }
  { const Cf = DD.CONFLUENCE; for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28, x = Cf.x + Math.cos(a) * Cf.r, z = Cf.z + Math.sin(a) * Cf.r, h = 4.5 + (k % 3); parts.push(stone(1.4, h, 1, x, h / 2, z, a)); glow.push(solid(new THREE.BoxGeometry(.1, h * .6, .1).translate(x, h * .5, z), 0xc8a0ff)); addStatic(x, z, .9, h, false); }
    S.poolMesh = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a5aff, transparent: true, opacity: .5, depthWrite: false, toneMapped: false })); S.poolMesh.position.set(Cf.x, .07, Cf.z); root.add(S.poolMesh);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .9), new THREE.MeshBasicMaterial({ map: signTex([['THE CONFLUENCE', 60], ['Confluence Circle', 34, '#e0c8ff']], 1024, 256, '#1a1424', '#f0e8ff', '#c8a0ff'), toneMapped: false, side: THREE.DoubleSide })); sg.position.set(Cf.x - 6, 2.2, Cf.z - Cf.r - 5); sg.rotation.y = Math.PI; root.add(sg); }
  root.add(new THREE.Mesh(M(parts), MAT), new THREE.Mesh(M(glow), GLOW));
  // --- the horizon: a wall of dark trunks + canopy painted on a cylinder at the edge (fogged), so nothing but forest is ever in view
  { const tex = canvasTex(1024, 256, (g, w, h) => { g.fillStyle = '#0a120e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 220; i++) { const x = Math.random() * w, tw = 3 + Math.random() * 9; g.fillStyle = `rgb(${8 + Math.random() * 10 | 0},${14 + Math.random() * 12 | 0},${11 + Math.random() * 8 | 0})`; g.fillRect(x, h * .25 + Math.random() * h * .2, tw, h); g.beginPath(); g.moveTo(x - 30, h * .45); g.lineTo(x + tw / 2, Math.random() * h * .2); g.lineTo(x + tw + 30, h * .45); g.fill(); } });
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(10, 1); const wall = new THREE.Mesh(new THREE.CylinderGeometry(DEEP.rx * 1.06, DEEP.rx * 1.06, 46, 64, 1, true).translate(DEEP.x, 22, DEEP.z), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })); root.add(wall); }
  // --- pickups (survey tags / Sable's tools): flag posts + a beam, shown only while their quest wants them
  for (const p of [...DD.TAGS.map(t => ({ ...t, kind: 'tag' })), ...DD.CLUES.map(t => ({ ...t, kind: 'clue' }))]) { const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    if (p.kind === 'tag') g.add(new THREE.Mesh(M([solid(new THREE.CylinderGeometry(.04, .05, 1.6, 6).translate(0, .8, 0), 0x5a4a3a), solid(new THREE.BoxGeometry(.5, .32, .02).translate(.25, 1.4, 0), 0xff7a1a)]), MAT));
    else g.add(new THREE.Mesh(M([solid(new THREE.BoxGeometry(.4, .14, .26).translate(0, .07, 0), 0x6a5a48), solid(new THREE.CylinderGeometry(.05, .05, .32, 8).rotateZ(1.57).translate(.06, .2, 0), 0xb0b8c0)]), MAT));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.18, .5, 9, 10, 1, true).translate(0, 4.5, 0), new THREE.MeshBasicMaterial({ color: p.kind === 'tag' ? 0xffa04a : 0x5ff0d0, transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); g.add(beam);
    root.add(g); S.picks.push({ ...p, g, beam }); }
  await step(.7, 'Orrick\'s camp, Sable\'s stones…');
  // --- NPCs (walkers, idle + face you)
  for (const n of DD.NPCS) { const g = buildWalker({ ...n.walker, lite: c.MOBILE }); g.position.set(n.x, 0, n.z); g.rotation.y = Math.atan2(-(n.look[0] - n.x), -(n.look[1] - n.z)); g.userData.home = g.rotation.y; root.add(g);
    if (n.id === 'orrick_vale') g.add(new THREE.Mesh(M([solid(new THREE.CylinderGeometry(.32, .36, .1, 12).translate(0, 1.95, 0), 0x6a5034), solid(new THREE.CylinderGeometry(.2, .22, .2, 12).translate(0, 2.05, 0), 0x6a5034)]), MAT));
    else g.add(new THREE.Mesh(M([solid(new THREE.BoxGeometry(.36, .42, .16).translate(0, 1.2, .2), 0x5a4030), solid(new THREE.BoxGeometry(.05, .05, .05).translate(.12, 1.32, .29), 0x5ff0d0)]), MAT));
    addStatic(n.x, n.z, .45, 2, true); const tg = Z.tag(n.name + ' · ' + n.role, 'npc');
    const npc = { ...n, rig: g, tagEl: tg, face: () => { const P = C().P; g.userData.faceT = Math.atan2(-(P.pos.x - n.x), -(P.pos.z - n.z)); g.userData.faceUntil = performance.now() + 6000; } };
    if (n.id === 'sable_kest') npc.onClaim = () => Z.toast('Sable Kest: "Next time, bring two companions who trust you."', 3600);
    S.npcs.push(npc); }
  // --- motes: drifting teal spores around the camera (one Points draw)
  { const N = tierN(90, 160, 240), pos = new Float32Array(N * 3); S.motes = []; for (let i = 0; i < N; i++) S.motes.push({ x: 0, y: -99, z: 0, p: rnd() * 6.28, s: .3 + rnd() * .7 });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); S.moteP = new THREE.Points(g, new THREE.PointsMaterial({ size: .16, color: 0x8affe0, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); S.moteP.frustumCulled = false; root.add(S.moteP); }
  // encounter table
  ZONE.spawns = DD.SPAWNS.map(s => ({ ...s, zone: ZONE, cr: null, cool: 0, when: s.quest ? () => { const st = Z.game().state.quests[s.quest]; return st && st.st === 'active' && !((st.prog[s.obj] || 0) >= 1); } : null }));
  await step(.85, 'Listening for the Grove…');
}

// ---------------------------------------------------------------- tree colliders: pooled around the player (thousands of trees, ~150 colliders)
function refreshPool(P) {
  if (S.poolAt && Math.hypot(P.pos.x - S.poolAt.x, P.pos.z - S.poolAt.z) < 10) return; S.poolAt = { x: P.pos.x, z: P.pos.z };
  const cols = C().colliders; for (const o of S.pool) { const i = cols.indexOf(o); if (i >= 0) cols.splice(i, 1); } S.pool = [];
  const TCS = 12, R = 44, cx = Math.floor(P.pos.x / TCS), cz = Math.floor(P.pos.z / TCS), n = Math.ceil(R / TCS);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const t of S.tgrid.get((cx + i) + ',' + (cz + j)) || []) { if (Math.hypot(t.x - P.pos.x, t.z - P.pos.z) > R) continue; const o = { x: t.x, z: t.z, r: t.r, h: t.h * .8, nc: true, wildsDeep: 1, pool: 1 }; cols.push(o); S.pool.push(o); }
}

// ---------------------------------------------------------------- interactions
const st = () => Z.game().state, gz = () => st().zones.glassroot;
function pickWanted(p) {
  const q = st().quests[p.kind === 'tag' ? 'tags_in_the_roots' : 'the_missing_tinker']; if (!q || q.st !== 'active' || gz().picked[p.id]) return false;
  if (p.kind === 'tag') return !((q.prog[p.id] || 0) >= 1); return (q.prog.find_clues || 0) < 3;
}
function pick(p) {
  const G = Z.game(); if (!pickWanted(p)) return; gz().picked[p.id] = Date.now();
  if (p.kind === 'tag') G.progress('collect', 'survey_tag', { obj: p.id }); else G.progress('interact', 'tinker_clue', {}); G.givePlayerXp(15); G.save();
  Z.toast('Recovered ' + p.label + ' · +15 XP'); Z.embersEmit(p.x, 1.2, p.z, 36, p.kind === 'tag' ? 0xffb04a : 0x5ff0d0, { up: 3, speed: 1.4, life: 1.3 }); Z.renderHud();
}
function confluence() {
  const T = DD.CONFLUENCE_TEXT; gz().confluenceSeen = (gz().confluenceSeen || 0) + 1; Z.game().save();
  Z.openModal('npc', `<h2>${Z.esc(T.title)} <small>${Z.esc(T.sub)}</small><button class="x" aria-label="Close">✕</button></h2><div class="say">${Z.esc(T.body)}</div><div class="card"><div><b>Recipe preview</b><div class="dim">${Z.esc(T.recipe)}</div></div><span class="chip">later</span></div><div class="local">${Z.esc(T.soon)}</div><div class="row"><button data-a="bye">Close</button></div>`);
  const m = document.getElementById('wlModal'); for (const s of ['.x', '[data-a="bye"]']) { const b = m && m.querySelector(s); if (b) b.onclick = Z.closeModal; } Z.W._modalKeys = { Digit1: 'bye', Escape: 'bye' };
}
function interactor(p) {
  let best = null; const offer = (d, max, label, act) => { if (d < max && (!best || d * .5 < best.d)) best = { label, d: d * .5, act }; };
  for (const n of S.npcs) offer(Math.hypot(p.x - n.x, p.z - n.z), 3.6, 'Talk to ' + n.name, () => Z.talkNpc(n));
  offer(Math.hypot(p.x - DD.CAMP.fire.x, p.z - DD.CAMP.fire.z), 3, 'Rest by the campfire (heal)', () => { Z.rest(); });
  for (const k of S.picks) if (pickWanted(k)) offer(Math.hypot(p.x - k.x, p.z - k.z), 3, 'Recover ' + k.label, () => pick(k));
  offer(Math.hypot(p.x - DD.CONFLUENCE.x, p.z - DD.CONFLUENCE.z), 7, 'Study the Confluence', confluence);
  offer(Math.hypot(p.x - DD.RETURN_ARCH.x, p.z - DD.RETURN_ARCH.z), 6, 'Back to Fernway Verge', () => ctx && ctx.exit());
  return best;
}

// ---------------------------------------------------------------- per frame (only while you are inside; wilds.js zoneFrame runs right after)
const _v = new THREE.Vector3();
function scr(x, y, z) { const c = C(); _v.set(x, y, z).project(c.C); if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) return null; return [(_v.x * .5 + .5) * innerWidth, (-_v.y * .5 + .5) * innerHeight]; }
let prevP = null;
export function frame(dt, t) {
  if (!S.active) return; const c = C(), P = c.P, day = c.U && c.U.day ? c.U.day.value : 0, explore = c.getMode() === 'explore';
  // close the world in: dense dark fog, matching background, short far plane, light boost under the canopy
  FOGC.copy(FOG_NIGHT).lerp(FOG_DAY, day); if (c.S.fog) { c.S.fog.color.copy(FOGC); c.S.fog.density = c.MOBILE || c.TIER === 'low' ? .026 : .021; }
  if (!c.S.background || !c.S.background.isColor) c.S.background = new THREE.Color(); c.S.background.copy(FOGC);
  if (c.C.far !== 320) { c.C.far = 320; c.C.updateProjectionMatrix(); }
  if (!S.lights) S.lights = { hemi: c.S.children.find(o => o.isHemisphereLight), amb: c.S.children.find(o => o.isAmbientLight) };
  if (S.lights.hemi) S.lights.hemi.intensity += (1 - day) * 1.1 + .2; if (S.lights.amb) S.lights.amb.intensity += (1 - day) * .5 + .1;
  { const pl = c.avatar.userData.pl; if (pl) { pl.intensity = c.avatar.visible ? 2 : 0; pl.position.set(c.avatar.position.x, c.avatar.position.y + 1.5, c.avatar.position.z); } }   // the city's per-frame avatar light is paused with the city
  // soft edge: the Grove has no way out but the arch
  { const e = dEll(P.pos.x, P.pos.z); if (e > .97) { P.pos.x = DEEP.x + (P.pos.x - DEEP.x) / e * .97; P.pos.z = DEEP.z + (P.pos.z - DEEP.z) / e * .97; P.vel.x = P.vel.z = 0; } }
  // chunks: distance + frustum culled
  const cp = c.C.position, VIS = 150; let vis = 0; for (const ch of S.chunks) { const on = Math.hypot(ch.cx - cp.x, ch.cz - cp.z) < VIS; ch.g.visible = on; if (on) vis++; } S.visChunks = vis;
  refreshPool(P);
  // walked back through the return arch (heading south)
  const A = DD.RETURN_ARCH; if (explore && prevP && !Z.W.modal && !Z.W.enc && Math.abs(P.pos.x - A.x) < 3 && P.pos.z < A.z + .3 && prevP.z >= A.z + .3 && ctx) ctx.exit(); prevP = { x: P.pos.x, z: P.pos.z };
  // flames, veils, pool, pickups
  if (S.fire) { const k = t * 9; S.fire.scale.set(1 + Math.sin(k) * .08, 1 + Math.sin(k * 1.7) * .14, 1 + Math.sin(k * 2.3) * .06); if (Math.random() < dt * 8) Z.embersEmit(DD.CAMP.fire.x, .5, DD.CAMP.fire.z, 1, 0xff8a2a, { up: 1.6, speed: .3, life: 1.8, spread: .4 }); }
  S.retVeil.material.opacity = .1 + Math.sin(t * 2) * .05; S.poolMesh.material.opacity = .38 + Math.sin(t * 1.3) * .14; S.creekMat.opacity = .5 + Math.sin(t * .9) * .06;
  for (const k of S.picks) { const w = pickWanted(k); k.g.visible = w; if (w) k.beam.material.opacity = .1 + Math.sin(t * 2.4 + k.x) * .05; }
  // motes around the camera
  { const a = S.moteP.geometry.attributes.position; let i = 0; for (const m of S.motes) { if (m.y < 0 || Math.hypot(m.x - cp.x, m.z - cp.z) > 22) { const ang = Math.random() * 6.28, r = 2 + Math.random() * 18; m.x = cp.x + Math.cos(ang) * r; m.z = cp.z + Math.sin(ang) * r; m.y = .3 + Math.random() * 6; }
      m.y += Math.sin(t * m.s + m.p) * .004; m.x += Math.sin(t * .3 + m.p) * .01; a.setXYZ(i++, m.x, m.y, m.z); } a.needsUpdate = true; }
  // NPCs: idle, turn to you, name tags
  for (const n of S.npcs) { const g = n.rig, d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z); const want = d < 9 ? Math.atan2(-(P.pos.x - n.x), -(P.pos.z - n.z)) : g.userData.home; let dy = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y)); g.rotation.y += dy * Math.min(1, dt * 3);
    if (d < 60) poseWalker(g, t * 2, Math.abs(dy) > .2 ? .25 : 0, t);
    const s = explore && d < 18 && !Z.W.modal ? scr(n.x, 2.5, n.z) : null; n.tagEl.style.display = s ? 'block' : 'none'; if (s) { n.tagEl.style.left = s[0] + 'px'; n.tagEl.style.top = s[1] + 'px'; const G = Z.game(), q = n.quests.find(id => !G.state.quests[id] ? G.canAccept(id) : G.state.quests[id].st === 'ready'); const txt = (q ? '❗ ' : '') + n.name + ' · ' + n.role; if (n.tagEl.textContent !== txt) n.tagEl.textContent = txt; } }
}

// ---------------------------------------------------------------- lifecycle (called by wilds-gate.js)
export const isLoaded = () => S.ready;
export const isActive = () => S.active;
export async function load(api, progress = () => { }, hooks = {}) {
  Z = api; ctx = hooks; if (S.ready) return; if (S.loading) return S.loading;
  S.loading = (async () => {
    await build(progress); const c = C();
    progress(.9, 'Lighting the canopy…'); S.root.visible = true;
    try { if (c.R && c.R.compileAsync) await Promise.race([c.R.compileAsync(S.root, c.C, c.S), new Promise(r => setTimeout(r, 4000))]); } catch (e) { }
    S.root.visible = false; S.ready = true; S.loads = (S.loads || 0) + 1; progress(1, 'Glassroot Grove');
  })();
  try { await S.loading; } catch (e) { try { unload(); } catch (e2) { } throw e; } finally { S.loading = null; }
}
export function enter() {
  if (!S.ready) throw new Error('deep area not loaded'); const c = C(), P = c.P;
  S.root.visible = true; S.active = true; S.poolAt = null; prevP = null; S.lights = null;
  P.pos.set(DD.ENTRY.x, 0, DD.ENTRY.z); P.vel.set(0, 0, 0); c.input.yp.yaw = Math.PI; c.input.yp.pitch = -.05; c.C.position.set(DD.ENTRY.x, 3, DD.ENTRY.z - 6);
  Z.setZone(ZONE); const g = gz(); g.visits = (g.visits || 0) + 1; Z.game().save();
  Z.bigBanner('GLASSROOT GROVE', 'Deeper into the Cinderwilds · Lv 5–12', 2600);
  const q = st().quests; if (!q.tags_in_the_roots) setTimeout(() => S.active && Z.toast('Orrick Vale\'s survey camp is just up the trail.'), 2600);
}
export function leave() {   // back to Fernway Verge: zone off, colliders pooled out, hidden (kept built until the unload timer)
  if (!S.active && !S.ready) return; S.active = false; if (Z) Z.setZone(null);
  const cols = C().colliders; for (const o of S.pool) { const i = cols.indexOf(o); if (i >= 0) cols.splice(i, 1); } S.pool = []; S.poolAt = null;
  for (const n of S.npcs) n.tagEl.style.display = 'none'; if (S.root) S.root.visible = false;
}
function disposeTree(o, seen) { o.traverse(m => { if (m.geometry && !seen.geo.has(m.geometry)) { seen.geo.add(m.geometry); m.geometry.dispose(); }
  for (const mt of [].concat(m.material || [])) { if (seen.mat.has(mt)) continue; seen.mat.add(mt); if (mt.map && !seen.tex.has(mt.map)) { seen.tex.add(mt.map); mt.map.dispose(); } if (mt !== mats().MAT && mt !== mats().GLOW) mt.dispose(); }
  if (m.isInstancedMesh && m.dispose) m.dispose(); }); }
export function unload() {
  if (S.active) leave(); const c = C(); const seen = { geo: new Set(), mat: new Set(), tex: new Set() };
  if (S.root) { S.root.removeFromParent(); disposeTree(S.root, seen); }
  for (let i = c.colliders.length - 1; i >= 0; i--) if (c.colliders[i].wildsDeep) c.colliders.splice(i, 1);
  if (Z) Z.obRemove(o => o.deep); for (const n of S.npcs) n.tagEl.remove();
  S.lastDispose = { geo: seen.geo.size, mat: seen.mat.size, tex: seen.tex.size };
  S.root = ZONE.root = null; S.chunks = []; S.trees = []; S.tgrid = null; S.picks = []; S.npcs = []; S.pool = []; S.motes = null; S.moteP = null; S.fire = S.poolMesh = S.retVeil = S.creekMat = null; ZONE.spawns = []; colliders.length = 0;
  S.ready = false; S.unloads = (S.unloads || 0) + 1;
}
if (TEST) Object.assign(S.test, { ZONE, DD, interactor: p => { const r = interactor(p || C().P.pos); return r && r.label; }, act: () => { const r = interactor(C().P.pos); if (r) r.act(); return r && r.label; }, pick: id => { const k = S.picks.find(x => x.id === id); if (k) pick(k); }, pickWanted: id => { const k = S.picks.find(x => x.id === id); return k && pickWanted(k); } });
