// BURN City International: a real-scale airport south of town (negative z).
// 1.1 km runway 09/27 with markings and edge lights, parallel taxiway, apron, curved-roof terminal with six gates
// and jet bridges, ATC tower with a rotating beacon, hangar, fuel farm, car park, an access road with curbside
// drop-off/pick-up traffic and passengers, apron tugs, and one movement every ~100 s (arrival or departure).
// Draw-call budget: static parts merged into a few meshes; repeated parts instanced; only the moving plane is separate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const A = window.__airport = { ready: false, log: [] };
const Q = new URLSearchParams(location.search), RATE = +(Q.get('airrate') || 1);
function colored(g, hex) { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
const box = (w, h, d, x, y, z, col) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
const cyl = (rt, rb, h, x, y, z, col, seg = 12) => colored(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), col);
const merge = a => mergeGeometries(a, false);

// layout (world metres). Runway along x; city is to the north (+z).
const RW = { z: -720, x0: -550, x1: 550, w: 45 }, TW = { z: -672 }, APRON = { z0: -655, z1: -585 }, TERM = { x: 0, z: -560, w: 230, d: 40 };
const ROAD = { x: 0, z0: -335, z1: -515 }, CURB = { z: -522 };

function runwayTex() {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, 2048, 128); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .04})`; g.fillRect(Math.random() * 2048, Math.random() * 128, 2, 2); }
  g.fillStyle = '#f2f2ee'; for (let x = 120; x < 1928; x += 48) g.fillRect(x, 62, 26, 4);   // centreline
  g.fillRect(0, 4, 2048, 2); g.fillRect(0, 122, 2048, 2);                                     // edge lines
  for (const x0 of [8, 2008]) for (let k = 0; k < 8; k++) g.fillRect(x0, 10 + k * 14 + (k > 3 ? 8 : 0), 32, 8);   // threshold piano keys
  for (const x of [190, 1840]) { g.fillRect(x, 30, 40, 10); g.fillRect(x, 88, 40, 10); }   // touchdown zone
  g.save(); g.font = 'bold 44px system-ui'; g.translate(90, 64); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillText('09', 0, 0); g.restore();
  g.save(); g.font = 'bold 44px system-ui'; g.translate(1958, 64); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('27', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function lineTex(base, line, dash) { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 64, 64); g.fillStyle = line; if (dash) g.fillRect(29, 0, 6, 40); else g.fillRect(29, 0, 6, 64); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }
// flat airfield surfaces draw AFTER the city ground overlay (transparent, no depth write) in a fixed layer order:
// no z-fighting at any distance, and still depth-tested against planes/buildings.
const flat = (m, o) => { m.material.transparent = true; m.material.depthWrite = false; m.renderOrder = 10 + o; return m; };
function strip(x0, z0, x1, z1, w, tex, rep, y = .05) {   // textured road/taxi strip from (x0,z0) to (x1,z1), texture v along the strip
  const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(w, L).rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * L / rep);
  g.rotateY(Math.atan2(x1 - x0, z1 - z0)); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: .9 })); m.receiveShadow = true; return flat(m, Math.round(y * 100));
}

// airliner (front = +z): 38 m long, 34 m span, BURN livery
function airliner() {
  const p = [];
  p.push(colored(new THREE.CylinderGeometry(2, 2, 30, 16).rotateX(Math.PI / 2), 0xf4f4f2));
  p.push(colored(new THREE.SphereGeometry(2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.6).translate(0, 0, 15), 0xf4f4f2));
  p.push(colored(new THREE.ConeGeometry(2, 7, 16).rotateX(-Math.PI / 2).translate(0, .5, -18.5), 0xf4f4f2));
  p.push(colored(new THREE.CylinderGeometry(2.02, 2.02, 30, 16, 1, true, -.5, 1).rotateX(Math.PI / 2), 0xff6a1a));   // belly stripe
  p.push(box(.06, .5, 1.1, 1.75, .9, 16.6, 0x14181f), box(.06, .5, 1.1, -1.75, .9, 16.6, 0x14181f));                 // cockpit
  const wing = new THREE.Shape(); wing.moveTo(0, 3); wing.lineTo(17, -3.5); wing.lineTo(17, -5.2); wing.lineTo(0, -4); wing.lineTo(0, 3);
  for (const s of [1, -1]) { const g = new THREE.ExtrudeGeometry(wing, { depth: .35, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, -.6, 0); if (s < 0) g.scale(-1, 1, 1); p.push(colored(g, 0xdfe2e6)); p.push(colored(new THREE.CylinderGeometry(1.1, 1, 4.2, 14).rotateX(Math.PI / 2).translate(s * 6, -1.5, 1.2), 0xc8ccd2)); p.push(colored(new THREE.CylinderGeometry(1.12, 1.12, .3, 14).rotateX(Math.PI / 2).translate(s * 6, -1.5, 3.3), 0xff6a1a)); }
  const tail = new THREE.Shape(); tail.moveTo(0, 0); tail.lineTo(-5.5, 0); tail.lineTo(-7.5, 7); tail.lineTo(-5.2, 7); tail.lineTo(0, 0);
  p.push(colored(new THREE.ExtrudeGeometry(tail, { depth: .3, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(.15, 1.6, -15.5), 0xff6a1a));
  const hs = new THREE.Shape(); hs.moveTo(0, 0); hs.lineTo(6.5, -2.5); hs.lineTo(6.5, -3.6); hs.lineTo(0, -3.2);
  for (const s of [1, -1]) { const g = new THREE.ExtrudeGeometry(hs, { depth: .2, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 1.2, -16.5); if (s < 0) g.scale(-1, 1, 1); p.push(colored(g, 0xdfe2e6)); }
  for (const [x, z] of [[0, 12.5], [2.6, -1], [-2.6, -1]]) p.push(cyl(.12, .12, 2.1, x, -2.6, z, 0x6a6e74, 6), colored(new THREE.CylinderGeometry(.55, .55, .5, 12).rotateZ(Math.PI / 2).translate(x, -3.4, z), 0x111111));
  const g = merge(p); g.translate(0, 3.95, 0); return g;   // wheels on the ground at y=0
}

function build() {
  const c = window.__city, CL = window.__cityLife, S = c.S, tier = c.TIER || 'medium';
  const grp = new THREE.Group(); grp.name = 'airport'; grp.position.y = .18; S.add(grp);   // lift the whole airfield clear of the city ground overlay (it is drawn on top within a few cm)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .12 });
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .12, metalness: .25, transparent: true, opacity: .62, emissive: 0x0d2233, emissiveIntensity: .6 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const add = (geo, m) => { const mm = new THREE.Mesh(geo, m); grp.add(mm); return mm; };

  // ---- surfaces
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1300, 420).rotateX(-Math.PI / 2).translate(0, .02, -650), new THREE.MeshStandardMaterial({ color: 0x3a4a34, roughness: 1 })); grp.add(flat(ground, 0));
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(RW.x1 - RW.x0, RW.w).rotateX(-Math.PI / 2).translate(0, .12, RW.z), new THREE.MeshStandardMaterial({ map: runwayTex(), roughness: .85, emissive: 0xffffff, emissiveIntensity: .35 })); rw.material.emissiveMap = rw.material.map; grp.add(flat(rw, 30));
  const twT = lineTex('#34353a', '#e8c020', false); grp.add(strip(RW.x0 + 30, TW.z, RW.x1 - 30, TW.z, 23, twT, 23, .06));
  for (const x of [-500, -120, 260, 500]) grp.add(strip(x, RW.z + RW.w / 2 - 2, x, APRON.z0 + 2, 20, twT, 20, .09));
  const ap = new THREE.Mesh(new THREE.PlaneGeometry(TERM.w + 60, APRON.z1 - APRON.z0).rotateX(-Math.PI / 2).translate(0, .03, (APRON.z0 + APRON.z1) / 2), new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: .9 })); grp.add(flat(ap, 2));
  const rdT = lineTex('#2b2c30', '#e8e2c8', true); grp.add(strip(ROAD.x, ROAD.z0, ROAD.x, ROAD.z1, 12, rdT, 8, .06));
  grp.add(strip(-80, CURB.z, 80, CURB.z, 12, rdT, 8, .09)); grp.add(strip(-80, CURB.z, -80, ROAD.z1 + 6, 12, rdT, 8, .12)); grp.add(strip(80, CURB.z, 80, ROAD.z1 + 6, 12, rdT, 8, .12)); grp.add(strip(-80, ROAD.z1 + 6, 80, ROAD.z1 + 6, 12, rdT, 8, .15));
  // sidewalks + curbs: access road both sides, terminal-side walk and outer edge of the curb loop (one merged mesh)
  { const sw = [], K = 0x9a9ca2, C = 0xd8d8d0, H = .18;
    for (const sx of [-1, 1]) { sw.push(box(3, H, ROAD.z0 - ROAD.z1 - 14, sx * 7.7, H / 2, (ROAD.z0 + ROAD.z1 - 14) / 2 + 7, K), box(.3, H + .04, ROAD.z0 - ROAD.z1 - 14, sx * 6.15, (H + .04) / 2, (ROAD.z0 + ROAD.z1 - 14) / 2 + 7, C)); }
    sw.push(box(172, H, 9, 0, H / 2, CURB.z - 6 - 4.5, K), box(172, H + .04, .3, 0, (H + .04) / 2, CURB.z - 6.15, C));
    for (const z of [ROAD.z1 + 6 + 7.7]) for (const [x0, x1] of [[-87.5, -7.7 - 1.5], [7.7 + 1.5, 87.5]]) sw.push(box(x1 - x0, H, 3, (x0 + x1) / 2, H / 2, z, K));
    add(merge(sw), mat); }
  const lotM = new THREE.Mesh(new THREE.PlaneGeometry(120, 60).rotateX(-Math.PI / 2).translate(-170, .03, -480), new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: .95 })); grp.add(flat(lotM, 2));

  // ---- runway edge + approach lights (one Points draw)
  const lp = [], lc = [], push = (x, z, r, g, b) => { lp.push(x, .35, z); lc.push(r, g, b); };
  for (let x = RW.x0; x <= RW.x1; x += 30) { push(x, RW.z + RW.w / 2 + 1, 1, .95, .8); push(x, RW.z - RW.w / 2 - 1, 1, .95, .8); }
  for (let k = -9; k <= 9; k++) { push(RW.x0 - 1, RW.z + k * 2.4, .2, 1, .3); push(RW.x1 + 1, RW.z + k * 2.4, 1, .1, .05); }
  for (let d = 30; d <= 300; d += 30) for (const k of [-2, -1, 0, 1, 2]) push(RW.x1 + d, RW.z + k * 3, 1, .95, .8);
  for (let x = RW.x0 + 30; x <= RW.x1 - 30; x += 25) { push(x, TW.z + 11.5, .2, .5, 1.6); push(x, TW.z - 11.5, .2, .5, 1.6); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  grp.add(new THREE.Points(lg, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, toneMapped: false, transparent: true, depthWrite: false })));

  // ---- terminal, concourse, jet bridges, tower, hangar, fuel farm (merged)
  const T = [];
  T.push(box(TERM.w, 12, TERM.d, TERM.x, 6, TERM.z, 0xd8dde4), box(TERM.w + 2, .8, TERM.d + 2, TERM.x, 12.4, TERM.z, 0x2a3240));
  // curved roof (Futurama wave) as a half-cylinder shell
  T.push(colored(new THREE.CylinderGeometry(1, 1, TERM.w + 6, 24, 1, true, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 8, TERM.d / 2 + 4).translate(TERM.x, 12.8, TERM.z), 0xe8ecf0));
  T.push(box(TERM.w + 8, .5, 10, TERM.x, 6.5, TERM.z + TERM.d / 2 + 5, 0xbfc6cf), ...[-100, -60, -20, 20, 60, 100].map(x => cyl(.3, .3, 6.5, x, 3.25, TERM.z + TERM.d / 2 + 9, 0x8a9098, 8)));   // curb canopy
  T.push(box(TERM.w, .25, .3, TERM.x, 6.3, TERM.z + TERM.d / 2 + 10, 0xff7a1a));
  const GATES = [-90, -54, -18, 18, 54, 90].map((x, i) => ({ i, x, z: -615, door: { x, z: TERM.z - TERM.d / 2 } }));
  GATES.forEach(gt => { T.push(box(3, 3, 16, gt.x - 4, 5, TERM.z - TERM.d / 2 - 8, 0xcfd4da), box(3.4, .4, 3.4, gt.x - 4, 2.2, TERM.z - TERM.d / 2 - 15, 0x5a6068), cyl(.25, .25, 3.5, gt.x - 4, 1.75, TERM.z - TERM.d / 2 - 15, 0x5a6068, 8), box(.2, .02, 26, gt.x, .07, gt.z + 2, 0xe8c020)); });
  const TW_ = { x: 140, z: -600 };
  T.push(cyl(3.2, 4.2, 42, TW_.x, 21, TW_.z, 0xd8dde4, 16), cyl(7, 4.2, 4, TW_.x, 44, TW_.z, 0x2a3240, 16), cyl(7.2, 7.2, .6, TW_.x, 50.6, TW_.z, 0x2a3240, 16), cyl(1.6, 1.6, 5, TW_.x, 53, TW_.z, 0xbfc6cf, 10), cyl(3.4, 3.4, .2, TW_.x, 30, TW_.z, 0xff7a1a, 16));
  T.push(colored(new THREE.CylinderGeometry(1, 1, 60, 20, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(36, 22, 1).translate(-220, 0, -615), 0x9aa2ac), box(48, 14, 1, -220, 7, -585, 0x5a6068));   // hangar: 72 x 60 m arch (axis along z), door wall on the north face sized to fit inside the arch
  for (let k = 0; k < 3; k++) T.push(cyl(7, 7, 9, 240 + k * 17, 4.5, -540, 0xe6e8ea, 18), cyl(7.1, 7.1, .5, 240 + k * 17, 8, -540, 0xff7a1a, 18));
  add(merge(T), mat);
  // glass: terminal facade (both sides) + tower cab
  add(merge([box(TERM.w - 6, 8, .3, TERM.x, 6.5, TERM.z + TERM.d / 2 + .2, 0x9fd8ff), box(TERM.w - 6, 8, .3, TERM.x, 6.5, TERM.z - TERM.d / 2 - .2, 0x9fd8ff), cyl(6.8, 6.8, 5.5, TW_.x, 47.6, TW_.z, 0x9fd8ff, 16), ...GATES.map(gt => box(2.6, 1.2, 15.6, gt.x - 4, 5.6, TERM.z - TERM.d / 2 - 8, 0x9fd8ff))]), glass);
  // terminal sign (shared city atlas)
  if (CL && CL.face) { const sg = CL.face(40, 10, 'sign_term'); sg.translate(TERM.x, 18, TERM.z + TERM.d / 2 + 4.5); grp.add(new THREE.Mesh(sg, CL.signMat)); const s45 = CL.face(.6, .75, 'speed45'); s45.translate(ROAD.x + 7.5, 2.15, ROAD.z0 - 20); grp.add(new THREE.Mesh(s45, CL.signMat)); grp.add(new THREE.Mesh(cyl(.04, .04, 2.5, ROAD.x + 7.5, 1.25, ROAD.z0 - 20.05, 0x8a9098, 6), mat)); }
  // tower beacon
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.4, .6, .4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 1.6), toneMapped: false })); beacon.position.set(TW_.x, 56, TW_.z); grp.add(beacon);
  // colliders
  for (let x = -100; x <= 100; x += 25) c.colliders.push({ x, z: TERM.z, r: 20, h: 13 });
  c.colliders.push({ x: TW_.x, z: TW_.z, r: 4.4, h: 51 }, { x: -220, z: -615, r: 30, h: 22 });
  for (let k = 0; k < 3; k++) c.colliders.push({ x: 240 + k * 17, z: -540, r: 7.2, h: 9 });

  // ---- parked planes (instanced) + the one moving plane
  const planeGeo = airliner();
  const parkedIM = new THREE.InstancedMesh(planeGeo, mat, GATES.length); parkedIM.frustumCulled = false; grp.add(parkedIM);
  const mover = new THREE.Mesh(planeGeo, mat); mover.visible = false; grp.add(mover);
  const navL = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .1, .05), toneMapped: false })), navR = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(.1, 2.4, .3), toneMapped: false })), strobe = new THREE.Mesh(new THREE.SphereGeometry(.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), toneMapped: false }));
  navL.position.set(-17, 3.4, -4.5); navR.position.set(17, 3.4, -4.5); strobe.position.set(0, 10.5, -21); mover.add(navL, navR, strobe);
  const occ = GATES.map((_, i) => i % 3 !== 2);   // 4 of 6 gates start occupied
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  function drawParked() { GATES.forEach((g, i) => { if (occ[i]) { q.setFromAxisAngle(up, 0); m4.compose(v.set(g.x, 0, g.z), q, one); parkedIM.setMatrixAt(i, m4); } else parkedIM.setMatrixAt(i, hide); }); parkedIM.instanceMatrix.needsUpdate = true; }
  drawParked();   // parked nose-in, facing +z toward the terminal

  // flight plans as keyframes: [x,y,z,speed m/s]; plane faces its direction of travel, pitch from climb/descent
  const RWYc = RW.z;
  function arrivalPlan(gate) {
    const g = GATES[gate]; return [[3600, 190, RWYc, 75], [RW.x1 - 40, 14, RWYc, 70], [RW.x1 - 160, 0, RWYc, 66], [-60, 0, RWYc, 22], [-120, 0, RWYc + 8, 12], [-120, 0, TW.z, 9], [g.x, 0, TW.z, 9], [g.x, 0, APRON.z0 + 4, 5], [g.x, 0, g.z, 1.5]];
  }
  function departurePlan(gate) {
    const g = GATES[gate]; return [[g.x, 0, g.z, 1.2], [g.x, 0, g.z - 14, 2], [g.x, 0, TW.z, 8], [RW.x1 - 50, 0, TW.z, 10], [RW.x1 - 20, 0, RWYc + 8, 6], [RW.x1 - 20, 0, RWYc, 3], [-150, 0, RWYc, 72], [-900, 60, RWYc, 85], [-3800, 420, RWYc, 95]];
  }
  let flight = null, nextOp = 25 / RATE, opT = 0, arrivals = 0, departures = 0;
  function startFlight() {
    const free = occ.map((o, i) => o ? -1 : i).filter(i => i >= 0), full = occ.map((o, i) => o ? i : -1).filter(i => i >= 0);
    const arrive = (A.nextArrive ?? (free.length && (departures >= arrivals || !full.length)));
    if (arrive && free.length) { const gi = free[(Math.random() * free.length) | 0]; flight = { kind: 'arr', gi, pts: arrivalPlan(gi), i: 0, pos: new THREE.Vector3(...arrivalPlan(gi)[0].slice(0, 3)) }; A.log.push('arrival to gate ' + (gi + 1)); }
    else if (full.length) { const gi = full[(Math.random() * full.length) | 0]; occ[gi] = false; drawParked(); flight = { kind: 'dep', gi, pts: departurePlan(gi), i: 0, pos: new THREE.Vector3(...departurePlan(gi)[0].slice(0, 3)) }; A.log.push('departure from gate ' + (gi + 1)); }
    A.nextArrive = undefined; if (flight) { mover.visible = true; flight.sp = flight.pts[0][3]; }
  }
  function updFlight(dt) {
    const f = flight; if (!f) return; const pts = f.pts;
    const a = pts[f.i], b = pts[f.i + 1]; if (!b) { endFlight(); return; }
    const tgt = v.set(b[0], b[1], b[2]), d = f.pos.distanceTo(tgt);
    // speed eases toward the next keyframe's speed over the segment (decel on rollout, accel on takeoff)
    const segL = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, u = 1 - Math.min(1, d / segL); f.sp = a[3] + (b[3] - a[3]) * u;
    const step = Math.max(.6, f.sp) * dt;
    const dir = tgt.clone().sub(f.pos); if (d <= step) { f.pos.copy(tgt); f.i++; } else f.pos.addScaledVector(dir.normalize(), step);
    const hd = Math.atan2(b[0] - a[0], b[2] - a[2]), climb = Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
    let flare = 0; if (f.kind === 'arr' && f.i === 1) flare = .06 * u; if (f.kind === 'dep' && f.i === 6) flare = .12 * Math.min(1, u * 3);
    // heading: pushback keeps the nose toward the terminal; on the ground turn at a taxi-like rate, in the air follow the path
    const want = (f.kind === 'dep' && f.i === 0) ? 0 : hd; if (f.hd === undefined) f.hd = want; let dh = Math.atan2(Math.sin(want - f.hd), Math.cos(want - f.hd)); f.hd += f.pos.y > 1 ? dh : Math.sign(dh) * Math.min(Math.abs(dh), dt * .9);
    mover.position.copy(f.pos); mover.rotation.set(0, 0, 0); mover.rotation.y = f.hd; mover.rotateX(-(climb + flare));
    strobe.visible = (performance.now() % 1200) < 90;
  }
  function endFlight() { const f = flight; if (f.kind === 'arr') { occ[f.gi] = true; drawParked(); arrivals++; } else departures++; mover.visible = false; flight = null; opT = 0; nextOp = (80 + Math.random() * 50) / RATE; }
  A.force = kind => { if (flight) return false; A.nextArrive = kind === 'arr'; startFlight(); return !!flight; };
  A.state = () => ({ flight: flight ? { kind: flight.kind, i: flight.i, n: flight.pts.length, x: Math.round(flight.pos.x), y: Math.round(flight.pos.y), z: Math.round(flight.pos.z), sp: Math.round(flight.sp) } : null, arrivals, departures, parked: occ.filter(Boolean).length, cars: cars.length, curb: cars.filter(k => k.state === 'curb').length, pax: pax.filter(p => p.on).length });

  // ---- curbside traffic: cars come from town, stop at the terminal curb, drop off / pick up, drive back
  const carGeo = merge([box(1.8, .55, 4.2, 0, .55, 0, 0xffffff), box(1.55, .5, 2.1, 0, 1.08, -.25, 0x14181f), ...[[.86, 1.3], [-.86, 1.3], [.86, -1.3], [-.86, -1.3]].map(([x, z]) => colored(new THREE.CylinderGeometry(.34, .34, .26, 10).rotateZ(Math.PI / 2).translate(x, .34, z), 0x0c0c0e))]);
  const NC = tier === 'low' ? 6 : tier === 'high' ? 14 : 10;
  const carIM = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .5, roughness: .35 }), NC); carIM.frustumCulled = false; grp.add(carIM);
  const PAL = [0xc8ccd4, 0x1c1f26, 0xe8e8ea, 0x8a1020, 0x16325e, 0xffd23a, 0xe8e8ea, 0x5a5f68];   // yellow = taxi
  // loop: in-lane down the access road (x=+3), along the curb lane westward, back up the road (x=-3)
  const inPath = [[3, ROAD.z0 + 40], [3, ROAD.z1 + 6], [3, CURB.z - 3.2]], curbStops = [-60, -30, 0, 30, 60], outPath = [[-75, CURB.z - 3.2], [-75, ROAD.z1 + 3], [-3, ROAD.z1 + 3], [-3, ROAD.z0 + 40]];
  const cars = []; for (let i = 0; i < NC; i++) { carIM.setColorAt(i, new THREE.Color(PAL[i % PAL.length])); cars.push({ state: 'drive', path: null, i: 0, x: 0, z: 0, yaw: 0, t: .1 + i * 6, wait: 0 }); } carIM.instanceColor.needsUpdate = true;
  const pedGeo = merge([colored(new THREE.CapsuleGeometry(.2, .5, 2, 6).translate(0, 1.12, 0), 0xffffff), colored(new THREE.SphereGeometry(.15, 8, 6).translate(0, 1.66, 0), 0xd8a880), box(.13, .7, .15, .1, .38, 0, 0x16181e), box(.13, .7, .15, -.1, .38, 0, 0x16181e), box(.4, .5, .25, .4, .3, 0, 0x2a2e36)]);   // with a rolling suitcase
  const NP = NC + 8, paxIM = new THREE.InstancedMesh(pedGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, emissive: 0x101418 }), NP); paxIM.frustumCulled = false; grp.add(paxIM);
  const SH = [0xd23b3b, 0x2f6fd8, 0xe8e2d6, 0x2a2a30, 0x3fa66b, 0xe0a030, 0x8a4fd0, 0x1fb5c0]; const pax = []; for (let i = 0; i < NP; i++) { paxIM.setColorAt(i, new THREE.Color(SH[i % SH.length])); pax.push({ on: false, x: 0, z: 0, tx: 0, tz: 0, done: null }); paxIM.setMatrixAt(i, hide); } paxIM.instanceColor.needsUpdate = true;
  const doorZ = TERM.z + TERM.d / 2 + .5;
  function spawnPax(x, z, tx, tz, done) { const p = pax.find(p => !p.on); if (!p) { done && done(); return; } Object.assign(p, { on: true, x, z, tx, tz, done }); }
  function startCar(k) { const stop = curbStops[(Math.random() * curbStops.length) | 0]; k.path = [...inPath, [stop, CURB.z - 3.2], ...outPath]; k.stopAt = 3; k.i = 0; k.x = inPath[0][0]; k.z = inPath[0][1]; k.state = 'drive'; k.pick = Math.random() < .5; }
  function updCars(dt) {
    cars.forEach((k, i) => {
      if (k.t > 0) { k.t -= dt; carIM.setMatrixAt(i, hide); if (k.t <= 0) startCar(k); return; }
      if (!k.path) { k.t = .1; return; }
      if (k.state === 'curb') { k.wait -= dt; if (k.wait <= 0 && !k.waitPax) { k.state = 'drive'; } }
      else {
        const b = k.path[k.i + 1]; if (!b) { k.t = 4 + Math.random() * 10; carIM.setMatrixAt(i, hide); return; }
        const dx = b[0] - k.x, dz = b[1] - k.z, d = Math.hypot(dx, dz), sp = (k.i < 1 ? 13 : 7) * dt;
        // queue: keep a gap to any car ahead heading the same way
        let blocked = false; for (const o of cars) { if (o === k || o.t > 0) continue; const ox = o.x - k.x, oz = o.z - k.z, od = Math.hypot(ox, oz); if (od < 7 && od > .1 && (ox * dx + oz * dz) / (od * (d || 1)) > .7) { blocked = true; break; } }
        if (!blocked) { if (d <= sp) { k.x = b[0]; k.z = b[1]; k.i++; if (k.i === k.stopAt) { k.state = 'curb'; k.wait = 5 + Math.random() * 6; const side = k.x, cz = k.z + 2.2; if (k.pick) { k.waitPax = 1; spawnPax(side + (Math.random() - .5) * 6, doorZ, side, cz, () => { k.waitPax = 0; }); } else spawnPax(side, cz, side + (Math.random() - .5) * 8, doorZ, null); } } else { k.x += dx / d * sp; k.z += dz / d * sp; } if (d > .01) k.yaw = Math.atan2(dx, dz); }
      }
      q.setFromAxisAngle(up, k.yaw); m4.compose(v.set(k.x, .06, k.z), q, one); carIM.setMatrixAt(i, m4);
    });
    carIM.instanceMatrix.needsUpdate = true;
    const t = performance.now() / 1000;
    pax.forEach((p, i) => { if (!p.on) return; const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz); if (d < .15) { p.on = false; paxIM.setMatrixAt(i, hide); p.done && p.done(); return; } const s = Math.min(d, 1.3 * dt); p.x += dx / d * s; p.z += dz / d * s; q.setFromAxisAngle(up, Math.atan2(dx, dz)); m4.compose(v.set(p.x, .06 + Math.abs(Math.sin(t * 7 + i)) * .04, p.z), q, one); paxIM.setMatrixAt(i, m4); });
    // a few travellers always milling at the doors
    if (Math.random() < dt * .5) { const x = (Math.random() - .5) * 180; spawnPax(x, CURB.z + 1, x + (Math.random() - .5) * 10, doorZ, null); }
    paxIM.instanceMatrix.needsUpdate = true;
  }

  // ---- apron tugs shuttling between gates
  const tugGeo = merge([box(1.6, .9, 2.6, 0, .6, 0, 0xffc21a), box(1.2, .9, 1, 0, 1.4, -.6, 0x14181f), ...[[.7, .8], [-.7, .8], [.7, -.8], [-.7, -.8]].map(([x, z]) => colored(new THREE.CylinderGeometry(.3, .3, .25, 8).rotateZ(Math.PI / 2).translate(x, .3, z), 0x111111)), box(1.4, .5, 2, 0, .45, -3, 0x5a6068), box(1.4, .5, 2, 0, .45, -5.4, 0x5a6068)]);
  const tugs = [0, 1, 2].map(i => ({ m: (() => { const m = new THREE.Mesh(tugGeo, mat); grp.add(m); return m; })(), a: i * 2, b: i * 2 + 1, u: Math.random(), d: 1 }));
  function updTugs(dt) { tugs.forEach(tg => { tg.u += tg.d * dt * .05; if (tg.u > 1 || tg.u < 0) { tg.d *= -1; tg.u = Math.max(0, Math.min(1, tg.u)); } const A0 = GATES[tg.a], B0 = GATES[tg.b], z = APRON.z1 - 8; tg.m.position.set(A0.x + 10 + (B0.x - A0.x) * tg.u, .05, z); tg.m.rotation.y = tg.d > 0 ? Math.PI / 2 : -Math.PI / 2; }); }


  // ---- shared-clock aerial banner planes (deterministic schedule: every client derives the same pose from Unix time)
  // Keep this lightweight and dependency-free; replace the procedural banner faces with supplied artwork assets when added to the repo.
  function makeBannerFace(title, subtitle, palette) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, 1024, 256);
    grad.addColorStop(0, palette[0]); grad.addColorStop(1, palette[1]); g.fillStyle = grad; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(0,0,0,.42)'; g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = palette[2]; g.lineWidth = 10; g.strokeRect(8, 8, 1008, 240);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = palette[2]; g.shadowBlur = 18;
    g.fillStyle = '#fff1d8'; g.font = '900 92px system-ui,sans-serif'; g.fillText(title, 512, 105, 940);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.font = '700 34px system-ui,sans-serif'; g.fillText(subtitle, 512, 190, 940);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
  }
  let bannerMats = null;   // both planes share the two banner textures/materials (2 canvases, not 4)
  const sharedBannerMat = () => bannerMats || (bannerMats = [
    new THREE.MeshStandardMaterial({ map: makeBannerFace('ETERNAL GRIND', 'CHOOSE YOUR CLASS · BRAVE THE DEPTHS', ['#161a24', '#8b301c', '#f0c878']), side: THREE.DoubleSide, roughness: .9 }),
    new THREE.MeshStandardMaterial({ map: makeBannerFace('LIGHT CYCLES', 'RIDE FAST · CUT SHARP', ['#071a36', '#e64d1e', '#42d8ff']), side: THREE.DoubleSide, roughness: .9 })
  ]);
  function makeTowPlane() {
    const root = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: .58, metalness: .12 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: .45, metalness: .15 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x162b42, metalness: .35, roughness: .22 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(.72, .9, 8.2, 10).rotateX(Math.PI / 2), bodyMat); fus.position.z = 0; root.add(fus);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.72, 10, 8).scale(1, .85, 1.25), bodyMat); nose.position.z = 4.1; root.add(nose);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.68, 10, 8).scale(1, .6, .9), glassMat); cockpit.position.set(0, .55, 2.25); root.add(cockpit);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(15, .22, 2.1), trimMat); wing.position.set(0, .15, .15); root.add(wing);
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(5, .16, 1.05), bodyMat); tailWing.position.set(0, .7, -3.2); root.add(tailWing);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.6, 1.35), trimMat); fin.position.set(0, 1.25, -3.35); root.add(fin);
    const prop = new THREE.Group(); prop.position.set(0, 0, 4.75);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), trimMat); prop.add(hub);
    for (let i = 0; i < 2; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(.16, 2.4, .28), trimMat); blade.rotation.z = i * Math.PI / 2; prop.add(blade); }
    root.add(prop);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 5.8, 5), new THREE.MeshStandardMaterial({ color: 0x292929, roughness: .9 })); rope.rotation.x = Math.PI / 2; rope.position.set(0, -.15, -6.9); root.add(rope);
    const bannerMat = sharedBannerMat();
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), bannerMat[0]); banner.position.set(0, -.2, -10.1); banner.rotation.y = Math.PI; root.add(banner);
    return { root, prop, banner, bannerMat };
  }
  const towFleet = [makeTowPlane(), makeTowPlane()];
  towFleet.forEach((p, i) => { p.root.scale.setScalar(.82); p.root.visible = false; grp.add(p.root); });
  // All clients use the same epoch-based route and phase. No random client-local flight decisions.
  const FLIGHT_CYCLE = 240, FLIGHT_OFFSET = 1700000000 % FLIGHT_CYCLE;
  const flightPath = [
    { t: 0, x: -220, y: 2.5, z: -610, yaw: Math.PI },       // taxi from apron
    { t: 14, x: -360, y: 2.5, z: -672, yaw: Math.PI },
    { t: 25, x: -480, y: 2.5, z: -720, yaw: Math.PI / 2 },  // line up on runway
    { t: 38, x: -170, y: 9, z: -700, yaw: Math.PI / 2 },   // takeoff roll / climb
    { t: 55, x: 80, y: 42, z: -570, yaw: .95 },
    { t: 82, x: 260, y: 70, z: -240, yaw: .35 },
    { t: 112, x: 160, y: 78, z: 160, yaw: -.55 },
    { t: 140, x: -140, y: 58, z: 330, yaw: -1.4 },
    { t: 158, x: -520, y: 30, z: 100, yaw: -2.2 },
    { t: 170, x: -900, y: 4, z: -300, yaw: -2.8 }
  ];
  function poseTowPlane(p, now, offset) {
    const phase = ((now / 1000 + offset + FLIGHT_OFFSET) % FLIGHT_CYCLE + FLIGHT_CYCLE) % FLIGHT_CYCLE;
    const slot = Math.floor((now / 1000 + offset + FLIGHT_OFFSET) / FLIGHT_CYCLE) % 2;
    p.root.visible = phase < 171;
    if (!p.root.visible) return;
    p.banner.material = p.bannerMat[slot];
    let a = flightPath[0], b = flightPath[1];
    for (let i = 0; i < flightPath.length - 1; i++) { if (phase >= flightPath[i].t && phase <= flightPath[i + 1].t) { a = flightPath[i]; b = flightPath[i + 1]; break; } }
    const u = THREE.MathUtils.clamp((phase - a.t) / Math.max(.001, b.t - a.t), 0, 1), smooth = u * u * (3 - 2 * u);
    p.root.position.set(THREE.MathUtils.lerp(a.x, b.x, smooth), THREE.MathUtils.lerp(a.y, b.y, smooth), THREE.MathUtils.lerp(a.z, b.z, smooth));
    let dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    p.root.rotation.set(0, a.yaw + dy * smooth, 0);
    p.root.rotation.z = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) * .8;
    p.prop.rotation.z = (now / 1000) * 42;
    p.banner.rotation.z = Math.sin(now / 1000 * 1.5 + offset) * .035;
  }
  function updBannerPlanes() { const now = Date.now(); towFleet.forEach((p, i) => poseTowPlane(p, now, i * 120)); }

  const clk = new THREE.Clock();
  function update() {
    const dt = Math.min(clk.getDelta(), .05) * RATE, t = performance.now() / 1000;
    beacon.rotation.y = t * 2.2;
    if (!flight) { opT += dt; if (opT > nextOp) startFlight(); } else updFlight(dt);
    updCars(dt); updTugs(dt); updBannerPlanes();
  }
  (function tick() { requestAnimationFrame(tick); if (!document.hidden && !window.__cityPaused) update(); })();   // __cityPaused: The Wilds deep area
  A.gates = GATES.length; A.ready = true;
}

(function wait() {
  if (Q.has('noairport')) return;
  const c = window.__city;
  if (window.__ready && c && c.colliders && window.__cityLife && window.__cityLife.ready) { try { build(); } catch (e) { console.warn('airport', e); } }
  else setTimeout(wait, 500);
})();
