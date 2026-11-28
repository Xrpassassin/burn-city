// Burn City traffic realism (Nov 27, 2026): right-hand lanes, signal phases with a protected left arrow, IDM queues,
// slowing + signalling for turns, yielding to pedestrians and sirens, time-of-day density, 8 vehicle types in ONE
// instanced draw (+1 draw for all their lights), turn arrows, Market Street wired into the road graph, and Main Street
// shops with hours, lit windows and awnings. The simulation lives in traffic-core.mjs (pure, node-tested).
// Kill switch: ?traffic=classic (the old left-hand loop cars, no new markings or shop hours). HANDOFF: "Traffic realism".
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TC from './traffic-core.mjs';

const Q = new URLSearchParams(location.search);
const CLASSIC = Q.get('traffic') === 'classic';
const TEST = Q.has('traffictest') || Q.get('debug') === '1';
const TR = window.__traffic = { on: false, ready: false, classic: CLASSIC, error: null, update: null, ped: null, stats: () => ({ on: false, classic: CLASSIC }) };

// ------------------------------------------------------------ vehicle models (local: +z forward, x right-hand = -x)
function part(g, col, vt) {
  g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, c = new THREE.Color(col), a = new Float32Array(n * 3), t = new Float32Array(n).fill(vt);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('vt', new THREE.BufferAttribute(t, 1)); if (g.attributes.uv) g.deleteAttribute('uv'); return g;
}
const PAINT = 0xffffff, GLASS = 0x0b0f16, TYRE = 0x0a0a0c, TRIM = 0x22252b, CHROME = 0x8a9098;
function vehicleGeo() {
  const all = [];
  const B = (vt, w, h, d, x, y, z, col) => all.push(part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col, vt));
  const wheels = (vt, xs, zs, r = .34) => { for (const x of xs) for (const z of zs) all.push(part(new THREE.CylinderGeometry(r, r, .26, 8).rotateZ(Math.PI / 2).translate(x, r, z), TYRE, vt)); };
  // 0 sedan
  B(0, 1.8, .52, 4.3, 0, .56, 0, PAINT); B(0, 1.56, .46, 2.0, 0, 1.03, -.2, GLASS); B(0, 1.5, .06, 1.8, 0, 1.28, -.25, PAINT); B(0, 1.82, .16, .2, 0, .42, 2.12, TRIM); B(0, 1.82, .16, .2, 0, .42, -2.12, TRIM); wheels(0, [-.86, .86], [1.32, -1.32]);
  // 1 hatchback
  B(1, 1.72, .52, 3.7, 0, .56, 0, PAINT); B(1, 1.5, .5, 1.95, 0, 1.05, -.42, GLASS); B(1, 1.46, .06, 1.8, 0, 1.31, -.45, PAINT); B(1, 1.74, .16, .2, 0, .42, 1.82, TRIM); wheels(1, [-.82, .82], [1.12, -1.12], .32);
  // 2 SUV
  B(2, 1.9, .72, 4.6, 0, .74, 0, PAINT); B(2, 1.76, .58, 2.7, 0, 1.39, -.4, GLASS); B(2, 1.7, .07, 2.6, 0, 1.71, -.4, PAINT); B(2, .06, .06, 2.4, .7, 1.78, -.4, CHROME); B(2, .06, .06, 2.4, -.7, 1.78, -.4, CHROME); B(2, 1.92, .2, .2, 0, .5, 2.27, TRIM); wheels(2, [-.9, .9], [1.45, -1.45], .4);
  // 3 pickup
  B(3, 1.95, .72, 2.3, 0, .76, 1.35, PAINT); B(3, 1.8, .56, 1.5, 0, 1.4, .75, GLASS); B(3, 1.74, .07, 1.4, 0, 1.71, .75, PAINT); B(3, 1.95, .3, 2.6, 0, .55, -1.25, PAINT);
  B(3, .1, .5, 2.6, .92, .95, -1.25, PAINT); B(3, .1, .5, 2.6, -.92, .95, -1.25, PAINT); B(3, 1.95, .5, .1, 0, .95, -2.52, PAINT); B(3, 1.95, .5, .1, 0, .95, .03, PAINT); wheels(3, [-.92, .92], [1.7, -1.6], .4);
  // 4 van
  B(4, 1.95, 1.75, 4.2, 0, 1.22, -.35, PAINT); B(4, 1.95, .9, .9, 0, .8, 2.05, PAINT); B(4, 1.86, .62, .6, 0, 1.55, 1.75, GLASS); B(4, 1.97, .42, 1.2, 0, 1.6, .9, GLASS); wheels(4, [-.9, .9], [1.75, -1.6], .36);
  // 5 taxi (sedan + roof sign)
  B(5, 1.8, .52, 4.3, 0, .56, 0, PAINT); B(5, 1.56, .46, 2.0, 0, 1.03, -.2, GLASS); B(5, 1.5, .06, 1.8, 0, 1.28, -.25, PAINT); B(5, .72, .22, .26, 0, 1.42, -.2, 0xfff4cc); B(5, 1.82, .16, .2, 0, .42, 2.12, TRIM); wheels(5, [-.86, .86], [1.32, -1.32]);
  // 6 box truck (cab painted, cargo box takes the paint too: whites / greys / a red one)
  B(6, 2.2, 1.6, 1.9, 0, 1.25, 2.4, PAINT); B(6, 2.1, .75, .1, 0, 1.6, 3.36, GLASS); B(6, 2.3, 2.6, 4.6, 0, 1.95, -.85, PAINT); B(6, 2.32, .2, 4.62, 0, .72, -.85, TRIM); wheels(6, [-1.0, 1.0], [2.5, -1.9, -2.6], .45);
  // 7 bus
  B(7, 2.45, 2.55, 9.0, 0, 1.68, 0, PAINT); B(7, 2.47, .85, 7.6, 0, 2.05, -.4, GLASS); B(7, 2.3, .95, .1, 0, 2.0, 4.51, GLASS); B(7, 2.0, .2, 7.0, 0, 3.02, -.3, TRIM); wheels(7, [-1.08, 1.08], [3.0, -2.9], .48);
  return mergeGeometries(all, false);
}
// head / tail / indicator points per type: [x, y, zFront, zRear]
const LIGHT = [[.62, .62, 2.16, -2.16], [.6, .62, 1.86, -1.86], [.68, .86, 2.31, -2.31], [.7, .86, 2.5, -2.58], [.72, .9, 2.5, -2.46], [.62, .62, 2.16, -2.16], [.85, 1.0, 3.36, -3.17], [.95, .9, 4.51, -4.51]];

function vehicleMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .55, roughness: .35, envMapIntensity: 1 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float vt;\nattribute float iType;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(vt - iType) > .5) transformed = vec3(0.);');
  };
  m.customProgramCacheKey = () => 'bc-traffic-veh-1'; return m;
}
function spriteTex() { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t; }

// ------------------------------------------------------------ road paint: turn arrows + STOP (one atlas, one instanced draw)
function arrowAtlas() {
  const W = 512, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const shaft = (cx) => { g.lineWidth = 9; g.beginPath(); g.moveTo(cx, 120); g.lineTo(cx, 52); g.stroke(); };
  const head = (x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, -20); g.lineTo(15, 4); g.lineTo(-15, 4); g.closePath(); g.fill(); g.restore(); };
  const S = cx => { shaft(cx); g.lineWidth = 9; g.beginPath(); g.moveTo(cx, 52); g.lineTo(cx, 24); g.stroke(); head(cx, 18, 0); };
  const Lt = (cx, d) => { g.lineWidth = 9; g.beginPath(); g.moveTo(cx, 120); g.lineTo(cx, 66); g.quadraticCurveTo(cx, 44, cx + d * 22, 44); g.lineTo(cx + d * 30, 44); g.stroke(); head(cx + d * 34, 44, d * Math.PI / 2); };
  // cells (64 px wide each): 0 S, 1 L, 2 R, 3 S+L, 4 S+R, 5 L+R
  const cells = [[S], [c => Lt(c, -1)], [c => Lt(c, 1)], [S, c => Lt(c, -1)], [S, c => Lt(c, 1)], [c => Lt(c, -1), c => Lt(c, 1)]];
  cells.forEach((fs, i) => { for (const f of fs) f(i * 64 + 32); });
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
}

// ------------------------------------------------------------ main
function build() {
  const c = window.__city, L = window.__cityLife, S = c.S, tier = c.TIER || 'medium', LOW = tier === 'low';
  const st = c.streets, sIdx = s => st.indexOf(s);
  const junctions = (L.signals || []).map(p => ({ x: p.x, z: p.z, s: p.s.map(sIdx), off: p.off, signal: true, ref: p }));
  const cap = Q.get('traffic') && isFinite(+Q.get('traffic')) ? +Q.get('traffic') : LOW ? 64 : tier === 'medium' ? 150 : 260;
  const base = st.map(s => s.type === 'ring' ? { type: 'ring', c: { x: s.c.x, z: s.c.z }, r: s.r } : { type: 'line', a: { x: s.a.x, z: s.a.z }, b: { x: s.b.x, z: s.b.z } });
  let sim = TC.createSim({ streets: base, junctions, cap, seed: 11 });
  const grp = new THREE.Group(); grp.name = 'traffic'; S.add(grp);

  // vehicles: one instanced draw; per-instance type + paint; packed so only visible cars are submitted
  const N = cap, geo = vehicleGeo(), iType = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); iType.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iType', iType);
  const veh = new THREE.InstancedMesh(geo, vehicleMaterial(), N); veh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); veh.frustumCulled = false; veh.count = 0; veh.name = 'traffic-vehicles'; veh.userData.traffic = true;
  veh.setColorAt(0, new THREE.Color(1, 1, 1)); grp.add(veh);
  // lights: 6 points per car (2 head, 2 tail/brake, 2 indicators), additive sprites, one draw
  const lp = new Float32Array(N * 6 * 3), lc = new Float32Array(N * 6 * 3), lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3).setUsage(THREE.DynamicDrawUsage)); lg.setDrawRange(0, 0);
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({ size: 1.1, map: spriteTex(), vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
  lights.frustumCulled = false; lights.name = 'traffic-lights'; grp.add(lights);

  // turn arrows + STOP legends painted in the approach lanes (one instanced draw, atlas cells by instance attribute)
  const arrowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, uniforms: { map: { value: arrowAtlas() }, day: c.U.day },
    vertexShader: 'attribute float aCell;varying vec2 vU;void main(){vU=vec2((uv.x+aCell)/8.,uv.y);gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform sampler2D map;uniform float day;varying vec2 vU;void main(){float a=texture2D(map,vU).a;if(a<.05)discard;gl_FragColor=vec4(vec3(.86,.86,.82)*mix(.42,1.,day),a*.9);}' });
  let arrows = null;
  function paintArrows() {
    if (arrows) { grp.remove(arrows); arrows.geometry.dispose(); arrows = null; }
    const list = [];
    for (const l of sim.G.road) {
      if (l.toJ < 0 || l.L < 16) continue; const J = sim.G.juncs[l.toJ], mv = new Set(l.outs.map(o => o.move));
      const cell = mv.has('S') && mv.has('L') ? 3 : mv.has('S') && mv.has('R') ? 4 : mv.has('L') && mv.has('R') ? 5 : mv.has('L') ? 1 : mv.has('R') ? 2 : 0;
      const p = TC.lanePoint(l, l.L - 9, { i: 0 }); list.push({ x: p.x, z: p.z, yaw: Math.atan2(p.hx, p.hz), cell });
    }
    if (!list.length) return;
    const pg = new THREE.PlaneGeometry(1.1, 2.2).rotateX(-Math.PI / 2).rotateY(Math.PI); const cellA = new THREE.InstancedBufferAttribute(new Float32Array(list.map(o => o.cell)), 1); pg.setAttribute('aCell', cellA);
    arrows = new THREE.InstancedMesh(pg, arrowMat, list.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    list.forEach((o, i) => { q.setFromAxisAngle(up, o.yaw); m.compose(v.set(o.x, .115, o.z), q, one); arrows.setMatrixAt(i, m); });
    arrows.name = 'traffic-arrows'; arrows.renderOrder = 1; arrows.computeBoundingSphere(); grp.add(arrows); TR.arrowCount = list.length;
  }
  paintArrows();

  // signal heads follow the new plan (ball + left arrow lamp) via citylife's hook
  L.phaseFn = (p, t, g) => { const s = TC.signalState(p.off, t, g); return s.thru; };
  L.arrowFn = (p, t, g) => TC.lampState(p.off, t, g).arrow;

  // ---------------- pedestrians: wait at the curb, cross on the walk phase; cars yield to anyone on a crosswalk
  let PX = TC.pedCrossings(sim.G); const now = () => performance.now() / 1000; let tSig = now();
  const occ = (J, k) => J.ped[k] > tSig - .25;
  TR.ped = (q, dt) => {
    const s = q.s, si = sIdx(s); if (si < 0) return false;
    if (s.type !== 'ring') {   // avenue walkers turn back at the ring's sidewalk instead of walking into the junction
      const len = q.len || TC.streetLen(s), m = q.u * len; if ((m < 5.2 && q.d < 0) || (m > len - 5.2 && q.d > 0)) { q.d *= -1; } return false;
    }
    const xs = PX.get(si); if (!xs) return false;
    const a = q.u * 2 * Math.PI, sideNow = Math.sign(q.lat * q.side) || 1;
    if (q.cr) {   // crossing the ring on a crosswalk: walk straight across, then carry on along the far sidewalk
      const cr = q.cr; cr.x += Math.sign(cr.to - cr.x) * q.sp * 1.1 * dt; const done = Math.abs(cr.to - cr.x) < .05 || Math.sign(cr.to - cr.x) !== Math.sign(cr.to - cr.from);
      if (done) cr.x = cr.to; q.side = Math.sign(cr.x) || 1; q.lat = Math.abs(cr.x); cr.J.ped[cr.k] = tSig;
      const rx = Math.cos(a), rz = Math.sin(a), dir = Math.sign(cr.to - cr.from); q.hd = Math.atan2(rx * dir, rz * dir);
      if (done) { q.cr = null; q.hd = null; q.lat = Math.abs(cr.to); q.side = Math.sign(cr.to); q.cd = 6; } return true;
    }
    if (q.cd > 0) q.cd -= dt;
    for (const X of xs) {
      const arc = TC.angDiff(X.th, a) * s.r * q.d;   // metres ahead to the junction centre along the walk
      if (arc < -6 || arc > 7) continue;
      const J = X.J; if (!J) continue;
      // 1) the avenue mouth (people on the avenue's side of the ring): the crosswalk spans |arc| < 2.3
      if (sideNow === X.side && X.xs >= 0) {
        if (Math.abs(arc) < 2.4) J.ped[X.xs] = tSig;
        if (arc > 2.4 && arc < 3.4) { const ss = TC.signalState(J.off, tSig, J.grp.get(X.stem) ?? 1); if (J.signal !== false && !ss.walk && !(q.walking === J)) { q.waitJ = J; return true; } q.walking = J; }
      }
      // 2) the ring crosswalk before the junction (4 m out): some people cross the ring here, on the walk phase
      if (!q.cd && arc > 3.6 && arc < 4.6) {
        const k = X.xr[q.d > 0 ? 0 : 1]; if (k < 0) continue;
        if (q.want == null) q.want = TC.hash(q.ph * 9.1, X.th) < .4;
        if (!q.want) continue;
        const ringG = J.grp.get(si) ?? 0, ss = TC.signalState(J.off, tSig, ringG);
        if (J.signal !== false && !ss.walk) return true;   // wait at the curb
        const from = q.lat * q.side; q.cr = { J, k, from, to: -from, x: from }; q.want = null; return true;
      }
    }
    if (q.walking && !xs.some(X => X.J === q.walking && Math.abs(TC.angDiff(X.th, a) * s.r) < 4)) q.walking = null;
    if (q.want != null && !xs.some(X => Math.abs(TC.angDiff(X.th, a) * s.r) < 7)) q.want = null;
    return false;
  };

  // ---------------- shops: hours by the city clock, lit windows after dark, awnings (2 instanced draws, culled by distance)
  const shops = L.shops || [], shopGrp = new THREE.Group(); shopGrp.name = 'traffic-shops'; grp.add(shopGrp);
  const winMesh = shops.length ? new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true }), shops.length * 2) : null;
  const AWN = { mart: 0xd8562a, smoke: 0x7a4a9a, disp: 0x2f9a5a, coffee: 0xc8902a, arcade: 0x2a7ad8, pizza: 0xc83a2a, pharmacy: 0x2a8a6a };
  const awnGeo = (() => { const parts = []; for (let i = 0; i < 9; i++) { const g = new THREE.BoxGeometry(1.0, .06, 1.9).translate(-4.0 + i * 1.0, 0, -.95); const cc = new THREE.Color(i % 2 ? 0xf4efe6 : 0xffffff); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) { a[k * 3] = cc.r; a[k * 3 + 1] = cc.g; a[k * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); parts.push(g); } const m = mergeGeometries(parts); m.rotateX(-.32); return m; })();
  const awnMesh = shops.length ? new THREE.InstancedMesh(awnGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: 0 }), shops.length) : null;
  let shopC = { x: 0, z: 0 };
  if (shops.length) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    shops.forEach((sp, i) => {
      const cs = Math.cos(sp.yaw), sn = Math.sin(sp.yaw), at = (lx, lz) => [sp.x + lx * cs + lz * sn, sp.z - lx * sn + lz * cs]; q.setFromAxisAngle(up, sp.yaw);
      let [x, z] = at(-1.1, -.1); m.compose(v.set(x, 1.9, z), q, sc.set(5.6, 3.0, 1)); winMesh.setMatrixAt(i * 2, m);           // shop window glow
      [x, z] = at(-3.3, -.12); m.compose(v.set(x, 2.5, z), q, sc.set(1.15, .42, 1)); winMesh.setMatrixAt(i * 2 + 1, m);        // OPEN / CLOSED neon
      [x, z] = at(0, -.2); m.compose(v.set(x, 3.62, z), q, sc.set(1, 1, 1)); awnMesh.setMatrixAt(i, m); awnMesh.setColorAt(i, new THREE.Color(AWN[sp.id] || 0xb05030));
      shopC.x += sp.x / shops.length; shopC.z += sp.z / shops.length;
    });
    for (let i = 0; i < shops.length * 2; i++) winMesh.setColorAt(i, new THREE.Color(0x1a2632));   // instance colours must exist before the first draw (compiles the instancing-colour path)
    winMesh.name = 'shop-windows'; awnMesh.name = 'shop-awnings'; winMesh.frustumCulled = awnMesh.frustumCulled = false; shopGrp.add(winMesh, awnMesh); awnMesh.instanceColor.needsUpdate = true;
  }
  const WIN = { lit: new THREE.Color(.95, .64, .34), day: new THREE.Color(0x1a2632), shut: new THREE.Color(0x0a0e14), open: new THREE.Color(.3, 1.9, .5), closed: new THREE.Color(1.6, .16, .1), off: new THREE.Color(.05, .05, .05) };
  let lastHourKey = '';
  function shopTick(hour, day) {
    if (!winMesh) return; const key = Math.floor(hour * 4) + ':' + (day > .45 ? 'd' : 'n'); if (key === lastHourKey) return; lastHourKey = key;
    shops.forEach((sp, i) => {
      const open = TC.shopOpen(sp.id, hour); sp.afterHours = !open;
      winMesh.setColorAt(i * 2, open ? (day > .45 ? WIN.day : WIN.lit) : WIN.shut);
      winMesh.setColorAt(i * 2 + 1, open && !sp.closed ? WIN.open : day > .45 && !open ? WIN.off : WIN.closed);
    });
    winMesh.instanceColor.needsUpdate = true; TR.shopsOpen = shops.filter(s => !s.afterHours).map(s => s.id);
  }

  // ---------------- Market Street: once the meme quarter is up, wire its approach into the nearest city ring with a link road
  let market = null;
  function tryMarket() {
    const M = window.__memesCircle; if (!M || !M.ready) return false; const mk = M.market; if (!mk) return true;
    const E = mk.roadEnd, avoid = (x, z, pad) => (c.colliders || []).some(o => o && !o.memes && o.r > 0 && Math.hypot(o.x - x, o.z - z) < o.r + pad) || (L.taken || []).some(o => Math.hypot(o.x - x, o.z - z) < o.r + pad) || !!(window.__estate?.inLake?.(x, z, pad));
    let best = null; const why = [];
    const clearSeg = (A, B, from, skipSi) => { const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz); for (let m = from; m <= l; m += 2) { const x = A.x + dx / l * m, z = A.z + dz / l * m;
      const blk = avoid(x, z, 5.2) ? 'building' : base.some((o, oi) => oi !== skipSi && TC.distToStreet(o, x, z) < 10.2) ? 'street' : Math.abs(c.groundAt(x, z, 3)) > .2 ? 'ground' : null; if (blk) return [blk, Math.round(x), Math.round(z)]; } return null; };
    base.forEach((s, si) => {
      if (s.type !== 'ring') return;
      if (base.some(o => o.type === 'ring' && o !== s && Math.hypot(o.c.x - s.c.x, o.c.z - s.c.z) < 1 && o.r > s.r)) return;   // only a district's OUTER ring
      const th0 = Math.atan2(E.z - s.c.z, E.x - s.c.x);
      for (let k = 0; k <= 30; k++) {   // sweep the ring's arc facing the quarter: a radial stem off the ring, then (if needed) one bend to Market Street
        const th = th0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .07, ux = Math.cos(th), uz = Math.sin(th), P = { x: s.c.x + ux * s.r, z: s.c.z + uz * s.r };
        if (junctions.some(J => J.s.includes(si) && Math.abs(TC.angDiff(Math.atan2(J.z - s.c.z, J.x - s.c.x), th)) * s.r < 24)) { why.push([si, 'junction too close']); continue; }
        for (const w of [0, 24, 40, 60]) {
          const W = w ? { x: P.x + ux * w, z: P.z + uz * w } : null, A = W || P, lenB = Math.hypot(E.x - A.x, E.z - A.z), len = w + lenB; if (lenB < 12 || len > 300) continue;
          if (W) { const bx = (E.x - W.x) / lenB, bz = (E.z - W.z) / lenB; if (bx * ux + bz * uz < .35) continue; }   // no hairpins at the bend
          else { const bx = (E.x - P.x) / lenB, bz = (E.z - P.z) / lenB; if (bx * ux + bz * uz < .97) continue; }   // a single straight stem must leave the ring square-on
          const b1 = W ? clearSeg(P, W, 6, si) : null, b2 = b1 ? null : clearSeg(A, E, W ? 0 : 6, W ? -1 : si);
          if (b1 || b2) { why.push([si, ...(b1 || b2)]); continue; }
          if (!best || len < best.len) best = { si, P, W, ux, uz, len, th };
        }
      }
    });
    TR.marketWhy = why;
    if (!best) { market = { linked: false, reason: 'no clear corridor from a city ring to Market Street', why: why.slice(0, 6) }; return true; }
    const i0 = base.length, Ep = { x: E.x, z: E.z }, add = [], J2 = [...junctions];
    if (best.W) { add.push({ type: 'line', a: best.P, b: best.W, kind: 'link' }, { type: 'line', a: best.W, b: Ep, kind: 'link' }); J2.push({ x: best.P.x, z: best.P.z, s: [best.si, i0], signal: false }, { x: best.W.x, z: best.W.z, s: [i0, i0 + 1], signal: false }); }
    else { add.push({ type: 'line', a: best.P, b: Ep, kind: 'link' }); J2.push({ x: best.P.x, z: best.P.z, s: [best.si, i0], signal: false }); }
    const iA = i0 + add.length; add.push({ type: 'line', a: Ep, b: mk.gate, kind: 'market' }, { type: 'line', a: mk.gate, b: mk.turn, kind: 'market' });
    J2.push({ x: E.x, z: E.z, s: [iA - 1, iA], signal: false }, { x: mk.gate.x, z: mk.gate.z, s: [iA, iA + 1], signal: false });
    const streets2 = [...base, ...add];
    const sim2 = TC.createSim({ streets: streets2, junctions: J2, cap, seed: 12 });
    sim2.adopt(sim); sim = sim2; PX = TC.pedCrossings(sim.G); paintArrows();
    market = { linked: true, ring: best.si, at: best.P, bend: best.W, len: Math.round(best.len), gate: mk.gate };
    // road surface for the link, in the City's own street material; the ring gets a proper mouth (rounded curbs, crosswalks)
    try { linkRoad(best); } catch (e) { market.roadErr = String(e); }
    return true;
  }
  function linkRoad(b) {
    const sm = window.__streets; if (!sm) return; const HW = 4.8, W = 9.6, P = [], UV = [], IX = [], AJ = [];
    const strip = (A, B, t0, t1, fromJ) => { const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, nx = -uz, nz = ux, n = Math.max(2, Math.ceil((l - t0 - t1) / 8)), v0 = P.length / 3;
      for (let i = 0; i <= n; i++) { const m = t0 + (l - t0 - t1) * i / n, x = A.x + ux * m, z = A.z + uz * m; P.push(x + nx * W / 2, .1, z + nz * W / 2, x - nx * W / 2, .1, z - nz * W / 2); UV.push(W / 2, m, -W / 2, m); const j = fromJ ? [m, 999, 2, 0] : [99, 0, 0, 0]; AJ.push(...j, ...j); if (i < n) { const q = v0 + i * 2, r = q + 2; IX.push(q, q + 1, r, q + 1, r + 1, r); } } };
    const E = { x: b.W ? b.W.x : 0, z: b.W ? b.W.z : 0 }, end = window.__memesCircle.market.roadEnd;
    if (b.W) { strip(b.P, b.W, HW - .05, -1.5, true); strip(b.W, end, -1.5, 0, false);
      const v0 = P.length / 3, K = 20; P.push(E.x, .098, E.z); UV.push(0, 0); AJ.push(99, 0, 0, 0);   // round joint under the bend (asphalt, curb and sidewalk rings)
      for (let i = 0; i <= K; i++) { const a = i / K * Math.PI * 2; P.push(E.x + Math.cos(a) * HW, .098, E.z + Math.sin(a) * HW); UV.push(HW, a * HW); AJ.push(99, 0, 0, 0); if (i < K) IX.push(v0, v0 + 1 + i + 1, v0 + 1 + i); }
    } else strip(b.P, end, HW - .05, 0, true);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('aj', new THREE.Float32BufferAttribute(AJ, 4)); g.setIndex(IX);
    const mesh = new THREE.Mesh(g, sm.material); mesh.name = 'market-link-road'; mesh.renderOrder = 0; mesh.frustumCulled = true; g.computeBoundingSphere(); grp.add(mesh); market.road = true;
    // ring mouth: rewrite the junction data of the ring's own vertices near the new junction (signed arc metres, side = -1 when the stem leaves outward)
    const ring = st[b.si], ga = sm.geometry.attributes.aj, gp = sm.geometry.attributes.position; let k = 0;
    const out = Math.hypot(b.P.x + b.ux - ring.c.x, b.P.z + b.uz - ring.c.z) > ring.r ? 1 : -1;
    for (let i = 0; i < gp.count; i++) { if (ga.getZ(i) !== 1) continue; const x = gp.getX(i), z = gp.getZ(i), rr = Math.hypot(x - ring.c.x, z - ring.c.z); if (Math.abs(rr - ring.r) > 5) continue;
      const bd = TC.angDiff(Math.atan2(z - ring.c.z, x - ring.c.x), b.th) * ring.r; if (Math.abs(bd) > 40 || Math.abs(bd) > Math.abs(ga.getX(i))) continue; ga.setXY(i, bd, -out); k++; }
    ga.needsUpdate = true; market.mouthVerts = k;
    market.cleared = clearCorridor(b, ring);
    (window.__roadJ || []).push({ ring, x: b.P.x, z: b.P.z, dx: b.ux, dz: b.uz, line: null, market: true });
  }
  // street furniture that stood where the new road now runs (ring-sidewalk lamps, props, trees): hide those instances / sprites
  function clearCorridor(b, ring) {
    const segs = [[b.P, b.W || window.__memesCircle.market.roadEnd]]; if (b.W) segs.push([b.W, window.__memesCircle.market.roadEnd]);
    const inside = (x, z) => { for (const [A, B] of segs) { const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz), u = ((x - A.x) * dx + (z - A.z) * dz) / l, lat = Math.abs(-(x - A.x) * dz + (z - A.z) * dx) / l;
      if (u < -4.9 || u > l + 4.9) continue; if (A === b.P && u < 6) { if (lat < 5.6 && Math.hypot(x - ring.c.x, z - ring.c.z) > ring.r + 2.4) return true; continue; } if (lat < 4.9) return true; } return false; };
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0); let n = 0;
    S.traverse(o => {
      if (o === grp || o.parent === grp || o.name === 'memes-circle' || (o.parent && o.parent.name === 'memes-circle')) return;
      if (o.isInstancedMesh && o !== window.__streets) { let hit = 0; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld); if (inside(p.x, p.z) && p.y < 30) { o.setMatrixAt(i, Z); hit++; } } if (hit) { o.instanceMatrix.needsUpdate = true; n += hit; } }
      else if (o.isPoints && o.geometry?.attributes?.position && !o.userData.traffic) { const a = o.geometry.attributes.position; let hit = 0; o.updateWorldMatrix(true, false); for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); if (p.y < 12 && inside(p.x, p.z)) { a.setY(i, -1000); hit++; } } if (hit) { a.needsUpdate = true; n += hit; } }
      else if (o.isMesh && !o.isInstancedMesh && o.geometry && o !== window.__streets) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const bs = o.geometry.boundingSphere; if (!bs || bs.radius > 4) return; o.getWorldPosition(p); if (p.y < 20 && inside(p.x, p.z)) { o.visible = false; n++; } }
    });
    return n;
  }
  if (!Q.has('nomarkettraffic')) { const poll = () => { if (!tryMarket()) setTimeout(poll, 1500); }; setTimeout(poll, 1500); }

  // ---------------- per frame (called from app.js updGround while traffic is on)
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1), vv = new THREE.Vector3(), col = new THREE.Color();
  const frus = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere();
  const LOD = Q.get('trafficlod') ? +Q.get('trafficlod') : LOW ? 170 : tier === 'medium' ? 280 : 420;
  const realtime = () => { try { return localStorage.getItem('bc_f_realtime') !== '0' && !Q.has('tod'); } catch (e) { return false; } };
  const hourQ = Q.get('traffichour');
  let hour = 12, hourT = 0, visN = 0, tAcc = 0;
  TR.update = dt => {
    dt = Math.min(dt, .1); tSig = now(); tAcc += dt;
    if ((hourT -= dt) <= 0) { hourT = 2; hour = TC.cityHour({ day: c.U.day.value, realtime: realtime(), override: hourQ != null ? +hourQ : null }); }
    const cam = c.C.position, mode = c.getMode && c.getMode(), pl = mode === 'explore' && c.P && c.P.pos ? { x: c.P.pos.x, z: c.P.pos.z } : null;
    const EV = window.__cityEvents, units = EV && EV.units ? EV.units() : null;
    sim.step(dt, { t: tSig, hour, cam: { x: cam.x, z: cam.z }, units, player: pl, ped: occ });
    // draw: frustum + distance cull, compact the visible cars to the front of the instance buffer
    pv.multiplyMatrices(c.C.projectionMatrix, c.C.matrixWorldInverse); frus.setFromProjectionMatrix(pv);
    const day = c.U.day.value, night = 1 - Math.min(1, Math.max(0, (day - .15) / .45)), blinkOn = (tSig * 1.6) % 1 < .5;
    const P = lg.attributes.position.array, C = lg.attributes.color.array; let k = 0;
    for (const car of sim.cars) {
      if (!car.on) continue; const dx = car.x - cam.x, dz = car.z - cam.z; if (dx * dx + dz * dz > LOD * LOD) continue;
      sph.center.set(car.x, 1, car.z); sph.radius = car.len * .6 + 1; if (!frus.intersectsSphere(sph)) continue;
      qq.setFromAxisAngle(UP, Math.atan2(car.hx, car.hz)); m4.compose(vv.set(car.x, .02, car.z), qq, ONE); veh.setMatrixAt(k, m4); col.setHex(car.col); veh.setColorAt(k, col); iType.array[k] = car.type;
      const Lt = LIGHT[car.type], fx = car.hx, fz = car.hz, rx = -fz, rz = fx, o = k * 18;
      const head = .35 + 1.4 * night, tail = car.brake ? 2.2 : .25 + .75 * night, ind = car.blink && blinkOn ? 2.2 : 0;
      const put = (j, lx, y, lz, r, g, b) => { P[o + j * 3] = car.x + rx * lx + fx * lz; P[o + j * 3 + 1] = y; P[o + j * 3 + 2] = car.z + rz * lx + fz * lz; C[o + j * 3] = r; C[o + j * 3 + 1] = g; C[o + j * 3 + 2] = b; };
      put(0, Lt[0], Lt[1], Lt[2] + .05, head, head * .95, head * .8); put(1, -Lt[0], Lt[1], Lt[2] + .05, head, head * .95, head * .8);
      put(2, Lt[0], Lt[1] + .04, Lt[3] - .05, tail, tail * .08, tail * .05); put(3, -Lt[0], Lt[1] + .04, Lt[3] - .05, tail, tail * .08, tail * .05);
      const sx = car.blink > 0 ? Lt[0] + .08 : -Lt[0] - .08;   // indicator on the turning side, front + rear
      put(4, ind ? sx : 0, ind ? Lt[1] + .1 : -50, Lt[2] - .1, ind, ind * .55, 0); put(5, ind ? sx : 0, ind ? Lt[1] + .1 : -50, Lt[3] + .1, ind, ind * .55, 0);
      k++;
    }
    veh.count = k; visN = k; veh.instanceMatrix.needsUpdate = true; if (veh.instanceColor) veh.instanceColor.needsUpdate = true; iType.needsUpdate = true;
    lg.setDrawRange(0, k * 6); lg.attributes.position.needsUpdate = true; lg.attributes.color.needsUpdate = true;
    // shops: hours + windows; the whole shop dressing is culled past 260 m
    shopTick(hour, day); shopGrp.visible = Math.hypot(cam.x - shopC.x, cam.z - shopC.z) < (LOW ? 200 : 300);
    if (arrows) arrows.visible = cam.y < (LOW ? 90 : 160);
  };

  TR.stats = () => ({ on: TR.on, classic: false, tier, cap, active: sim.st.active, target: sim.st.target, visible: visN, hour: +hour.toFixed(2), demand: +TC.demand(hour).toFixed(2), lanes: sim.G.lanes.length, junctions: sim.G.juncs.length,
    entries: sim.st.entries, redRuns: sim.st.redRuns, pedYields: sim.st.pedYields, pullovers: sim.st.pullovers, cleared: sim.st.cleared || 0, arrows: TR.arrowCount || 0, market, shopsOpen: TR.shopsOpen, lod: LOD,
    avgSpeed: +(sim.cars.filter(c => c.on).reduce((a, c) => a + c.v, 0) / Math.max(1, sim.st.active)).toFixed(2), types: sim.cars.filter(c => c.on).reduce((o, c) => (o[c.T.id] = (o[c.T.id] || 0) + 1, o), {}) });
  if (TEST) TR.sim = () => sim;
  TR.on = true; TR.ready = true; TR.grp = grp;
}

(function wait() {
  if (CLASSIC) { TR.ready = true; return; }
  const c = window.__city, L = window.__cityLife;
  if (window.__ready && c && c.streets && c.streets.length && L && L.ready && L.signals) { try { build(); } catch (e) { console.warn('traffic', e); TR.error = String(e && e.stack || e); TR.on = false; TR.ready = true; } }
  else setTimeout(wait, 300);
})();
