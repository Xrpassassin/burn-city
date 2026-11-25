// BURN Air 1: one shared, deterministic scenic flight. Every client derives the same pose from Unix time (no server state):
// board at gate 4 -> push back -> taxi -> take off from runway 27 -> one smooth loop around the whole map -> land -> taxi back.
// Players can board, walk the cabin (aisle, seats, cockpit) with the same WASD/joystick as the city, and look around freely
// while it flies. Position is stored in the plane's local frame and transformed each frame; collision stays inside the hull.
// Window-seat and cockpit buttons remain quick snaps. Sounds are synthesized with WebAudio (nothing downloaded, nothing to
// credit), very quiet, strongly distance-attenuated, and they follow the city's sound button/master gain.
// Player-piloted flight is NOT in this file (see PR notes). Disable with ?shuttle=0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Q = new URLSearchParams(location.search);
const DT = .25, DWELL = 100, BOARD_CLOSE = 12;   // seconds: parked/boarding window per cycle; doors close this long before pushback
const GATE_I = 3;

// ---------- route: [x, y, z, speed m/s, corner radius m]   (grp space: y=0 is the paving)
const ROUTE = [
  [18, 0, -615, 0, 0],        // gate 4 stand, nose toward the terminal (+z)
  [18, 0, -672, 3.2, 26],     // pushed back onto the parallel taxiway
  [500, 0, -672, 11, 34],     // taxi east to the connector
  [500, 0, -720, 8, 36],      // line up on the runway centreline (heading west)
  [-40, 0, -720, 74, 0],      // takeoff roll: lift-off here
  [-540, 70, -720, 82, 60],   // climb-out
  [-900, 125, -700, 84, 220],
  [-900, 140, 850, 86, 320],  // clockwise loop around the 900 m map
  [900, 150, 900, 86, 320],
  [900, 130, -250, 84, 320],
  [1250, 34, -720, 78, 380],  // base -> long final from the east
  [700, 12, -720, 72, 0],
  [450, 0, -720, 66, 0],      // touchdown
  [-110, 0, -720, 14, 0],     // rollout
  [-120, 0, -720, 10, 30],    // exit the runway
  [-120, 0, -672, 9, 30],
  [18, 0, -672, 8, 26],
  [18, 0, -615, 0, 0],        // park
];
const PUSH_WP = 1;            // nose stays toward the terminal until the pushback is done

function buildTable() {
  const pts = [], keyAt = [];   // dense polyline in 3D + the distance at each waypoint
  const P = ROUTE.map(r => new THREE.Vector3(r[0], r[1], r[2]));
  const push = v => pts.push(v.clone());
  push(P[0]); keyAt.push(0);
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const r = Math.min(ROUTE[i][4], l1 / 2 - .01, l2 / 2 - .01);
    if (r < 1) { push(b); keyAt.push(pts.length - 1); continue; }
    const p0 = b.clone().lerp(a, r / l1), p2 = b.clone().lerp(c, r / l2);
    const N = 14;
    for (let k = 0; k <= N; k++) { const u = k / N, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; push(new THREE.Vector3(w0 * p0.x + w1 * b.x + w2 * p2.x, w0 * p0.y + w1 * b.y + w2 * p2.y, w0 * p0.z + w1 * b.z + w2 * p2.z)); if (k === N >> 1) keyAt.push(pts.length - 1); }
  }
  push(P[P.length - 1]); keyAt.push(pts.length - 1);
  const cd = [0]; for (let i = 1; i < pts.length; i++) cd.push(cd[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const kd = keyAt.map(i => cd[i]), total = cd[cd.length - 1];
  const speedAt = d => { let i = 0; while (i < kd.length - 2 && d > kd[i + 1]) i++; const u = Math.min(1, Math.max(0, (d - kd[i]) / ((kd[i + 1] - kd[i]) || 1))); return ROUTE[i][3] + (ROUTE[i + 1][3] - ROUTE[i][3]) * u; };
  const at = (d, out) => { let lo = 0, hi = cd.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cd[m] <= d) lo = m; else hi = m; } const u = Math.min(1, Math.max(0, (d - cd[lo]) / ((cd[hi] - cd[lo]) || 1))); return out.copy(pts[lo]).lerp(pts[hi], u); };
  // time table: distance travelled every DT seconds
  const ds = [0]; let d = 0, guard = 0;
  while (d < total - .05 && guard++ < 20000) { d = Math.min(total, d + Math.max(.8, speedAt(d)) * DT); ds.push(d); }
  const n = ds.length, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), YAW = new Float32Array(n), PIT = new Float32Array(n), ROL = new Float32Array(n), SPD = new Float32Array(n), THR = new Float32Array(n);
  const v = new THREE.Vector3(), w = new THREE.Vector3(); let yaw = 0, pit = 0, rol = 0;
  const pushEnd = kd[PUSH_WP];
  for (let i = 0; i < n; i++) {
    at(ds[i], v); X[i] = v.x; Y[i] = v.y; Z[i] = v.z;
    at(Math.min(total, ds[i] + 6), w); const t = w.clone().sub(v); if (i === n - 1) t.copy(pts[pts.length - 1]).sub(pts[pts.length - 2]);
    const hor = Math.hypot(t.x, t.z) || 1, want = ds[i] < pushEnd ? 0 : Math.atan2(t.x, t.z);
    let dy = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)); const ground = v.y < .6, lim = ground ? .5 * DT : 1;
    const prev = yaw; yaw += Math.max(-lim, Math.min(lim, dy)); YAW[i] = yaw;
    const slope = Math.atan2(t.y, hor); let tp = slope; if (v.y < 9 && t.y < 0) tp = .05; if (ground && ds[i] > kd[3] && ds[i] < kd[4]) tp = 0;
    pit += (tp - pit) * .12; PIT[i] = ground && Math.abs(pit) < .02 ? 0 : pit;
    const rate = (yaw - prev) / DT, sp = Math.max(.8, speedAt(ds[i])); SPD[i] = sp;
    rol += ((v.y > 3 ? Math.max(-.5, Math.min(.5, Math.atan(sp * rate / 9.8))) : 0) - rol) * .2; ROL[i] = rol;
  }
  for (let i = 0; i < n; i++) { const a = SPD[Math.min(n - 1, i + 1)] - SPD[i], climb = Math.max(0, PIT[i]); THR[i] = Math.max(.22, Math.min(1, .28 + a / DT * .11 + climb * 1.6)); if (ds[i] >= kd[kd.length - 3] - 1 && Y[i] < 1 && a <= 0) THR[i] = Math.min(THR[i], .35); }
  return { n, X, Y, Z, YAW, PIT, ROL, SPD, THR, dur: (n - 1) * DT, total };
}

const TB = buildTable();
const CYC = Math.ceil(TB.dur + DWELL), OFFSET = 1700000000 % CYC;
const phaseNow = () => (((Date.now() / 1000 + OFFSET) % CYC) + CYC) % CYC;
function sample(ph, o) {   // ph: seconds into the cycle -> pose into o
  const t = ph - DWELL, k = Math.min(TB.n - 1, Math.max(0, t / DT)), i = Math.min(TB.n - 2, k | 0), u = k - i;
  if (t < 0 || k >= TB.n - 1) { const j = t < 0 ? 0 : TB.n - 1; o.x = TB.X[j]; o.y = TB.Y[j]; o.z = TB.Z[j]; o.yaw = TB.YAW[j]; o.pit = 0; o.rol = 0; o.sp = 0; o.thr = .2; o.parked = true; return o; }
  const L = (a) => a[i] + (a[i + 1] - a[i]) * u;
  o.x = L(TB.X); o.y = L(TB.Y); o.z = L(TB.Z); o.yaw = L(TB.YAW); o.pit = L(TB.PIT); o.rol = L(TB.ROL); o.sp = L(TB.SPD); o.thr = L(TB.THR); o.parked = false; return o;
}


// ---------- cabin (plane-local; airliner geo is translated y+4.08; +z is the nose)
const FL = 3.12, EYE_STAND = 1.55, EYE_SEAT = 1.18, CEIL = 5.0;
const XW = 1.20, Z0 = -11.35, ZD = 11.20, Z1 = 16.35, AISLE = .42, PR = .22;
const ROWS = 18, ROW0 = 9.55, ROWP = .98, SEAT_IN = .50, SEAT_OUT = 1.10;
const SNAP = {
  cabin: { x: -.58, z: 2.7, eye: EYE_SEAT, yaw: -.92, pit: .02 },
  cockpit: { x: 0, z: 14.45, eye: 1.50, yaw: 0, pit: -.02 }
};

function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g;
}
const box = (w, h, d, x, y, z, col) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);

function buildCabin(plane, low) {
  const p = [], backs = [];
  const midZ = (Z0 + ZD) / 2, cabL = ZD - Z0, doorW = 1.0, doorH = 1.72;
  p.push(box(XW * 2, .06, cabL, 0, FL, midZ, 0x2a2420));
  p.push(box(AISLE * 2, .02, cabL - .2, 0, FL + .04, midZ, 0x5a2014));
  p.push(box(1.9, .06, Z1 - ZD, 0, FL, (ZD + Z1) / 2, 0x1c1e24));
  p.push(box(XW * 2 + .02, .06, cabL + .04, 0, CEIL, midZ, 0xf2ece3));
  p.push(box(1.8, .05, Z1 - ZD, 0, CEIL - .05, (ZD + Z1) / 2, 0xd8d4cc));
  p.push(box(XW * 2, CEIL - FL, .08, 0, (FL + CEIL) / 2, Z0, 0xddd6cc));
  const sideW = (XW * 2 - doorW) / 2;
  p.push(box(sideW, CEIL - FL, .08, -(doorW + XW * 2) / 4, (FL + CEIL) / 2, ZD, 0xddd6cc));
  p.push(box(sideW, CEIL - FL, .08, (doorW + XW * 2) / 4, (FL + CEIL) / 2, ZD, 0xddd6cc));
  p.push(box(doorW, CEIL - FL - doorH, .08, 0, FL + doorH + (CEIL - FL - doorH) / 2, ZD, 0xddd6cc));
  const WY = FL + 1.22, WH = .55, WW = .7;
  for (const s of [1, -1]) {
    p.push(box(.05, WY - FL - .18, cabL - .1, s * (XW - .03), (FL + WY - .18) / 2, midZ, 0xc4b8a4));
    p.push(box(.05, CEIL - (WY + WH / 2) - .04, cabL - .1, s * (XW - .03), (WY + WH / 2 + CEIL) / 2, midZ, 0xe6dfd2));
    p.push(box(.4, .22, cabL - .8, s * .78, CEIL - .28, midZ, 0xf0ebe3));
  }
  p.push(box(1.15, .03, cabL - .6, 0, CEIL - .04, midZ, 0xfff6e0));   // ceiling light strip
  for (let i = 0; i < ROWS; i++) {
    const z = ROW0 - i * ROWP; if (z < Z0 + .8) continue;
    for (const s of [1, -1]) {
      p.push(box(.08, WH + .18, .22, s * (XW - .02), WY, z + ROWP / 2, 0x3a3f48));   // window post
      p.push(box(.08, .08, WW + .06, s * (XW - .02), WY - WH / 2 - .02, z, 0x3a3f48)); // sill
      p.push(box(.08, .08, WW + .06, s * (XW - .02), WY + WH / 2 + .02, z, 0x3a3f48)); // header
      const x = s * (SEAT_IN + SEAT_OUT) / 2, sw = SEAT_OUT - SEAT_IN;
      p.push(box(sw, .12, .48, x, FL + .28, z, 0x2a3d55));
      p.push(box(sw, .72, .08, x, FL + .64, z - .22, 0x24364c));
      p.push(box(.05, .32, .48, x - s * sw / 2, FL + .36, z, 0x1a1c20));
      backs.push({ x0: x - sw / 2 - .02, x1: x + sw / 2 + .02, z0: z - .30, z1: z - .14 });
    }
  }
  for (const s of [1, -1]) {
    p.push(box(.42, .12, .42, s * .42, FL + .28, 13.8, 0x22262c));
    p.push(box(.42, .55, .08, s * .42, FL + .55, 13.55, 0x1a1d22));
    backs.push({ x0: s * .42 - .24, x1: s * .42 + .24, z0: 13.42, z1: 13.64 });
  }
  p.push(box(1.7, .08, .7, 0, FL + 1.05, 15.35, 0x16181c));
  p.push(box(1.7, .28, .08, 0, FL + 1.16, 15.65, 0x0e1014));
  p.push(box(.22, .1, .02, -.42, FL + 1.18, 15.62, 0x7ad0ff));
  p.push(box(.22, .1, .02, 0, FL + 1.18, 15.62, 0x9cffb0));
  p.push(box(.22, .1, .02, .42, FL + 1.18, 15.62, 0xffd27a));
  p.push(box(.14, .06, .02, 0, FL + 1.08, 15.62, 0xff6a1a));
  p.push(box(1.9, .06, .08, 0, CEIL - .15, 16.15, 0x22262c));
  p.push(box(.08, CEIL - FL - .2, .08, .9, (FL + CEIL) / 2, 16.15, 0x22262c));
  p.push(box(.08, CEIL - FL - .2, .08, -.9, (FL + CEIL) / 2, 16.15, 0x22262c));
  for (const s of [1, -1]) p.push(box(.05, CEIL - FL, Z1 - ZD, s * .95, (FL + CEIL) / 2, (ZD + Z1) / 2, 0x2a3038));
  p.push(box(1.85, .08, .5, 0, FL + 1.24, 15.5, 0x1a1d22));   // glareshield, kept low so the windshield stays open
  p.push(box(1.85, .05, .1, 0, FL + 1.29, 15.72, 0x121418));
  const mesh = new THREE.Mesh(mergeGeometries(p, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .04, emissive: 0x3a322c, emissiveIntensity: .7 }));
  mesh.name = 'cabin_int'; mesh.visible = false; mesh.frustumCulled = false; plane.add(mesh);
  const panes = [];
  for (let i = 0; i < ROWS; i++) {
    const z = ROW0 - i * ROWP; if (z < Z0 + .7 || z > ZD - .5) continue; if (low && i % 2) continue;
    for (const s of [1, -1]) panes.push(colored(new THREE.PlaneGeometry(WW, WH).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(s * (XW - .012), WY, z), 0xb8d4e6));
  }
  panes.push(colored(new THREE.PlaneGeometry(1.7, 1.15).translate(0, FL + 1.55, 16.18), 0xc5e0f0));
  const glass = new THREE.Mesh(mergeGeometries(panes, false), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .08, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  glass.name = 'cabin_glass'; glass.visible = false; glass.frustumCulled = false; plane.add(glass);
  const dash = { x0: -.9, x1: .9, z0: 15.05, z1: 16.4 };
  function collide(x, z) {
    const cock = z > ZD, xmax = cock ? .92 : XW - .08;
    x = Math.max(-xmax, Math.min(xmax, x)); z = Math.max(Z0 + PR, Math.min(Z1 - .2, z));
    if (Math.abs(z - ZD) < PR + .04 && Math.abs(x) > doorW / 2 - PR) z = z < ZD ? ZD - PR - .04 : ZD + PR + .04;
    const hit = (b) => {
      const cx = Math.max(b.x0, Math.min(b.x1, x)), cz = Math.max(b.z0, Math.min(b.z1, z));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < PR * PR) {
        if (d2 < 1e-8) { z = b.z1 + PR; return; }
        const d = Math.sqrt(d2), k = (PR - d) / d; x += dx * k; z += dz * k;
      }
    };
    for (let i = 0; i < backs.length; i++) hit(backs[i]);
    hit(dash);
    x = Math.max(-xmax, Math.min(xmax, x)); z = Math.max(Z0 + PR, Math.min(Z1 - .2, z));
    return { x, z };
  }
  return { mesh, glass, collide, doorW };
}

function css() {
  const s = document.createElement('style');
  s.textContent = `#bcAirRide{position:fixed;inset:0;pointer-events:none;z-index:45;display:none;font:600 14px system-ui;color:#fff3e2}
#bcAirRide.on{display:block}#bcAirRide .top{position:absolute;left:50%;top:calc(env(safe-area-inset-top) + 64px);transform:translateX(-50%);text-align:center;background:#1a0f08cc;border:1px solid #ff7a1a88;border-radius:12px;padding:8px 14px;max-width:88vw}
#bcAirRide .top b{display:block;font-size:15px}#bcAirRide .top small{display:block;opacity:.85;font-weight:500;margin-top:2px}
#bcAirRide .bot{display:flex;justify-content:center;gap:8px;margin-top:8px}
#bcAirRide button{pointer-events:auto;min-height:44px;min-width:44px;border-radius:10px;border:1px solid #ff9a42;background:#2a1409e8;color:#fff3e2;font:700 14px system-ui;padding:8px 14px;touch-action:manipulation}
#bcAirRide .dash{position:absolute;left:0;right:0;bottom:0;height:9vh;display:none;background:linear-gradient(#0d1118cc,#06080ce8);border-top:2px solid #232a35;pointer-events:none}
#bcAirRide[data-v=cockpit] .dash{display:block}`;
  document.head.append(s);
  const h = document.createElement('div'); h.id = 'bcAirRide'; h.setAttribute('role', 'region'); h.setAttribute('aria-label', 'BURN Air 1 flight');
  h.innerHTML = `<div class="dash"></div><div class="top"><b id="bcAirT">BURN Air 1</b><small id="bcAirS"></small><div class="bot"><button type="button" id="bcAirV">View: Cockpit</button><button type="button" id="bcAirX">Exit</button></div></div>`;
  document.body.append(h); return h;
}

function init(A) {
  const c = window.__city, BC = window.__BC, C = c.C, { grp, planeGeo, mat } = A.api;
  const plane = new THREE.Mesh(planeGeo, mat); plane.name = 'burn_air_1'; plane.frustumCulled = false; grp.add(plane);
  const lamp = (col, x, y, z, r = .35) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); m.position.set(x, y, z); plane.add(m); return m; };
  lamp(new THREE.Color(2.4, .1, .05), 17, 3.4, -4.5); lamp(new THREE.Color(.1, 2.4, .3), -17, 3.4, -4.5); const strobe = lamp(new THREE.Color(3, 3, 3), 0, 10.5, -21, .4);
  const cabin = buildCabin(plane, (c.TIER === 'low') || !!c.MOBILE);
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pit: 0, rol: 0, sp: 0, thr: 0, parked: true }, e = new THREE.Euler(0, 0, 0, 'YXZ');
  function place(ph) { sample(ph, pose); plane.position.set(pose.x, pose.y, pose.z); e.set(-pose.pit, pose.yaw, -pose.rol); plane.quaternion.setFromEuler(e); strobe.visible = (performance.now() % 1300) < 90 && !pose.parked; }

  // ---------- riding (walk in the plane's local frame; seat/cockpit are snaps)
  const hud = css(), $ = id => document.getElementById(id);
  let ride = null;   // { view, prevMode, yaw, pit, flew, lx, lz, eye, drag }
  const world = new THREE.Vector3(), look = new THREE.Vector3(), lq = new THREE.Quaternion(), up = new THREE.Vector3();
  const spaceBusy = () => { try { const st = window.__citySpace?.state?.().stage; return !!st && st !== 'parked'; } catch { return false; } };
  const blocked = () => !!(window.__estatesIslandLive?.active || window.__burnTowerOpen || window.__cityPaused || spaceBusy() || document.body.classList.contains('wl-travel'));
  function showTouch(on) {
    const t = $('touch'); if (!t || !c.MOBILE) return;
    if (on) { t.classList.add('on'); ['tJump', 'tUse', 'tUp', 'tDown'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; }); const r = $('tRun'); if (r) r.style.display = ''; }
  }
  function board() {
    if (ride || blocked() || !pose.parked || phaseNow() > DWELL - BOARD_CLOSE) return false;
    const mode = window.__burnMode ? window.__burnMode() : 'orbit';
    ride = { view: 'cabin', prevMode: mode, yaw: 0, pit: 0, flew: false, drag: null, lx: 0, lz: 0, eye: EYE_STAND };
    document.activeElement?.blur?.(); const info = document.getElementById('info'); if (info) info.style.display = 'none';
    window.__setBurnMode && window.__setBurnMode('orbit'); if (BC && BC.orbit) BC.orbit.enabled = false;
    cabin.mesh.visible = cabin.glass.visible = true; hud.classList.add('on'); showTouch(true); const rec = $('recap'); if (rec) rec.style.display = 'none'; setView('cabin'); return true;
  }
  function setView(v) {
    const s = SNAP[v] || SNAP.cabin; ride.view = v === 'cockpit' ? 'cockpit' : 'cabin';
    ride.lx = s.x; ride.lz = s.z; ride.eye = s.eye; ride.yaw = s.yaw; ride.pit = s.pit;
    hud.dataset.v = ride.view; $('bcAirV').textContent = ride.view === 'cabin' ? 'View: Cockpit' : 'View: Window seat';
  }
  function exit(msg) {
    if (!ride) return; const prev = ride.prevMode; ride = null;
    cabin.mesh.visible = cabin.glass.visible = false; hud.classList.remove('on'); hud.dataset.v = ''; C.up.set(0, 1, 0); const rec = $('recap'); if (rec) rec.style.display = '';
    const x = 40, z = -603, P = c.P;
    if (prev === 'explore' && P && P.pos) { P.pos.set(x, c.groundAt ? c.groundAt(x, z, 0) : 0, z); P.vel && P.vel.set(0, 0, 0); window.__setBurnMode('explore'); }
    else { window.__setBurnMode && window.__setBurnMode('orbit'); if (BC && BC.orbit) { BC.orbit.enabled = true; BC.orbit.target.set(18, 4, -615); C.position.set(80, 40, -560); C.lookAt(18, 4, -615); } }
    if (msg) { const t = document.getElementById('toast'); if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); } }
  }
  $('bcAirV').onclick = () => ride && setView(ride.view === 'cabin' ? 'cockpit' : 'cabin');
  $('bcAirX').onclick = () => exit('Back at the terminal');
  addEventListener('keydown', ev => { if (!ride || ev.target.closest?.('input,textarea,select')) return; if (ev.code === 'KeyV') { setView(ride.view === 'cabin' ? 'cockpit' : 'cabin'); ev.preventDefault(); } else if (ev.code === 'Escape' || ev.code === 'KeyX') { exit('Back at the terminal'); ev.preventDefault(); } }, true);
  const lookTarget = ev => ev.target.closest?.('button,#touch,#joy,#knob,#tbtns,#bcAirRide .bot');
  addEventListener('pointerdown', ev => { if (ride && !lookTarget(ev)) ride.drag = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; }, true);
  addEventListener('pointermove', ev => {
    const d = ride && ride.drag; if (!d || d.id !== ev.pointerId) return;
    ride.yaw -= (ev.clientX - d.x) * .005; if (ride.yaw > Math.PI) ride.yaw -= Math.PI * 2; else if (ride.yaw < -Math.PI) ride.yaw += Math.PI * 2;
    ride.pit = Math.max(-1.15, Math.min(1.15, ride.pit - (ev.clientY - d.y) * .004)); d.x = ev.clientX; d.y = ev.clientY;
  }, true);
  addEventListener('pointerup', () => { if (ride) ride.drag = null; }, true); addEventListener('pointercancel', () => { if (ride) ride.drag = null; }, true);
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  (window.__interactors = window.__interactors || []).push(p => {
    if (ride || !pose.parked || phaseNow() > DWELL - BOARD_CLOSE) return null;
    const d = Math.hypot(p.x - pose.x, p.z - pose.z) - 26; if (d > 10) return null;
    return { d: Math.max(0, d), label: 'Board BURN Air 1 · scenic flight (departs in ' + mmss(DWELL - phaseNow()) + ')', act: board };
  });

  // ---------- sound: synthesized, quiet, distance-attenuated, follows the City's sound toggle
  let au = null;
  const REF = 70, MAXG = .5, BUS = .30;   // reference distance (m), peak bus level, overall level under the city master
  function audioInit(AC, master) {
    const bus = AC.createGain(); bus.gain.value = 0; bus.connect(master);
    const nb = AC.createBuffer(1, AC.sampleRate, AC.sampleRate), nd = nb.getChannelData(0); let lp = 0; for (let i = 0; i < nd.length; i++) { lp += .08 * ((Math.random() * 2 - 1) - lp); nd[i] = lp * 3; }
    const noise = AC.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const hum = ['sawtooth', 'triangle'].map((t, i) => { const o = AC.createOscillator(); o.type = t; o.frequency.value = 62 * (i ? 1.5 : 1); return o; });
    const humLP = AC.createBiquadFilter(); humLP.type = 'lowpass'; humLP.frequency.value = 260; const humG = AC.createGain(); humG.gain.value = 0;
    hum.forEach((o, i) => { const g = AC.createGain(); g.gain.value = i ? .5 : 1; o.connect(g).connect(humLP); o.start(); }); humLP.connect(humG).connect(bus);
    const roar = AC.createBiquadFilter(); roar.type = 'bandpass'; roar.frequency.value = 700; roar.Q.value = .5; const roarG = AC.createGain(); roarG.gain.value = 0; noise.connect(roar).connect(roarG).connect(bus); noise.start();
    const rumble = AC.createBiquadFilter(); rumble.type = 'lowpass'; rumble.frequency.value = 110; const rumG = AC.createGain(); rumG.gain.value = 0; noise.connect(rumble).connect(rumG).connect(bus);
    const air = AC.createBiquadFilter(); air.type = 'highpass'; air.frequency.value = 1800; const airG = AC.createGain(); airG.gain.value = 0; noise.connect(air).connect(airG).connect(bus);
    return { AC, bus, hum, humLP, humG, roar, roarG, rumG, airG };
  }
  const prevPos = new THREE.Vector3(); let prevT = 0, doppler = 1;
  function sound(dt) {
    const a = c.audio && c.audio(); if (!a || !a.AC) return;
    if (!au) { if (!a.on) return; au = audioInit(a.AC, a.master); }
    const AC = au.AC, now = AC.currentTime, on = !!a.on && !document.hidden;
    world.copy(plane.position); grp.localToWorld(world);
    const dist = ride ? 0 : C.position.distanceTo(world);
    let g = ride ? .9 : Math.min(1, 1 / (1 + (dist / REF) * (dist / REF)) * 1.0);   // strong falloff: ~.2 at 140 m, ~.03 at 400 m
    if (dist > 1100 && !ride) g = 0;
    const thr = pose.parked ? .12 : pose.thr, air = pose.y > 2, cock = !!(ride && (ride.view === 'cockpit' || ride.lz > ZD)), cabin = !!(ride && !cock);
    // Doppler from the radial speed between the camera and the plane (clamped so it stays gentle)
    if (!ride && prevT) { const rv = (dist - prevPos.x) / Math.max(.016, dt); doppler += (Math.max(.82, Math.min(1.2, 340 / (340 + Math.max(-90, Math.min(90, rv))))) - doppler) * .2; } else doppler = 1;
    prevPos.x = dist; prevT = 1;
    const T = (p, v, k = .12) => p.setTargetAtTime(v, now, k);
    const base = on && (!pose.parked || ride || dist < 60) ? BUS * MAXG * g : 0;
    T(au.bus.gain, on ? 1 : 0, .25);
    T(au.humG.gain, base * (.35 + thr * .5) * (pose.parked && !ride ? .6 : 1));
    au.hum[0].frequency.setTargetAtTime((58 + thr * 70) * doppler, now, .3); au.hum[1].frequency.setTargetAtTime((88 + thr * 100) * doppler, now, .3);
    T(au.humLP.frequency, (cabin ? 220 : cock ? 320 : 260 + thr * 700) * (ride ? 1 : doppler), .2);
    T(au.roarG.gain, base * thr * thr * (ride ? (cock ? .5 : .28) : 1.3));   // takeoff / climb roar rides the throttle
    T(au.roar.frequency, (450 + thr * 1100) * doppler, .25);
    T(au.rumG.gain, base * (pose.y < .6 && !pose.parked ? Math.min(1, pose.sp / 40) * (ride ? .9 : .6) : 0));   // wheel rumble on the ground roll
    T(au.airG.gain, on && ride ? BUS * .016 * (cabin ? 1.2 : .7) * (air ? 1 : .4) : 0, .5);   // cabin air ambience
  }

  function walkCabin(dt) {
    const inp = c.input || {}, keys = inp.keys || {}, joy = inp.joy || { x: 0, y: 0 }, tb = inp.tb || {};
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - (joy.y || 0);
    const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (joy.x || 0);
    const ml = Math.min(1, Math.hypot(f, s)); if (ml < .05) return;
    const run = !!(keys.ShiftLeft || keys.ShiftRight || tb.run), spd = (run ? 6.5 : 3.6) * ml;
    const sy = Math.sin(ride.yaw), cy = Math.cos(ride.yaw);
    const n = cabin.collide(ride.lx + (sy * f + cy * s) / ml * spd * dt, ride.lz + (cy * f - sy * s) / ml * spd * dt);
    ride.lx = n.x; ride.lz = n.z; ride.eye += (EYE_STAND - ride.eye) * Math.min(1, dt * 6);
  }
  function camUpdate(dt) {
    walkCabin(dt);
    plane.updateMatrixWorld(true);
    const cp = Math.cos(ride.pit), sp = Math.sin(ride.pit);
    look.set(Math.sin(ride.yaw) * cp, sp, Math.cos(ride.yaw) * cp);
    const sway = Math.sin(performance.now() / 700) * .015 * (pose.parked ? 0 : 1);
    world.set(ride.lx, FL + ride.eye + sway, ride.lz); plane.localToWorld(world);
    C.position.copy(world);
    look.set(ride.lx + Math.sin(ride.yaw) * cp * 40, FL + ride.eye + sp * 40, ride.lz + Math.cos(ride.yaw) * cp * 40);
    plane.localToWorld(look);
    lq.copy(plane.getWorldQuaternion(lq)); C.up.set(0, 1, 0).applyQuaternion(lq);   // stay planted on the cabin floor, including bank
    C.lookAt(look);
    hud.dataset.v = ride.lz > ZD ? 'cockpit' : (ride.view === 'cabin' && Math.hypot(ride.lx - SNAP.cabin.x, ride.lz - SNAP.cabin.z) < .35 ? 'cabin' : 'walk');
  }
  function hudUpdate(ph) {
    const rec = $('recap'); if (rec) rec.style.display = 'none';
    const tip = $('iosHint'); if (tip) tip.style.display = 'none';
    const alt = Math.round(pose.y), kmh = Math.round(pose.sp * 3.6), state = pose.parked ? 'At the gate' : pose.y > 3 ? 'In flight' : pose.sp > 25 ? 'Rolling' : 'Taxiing';
    const s = `${state} · ${kmh} km/h · ${alt} m · walk the cabin · drag to look · V = snap · Esc = exit`; if ($('bcAirS').textContent !== s) $('bcAirS').textContent = s;
    const where = ride.lz > ZD ? 'Cockpit' : Math.hypot(ride.lx - SNAP.cabin.x, ride.lz - SNAP.cabin.z) < .45 ? 'Window seat' : 'Cabin';
    const t = 'BURN Air 1 · ' + where; if ($('bcAirT').textContent !== t) $('bcAirT').textContent = t;
  }

  (window.__preRender = window.__preRender || []).push(dt => {
    try {
      const ph = phaseNow(); place(ph);
      if (ride) {
        if (!ride.flew && !pose.parked) ride.flew = true;
        if (ride.flew && pose.parked) { exit('Welcome back to BURN City'); }
        else if (blocked()) exit(); else { camUpdate(dt); hudUpdate(ph); }
      }
      sound(dt);
    } catch (err) { if (!A.shuttleError) { A.shuttleError = String(err && err.stack || err).slice(0, 300); console.warn('airport shuttle', err); } }
  });
  A.shuttle = { cycle: CYC, dwell: DWELL, flightSeconds: TB.dur, routeMetres: Math.round(TB.total), phase: phaseNow, pose: () => ({ ...pose }), riding: () => !!ride, board, exit, view: v => ride && setView(v), sample: (ph) => ({ ...sample(ph, {}) }), local: () => ride && ({ x: ride.lx, z: ride.lz, yaw: ride.yaw, pit: ride.pit, eye: ride.eye, view: ride.view }), placeInCabin: (x, z) => { if (!ride) return null; const n = cabin.collide(x, z); ride.lx = n.x; ride.lz = n.z; return { ...n }; } };
}

(function wait() {
  if (Q.get('shuttle') === '0' || Q.has('noairport')) return;
  const A = window.__airport;
  if (A && A.ready && A.api && window.__city && window.__city.audio) { try { init(A); } catch (e) { console.warn('airport shuttle init', e); } }
  else setTimeout(wait, 500);
})();
