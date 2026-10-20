// Fishing gear: rod model with guides + spinning reel, verlet fishing line, bobber physics on the lake surface, ripple / wake rings.
// One "gear" = rod + line + bobber. The local angler and remote anglers share it (remotes get a shorter rope and fewer iterations).
// Everything is preallocated: no per-frame allocations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const WY = 0.22;   // lake surface height (estate.js lake mesh y)
export const MOB = matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
export const REL = 0.4;   // seconds from cast start to line release (back-cast + forward flick)
const GRAV = 9.8;
// ---------- lake surface: same travelling waves the water shader uses for its normals, as heights ----------
const WV = [[1, .35, .55, .05, 1.3], [-.4, 1, .9, .03, 1.9], [.8, -.6, 1.7, .014, 2.7], [-.9, -.2, 3.1, .007, 3.6]].map(([x, z, k, a, s]) => { const l = Math.hypot(x, z); return [x / l, z / l, k, a, s] });
const WQ = { h: 0, gx: 0, gz: 0 };
export function wave(x, z) { const u = window.__water && window.__water.uniforms, t = u ? u.t.value : performance.now() / 1000, ch = 1 + (u && u.storm ? u.storm.value : 0) * 1.6 + (u && u.wet ? u.wet.value : 0) * .5; let h = 0, gx = 0, gz = 0;
  for (let i = 0; i < 4; i++) { const w = WV[i], ph = (w[0] * x + w[1] * z) * w[2] + t * w[4], A = w[3] * ch, c = A * w[2] * Math.cos(ph); h += A * Math.sin(ph); gx += w[0] * c; gz += w[1] * c } WQ.h = h; WQ.gx = gx; WQ.gz = gz; return WQ }
// ---------- ripple / wake rings (one shared pool) ----------
const RINGS = []; let ri = 0;
export function ringsInit(S) { if (RINGS.length) return; const g = new THREE.RingGeometry(.82, 1, MOB ? 24 : 40).rotateX(-Math.PI / 2);
  for (let i = 0; i < (MOB ? 12 : 18); i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 3; S.add(m); RINGS.push({ m, on: 0, t: 0, life: 1, s0: 1, gr: 1, op: 1 }) } }
export function ring(x, z, s0, grow, life, op, delay = 0) { if (!RINGS.length) return; const r = RINGS[ri]; ri = (ri + 1) % RINGS.length; r.m.position.set(x, WY + .02, z); r.t = -delay; r.life = life; r.s0 = s0; r.gr = grow; r.op = op; r.on = 1; r.m.visible = false }
export function ringsTick(dt) { for (let i = 0; i < RINGS.length; i++) { const r = RINGS[i]; if (!r.on) continue; r.t += dt; if (r.t < 0) continue; const k = r.t / r.life; if (k >= 1) { r.on = 0; r.m.visible = false; continue }
  r.m.visible = true; r.m.scale.setScalar(r.s0 + r.gr * r.t); r.m.material.opacity = r.op * (1 - k) * (1 - k) } }
// ---------- rod: cork / EVA grip, reel seat, spinning reel with crank, tapered 5-piece blank with guides and thread wraps ----------
// look: blank, accent (wraps + glow), grip, reel body
export const LOOKS = [[0x7a4f26, 0x2f5a2a, 0xc9a26c, 0xa4a8ac, 0], [0x1a1b20, 0x2a6aff, 0x26262a, 0x4a4f56, .35], [0x2050d8, 0x2ad0ff, 0xc9a26c, 0x2a2e36, .45], [0xe86a14, 0xff3a00, 0x2a1a12, 0xd8a030, .6]];
const SEGL = [.44, .44, .42, .4, .38], R0 = .017, R1 = .0042, BEND_W = [.06, .12, .2, .27, .35], GUIDE = [.022, .015, .011, .008, .0062], TIP_R = .005;
const BL = SEGL.reduce((a, b) => a + b, 0), radAt = s => R0 + (R1 - R0) * s / BL;
function paint(g, hex) { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g }
const RS = MOB ? 6 : 8, GEO = {}, MAT = {};
function rodGeo(li) { if (GEO[li]) return GEO[li]; const [blank, acc, grip, reel] = LOOKS[li], metal = 0x9aa0a6, dark = 0x18181a, line = 0xe8f2ff, P = [], C = (rt, rb, h, y, col, x = 0, z = 0) => P.push(paint(new THREE.CylinderGeometry(rt, rb, h, RS).translate(x, y, z), col));
  // handle (local y: butt -0.3 .. blank start .22); the hand sits at y ~ 0
  C(.027, .03, .05, -.275, dark); C(.024, .026, .24, -.155, grip); C(.0215, .0215, .02, -.03, metal); C(.0185, .0185, .12, .035, li === 1 ? 0x303034 : metal); C(.0215, .0215, .02, .1, metal); C(.018, .022, .11, .165, grip); C(.0185, .0185, .012, .226, acc);
  // spinning reel hangs under the seat (local -z is the side facing the water when the rod points forward)
  P.push(paint(new THREE.BoxGeometry(.012, .07, .012).translate(0, .035, -.024), reel), paint(new THREE.BoxGeometry(.01, .012, .06).translate(0, .03, -.055), reel));
  C(.032, .032, .065, .02, reel, 0, -.1); C(.034, .028, .028, .062, reel, 0, -.1); C(.031, .031, .036, .094, metal, 0, -.1); C(.0275, .0275, .028, .094, line, 0, -.1);
  P.push(paint(new THREE.TorusGeometry(.038, .0028, 4, RS * 2).rotateX(Math.PI / 2).translate(0, .11, -.1), metal), paint(new THREE.CylinderGeometry(.008, .008, .03, RS).rotateZ(Math.PI / 2).translate(.03, .02, -.1), reel));
  const handle = mergeGeometries(P); handle.computeBoundingSphere();
  const crank = mergeGeometries([paint(new THREE.BoxGeometry(.006, .06, .008).translate(0, .03, 0), metal), paint(new THREE.CylinderGeometry(.009, .009, .028, RS).rotateZ(Math.PI / 2).translate(.016, .058, 0), dark)]);
  const segs = [], guides = []; let s0 = 0;
  for (let i = 0; i < 5; i++) { const L = SEGL[i], ra = radAt(s0), rb = radAt(s0 + L), Q = [paint(new THREE.CylinderGeometry(rb, ra, L, i > 2 ? Math.max(5, RS - 2) : RS).translate(0, L / 2, 0), blank)], gy = i ? .1 : .24, gr = GUIDE[i], rr = radAt(s0 + gy), gz = -(rr + .01 + gr);
    Q.push(paint(new THREE.TorusGeometry(gr, .0018, 3, MOB ? 8 : 10).rotateX(Math.PI / 2).translate(0, gy, gz), metal), paint(new THREE.BoxGeometry(.003, .004, .01 + gr).translate(0, gy, -(rr + (.01 + gr) / 2)), metal), paint(new THREE.CylinderGeometry(rr + .0016, rr + .0016, .03, RS).translate(0, gy, 0), acc));
    guides.push([i, 0, gy, gz]);
    if (i === 4) { Q.push(paint(new THREE.TorusGeometry(TIP_R, .0015, 3, 8).rotateX(Math.PI / 2).translate(0, L - .004, -(rb + TIP_R)), metal), paint(new THREE.CylinderGeometry(rb + .0015, rb + .0015, .02, 5).translate(0, L - .012, 0), acc)); guides.push([4, 0, L - .004, -(rb + TIP_R)]) }
    segs.push(mergeGeometries(Q)); s0 += L }
  return GEO[li] = { handle, crank, segs, guides } }
function rodMat(li) { if (MAT[li]) return MAT[li]; const l = LOOKS[li]; return MAT[li] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: li === 1 ? .32 : .42, metalness: .3, emissive: new THREE.Color(l[1]), emissiveIntensity: l[4] * .35 }) }
export function mkRod(li = 0) { const G = rodGeo(li), m = rodMat(li), rg = new THREE.Group(), handle = new THREE.Mesh(G.handle, m), crankG = new THREE.Group(), crank = new THREE.Mesh(G.crank, m); rg.add(handle); crankG.position.set(.045, .02, -.1); crankG.add(crank); rg.add(crankG);
  const seg = []; let par = rg; for (let i = 0; i < 5; i++) { const g = new THREE.Group(), mesh = new THREE.Mesh(G.segs[i], m); g.add(mesh); g.position.y = i ? SEGL[i - 1] : .232; par.add(g); seg.push(g); par = g }
  const tip = new THREE.Object3D(); tip.position.copy(new THREE.Vector3(G.guides[5][1], G.guides[5][2], G.guides[5][3])); seg[4].add(tip);
  const gl = G.guides.map(q => new THREE.Vector3(q[1], q[2], q[3])), spool = new THREE.Vector3(0, .094, -.1);
  rg.traverse(o => { if (o.isMesh) o.castShadow = false });
  return { rg, seg, tip, crankG, li, meshes: [handle, crank, ...seg.map(g => g.children[0])], gl, spool,
    setLook(i) { i = Math.max(0, Math.min(3, i | 0)); if (i === this.li) return; this.li = i; const G2 = rodGeo(i), m2 = rodMat(i); this.meshes[0].geometry = G2.handle; this.meshes[1].geometry = G2.crank; for (let k = 0; k < 5; k++) this.meshes[k + 2].geometry = G2.segs[k]; this.meshes.forEach(x => x.material = m2) } } }
export const rodGlow = (li, t) => { const m = MAT[li]; if (m) m.emissiveIntensity = LOOKS[li][4] * (.3 + .2 * Math.sin(t * 3)) };
// ---------- bobber: pear-shaped float, red cap / white body, black waterline band, antenna with fluorescent tip, eyelet at the bottom ----------
let BOB = null;
function bobGeo() { if (BOB) return BOB; const V = (r, y) => new THREE.Vector2(r, y), seg = MOB ? 10 : 14;
  const bot = [V(.001, -.2), V(.05, -.19), V(.12, -.15), V(.18, -.085), V(.205, -.03), V(.21, 0)], top = [V(.21, 0), V(.2, .055), V(.16, .11), V(.1, .155), V(.04, .185), V(.012, .195)];
  const g = mergeGeometries([paint(new THREE.LatheGeometry(bot, seg), 0xf2f2ea), paint(new THREE.LatheGeometry(top, seg), 0xff2414), paint(new THREE.TorusGeometry(.212, .012, 4, seg * 2).rotateX(Math.PI / 2), 0x141414),
    paint(new THREE.CylinderGeometry(.012, .014, .14, 5).translate(0, -.26, 0), 0xf2f2ea), paint(new THREE.TorusGeometry(.022, .006, 4, 8).translate(0, -.345, 0), 0x9aa0a6), paint(new THREE.CylinderGeometry(.013, .016, .3, 6).translate(0, .34, 0), 0x202020)]);
  g.computeVertexNormals(); return BOB = { g, tip: new THREE.CylinderGeometry(.02, .02, .09, 6).translate(0, .53, 0), m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .32, metalness: .05 }), tm: new THREE.MeshBasicMaterial({ color: 0xffd21a, toneMapped: false }) } }
export function mkBobber() { const B = bobGeo(), g = new THREE.Group(); g.add(new THREE.Mesh(B.g, B.m), new THREE.Mesh(B.tip, B.tm)); const eye = new THREE.Object3D(); eye.position.y = -.345; g.add(eye); g.userData.eye = eye; g.scale.setScalar(1.15); return g }
const EYE = .345 * 1.15;
// ---------- fishing line: verlet rope pinned at the rod tip; end pinned to the bobber (or free while it hangs from the tip) ----------
function mkRope(S, n, nG) { const geo = new THREE.BufferGeometry(), pos = new Float32Array((n + nG) * 3); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setDrawRange(0, n + nG);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xeef8ff, transparent: true, opacity: .8 })); line.frustumCulled = false; line.visible = false; line.renderOrder = 4; S.add(line);
  return { n, nG, p: new Float32Array(n * 3), o: new Float32Array(n * 3), pos, geo, line, len: 1 } }
function ropeInit(R, ax, ay, az, bx, by, bz) { const { n, p, o } = R; for (let i = 0; i < n; i++) { const k = i / (n - 1), j = i * 3; p[j] = o[j] = ax + (bx - ax) * k; p[j + 1] = o[j + 1] = ay + (by - ay) * k; p[j + 2] = o[j + 2] = az + (bz - az) * k } }
// one step: integrate (gravity, air / water drag), satisfy stretch-only segment constraints (so slack line sags and taut line straightens), collide with water film / dock / ground
function ropeStep(R, a, b, free, dt, iters, lake) { const { n, p, o } = R, L = R.len / (n - 1), gg = -GRAV * dt * dt, last = n - 1;
  for (let i = 1; i < n; i++) { if (i === last && !free) continue; const j = i * 3, wet = p[j + 1] <= WY + .005 && lake(p[j], p[j + 2]), dh = wet ? .55 : .985, dv = wet ? .3 : .985;
    const vx = (p[j] - o[j]) * dh, vy = (p[j + 1] - o[j + 1]) * dv, vz = (p[j + 2] - o[j + 2]) * dh; o[j] = p[j]; o[j + 1] = p[j + 1]; o[j + 2] = p[j + 2]; p[j] += vx; p[j + 1] += vy + gg * (i === last ? 1.6 : 1); p[j + 2] += vz }
  p[0] = a.x; p[1] = a.y; p[2] = a.z; if (!free) { p[last * 3] = b.x; p[last * 3 + 1] = b.y; p[last * 3 + 2] = b.z }
  for (let it = 0; it < iters; it++) { const fwd = !(it & 1);
    for (let q = 0; q < last; q++) { const i = fwd ? q : last - 1 - q, j = i * 3, k = j + 3, dx = p[k] - p[j], dy = p[k + 1] - p[j + 1], dz = p[k + 2] - p[j + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d <= L || d < 1e-6) continue;
      const wa = i === 0 ? 0 : 1, wb = i + 1 === last ? (free ? .4 : 0) : 1, ws = wa + wb; if (!ws) continue; const s = (d - L) / d / ws;
      p[j] += dx * s * wa; p[j + 1] += dy * s * wa; p[j + 2] += dz * s * wa; p[k] -= dx * s * wb; p[k + 1] -= dy * s * wb; p[k + 2] -= dz * s * wb } }
  // the line rests on the water film (sinks a couple of cm), on the dock deck or on the shore
  for (let i = 1; i < n; i++) { const j = i * 3; if (p[j + 1] > 1.45) continue; const x = p[j], z = p[j + 2]; let fl;
    if (p[j + 1] < WY + .05 && lake(x, z)) fl = WY - .025; else { const dk = window.__deckAt ? window.__deckAt(x, z) : null; fl = dk != null ? dk + .03 : .2 }
    if (p[j + 1] < fl) { p[j + 1] = fl; o[j] += (p[j] - o[j]) * .4; o[j + 2] += (p[j + 2] - o[j + 2]) * .4; o[j + 1] = fl } } }
// ---------- gear ----------
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), NY = new THREE.Vector3(0, -1, 0);
// opts: n rope points, iters constraint passes, guides (route the line through the rod guides), lake(x,z), onSplash(x,z,amp)
export function mkGear(S, opts) { ringsInit(S); const rod = mkRod(0), bob = mkBobber(); bob.visible = false; S.add(bob);
  const nG = opts.guides ? rod.gl.length : 0, rope = mkRope(S, opts.n, nG);
  return { rod, bob, rope, opts, nG, mode: 'off', castT: -9, tgt: new THREE.Vector3(), from: new THREE.Vector3(), v0: new THREE.Vector3(), T: 1, tip: new THREE.Vector3(), att: new THREE.Vector3(), gp: nG ? rod.gl.map(() => new THREE.Vector3()) : [], sp: new THREE.Vector3(),
    vy: 0, tx: 0, tz: 0, tvx: 0, tvz: 0, bend: 0, bv: 0, aim: -.9, ten: 0, nibSeen: 0, lastSt: 'idle', wk: 0, px: 0, pz: 0, spd: 0 } }
export function gearCast(G, x, z, pow, t) { G.mode = 'cast'; G.castT = t; G.tgt.set(x, WY + .015, z); G.pow = pow; G.released = 0 }
export function gearDispose(G, S) { S.remove(G.bob); S.remove(G.rope.line); G.rope.geo.dispose(); G.rope.line.material.dispose() }
const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
// ph: { show, st: idle|wait|bite|reel|run|lift, to: {x,z}|null (where the fish drags the bobber), rate, nib (nibble timestamp), pull (0..1 reel tap), fish (Object3D on the hook while lifting), home {x,z} (angler), heavy (0..1 fish weight) }
export function gearUpdate(G, t, dt, ph) { const { rod, bob, rope, opts } = G, lake = opts.lake;
  if (!ph.show) { if (G.mode !== 'off' || G.init) { G.mode = 'off'; G.init = 0; bob.visible = false; rope.line.visible = false } return }
  const st = ph.st, stCh = st !== G.lastSt; G.lastSt = st;
  // ---- rod pose: back-cast, forward flick, follow-through; raised while reeling, dragged down when the fish runs ----
  const ck = t - G.castT, casting = ck >= 0 && ck < 1.05; let bt;
  if (casting) { G.aim = ck < .3 ? -.85 + 1.4 * ease(ck / .3) : ck < .44 ? .55 - 1.85 * Math.pow((ck - .3) / .14, 1.4) : -1.3 + .5 * (1 - Math.pow(1 - (ck - .44) / .61, 3));
    bt = ck < .3 ? -.3 * Math.sin(Math.PI * ck / .3) : ck < .44 ? .85 : null }
  else { const at = st === 'reel' ? -.5 + (ph.pull || 0) * .18 : st === 'run' ? -1.02 : st === 'lift' ? -.28 : st === 'bite' ? -.82 + Math.sin(t * 19) * .025 : st === 'wait' ? -.8 + Math.sin(t * .8) * .02 : -.9; G.aim += (at - G.aim) * Math.min(1, dt * 5); bt = null }
  rod.rg.rotation.x = G.aim;
  if (bt == null) bt = -(.05 + G.ten * .5 + (st === 'bite' ? .22 + Math.sin(t * 23) * .1 : st === 'reel' ? .38 + (ph.pull || 0) * .3 + Math.sin(t * 9) * .03 : st === 'run' ? .85 + Math.sin(t * 13) * .12 : st === 'lift' ? .3 + (ph.heavy || 0) * .45 : 0));
  G.bv += ((bt - G.bend) * 150 - G.bv * 10) * dt; G.bend = Math.max(-1.45, Math.min(1, G.bend + G.bv * dt)); for (let i = 0; i < 5; i++) rod.seg[i].rotation.x = G.bend * BEND_W[i];
  if (st === 'reel' || st === 'run' || G.mode === 'retrieve') rod.crankG.rotation.x -= dt * (G.mode === 'retrieve' ? 22 : st === 'run' ? 2 : 8 + (ph.pull || 0) * 22);
  rod.rg.updateWorldMatrix(true, true); const tip = G.tip; rod.tip.getWorldPosition(tip);
  // ---- bobber state machine ----
  if (!G.init) { G.init = 1; if (G.mode === 'off') G.mode = 'hang'; rope.len = .85; ropeInit(rope, tip.x, tip.y, tip.z, tip.x, tip.y - .85, tip.z); bob.position.set(tip.x, tip.y - .85 - EYE, tip.z) }
  if ((G.mode === 'water' || G.mode === 'fly') && st === 'idle') G.mode = 'retrieve';
  if (st === 'lift' && ph.fish && G.mode !== 'fish') G.mode = 'fish'; else if (G.mode === 'fish' && st !== 'lift') G.mode = 'hang';
  if ((G.mode === 'hang' || G.mode === 'retrieve') && ph.to && (st === 'wait' || st === 'bite' || st === 'reel' || st === 'run')) { G.mode = 'water'; bob.position.set(ph.to.x, WY, ph.to.z); G.vy = 0; rope.len = tip.distanceTo(bob.position) * 1.04; ropeInit(rope, tip.x, tip.y, tip.z, bob.position.x, WY, bob.position.z) }
  if (G.mode === 'cast' && ck >= REL) { // release: ballistic flight from wherever the swinging bobber is to the target; stronger casts fly higher and longer
    const B = bob.position, dx = G.tgt.x - B.x, dz = G.tgt.z - B.z, d = Math.hypot(dx, dz); G.T = .62 + d / 30 + (G.pow || .5) * .22; G.from.copy(B);
    G.v0.set(dx / G.T, (G.tgt.y - B.y) / G.T + .5 * GRAV * G.T, dz / G.T); G.flyT = t; G.mode = 'fly' }
  const free = G.mode === 'hang' || G.mode === 'cast';
  const wq = G.mode === 'water' || G.mode === 'retrieve' ? wave(bob.position.x, bob.position.z) : null;
  if (G.mode === 'fly') { const k = (t - G.flyT) / G.T, tt = Math.min(k, 1) * G.T;
    bob.position.set(G.from.x + G.v0.x * tt, G.from.y + G.v0.y * tt - .5 * GRAV * tt * tt, G.from.z + G.v0.z * tt);
    _v.set(-G.v0.x, -(G.v0.y - GRAV * tt), -G.v0.z).normalize(); _q.setFromUnitVectors(UP, _v); bob.quaternion.slerp(_q, Math.min(1, dt * 7));   // weighted bottom leads, antenna trails
    if (k >= 1) { G.mode = 'water'; const vi = Math.abs(G.v0.y - GRAV * G.T), hs = Math.hypot(G.v0.x, G.v0.z) || 1; G.vy = -Math.min(3.2, .4 + vi * .32); G.tx = G.v0.x / hs * 1.3; G.tz = G.v0.z / hs * 1.3; G.tvx = G.tvz = 0;
      const amp = Math.min(1.4, .5 + vi * .08); opts.onSplash && opts.onSplash(bob.position.x, bob.position.z, amp); ring(bob.position.x, bob.position.z, .25, 2.4, 1.6, .75); ring(bob.position.x, bob.position.z, .15, 1.7, 1.9, .55, .22); ring(bob.position.x, bob.position.z, .1, 1.1, 2.2, .4, .5); G.px = bob.position.x; G.pz = bob.position.z } }
  if (G.mode === 'water' || G.mode === 'retrieve') { const B = bob.position, now = performance.now();
    // horizontal: the fish drags the bobber; on a retrieve it skims back toward the angler
    if (G.mode === 'retrieve') { const hx = ph.home ? ph.home.x : tip.x, hz = ph.home ? ph.home.z : tip.z, dx = hx - B.x, dz = hz - B.z, d = Math.hypot(dx, dz) || 1, sp = Math.min(d, dt * 8.5); B.x += dx / d * sp; B.z += dz / d * sp;
      if (d < 2.6 || !lake(B.x, B.z)) { G.mode = 'hang' } }
    else if (ph.to) { const k = Math.min(1, dt * (ph.rate || 3)); B.x += (ph.to.x - B.x) * k; B.z += (ph.to.z - B.z) * k }
    // vertical: buoyancy spring riding the waves; nibbles dip it, a strike drags it under, a running fish pulls it down
    if (ph.nib && ph.nib !== G.nibSeen) { G.nibSeen = ph.nib; G.vy -= 1.5; G.tvx += (Math.random() - .5) * 4; G.tvz += (Math.random() - .5) * 4; ring(B.x, B.z, .2, 1.2, 1.1, .5) }
    if (stCh && st === 'bite') { G.vy -= 3; ring(B.x, B.z, .2, 2, 1.3, .7); ring(B.x, B.z, .1, 1.4, 1.5, .45, .2) }
    const rest = WY + .015 + (wq ? wq.h : 0), ty = G.mode === 'retrieve' ? WY + .01 : st === 'bite' ? WY - .52 + Math.sin(t * 9) * .12 + Math.sin(t * 23) * .04 : st === 'run' ? WY - .3 + Math.sin(t * 11) * .06 : st === 'reel' ? WY - .04 + Math.sin(t * 14) * .025 : rest;
    G.vy += ((ty - B.y) * 55 - G.vy * 6.5) * dt; B.y += G.vy * dt;
    // tilt: waves rock it, line tension leans the top away from the rod, a drag lays it on its side
    const tdx = tip.x - B.x, tdz = tip.z - B.z, td = Math.hypot(tdx, tdz) || 1, lay = G.mode === 'retrieve' ? 1.25 : st === 'reel' ? 1.12 : st === 'run' ? .7 : st === 'bite' ? .5 + G.ten * .3 : G.ten * .6;
    let ttx = -tdx / td * lay + (wq ? wq.gx * 2.2 : 0), ttz = -tdz / td * lay + (wq ? wq.gz * 2.2 : 0); if (st === 'bite' || st === 'run') { ttx += Math.sin(t * 17) * .35; ttz += Math.cos(t * 13) * .35 }
    G.tvx += ((ttx - G.tx) * 32 - G.tvx * 5) * dt; G.tvz += ((ttz - G.tz) * 32 - G.tvz * 5) * dt; G.tx += G.tvx * dt; G.tz += G.tvz * dt;
    const a = Math.hypot(G.tx, G.tz); if (a > 1e-4) { _ax.set(G.tz / a, 0, -G.tx / a); bob.quaternion.setFromAxisAngle(_ax, Math.min(1.5, a)) } else bob.quaternion.identity();
    // wake: rings trail a bobber that's being dragged
    const sp = Math.hypot(B.x - G.px, B.z - G.pz) / Math.max(dt, 1e-3); G.spd += (sp - G.spd) * Math.min(1, dt * 6); G.px = B.x; G.pz = B.z;
    if (G.spd > .6 && t - G.wk > (MOB ? .14 : .09)) { G.wk = t; ring(B.x, B.z, .18, .9 + Math.min(1.2, G.spd * .15), .95, Math.min(.5, .2 + G.spd * .05)) } }
  // ---- line ----
  if (!free) { if (G.mode === 'fish' && ph.fish) G.att.copy(ph.fish.position); else { bob.updateMatrixWorld(); bob.userData.eye.getWorldPosition(G.att) } }
  const D = free ? .85 : tip.distanceTo(G.att);
  if (free) rope.len += (.85 - rope.len) * Math.min(1, dt * (G.mode === 'cast' ? 8 : 3));
  else if (G.mode === 'fly') rope.len = Math.max(rope.len, D * 1.03 + .25);
  else if (G.mode === 'water') { const tl = st === 'bite' ? D * .995 : st === 'reel' || st === 'run' ? D * .99 : D * 1.035 + .3, r = st === 'wait' || st === 'idle' ? .7 : st === 'bite' ? 4 : 9; rope.len += (tl - rope.len) * Math.min(1, dt * r); if (st !== 'wait') rope.len = Math.max(rope.len, D * .97) }
  else if (G.mode === 'retrieve') rope.len = Math.min(rope.len, D * .995);
  else if (G.mode === 'fish') rope.len = D;
  const sub = dt > .022 ? 2 : 1, h = Math.min(dt, .05) / sub; for (let s = 0; s < sub; s++) ropeStep(rope, tip, G.att, free, h, opts.iters, lake);
  G.ten = free ? 0 : Math.max(0, Math.min(1, (D / Math.max(.01, rope.len) - .965) / .035));
  // a taut line pulls itself straight (the stretch solver converges slowly on long lines)
  const p = rope.p, o = rope.o, n = rope.n, last = n - 1;
  if (!free && D > rope.len * .995) { const s = Math.min(1, (D / rope.len - .995) * 30) * .55; for (let i = 1; i < last; i++) { const j = i * 3, k = i / last, lx = tip.x + (G.att.x - tip.x) * k, ly = tip.y + (G.att.y - tip.y) * k, lz = tip.z + (G.att.z - tip.z) * k, ex = (lx - p[j]) * s, ey = (ly - p[j + 1]) * s, ez = (lz - p[j + 2]) * s; p[j] += ex; p[j + 1] += ey; p[j + 2] += ez; o[j] += ex; o[j + 1] += ey; o[j + 2] += ez } }
  // hanging from the tip: the bobber hangs from its eyelet at the end of the line
  if (free) { const j = last * 3; _v.set(p[j - 3] - p[j], p[j - 2] - p[j + 1], p[j - 1] - p[j + 2]); if (_v.lengthSq() < 1e-8) _v.set(0, 1, 0); _v.normalize(); _q.setFromUnitVectors(NY, _v); bob.quaternion.slerp(_q, Math.min(1, dt * 14)); bob.position.set(p[j] - _v.x * EYE, p[j + 1] - _v.y * EYE, p[j + 2] - _v.z * EYE) }
  if (G.mode === 'fish') { const m = Math.max(1, Math.min(last - 1, Math.round(.75 / (rope.len / last)))), j = (last - m) * 3; _v.set(p[j - 3] - p[j], p[j - 2] - p[j + 1], p[j - 1] - p[j + 2]).normalize(); _q.setFromUnitVectors(NY, _v); bob.quaternion.copy(_q); bob.position.set(p[j] - _v.x * EYE, p[j + 1] - _v.y * EYE, p[j + 2] - _v.z * EYE) }
  // draw: reel spool -> guides -> tip, then the rope; a taut line under a fighting fish shivers
  const P = rope.pos; let q = 0;
  if (G.nG) { G.sp.copy(rod.spool).applyMatrix4(rod.rg.matrixWorld); P[0] = G.sp.x; P[1] = G.sp.y; P[2] = G.sp.z; q = 3; for (let i = 0; i < G.nG - 1; i++) { const gq = rod.gl[i], par = i === 0 ? rod.seg[0] : rod.seg[i]; _w.copy(gq).applyMatrix4(par.matrixWorld); P[q++] = _w.x; P[q++] = _w.y; P[q++] = _w.z } }
  const vib = st === 'run' ? .045 : st === 'reel' ? .012 : st === 'bite' ? .01 : 0;
  for (let i = 0; i < n; i++) { const j = i * 3, k = i / last, w = 4 * k * (1 - k), sh = vib ? Math.sin(t * 61 + k * 19) * vib * w : 0; P[q++] = p[j]; P[q++] = p[j + 1] + sh; P[q++] = p[j + 2] + sh * .6 }
  rope.geo.attributes.position.needsUpdate = true; rope.line.visible = true; bob.visible = true }
