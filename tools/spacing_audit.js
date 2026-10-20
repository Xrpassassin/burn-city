// Burn City spacing / overlap audit. Paste into the console (or inject with Playwright addScriptTag) once
// window.__airport.ready is true, then call window.__spacingAudit() -> { counts, pairs, inv, issues }.
// In-page spacing / overlap audit for Burn City. Evaluated inside the page after the city, citylife, streetprops,
// events and airport layers are ready. Returns { counts, issues, inventory }.
window.__spacingAudit = function (opts = {}) {
  const GAP = opts.gap ?? 2.0;   // minimum building-to-building clearance (m)
  const c = window.__city, CL = window.__cityLife, SP = window.__streetProps, A = window.__airport, ES = window.__estate;
  const st = c.streets, ROAD_HW = 4.8, ASPH = 2.5;
  const issues = [], inv = {};
  const R1 = v => Math.round(v * 10) / 10;
  // ---------- geometry
  const obb = (cx, cz, yaw, lx0, lx1, lz0, lz1) => { const cs = Math.cos(yaw), sn = Math.sin(yaw), W = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]; return [W(lx0, lz0), W(lx1, lz0), W(lx1, lz1), W(lx0, lz1)]; };
  const circ = (x, z, r, n = 12) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push([x + Math.cos(a) * r / Math.cos(Math.PI / n), z + Math.sin(a) * r / Math.cos(Math.PI / n)]); } return p; };
  const bbox = P => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, x1, z0, z1]; };
  const proj = (P, ax, az) => { let a = 1e9, b = -1e9; for (const [x, z] of P) { const d = x * ax + z * az; if (d < a) a = d; if (d > b) b = d; } return [a, b]; };
  // SAT: returns penetration depth (>0 overlapping) or -gap estimate via segment distances
  function satDepth(P, Q) {
    let best = 1e9;
    for (const S of [P, Q]) for (let i = 0; i < S.length; i++) { const a = S[i], b = S[(i + 1) % S.length]; let ax = -(b[1] - a[1]), az = b[0] - a[0]; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      const [p0, p1] = proj(P, ax, az), [q0, q1] = proj(Q, ax, az); const o = Math.min(p1, q1) - Math.max(p0, q0); if (o <= 0) return o; if (o < best) best = o; }
    return best;
  }
  const segD = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l)); return Math.hypot(a[0] + u * dx - px, a[1] + u * dz - pz); };
  function gap(P, Q) { const d = satDepth(P, Q); if (d > 0) return -d; let m = 1e9; for (const p of P) for (let i = 0; i < Q.length; i++) m = Math.min(m, segD(p[0], p[1], Q[i], Q[(i + 1) % Q.length])); for (const q of Q) for (let i = 0; i < P.length; i++) m = Math.min(m, segD(q[0], q[1], P[i], P[(i + 1) % P.length])); return m; }
  const distSt = (x, z, skip) => { let m = 1e9, w = null; for (const s of st) { if (s === skip) continue; let d; if (s.type === 'ring') d = Math.abs(Math.hypot(x - s.c.x, z - s.c.z) - s.r); else { const vx = s.b.x - s.a.x, vz = s.b.z - s.a.z, L2 = vx * vx + vz * vz; let t = ((x - s.a.x) * vx + (z - s.a.z) * vz) / L2; t = Math.max(0, Math.min(1, t)); d = Math.hypot(x - s.a.x - vx * t, z - s.a.z - vz * t); } if (d < m) { m = d; w = s; } } return [m, w]; };
  // min distance from a polygon (perimeter samples + centre) to any street centreline
  function polyStreet(P, skip) { let m = 1e9; const n = P.length; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / .5)); for (let j = 0; j < k; j++) { const u = j / k; const d = distSt(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, skip)[0]; if (d < m) m = d; } } return m; }
  const inPoly = (x, z, P) => { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; };
  // highway (estate approach road), 7.5 m half width as in the app's own audit
  const hw = ES && (ES.roadO || ES.cityEdge) && ES.dir ? { o: ES.roadO || ES.cityEdge, d: ES.dir, L: ES.roadLen } : null;
  const onHw = (x, z, r) => { if (!hw) return false; const al = (x - hw.o.x) * hw.d.x + (z - hw.o.z) * hw.d.z; return al > -2 && al < hw.L && Math.abs((x - hw.o.x) * hw.d.z - (z - hw.o.z) * hw.d.x) < 7.5 + r; };
  const polyHw = P => { if (!hw) return false; if (P.some(([x, z]) => onHw(x, z, 0))) return true; const [x0, x1, z0, z1] = bbox(P); return onHw((x0 + x1) / 2, (z0 + z1) / 2, 0); };

  // ---------- buildings
  const B = [];
  const addB = (type, id, P, extra = {}) => { const o = { type, id, P, bb: bbox(P), ...extra }; B.push(o); return o; };
  // towers (pad)
  for (const k of c.colliders) if (k.node) { const n = k.node, pad = n.w * 2.05; addB('tower', n.name, circ(n.pos.x, n.pos.z, pad, 40), { cx: n.pos.x, cz: n.pos.z }); }
  // satellites / holder / infill: exact base footprint from the instanced segment mesh
  const sats = window.__sats || [];
  let segIM = null; c.S.traverse(o => { if (o.isInstancedMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.radialSegments === 4 && o.geometry.parameters.radiusTop === .82) segIM = o; });
  const base = new Map();
  if (segIM) { const m = new c.S.matrix.constructor(); for (let i = 0; i < segIM.count; i++) { segIM.getMatrixAt(i, m); const e = m.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]); if (Math.abs(e[13] - sy / 2) > .01) continue; const yaw = Math.atan2(e[8] / sz, e[0] / sx); base.set(R1(e[12]) + ',' + R1(e[14]), { x: e[12], z: e[14], sx, sz, yaw, h: sy }); } }
  sats.forEach((s, i) => { const b = base.get(R1(s.x) + ',' + R1(s.z)); const hx = (b ? b.sx : s.w * 1.2) * .7071, hz = (b ? b.sz : s.w * 1.2) * .7071, yaw = b ? b.yaw : s.rot;
    addB(s.infill ? 'infill' : s.holder ? 'holder' : 'satellite', 'sat#' + i + (s.n ? '@' + s.n.name : ''), obb(s.x, s.z, yaw, -hx, hx, -hz, hz), { cx: s.x, cz: s.z, sat: i }); });
  if (!sats.length && segIM) { let i = 0; for (const b of base.values()) { const hx = b.sx * .7071, hz = b.sz * .7071; addB('satellite', 'seg#' + (i++), obb(b.x, b.z, b.yaw, -hx, hx, -hz, hz), { cx: b.x, cz: b.z }); } }
  // shops (body + awning line)
  (CL.shops || []).forEach(s => addB('shop', s.id, obb(s.x, s.z, s.yaw, -5.3, 5.3, -.1, 9.1), { cx: s.x, cz: s.z, shop: s }));
  // stations: body + apron (apron runs to the road edge: front 1.2 m strip of sidewalk is the driveway)
  const APRON = 9, stations = [];
  for (const k of ['police', 'fire', 'ems']) { const s = CL[k]; if (!s) continue; const b = addB('station', k, obb(s.x, s.z, s.yaw, -s.w / 2, s.w / 2, -s.d / 2, s.d / 2), { cx: s.x, cz: s.z });
    const ap = obb(s.x, s.z, s.yaw, -s.w / 2 - 1, s.w / 2 + 1, -s.d / 2 - APRON - 1.2, -s.d / 2 - .05); stations.push({ k, s, body: b, apron: ap, apBB: bbox(ap) }); }
  // power plant
  if (CL.power) { const p = CL.power; addB('power', 'power', obb(p.x, p.z, p.yaw, -30.5, 30.5, -32.5, 28.5), { cx: p.x, cz: p.z }); }
  (CL.wind || []).forEach((t, i) => addB('turbine', 'turbine#' + i, circ(t.x, t.z, 2, 8), { cx: t.x, cz: t.z }));
  // billboards (frames) and airport
  const grpOf = name => c.S.children.find(o => o.name === name);
  const life = grpOf('citylife'), props = grpOf('streetprops');
  const instList = (im, fn) => { const m = new c.S.matrix.constructor(), out = []; for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); const e = m.elements, sx = Math.hypot(e[0], e[1], e[2]); if (sx < 1e-4) continue; out.push(fn(e[12], e[14], Math.atan2(e[8] / Math.hypot(e[8], e[9], e[10]), e[0] / sx), i)); } return out; };
  if (life) { const bb = life.children.find(o => o.name === 'bbframes'); if (bb) instList(bb, (x, z, yaw, i) => addB('billboard', 'billboard#' + i, obb(x, z, yaw, -6.4, 6.4, -.8, .2), { cx: x, cz: z })); }
  if (A && A.ready) {
    addB('airport', 'terminal', obb(0, -560, 0, -116, 116, -21, 21)); addB('airport', 'curb-canopy', obb(0, -535, 0, -119, 119, -5, 5)); addB('airport', 'atc-tower', circ(140, -600, 7.2));
    addB('airport', 'hangar', obb(-220, -615, 0, -36, 36, -30, 30)); for (let k = 0; k < 3; k++) addB('airport', 'fuel#' + k, circ(240 + k * 17, -540, 7.1));
  }
  inv.buildings = B.reduce((o, b) => (o[b.type] = (o[b.type] || 0) + 1, o), {});
  // spatial hash
  const CELL = 24, grid = new Map(), key = (i, j) => i + ',' + j;
  B.forEach((b, bi) => { const [x0, x1, z0, z1] = b.bb; for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(bi); } });
  const near = (bb, pad) => { const out = new Set(); for (let i = Math.floor((bb[0] - pad) / CELL); i <= Math.floor((bb[1] + pad) / CELL); i++) for (let j = Math.floor((bb[2] - pad) / CELL); j <= Math.floor((bb[3] + pad) / CELL); j++) { const a = grid.get(key(i, j)); if (a) a.forEach(x => out.add(x)); } return out; };
  const add = (cat, sev, msg, at, data) => issues.push({ cat, sev, msg, at: at && [R1(at[0]), R1(at[1])], ...data });
  const ctr = b => b.cx != null ? [b.cx, b.cz] : [(b.bb[0] + b.bb[1]) / 2, (b.bb[2] + b.bb[3]) / 2];

  // 1) building-building overlaps / tight gaps
  B.forEach((a, ai) => { for (const bi of near(a.bb, GAP)) { if (bi <= ai) continue; const b = B[bi];
    if (a.bb[0] - GAP > b.bb[1] || b.bb[0] - GAP > a.bb[1] || a.bb[2] - GAP > b.bb[3] || b.bb[2] - GAP > a.bb[3]) continue;
    if (a.type === 'airport' && b.type === 'airport') continue;
    const g = gap(a.P, b.P); if (g >= GAP) continue;
    add(g < 0 ? 'bldg_overlap' : 'bldg_tight', g < 0 ? 'major' : g < 1 ? 'minor' : 'info', `${a.type}:${a.id} vs ${b.type}:${b.id} ${g < 0 ? 'overlap ' + R1(-g) : 'gap ' + R1(g)} m`, ctr(a), { a: a.type, b: b.type, g: R1(g), ida: a.id, idb: b.id }); } });

  // 2) buildings on roads / sidewalks / intersections / highway / lake / skatepark
  const X = (CL.signals || []).map(p => ({ x: p.x, z: p.z }));
  const PARK = { x: -106, z: 54, hx: 24, hz: 21 };   // Ember Yard (skate.js PARK; built lazily on first skate)
  const parkP = obb(PARK.x, PARK.z, 0, -PARK.hx, PARK.hx, -PARK.hz, PARK.hz);
  B.forEach(b => {
    if (b.type === 'airport') return;
    const d = polyStreet(b.P);
    if (d < ROAD_HW) add(d < ASPH ? 'bldg_on_road' : 'bldg_on_sidewalk', 'major', `${b.type}:${b.id} ${d < ASPH ? 'on the asphalt' : 'on the sidewalk'} (edge ${R1(d)} m from centreline)`, ctr(b), { a: b.type, d: R1(d) });
    // junction box: within 9 m of a junction centre AND within 1 m of the road band (corner sweep / turning radius / crosswalk landing)
    if (d < ROAD_HW + 1) for (const x of X) { const cx = Math.max(b.bb[0], Math.min(x.x, b.bb[1])), cz = Math.max(b.bb[2], Math.min(x.z, b.bb[3])); if (Math.hypot(cx - x.x, cz - x.z) > 9) continue;
      const near9 = b.P.some(([px, pz]) => Math.hypot(px - x.x, pz - x.z) < 9 && distSt(px, pz)[0] < ROAD_HW + 1) || gap(b.P, circ(x.x, x.z, 9)) < 0 && d < ROAD_HW + 1; if (near9) { add('bldg_in_intersection', 'major', `${b.type}:${b.id} crowds a junction (edge ${R1(d)} m from centreline)`, ctr(b), { a: b.type }); break; } }
    if (polyHw(b.P)) add('bldg_on_highway', 'major', `${b.type}:${b.id} on the highway`, ctr(b), { a: b.type });
    if (ES && ES.inLake && b.P.some(([x, z]) => ES.inLake(x, z))) add('bldg_in_lake', 'major', `${b.type}:${b.id} in the lake`, ctr(b), { a: b.type });
    if (gap(b.P, parkP) < 1) add('skate_blocked', 'major', `${b.type}:${b.id} inside the Ember Yard skatepark area`, ctr(b), { a: b.type });
  });
  // airport structures vs city streets (they should be clear of everything)
  if (A && A.ready) B.filter(b => b.type === 'airport').forEach(b => { const d = polyStreet(b.P); if (d < ROAD_HW) add('bldg_on_road', 'major', `airport:${b.id} on a city street`, ctr(b), { a: 'airport', d: R1(d) }); });
  // streets running into the skatepark
  { const d = polyStreet(parkP); if (d < ROAD_HW) add('skate_blocked', 'major', `a street runs through the skatepark area (${R1(d)} m)`, [PARK.x, PARK.z]); }

  // ---------- props
  const P = [];   // {kind, x, z, r | poly, flat}
  const addP = (kind, x, z, poly, flat = false) => P.push({ kind, x, z, P: poly, bb: bbox(poly), flat });
  if (props && SP) {
    const LOC = { bench: [-.9, .9, -.28, .28], planter: [-1.2, 1.2, -.6, .6], bin: .32, hydrant: .22, rack: [-.85, .85, -.32, .32], lamp: .26, shelterGlass: null, shelter: [-2.1, 2.1, -.7, 1.1], plaza: [-3, 3, -2.5, 2.9] };
    const keys = Object.keys(SP.counts).filter(k => SP.counts[k] > 0); let ci = 0;
    for (const k of keys) { const im = props.children[ci++]; if (!im || !im.isInstancedMesh) break; const L = LOC[k]; if (L === null) continue; instList(im, (x, z, yaw) => addP(k, x, z, typeof L === 'number' ? circ(x, z, L, 8) : obb(x, z, yaw, L[0], L[1], L[2], L[3]))); }
  }
  if (life) for (const im of life.children) { if (!im.isInstancedMesh) continue; const n = im.name;
    if (n === 'sigpoles') instList(im, (x, z) => addP('signal', x, z, circ(x, z, .12, 6)));
    else if (n === 'speedpoles') instList(im, (x, z) => addP('speedsign', x, z, circ(x, z, .1, 6)));
    else if (n === 'drains') instList(im, (x, z, yaw) => addP('drain', x, z, obb(x, z, yaw, -.45, .45, -.23, .23), true));
    else if (n === 'manholes') instList(im, (x, z) => addP('manhole', x, z, circ(x, z, .45, 8), true));
    else if (n === 'crosswalks') instList(im, (x, z, yaw) => addP('crosswalk', x, z, obb(x, z, yaw, -.25, .25, -1.1, 1.1), true));
    else if (n === 'bbframes') instList(im, (x, z, yaw) => { for (const lx of [-3.5, 3.5]) { const cs = Math.cos(yaw), sn = Math.sin(yaw), px = x + lx * cs - .4 * sn, pz = z - lx * sn - .4 * cs; addP('billboard-post', px, pz, circ(px, pz, .35, 6)); } });
  }
  if (window.__props) for (const [x, z, r] of window.__props.items) { if (!r) continue; addP(r >= 1 ? 'park-bench' : 'park-lamp', x, z, circ(x, z, r >= 1 ? .95 : .1, 6)); }
  for (const k of c.colliders) if (k.r === .4 && k.h === 4) addP('tree', k.x, k.z, circ(k.x, k.z, .4, 6));
  inv.props = P.reduce((o, p) => (o[p.kind] = (o[p.kind] || 0) + 1, o), {});
  // 3) props inside building footprints / in driving lanes
  for (const p of P) {
    if (p.kind === 'crosswalk') continue;
    for (const bi of near(p.bb, .3)) { const b = B[bi]; if (p.kind === 'billboard-post' && b.type === 'billboard') continue; if (p.bb[0] > b.bb[1] || b.bb[0] > p.bb[1] || p.bb[2] > b.bb[3] || b.bb[2] > p.bb[3]) continue;
      const g = gap(p.P, b.P); if (g < 0) add('prop_in_building', p.flat ? 'minor' : 'major', `${p.kind} inside ${b.type}:${b.id} (${R1(-g)} m)`, [p.x, p.z], { a: p.kind, b: b.type }); }
    if (!p.flat) { const d = polyStreet(p.P); if (d < ASPH) add('prop_in_lane', 'major', `${p.kind} in the driving lanes (${R1(d)} m from centreline)`, [p.x, p.z], { a: p.kind, d: R1(d) }); }
    if (!p.flat && onHw(p.x, p.z, .3)) add('prop_on_highway', 'major', `${p.kind} on the highway`, [p.x, p.z], { a: p.kind });
    if (!p.flat && ES && ES.inLake && ES.inLake(p.x, p.z)) add('prop_in_lake', 'minor', `${p.kind} in the lake`, [p.x, p.z], { a: p.kind });
    if (!p.flat && gap(p.P, parkP) < 0) add('skate_blocked', 'major', `${p.kind} inside the skatepark area`, [p.x, p.z], { a: p.kind });
  }
  // props stacked on props (solid pieces overlapping each other)
  { const solid = P.filter(p => !p.flat), g2 = new Map(); solid.forEach((p, i) => { const k = key(Math.floor(p.x / 6), Math.floor(p.z / 6)); if (!g2.has(k)) g2.set(k, []); g2.get(k).push(i); });
    solid.forEach((p, i) => { const ci = Math.floor(p.x / 6), cj = Math.floor(p.z / 6); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of g2.get(key(ci + a, cj + b)) || []) { if (j <= i) continue; const q = solid[j]; if (p.bb[0] > q.bb[1] || q.bb[0] > p.bb[1] || p.bb[2] > q.bb[3] || q.bb[2] > p.bb[3]) continue; if ((p.kind === 'billboard-post') && q.kind === 'billboard-post') continue; const g = gap(p.P, q.P); if (g < 0) add('prop_on_prop', 'minor', `${p.kind} overlaps ${q.kind} (${R1(-g)} m)`, [p.x, p.z], { a: p.kind, b: q.kind }); } }); }

  // 4) station aprons / bays blocked
  for (const S of stations) {
    for (const bi of near(S.apBB, 0)) { const b = B[bi]; if (b === S.body) continue; if (gap(S.apron, b.P) < 0) add('apron_blocked', 'major', `${S.k} apron blocked by ${b.type}:${b.id}`, [S.s.x, S.s.z], { a: S.k, b: b.type }); }
    for (const p of P) { if (p.flat || p.bb[0] > S.apBB[1] || S.apBB[0] > p.bb[1] || p.bb[2] > S.apBB[3] || S.apBB[2] > p.bb[3]) continue; if (gap(S.apron, p.P) < 0) add('apron_blocked', 'major', `${S.k} apron/driveway blocked by ${p.kind}`, [p.x, p.z], { a: S.k, b: p.kind }); }
    const own = S.s.s; const d = polyStreet(S.apron.map(q => q), own); if (d < ROAD_HW) add('apron_blocked', 'major', `${S.k} apron crosses another street (${R1(d)} m)`, [S.s.x, S.s.z], { a: S.k, b: 'street' });
    (S.s.bays || []).forEach((by, i) => { if (!inPoly(by.x, by.z, S.apron)) add('apron_blocked', 'major', `${S.k} bay ${i} not on its apron`, [by.x, by.z], { a: S.k, b: 'bay' }); });
  }
  // stations near each other: the aprons must not overlap each other or another station's body
  for (let i = 0; i < stations.length; i++) for (let j = 0; j < stations.length; j++) if (i !== j && gap(stations[i].apron, stations[j].apron) < 0 && i < j) add('apron_blocked', 'major', `${stations[i].k} and ${stations[j].k} aprons overlap`, [stations[i].s.x, stations[i].s.z]);
  // parked emergency vehicles: on their apron, not on a street
  if (window.__cityEvents && window.__cityEvents.vehicles) { try { for (const v of window.__cityEvents.vehicles()) { if (v.state && v.state !== 'parked') continue; const x = v.x ?? (v.pos && v.pos[0]), z = v.z ?? (v.pos && v.pos[1]); if (x == null) continue; const d = distSt(x, z)[0]; if (d < ROAD_HW) add('apron_blocked', 'major', `parked ${v.kind || v.k || 'vehicle'} on the street (${R1(d)} m)`, [x, z], { a: 'vehicle' }); } } catch (e) { } }

  // 5) spawn
  for (const sp of [{ x: 0, z: 55, r: 3 }, { x: 0, z: 52, r: 3 }]) { const cp = circ(sp.x, sp.z, sp.r, 12);
    for (const bi of near(bbox(cp), 0)) if (gap(cp, B[bi].P) < 0) add('spawn_blocked', 'major', `spawn (${sp.x},${sp.z}) blocked by ${B[bi].type}:${B[bi].id}`, [sp.x, sp.z]);
    for (const p of P) if (!p.flat && Math.hypot(p.x - sp.x, p.z - sp.z) < sp.r + 3 && gap(cp, p.P) < 0) add('spawn_blocked', 'major', `spawn (${sp.x},${sp.z}) blocked by ${p.kind}`, [p.x, p.z]); }

  // 6) shop doors reachable: the strip from the door to the sidewalk must be free of solid props
  for (const s of CL.shops || []) { const wk = obb(s.x, s.z, s.yaw, 1.6, 3.6, -2.2, -.05); for (const p of P) { if (p.flat || Math.hypot(p.x - s.x, p.z - s.z) > 9) continue; if (gap(wk, p.P) < 0) add('door_blocked', 'major', `shop ${s.id} door blocked by ${p.kind}`, [p.x, p.z], { a: 'shop', b: p.kind }); } }

  // 7) airport geometry sanity: every merged airport mesh must stay inside the airfield (1300 x 420 m at z -650)
  { const ag = grpOf('airport'); if (ag) ag.children.forEach((m, i) => { if (!m.geometry || m.isPoints || m.isInstancedMesh || !m.visible) return; m.geometry.computeBoundingBox(); if (!m.geometry.boundingBox || !isFinite(m.geometry.boundingBox.min.x)) return; m.updateMatrixWorld(true); const bx = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
      if (bx.min.x < -700 || bx.max.x > 700 || bx.min.z < -900 || bx.max.z > -300) add('airport_geometry', 'major', `airport mesh #${i} spans x ${R1(bx.min.x)}..${R1(bx.max.x)} z ${R1(bx.min.z)}..${R1(bx.max.z)} (outside the airfield)`, [0, -650]); }); }
  const counts = {}; for (const i of issues) { const k = i.cat + (i.cat === 'bldg_tight' ? (i.g < 1 ? '<1m' : '<2m') : ''); counts[k] = (counts[k] || 0) + 1; }
  const pairs = {}; for (const i of issues) if (i.cat.startsWith('bldg_') || i.cat.startsWith('prop_')) { const k = i.cat + ' ' + i.a + (i.b ? '/' + i.b : ''); pairs[k] = (pairs[k] || 0) + 1; }
  return { counts, pairs, inv, issues, n: issues.length, tier: c.TIER };
};
