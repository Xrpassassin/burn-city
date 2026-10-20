// City life, static layer: traffic signals that ground traffic obeys, crosswalks, storm drains and manholes,
// speed-limit signs, billboards (BURN, IMM, XRPyro, IMG, RACC), a Main Street of shops that pedestrians walk into,
// police + fire stations, a power plant and a wind farm outside town.
// Budget: every repeated thing is one InstancedMesh; every sign/billboard face samples ONE canvas atlas (one material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const L = window.__cityLife = { ready: false, taken: [], signals: [], shops: [], police: null, fire: null, power: null, wind: null, update: null };
const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g;
}
const box = (w, h, d, x, y, z, col) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
const cyl = (rt, rb, h, x, y, z, col, seg = 10) => colored(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), col);
const merge = a => mergeGeometries(a, false);
const xf = (g, x, z, yaw) => g.clone().rotateY(yaw).translate(x, 0, z);

// ------------------------------------------------------------ atlas (all text faces)
const AT = { W: 2048, H: 2048, slots: {} };
function atlas(c) {
  const cv = document.createElement('canvas'); cv.width = AT.W; cv.height = AT.H; const g = cv.getContext('2d');
  const slot = (name, x, y, w, h, draw) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(g, w, h); g.restore(); AT.slots[name] = [x / AT.W, 1 - (y + h) / AT.H, (x + w) / AT.W, 1 - y / AT.H]; };
  const col = n => { const d = c.N && c.N[n]; return d && d.col ? '#' + d.col.getHexString() : '#ff7a1a'; };
  const ADS = [['BURN', 'Feel the heat.'], ['IMM', 'Built to last.'], ['XRPyro', 'Light it up.'], ['IMG', 'Picture the future.'], ['RACC', 'Raccoons run this town.']];
  ADS.forEach(([n, tag], i) => slot('ad_' + n, (i % 2) * 1024, Math.floor(i / 2) * 426, 1024, 426, (g, w, h) => {
    const k = col(n), gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#120806'); gr.addColorStop(1, k); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // flame tongues along the bottom
    for (let j = 0; j < 22; j++) { const x = j * w / 21, fh = 60 + hsh(j, i) * 120; const fg = g.createLinearGradient(0, h, 0, h - fh); fg.addColorStop(0, '#ffb347'); fg.addColorStop(.6, '#ff4a1acc'); fg.addColorStop(1, '#ff4a1a00'); g.fillStyle = fg; g.beginPath(); g.moveTo(x - 34, h); g.quadraticCurveTo(x - 10, h - fh * .6, x + (hsh(i, j) - .5) * 30, h - fh); g.quadraticCurveTo(x + 10, h - fh * .5, x + 34, h); g.fill(); }
    g.fillStyle = '#fff'; g.shadowColor = k; g.shadowBlur = 30; g.font = '900 170px system-ui,sans-serif'; g.textBaseline = 'middle'; g.fillText(n, 60, h * .38);
    g.shadowBlur = 0; g.font = '600 56px system-ui,sans-serif'; g.fillStyle = '#ffe2c0'; g.fillText(tag, 64, h * .68);
    g.font = '600 26px system-ui,sans-serif'; g.fillStyle = '#ffffffaa'; g.fillText('on the XRP Ledger', 66, h * .86);
    g.strokeStyle = '#ffffff33'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  }));
  // AEGIS CRITICAL alert face (free 6th ad slot): shown over every street billboard only while the live threat feed is CRITICAL
  slot('ad_ALERT', 1024, 852, 1024, 426, (g, w, h) => {
    g.fillStyle = '#1a0402'; g.fillRect(0, 0, w, h);
    for (let i = -6; i < 30; i++) { g.fillStyle = i % 2 ? '#ffb000' : '#140400'; g.beginPath(); g.moveTo(i * 48, h); g.lineTo(i * 48 + 48, h); g.lineTo(i * 48 + 88, h - 44); g.lineTo(i * 48 + 40, h - 44); g.fill(); g.beginPath(); g.moveTo(i * 48, 0); g.lineTo(i * 48 + 48, 0); g.lineTo(i * 48 + 88, 44); g.lineTo(i * 48 + 40, 44); g.fill(); }
    g.fillStyle = '#fff'; g.shadowColor = '#ff3b2a'; g.shadowBlur = 34; g.font = '900 132px system-ui,sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('⚠ AEGIS ALERT', w / 2, h * .42);
    g.shadowBlur = 0; g.font = '700 50px system-ui,sans-serif'; g.fillStyle = '#ffd9b0'; g.fillText('CRITICAL THREAT · CITY WATCH ACTIVE', w / 2, h * .68); g.textAlign = 'left';
  });
  const SHOPS = [['mart', 'BURN MART', '24/7', '#ff6a1a', '#1a0d08'], ['smoke', 'EMBER SMOKE SHOP', 'vapes · glass · lighters', '#ff9a3a', '#16100c'], ['disp', 'GREEN FLAME', 'DISPENSARY · 21+', '#5fe08a', '#08160d'],
    ['coffee', 'HOT BEANS', 'coffee · donuts', '#ffcf6a', '#1a1208'], ['arcade', 'PIXEL ARCADE', 'games · prizes', '#5fe6ff', '#080f1a'], ['police', 'BURN CITY POLICE', 'PRECINCT 1', '#6aa8ff', '#0a1020'], ['fire', 'FIRE STATION 1', 'BURN CITY FIRE DEPT', '#ff4a2a', '#1a0806'],
    ['ems', 'BURN CITY MEDICAL', 'EMERGENCY · 24H', '#ff7a7a', '#1a0a0c'], ['power', 'BURN CITY POWER', 'generating station', '#ffd04a', '#14120a'], ['term', 'BURN CITY INTERNATIONAL', 'DEPARTURES · ARRIVALS', '#9fd8ff', '#0a1018']];
  SHOPS.forEach(([id, name, sub, fg, bg], i) => slot('sign_' + id, (i % 4) * 512, 1300 + Math.floor(i / 4) * 128, 512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg; g.shadowColor = fg; g.shadowBlur = 18; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = 58; g.font = `900 ${fs}px system-ui,sans-serif`; while (g.measureText(name).width > w - 40 && fs > 20) { fs -= 2; g.font = `900 ${fs}px system-ui,sans-serif`; }
    g.fillText(name, w / 2, h * .42); g.shadowBlur = 0; g.font = '600 22px system-ui,sans-serif'; g.fillStyle = '#ffffffcc'; g.fillText(sub, w / 2, h * .8);
  }));
  for (const [i, mph] of [[0, 25], [1, 35], [2, 45]]) slot('speed' + mph, i * 128, 1700, 128, 160, (g, w, h) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#111'; g.textAlign = 'center';
    g.font = '800 20px system-ui,sans-serif'; g.fillText('SPEED', w / 2, 36); g.fillText('LIMIT', w / 2, 58); g.font = '900 64px system-ui,sans-serif'; g.fillText(mph, w / 2, 124);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t;
}
function facePlane(w, h, slot) { const g = new THREE.PlaneGeometry(w, h); const [u0, v0, u1, v1] = AT.slots[slot], uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); return g; }

// ------------------------------------------------------------ geometry helpers on the street network
function streetLen(s) { return s.type === 'ring' ? 2 * Math.PI * s.r : Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z); }
function streetAt(s, u) {   // point + unit tangent at parameter u (same convention as the city's own traffic)
  if (s.type === 'ring') { const a = u * Math.PI * 2; return { x: s.c.x + Math.cos(a) * s.r, z: s.c.z + Math.sin(a) * s.r, tx: -Math.sin(a), tz: Math.cos(a) }; }
  const L = streetLen(s); return { x: s.a.x + (s.b.x - s.a.x) * u, z: s.a.z + (s.b.z - s.a.z) * u, tx: (s.b.x - s.a.x) / L, tz: (s.b.z - s.a.z) / L };
}
function uOn(s, x, z) { if (s.type === 'ring') { let a = Math.atan2(z - s.c.z, x - s.c.x) / (Math.PI * 2); return (a + 1) % 1; } const vx = s.b.x - s.a.x, vz = s.b.z - s.a.z; return ((x - s.a.x) * vx + (z - s.a.z) * vz) / (vx * vx + vz * vz); }
function distToStreets(st, x, z, skip) {
  let m = 1e9; for (const s of st) { if (s === skip) continue;
    if (s.type === 'ring') m = Math.min(m, Math.abs(Math.hypot(x - s.c.x, z - s.c.z) - s.r));
    else { const vx = s.b.x - s.a.x, vz = s.b.z - s.a.z, L2 = vx * vx + vz * vz; let t = ((x - s.a.x) * vx + (z - s.a.z) * vz) / L2; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(x - s.a.x - vx * t, z - s.a.z - vz * t)); } }
  return m;
}
// nudge a point out of every street's asphalt + curb band (min distance from each centreline), deterministic
function clearOfStreets(st, x, z, minD) {
  for (let it = 0; it < 6; it++) {
    let worst = null, wd = minD;
    for (const s of st) {
      let d, nx, nz;
      if (s.type === 'ring') { const dx = x - s.c.x, dz = z - s.c.z, l = Math.hypot(dx, dz) || 1; d = Math.abs(l - s.r); const sg = l >= s.r ? 1 : -1; nx = dx / l * sg; nz = dz / l * sg; }
      else { const vx = s.b.x - s.a.x, vz = s.b.z - s.a.z, L2 = vx * vx + vz * vz; let t = ((x - s.a.x) * vx + (z - s.a.z) * vz) / L2; t = Math.max(0, Math.min(1, t)); const qx = x - s.a.x - vx * t, qz = z - s.a.z - vz * t; d = Math.hypot(qx, qz); nx = qx / (d || 1); nz = qz / (d || 1); }
      if (d < wd) { wd = d; worst = [nx, nz]; }
    }
    if (!worst) break; x += worst[0] * (minD - wd + .05); z += worst[1] * (minD - wd + .05);
  }
  return [x, z];
}
function intersections(st) {
  const raw = [];
  const add = (x, z, a, b) => raw.push({ x, z, s: [a, b] });
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const A = st[i], B = st[j];
    if (A.type === 'line' && B.type === 'line') {
      const r = { x: A.b.x - A.a.x, z: A.b.z - A.a.z }, s = { x: B.b.x - B.a.x, z: B.b.z - B.a.z }, den = r.x * s.z - r.z * s.x; if (Math.abs(den) < 1e-6) continue;
      const qx = B.a.x - A.a.x, qz = B.a.z - A.a.z, t = (qx * s.z - qz * s.x) / den, u = (qx * r.z - qz * r.x) / den;
      if (t > -.01 && t < 1.01 && u > -.01 && u < 1.01) add(A.a.x + r.x * t, A.a.z + r.z * t, A, B);
    } else if (A.type === 'ring' && B.type === 'ring') {
      const dx = B.c.x - A.c.x, dz = B.c.z - A.c.z, d = Math.hypot(dx, dz); if (d < 1 || d > A.r + B.r || d < Math.abs(A.r - B.r)) continue;
      const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)), mx = A.c.x + dx * a / d, mz = A.c.z + dz * a / d;
      add(mx + h * dz / d, mz - h * dx / d, A, B); add(mx - h * dz / d, mz + h * dx / d, A, B);
    } else {
      const R = A.type === 'ring' ? A : B, Ln = A.type === 'ring' ? B : A, dx = Ln.b.x - Ln.a.x, dz = Ln.b.z - Ln.a.z, fx = Ln.a.x - R.c.x, fz = Ln.a.z - R.c.z;
      const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - R.r * R.r, disc = b * b - 4 * a * c; if (disc < 0) continue;
      for (const sg of [-1, 1]) { const t = (-b + sg * Math.sqrt(disc)) / (2 * a); if (t > -.01 && t < 1.01) add(Ln.a.x + dx * t, Ln.a.z + dz * t, A, B); }
    }
  }
  // merge near-duplicates
  const out = [];
  for (const p of raw) { const q = out.find(o => Math.hypot(o.x - p.x, o.z - p.z) < 8); if (q) { for (const s of p.s) if (!q.s.includes(s)) q.s.push(s); } else out.push({ x: p.x, z: p.z, s: [...p.s] }); }
  return out;
}

// ------------------------------------------------------------ build
function build() {
  const c = window.__city, S = c.S, st = c.streets, tier = c.TIER || 'medium';
  const grp = new THREE.Group(); grp.name = 'citylife'; S.add(grp);
  const tex = atlas(c);
  const signMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  L.signMat = signMat; L.face = facePlane;   // shared atlas for other modules (airport signage)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: .3 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const inst = (geo, m, list, name) => { if (!list.length) return null; const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((o, i) => { q.setFromAxisAngle(up, o.yaw || 0); m4.compose(v.set(o.x, o.y || 0, o.z), q, o.s ? v.clone().setScalar(o.s) : one); im.setMatrixAt(i, m4); }); im.computeBoundingSphere(); im.name = name || ''; grp.add(im); return im; };
  const taken = L.taken;
  const free = (x, z, r, opts = {}) => {
    for (const o of c.colliders) if (o.r > 0 && Math.abs(x - o.x) < o.r + r + 2 && Math.hypot(x - o.x, z - o.z) < o.r + r + 1.5) return false;
    for (const o of taken) if (Math.hypot(x - o.x, z - o.z) < o.r + r + 1) return false;
    const es = window.__estate; if (es && es.inLake && es.inLake(x, z, r)) return false;   // whole footprint clear of the water
    const sk = window.__skate && (window.__skate.park || window.__skate.parkArea); if (sk && Math.abs(x - sk.x) < 24 + r && Math.abs(z - sk.z) < 21 + r) return false;
    if (Math.abs(c.groundAt(x, z, 3)) > .2) return false;
    if (!opts.offroad && distToStreets(st, x, z) < r + 5.2) return false;
    return true;
  };
  const claim = (x, z, r) => { taken.push({ x, z, r }); };

  // ---------------- intersections + traffic signals
  const X = intersections(st).filter(p => p.s.length >= 2);
  const poles = [], heads = [], lamps = [], walks = [];
  X.forEach((p, k) => {
    p.id = k; p.off = hsh(p.x, p.z) * 26; p.group = new Map(); p.s.forEach((s, i) => p.group.set(s, i === 0 ? 0 : 1));
    p.u = new Map(); p.s.forEach(s => p.u.set(s, uOn(s, p.x, p.z)));
    p.lamps = [];
    for (const s of p.s) {
      const t = streetAt(s, p.u.get(s));
      for (const d of [1, -1]) {
        // approach direction = d * tangent; the pole stands on the right curb before the junction
        const ax = t.tx * d, az = t.tz * d, rx = -az, rz = ax;   // right of travel
        const along = s.type === 'line' ? p.u.get(s) * streetLen(s) : 1e9; if (s.type === 'line' && ((d > 0 && along < 8) || (d < 0 && streetLen(s) - along < 8))) continue;
        const [px, pz] = clearOfStreets(st, p.x - ax * 6.2 + rx * 3.1, p.z - az * 6.2 + rz * 3.1, 3.0), yaw = Math.atan2(-ax, -az);   // head faces oncoming traffic; pole stays on the sidewalk, clear of every street's lanes
        poles.push({ x: px, z: pz, yaw }); heads.push({ x: px, z: pz, yaw });
        p.lamps.push({ i: lamps.length, s, x: px, z: pz, yaw }); lamps.push({ x: px, y: 3.62, z: pz, yaw });
        claim(px, pz, .5);
        // crosswalk across this approach
        for (let j = -2; j <= 2; j++) walks.push({ x: p.x - ax * 4.6 + rx * j * 1, z: p.z - az * 4.6 + rz * j * 1, y: .125, yaw: Math.atan2(ax, az) });
      }
    }
  });
  L.signals = X;
  inst(merge([cyl(.08, .1, 3.9, 0, 1.95, 0, 0x2a2e36, 8), box(.04, 2.4, .05, 0, 2.2, .09, 0x5fe6ff)]), mat, poles, 'sigpoles');
  inst(merge([box(.34, 1.0, .26, 0, 3.32, .05, 0x1a1c22), ...[3.62, 3.32, 3.02].map(y => colored(new THREE.CylinderGeometry(.11, .11, .04, 10).rotateX(Math.PI / 2).translate(0, y, .19), 0x30302c)), box(.5, .06, .3, 0, 3.86, .12, 0x1a1c22)]), mat, heads, 'sigheads');
  const lampGeo = new THREE.SphereGeometry(.12, 10, 8); lampGeo.translate(0, 0, .2);
  const lampIM = inst(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), lamps, 'siglamps');
  if (lampIM) { lamps.forEach((_, i) => lampIM.setColorAt(i, new THREE.Color(1, .1, .05))); lampIM.instanceColor.needsUpdate = true; }
  inst(new THREE.BoxGeometry(.5, .02, 2.2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: .7 }), walks, 'crosswalks');

  // signal phase: 2 groups; green 10 s, yellow 2.5 s, all-red 0.8 s
  const G = 10, Y = 2.5, AR = .8, CYC = 2 * (G + Y + AR);
  const phase = (p, t, grp) => { const k = (t + p.off) % CYC, a = grp ? (k + CYC / 2) % CYC : k; return a < G ? 'g' : a < G + Y ? 'y' : 'r'; };
  L.phase = phase;
  const COLS = { g: new THREE.Color(.15, 1.6, .5), y: new THREE.Color(1.6, 1.1, .1), r: new THREE.Color(1.8, .12, .06) }, HY = { g: 3.02, y: 3.32, r: 3.62 };
  let lastPh = -1;
  function updSignals(t) {
    if (!lampIM) return; const tick = Math.floor(t * 4); if (tick === lastPh) return; lastPh = tick;
    for (const p of X) for (const l of p.lamps) { const ph = phase(p, t, p.group.get(l.s)); q.setFromAxisAngle(up, l.yaw); m4.compose(v.set(l.x, HY[ph], l.z), q, one); lampIM.setMatrixAt(l.i, m4); lampIM.setColorAt(l.i, COLS[ph]); }
    lampIM.instanceMatrix.needsUpdate = true; lampIM.instanceColor.needsUpdate = true;
  }

  // traffic control for the city's ground cars (called from app.js updGround). Sets g.k = speed factor 0..1.
  const byStreet = new Map(); for (const p of X) for (const s of p.s) { if (!byStreet.has(s)) byStreet.set(s, []); byStreet.get(s).push(p); }
  L.traffic = (cars, dt, t) => {
    const lanes = new Map();
    for (const g of cars) { const key = g.s; let a = lanes.get(key); if (!a) lanes.set(key, a = []); a.push(g); }
    for (const [s, a] of lanes) {
      const len = streetLen(s), ring = s.type === 'ring', xs = byStreet.get(s) || [];
      for (const g of a) {
        const mU = g.u * len, d = g.d; let tgt = 1;
        // next junction ahead
        for (const p of xs) {
          let du = (p.u.get(s) * len - mU) * d; if (ring) du = ((du % len) + len) % len;
          if (du < 0 || du > 40) continue;
          const stop = du - 7.2; if (stop < -.5) continue;   // already in the junction: keep going
          const ph = phase(p, t, p.group.get(s));
          if (ph === 'r' || (ph === 'y' && stop > 5)) tgt = Math.min(tgt, Math.max(0, (stop - .3) / 14));
        }
        // keep a gap to the car ahead in the same lane
        for (const o of a) { if (o === g || o.d !== d || o.side !== g.side) continue; let gap = (o.u * len - mU) * d; if (ring) gap = ((gap % len) + len) % len; if (gap > 0 && gap < 20) tgt = Math.min(tgt, Math.max(0, (gap - 6.5) / 10)); }
        // emergency vehicles nearby make traffic yield
        if (window.__cityEvents && window.__cityEvents.yieldAt) { const pt = streetAt(s, g.u); if (window.__cityEvents.yieldAt(pt.x, pt.z)) tgt = Math.min(tgt, .25); }
        const k = g.k ?? 1; g.k = tgt < k ? Math.max(tgt, k - dt * 1.6) : Math.min(tgt, k + dt * .55);
      }
    }
  };

  // ---------------- storm drains + manholes, speed signs (along every street)
  const drains = [], holes = [], spPoles = [], sp = { 25: [], 35: [], 45: [] };
  for (const s of st) {
    const len = streetLen(s), lim = s.type === 'ring' ? 25 : 35;
    for (let m = 20; m < len - 10; m += 42) { const u = m / len, p = streetAt(s, u), side = (Math.round(m / 42) % 2) ? 1 : -1, rx = -p.tz * side, rz = p.tx * side; if (distToStreets(st, p.x, p.z, s) < 8) continue; drains.push({ x: p.x + rx * 2.3, z: p.z + rz * 2.3, y: .105, yaw: Math.atan2(p.tx, p.tz) }); }
    for (let m = 35; m < len - 10; m += 64) { const p = streetAt(s, m / len); if (distToStreets(st, p.x, p.z, s) < 8) continue; holes.push({ x: p.x - p.tz * 1.25, z: p.z + p.tx * 1.25, y: .11 }); }
    for (let m = 30; m < len - 20; m += 150) for (const d of [1, -1]) {
      const p = streetAt(s, m / len), ax = p.tx * d, az = p.tz * d, rx = -az, rz = ax, x = p.x + rx * 3.0, z = p.z + rz * 3.0; if (distToStreets(st, x, z, s) < 9 || !free(x, z, .4, { offroad: true })) continue;
      claim(x, z, .5); spPoles.push({ x, z }); sp[lim].push({ x, z, y: 2.15, yaw: Math.atan2(-ax, -az) });
    }
  }
  inst(merge([box(.9, .03, .45, 0, 0, 0, 0x1b1d20), ...[-.3, -.15, 0, .15, .3].map(xx => box(.06, .035, .38, xx, .002, 0, 0x55595e))]), mat, drains, 'drains');
  inst(merge([cyl(.45, .45, .03, 0, 0, 0, 0x3a3c40, 16), cyl(.38, .38, .035, 0, 0, 0, 0x2a2c30, 16)]), mat, holes, 'manholes');
  inst(cyl(.04, .04, 2.5, 0, 1.25, 0, 0x8a9098, 6), mat, spPoles, 'speedpoles');
  for (const k of [25, 35, 45]) inst(facePlane(.6, .75, 'speed' + k).translate(0, 0, .05), signMat, sp[k], 'speed' + k);

  // ---------------- billboards near each token's district
  const boards = [], frames = [];
  for (const n of ['BURN', 'IMM', 'XRPyro', 'IMG', 'RACC']) {
    const d = c.N && c.N[n]; if (!d) continue; let placed = 0;
    // walk the streets nearest the district and put two boards facing the road
    const cand = [];
    for (const s of st) { const len = streetLen(s); for (let m = 10; m < len; m += 12) { const p = streetAt(s, m / len); const dd = Math.hypot(p.x - d.pos.x, p.z - d.pos.z); if (dd < 160) cand.push({ s, p, dd }); } }
    cand.sort((a, b) => a.dd - b.dd);
    for (const cd of cand) {
      if (placed >= 2) break;
      for (const side of [1, -1]) {
        const rx = -cd.p.tz * side, rz = cd.p.tx * side, x = cd.p.x + rx * 13, z = cd.p.z + rz * 13;
        if (!free(x, z, 6.5, { offroad: true }) || distToStreets(st, x, z) < 12) continue; if (boards.some(b => Math.hypot(b.x - x, b.z - z) < 40)) continue;
        claim(x, z, 6.5); const yaw = Math.atan2(-rx, -rz); boards.push({ x, z, y: 8.5, yaw, n }); frames.push({ x, z, yaw }); placed++; break;
      }
    }
  }
  const frameGeo = merge([box(12.6, 5.6, .35, 0, 8.5, -.22, 0x22252b), cyl(.3, .35, 6, -3.5, 3, -.4, 0x3a3f48), cyl(.3, .35, 6, 3.5, 3, -.4, 0x3a3f48), box(12.8, .12, .5, 0, 5.62, -.1, 0xff7a1a), box(12.8, .12, .5, 0, 11.38, -.1, 0xff7a1a)]);
  inst(frameGeo, mat, frames, 'bbframes');
  for (const n of ['BURN', 'IMM', 'XRPyro', 'IMG', 'RACC']) inst(facePlane(12, 5, 'ad_' + n).translate(0, 0, -.0), signMat, boards.filter(b => b.n === n).map(b => ({ ...b })), 'ad_' + n);
  { const al = inst(facePlane(12, 5, 'ad_ALERT').translate(0, 0, .04), signMat, boards.map(b => ({ ...b })), 'ad_alert'); if (al) al.visible = false; L.setAlert = on => { if (al) al.visible = !!on; }; }   // hidden = not drawn: no cost at NORMAL
  for (const b of boards) { const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw); for (const lx of [-3.5, 3.5]) c.colliders.push({ x: b.x + lx * cs - .4 * sn, z: b.z - lx * sn - .4 * cs, r: .4, h: 11.5 }); /* posts sit behind the face */ }

  // ---------------- buildings: Main Street shops, police, fire, power plant, wind farm
  const blds = [], signs = [];
  // Main Street: a row of five shops along a straight avenue near the spawn
  const spawn = { x: 0, z: 52 };
  const SHOPS = [['mart', 0xd8562a, 0x2a1810], ['smoke', 0x7a4a9a, 0x1a1420], ['disp', 0x2f9a5a, 0x0f2014], ['coffee', 0xc8902a, 0x2a1c0c], ['arcade', 0x2a7ad8, 0x0c1424]];
  const shopGeo = (wall, trim) => merge([box(10.4, 6.4, 9, 0, 3.2, 4.5, wall), box(10.6, .5, 9.2, 0, 6.6, 4.5, trim), box(8.2, 3.2, .12, 0, 1.9, -.02, 0x14202c), box(1.6, 2.5, .14, 2.6, 1.25, -.05, 0x0a0e14), box(10.6, .18, 1.6, 0, 3.75, -.75, trim), box(10.6, .06, 1.62, 0, 3.86, -.75, 0xff8a2a), box(.2, 6.4, .2, -5.1, 3.2, -.05, trim), box(.2, 6.4, .2, 5.1, 3.2, -.05, trim)]);
  // storefront spots: frontage 6.3 m from the street centre, body 9 m deep, nearest the spawn first
  const spots = [];
  for (const s of st) { const len = streetLen(s); for (let m = 8; m < len - 8; m += 4) for (const side of [1, -1]) {
    const p = streetAt(s, m / len), rx = -p.tz * side, rz = p.tx * side, cx = p.x + rx * 10.8, cz = p.z + rz * 10.8;
    if (!free(cx, cz, 6.4, { offroad: true }) || distToStreets(st, cx, cz, s) < 12 || distToStreets(st, cx, cz) < 9.5 || distToStreets(st, p.x + rx * 14, p.z + rz * 14, s) < 8 || distToStreets(st, p.x + rx * 10.8 + p.tx * 5.5, p.z + rz * 10.8 + p.tz * 5.5, s) < 8 || distToStreets(st, p.x + rx * 10.8 - p.tx * 5.5, p.z + rz * 10.8 - p.tz * 5.5, s) < 8) continue;
    spots.push({ s, m, side, len, p, rx, rz, d: Math.hypot(cx - spawn.x, cz - spawn.z) }); } }
  spots.sort((a, b) => a.d - b.d);
  for (const [id, wall, trim] of SHOPS) {
    const o = spots.find(o => free(o.p.x + o.rx * 10.8, o.p.z + o.rz * 10.8, 6.4, { offroad: true })); if (!o) break;
    const x = o.p.x + o.rx * 6.3, z = o.p.z + o.rz * 6.3, yaw = Math.atan2(o.rx, o.rz);
    blds.push({ geo: shopGeo(wall, trim), x, z, yaw }); signs.push({ slot: 'sign_' + id, w: 6.4, h: 1.6, x, z, yaw, lx: 0, ly: 4.9, lz: -.08 });
    const door = { x: x + Math.cos(yaw) * 2.6 - Math.sin(yaw) * .2, z: z - Math.sin(yaw) * 2.6 - Math.cos(yaw) * .2 };
    L.shops.push({ id, x, z, yaw, door, s: o.s, m: o.m, len: o.len, side: o.side });
    claim(x + o.rx * 4.5, z + o.rz * 4.5, 6.4); for (const lz of [2.2, 6.8]) c.colliders.push({ x: x + o.rx * lz, z: z + o.rz * lz, r: 5.2, h: 7 });
  }
  // police + fire stations: frontage on a street, not too far from spawn
  const APRON = 9;   // concrete apron between the curb and the bay doors, where the vehicles park
  const lot = (w, d, minD, maxD) => {
    const cs = [];
    for (const s of st) { const len = streetLen(s); for (let m = 8; m < len; m += 8) for (const side of [1, -1]) {
      const p = streetAt(s, m / len), rx = -p.tz * side, rz = p.tx * side, SB = 6 + APRON + d / 2, x = p.x + rx * SB, z = p.z + rz * SB, dd = Math.hypot(x - spawn.x, z - spawn.z);
      if (dd < minD || dd > maxD) continue; const r = Math.hypot(w, d + APRON * 2) / 2 + 3; if (!free(x, z, r, { offroad: true }) || distToStreets(st, x, z, s) < SB - .5 || distToStreets(st, x, z) < SB - 1) continue;
      cs.push({ s, m, side, x, z, rx, rz, p, dd, r }); } }
    cs.sort((a, b) => a.dd - b.dd); return cs[0] || null;
  };
  const station = (kind, w, d, wall, trim) => {
    const o = lot(w, d, 40, 300); if (!o) return null; const yaw = Math.atan2(o.rx, o.rz); claim(o.x, o.z, o.r);
    const parts = [box(w + 2, .06, APRON, 0, .03, -d / 2 - APRON / 2, 0x77726c), box(w + 2, .07, .25, 0, .04, -d / 2 - APRON + .2, 0xd8d2c8), box(w, 7.5, d, 0, 3.75, 0, wall), box(w + .3, .6, d + .3, 0, 7.8, 0, trim), box(w * .9, .25, 1.4, 0, 4.4, -d / 2 - .7, trim)];
    if (kind === 'fire') { for (const gx of [-w / 4, w / 4]) parts.push(box(w * .38, 4.2, .15, gx, 2.1, -d / 2 - .02, 0x3a1410), box(w * .38, .1, .16, gx, 4.25, -d / 2 - .03, 0xff8a2a)); parts.push(box(1.6, 12, 1.6, w / 2 - 1.2, 6, d / 2 - 1.2, trim)); }
    else if (kind === 'ems') { for (const gx of [-w / 4, w / 4]) parts.push(box(w * .36, 3.6, .15, gx, 1.8, -d / 2 - .02, 0xdfe4ea)); parts.push(box(3, .9, .2, 0, 8.6, -d / 2 + .5, 0xe82020), box(.9, 3, .2, 0, 8.6, -d / 2 + .5, 0xe82020), box(w * .9, .25, .1, 0, 4.0, -d / 2 - .08, 0xe82020)); }
    else { parts.push(box(w * .5, 3, .12, 0, 1.9, -d / 2 - .02, 0x14202c), box(2, .4, .4, 0, 8.4, 0, 0x2a4aa8), box(.6, .4, .42, -.7, 8.4, 0, 0xff2a2a), box(.6, .4, .42, .7, 8.4, 0, 0x2a6aff)); }
    blds.push({ geo: merge(parts), x: o.x, z: o.z, yaw }); signs.push({ slot: 'sign_' + kind, w: 7, h: 1.75, x: o.x, z: o.z, yaw, lx: 0, ly: 6.1, lz: -d / 2 - .1 });
    for (const lz of [-d / 4, d / 4]) for (const lx of [-w / 4, w / 4]) c.colliders.push({ x: o.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: o.z - lx * Math.sin(yaw) + lz * Math.cos(yaw), r: Math.min(w, d) / 3.2, h: 8 });
    // where vehicles leave/arrive: the street point in front
    const cs = Math.cos(yaw), sn = Math.sin(yaw), at = (lx, lz) => ({ x: o.x + lx * cs + lz * sn, z: o.z - lx * sn + lz * cs });
    const bays = (kind === 'police' ? [-w / 3, 0, w / 3] : [-w / 4, w / 4]).map(lx => ({ ...at(lx, -d / 2 - APRON / 2), yaw: yaw + Math.PI }));
    return { x: o.x, z: o.z, yaw, bays, s: o.s, u: o.m / streetLen(o.s), door: { x: o.p.x + o.rx * 4.2, z: o.p.z + o.rz * 4.2 }, w, d };
  };
  L.police = station('police', 18, 13, 0xdfe6ee, 0x22345a);
  L.fire = station('fire', 16, 14, 0xb8322a, 0xe8e2d6);
  L.ems = station('ems', 18, 14, 0xf2f2f0, 0xc8201a);

  // power plant + wind farm outside town (west/south-west, away from the estate lake in the east)
  const away = (a, r) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  let pp = null; for (const a of [2.6, 2.9, 3.3, 2.3, 3.7]) { const p = away(a, 440); if (free(p.x, p.z, 45, { offroad: true })) { pp = { ...p, a }; break; } }
  if (pp) {
    const yaw = -pp.a + Math.PI / 2; claim(pp.x, pp.z, 50);
    const lathe = (r0, r1, r2, h) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, r = t < .7 ? r0 + (r1 - r0) * Math.pow(t / .7, .8) : r1 + (r2 - r1) * ((t - .7) / .3); pts.push(new THREE.Vector2(r, t * h)); } return new THREE.LatheGeometry(pts, 20); };
    const parts = [];
    for (const lx of [-16, 16]) parts.push(colored(lathe(14, 8.5, 9.6, 46).translate(lx, 0, 14), 0xbfb8ae));
    parts.push(box(40, 16, 18, 0, 8, -12, 0x5a6068), box(41, 1, 19, 0, 16.4, -12, 0xffb020), cyl(1.8, 2.4, 52, 14, 26, -18, 0xd8d0c8), cyl(1.9, 1.9, 2, 14, 51, -18, 0xd8402a), box(12, 6, 10, -24, 3, -12, 0x3a3f48));
    for (let i = 0; i < 6; i++) parts.push(box(.4, 9, .4, -30 + i * 5, 4.5, -32, 0x8a9098)); parts.push(box(26, .3, .3, -17.5, 8.5, -32, 0x8a9098), box(26, .3, .3, -17.5, 6.5, -32, 0x8a9098));
    blds.push({ geo: merge(parts), x: pp.x, z: pp.z, yaw }); signs.push({ slot: 'sign_power', w: 12, h: 3, x: pp.x, z: pp.z, yaw, lx: 0, ly: 13, lz: -21.1 });
    for (const [lx, lz, r] of [[-16, 14, 14], [16, 14, 14], [0, -12, 14], [-24, -12, 7]]) c.colliders.push({ x: pp.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: pp.z - lx * Math.sin(yaw) + lz * Math.cos(yaw), r, h: 46 });
    L.power = { x: pp.x, z: pp.z, yaw, stack: { x: pp.x + 14 * Math.cos(yaw) - 18 * Math.sin(yaw), y: 52, z: pp.z - 14 * Math.sin(yaw) - 18 * Math.cos(yaw) } };
  }
  // wind farm: a loose grid on the far side of the power plant
  const turb = []; const wa = pp ? pp.a + .38 : 2.95;
  for (let i = 0; i < (tier === 'low' ? 6 : 10); i++) { const r = 520 + (i % 2) * 70 + hsh(i, 3) * 20, a = wa + (Math.floor(i / 2) - 2) * .12 + hsh(i, 9) * .03, p = away(a, r); if (!free(p.x, p.z, 14, { offroad: true })) continue; claim(p.x, p.z, 14); turb.push({ x: p.x, z: p.z, yaw: -a - Math.PI / 2, ph: hsh(i, 1) * 6 }); c.colliders.push({ x: p.x, z: p.z, r: 1.6, h: 40 }); }
  inst(merge([cyl(.9, 1.6, 40, 0, 20, 0, 0xeef0f2, 12), box(1.6, 1.6, 4, 0, 40.5, .6, 0xe6e8ea), box(1.62, .1, 4.02, 0, 41.3, .6, 0xff7a1a)]), mat, turb, 'turbines');
  const blade = (() => { const b = []; for (let k = 0; k < 3; k++) b.push(colored(new THREE.BoxGeometry(.7, 17, .25).translate(0, 9, 0).rotateZ(k * Math.PI * 2 / 3), 0xf4f4f4)); b.push(cyl(.8, .8, 1.2, 0, 0, 0, 0xdfe2e6, 10).rotateX(Math.PI / 2)); return merge(b); })();
  const rotors = turb.length ? new THREE.InstancedMesh(blade, mat, turb.length) : null; if (rotors) { rotors.frustumCulled = false; grp.add(rotors); }
  // red aviation beacons on top of each turbine
  const beac = inst(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, .1, .05), toneMapped: false }), turb.map(t => ({ x: t.x, y: 42, z: t.z })), 'beacons');
  L.wind = turb;

  // merged buildings (one draw call) + signs (one draw call, atlas)
  if (blds.length) grp.add(new THREE.Mesh(merge(blds.map(b => xf(b.geo, b.x, b.z, b.yaw))), mat));
  if (signs.length) { const gs = signs.map(sg => { const g = facePlane(sg.w, sg.h, sg.slot); g.rotateY(Math.PI); g.translate(sg.lx, sg.ly, sg.lz); return xf(g, sg.x, sg.z, sg.yaw); }); grp.add(new THREE.Mesh(merge(gs), signMat)); }
  // ember glow on the power-plant stack
  if (L.power) { const fl = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .7, .15), toneMapped: false })); fl.position.set(L.power.stack.x, L.power.stack.y + .6, L.power.stack.z); grp.add(fl); }

  // ---------------- Main Street shoppers: walk the storefronts, go inside, come back out
  const shoppers = [];
  const pedGeo = merge([colored(new THREE.CapsuleGeometry(.2, .5, 2, 6).translate(0, 1.12, 0), 0xffffff), colored(new THREE.SphereGeometry(.15, 8, 6).translate(0, 1.66, 0), 0xd8a880), box(.13, .7, .15, .1, .38, 0, 0x16181e), box(.13, .7, .15, -.1, .38, 0, 0x16181e), box(.3, .25, .18, .26, .9, 0, 0xc89a5a)]);
  const NSH = L.shops.length ? (tier === 'low' ? 8 : tier === 'high' ? 22 : 14) : 0;
  const shopIM = NSH ? new THREE.InstancedMesh(pedGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, emissive: 0x101418 }), NSH) : null;
  const SHIRT = [0xd23b3b, 0x2f6fd8, 0xe8e2d6, 0x2a2a30, 0x3fa66b, 0xe0a030, 0x8a4fd0, 0x1fb5c0, 0xf06292, 0xff7a1a];
  if (shopIM) { shopIM.frustumCulled = false; grp.add(shopIM); for (let i = 0; i < NSH; i++) { shopIM.setColorAt(i, new THREE.Color(SHIRT[i % SHIRT.length])); shoppers.push({ x: 0, z: 0, state: 'walk', tgt: null, t: 0, ph: i * 1.3, sp: 1.1 + hsh(i, 7) * .5, inside: 0 }); } shopIM.instanceColor.needsUpdate = true; }
  const sidewalk = (f, k) => { const sp = L.shops[k ?? ((Math.random() * L.shops.length) | 0)]; const m = Math.max(2, Math.min(sp.len - 2, sp.m + (f - .5) * 44)), p = streetAt(sp.s, m / sp.len), rx = -p.tz * sp.side, rz = p.tx * sp.side; return { x: p.x + rx * 4.3, z: p.z + rz * 4.3 }; };
  shoppers.forEach((sh, i) => { const k = i % Math.max(1, L.shops.length), p = sidewalk(hsh(i, 2), k); sh.x = p.x; sh.z = p.z; sh.home = k; sh.tgt = i % 2 ? sidewalk(hsh(i, 5), k) : { x: L.shops[k].door.x - Math.sin(L.shops[k].yaw) * 2.2, z: L.shops[k].door.z - Math.cos(L.shops[k].yaw) * 2.2 }; if (!(i % 2)) { sh.state = 'toShop'; sh.shop = k; } });
  L.shoppersInside = () => shoppers.filter(s => s.state === 'inside').length;
  L.shopperStates = () => shoppers.reduce((o, s) => (o[s.state] = (o[s.state] || 0) + 1, o), {});
  function updShoppers(dt, t) {
    if (!shopIM) return;
    shoppers.forEach((sh, i) => {
      if (sh.state === 'inside') {
        sh.t -= dt; if (sh.t > 0) { m4.makeScale(0, 0, 0); shopIM.setMatrixAt(i, m4); return; }
        const sp = L.shops[sh.shop]; sh.x = sp.door.x; sh.z = sp.door.z; sh.state = 'walk'; sh.tgt = sidewalk(Math.random(), sh.shop); sh.exits = (sh.exits || 0) + 1;
      }
      const dx = sh.tgt.x - sh.x, dz = sh.tgt.z - sh.z, d = Math.hypot(dx, dz);
      if (d < .25) {
        if (sh.state === 'enter') { sh.state = 'inside'; sh.t = 6 + Math.random() * 14; L.entries = (L.entries || 0) + 1; m4.makeScale(0, 0, 0); shopIM.setMatrixAt(i, m4); return; }
        if (sh.state === 'toShop') { sh.state = 'enter'; sh.tgt = { ...L.shops[sh.shop].door }; }
        else if (Math.random() < .55) { const near = L.shops.map((o, k) => k).filter(k => Math.hypot(L.shops[k].x - sh.x, L.shops[k].z - sh.z) < 40); sh.shop = near.length ? near[(Math.random() * near.length) | 0] : sh.home; sh.home = sh.shop; const sp = L.shops[sh.shop]; sh.state = 'toShop'; sh.tgt = { x: sp.door.x - Math.sin(sp.yaw) * 2.2, z: sp.door.z - Math.cos(sp.yaw) * 2.2 }; }
        else sh.tgt = sidewalk(Math.random(), sh.home);
        return;
      }
      const st2 = Math.min(d, sh.sp * dt); sh.x += dx / d * st2; sh.z += dz / d * st2;
      q.setFromAxisAngle(up, Math.atan2(dx, dz)); m4.compose(v.set(sh.x, Math.abs(Math.sin(t * sh.sp * 5.2 + sh.ph)) * .05, sh.z), q, one); shopIM.setMatrixAt(i, m4);
    });
    shopIM.instanceMatrix.needsUpdate = true;
  }

  // ---------------- per-frame (own light tick like the boat module; skips work when the tab is hidden)
  const clk = new THREE.Clock();
  L.update = () => {
    const dt = Math.min(clk.getDelta(), .05), t = performance.now() / 1000;
    updSignals(t); updShoppers(dt, t);
    if (rotors) { turb.forEach((tb, i) => { const e = new THREE.Euler(0, tb.yaw, t * 1.1 + tb.ph, 'YXZ'); q.setFromEuler(e); const off = new THREE.Vector3(0, 0, -1.6).applyAxisAngle(up, tb.yaw); m4.compose(v.set(tb.x + off.x, 40.5, tb.z + off.z), q, one); rotors.setMatrixAt(i, m4); }); rotors.instanceMatrix.needsUpdate = true; }
  };
  (function tick() { requestAnimationFrame(tick); if (!document.hidden && L.update) L.update(); })();
  L.counts = { junctions: X.length, signals: lamps.length, crosswalkBars: walks.length, drains: drains.length, manholes: holes.length, speedSigns: spPoles.length, billboards: boards.length, shops: L.shops.length, police: !!L.police, fire: !!L.fire, power: !!L.power, turbines: turb.length, shoppers: NSH, drawCalls: grp.children.length };
  L.ready = true;
}

(function wait() {
  const c = window.__city;
  if (new URLSearchParams(location.search).has('nolife')) { L.ready = true; return; }
  if (window.__ready && c && c.streets && c.streets.length && c.colliders.length) { try { build(); } catch (e) { console.warn('citylife', e); L.ready = true; } }
  else setTimeout(wait, 300);
})();
