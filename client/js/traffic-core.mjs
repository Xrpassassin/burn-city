// Burn City traffic realism, pure core (no three.js; node-testable): lane graph on the City street network,
// signal plans with a protected left arrow, IDM car-following, gap acceptance at junctions, time-of-day demand,
// pedestrian crosswalk rules and shop hours. client/js/traffic.mjs renders it; ?traffic=classic turns it all off.
// Conventions: x/z ground plane, y up. Right of a heading (hx,hz) is (-hz,hx). Traffic drives on the RIGHT.

export const LANE = 1.25;          // lane centre from the street centreline (asphalt is ±2.5)
export const STOP = 5.6;           // stop line / lane start, metres from the junction centre (painted bars sit at 4.95–5.4)
export const MPH = .44704;
export const LIMIT = { ring: 25 * MPH, line: 35 * MPH, link: 30 * MPH, market: 25 * MPH };
// signal plan per junction, two groups (group 0 = the first street, the ring; group 1 = the avenue):
// protected left arrow -> green (permissive left) -> yellow -> all red, then the other group.
export const SIG = { LEFT: 5, GREEN: 12, YELLOW: 3, ALLRED: 1.5, WALK: 8 };
export const CYCLE = 2 * (SIG.LEFT + SIG.GREEN + SIG.YELLOW + SIG.ALLRED);

// vehicle types: len/w metres, v = top-speed factor, a = accel m/s², w8 = share of the fleet, lights = [y front, y rear]
export const VEHICLES = [
  { id: 'sedan', len: 4.3, w: 1.8, v: 1, a: 1.5, w8: 30, ly: .66 },
  { id: 'hatch', len: 3.7, w: 1.72, v: 1, a: 1.6, w8: 17, ly: .66 },
  { id: 'suv', len: 4.6, w: 1.9, v: .97, a: 1.3, w8: 20, ly: .86 },
  { id: 'pickup', len: 5.2, w: 1.95, v: .96, a: 1.25, w8: 10, ly: .86 },
  { id: 'van', len: 5.0, w: 1.95, v: .9, a: 1.1, w8: 8, ly: .8 },
  { id: 'taxi', len: 4.3, w: 1.8, v: 1.03, a: 1.5, w8: 8, ly: .66 },
  { id: 'truck', len: 6.8, w: 2.3, v: .82, a: .85, w8: 4, ly: 1.0 },
  { id: 'bus', len: 9.0, w: 2.45, v: .78, a: .8, w8: 3, ly: 1.0 },
];
export const PAINT = { car: [0xc8ccd4, 0x1c1f26, 0xe8e8ea, 0x8a1020, 0x16325e, 0x2b3a2e, 0xb8860b, 0x5a5f68, 0x7a1e5a, 0x0f4a5a, 0x9aa3ad, 0x3a2418],
  taxi: [0xf2c018], truck: [0xeeeeea, 0xd8dade, 0xb0201a], bus: [0xd8541a, 0x1f5fae] };

// ---------------------------------------------------------------- small math
export const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));

// ---------------------------------------------------------------- time of day
/** City hour 0..24: Phoenix wall clock when "Real Phoenix day/night" drives the sky, else read back from the tod slider. */
export function cityHour({ day = 1, realtime = false, now = Date.now(), override = null } = {}) {
  if (override != null && isFinite(override)) return ((+override % 24) + 24) % 24;
  if (realtime) { const d = new Date(now - 7 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; }
  if (day >= .985) return 12.5; if (day <= .015) return 23;
  const sun = Math.max(-1, Math.min(1, day * .75 - .15)); return 12.5 - Math.acos(sun) * 24 / (2 * Math.PI);   // the morning side of the curve
}
/** Share of the fleet on the road at this hour: overnight floor, morning + evening rush, lunch bump, evening out. */
export function demand(h) {
  const v = .16 + .62 * gauss(h, 8, 1.2) + .72 * gauss(h, 17.5, 1.5) + .34 * gauss(h, 12.5, 2.2) + .26 * gauss(h, 20.5, 1.8) + .26 * gauss(h, 24.5, 1.6) * 0;
  return Math.max(.16, Math.min(1, v + .18 * gauss(h, 10, 3) + .18 * gauss(h, 15, 3)));
}
export const rushHour = h => (h >= 7 && h < 9.5) || (h >= 16 && h < 19);
/** Downtown weight for spawning: the hub and inner districts carry more traffic. */
export const downtown = r => 1 / (1 + (r / 210) * (r / 210));
// shop hours (Phoenix clock). mart never closes.
export const HOURS = { mart: [0, 24], smoke: [8, 24], disp: [8, 22], coffee: [6, 16], arcade: [11, 24], pizza: [11, 23], pharmacy: [8, 21] };
export function shopOpen(id, h) { const o = HOURS[id]; if (!o) return true; const [a, b] = o; return b - a >= 24 || (a <= b ? h >= a && h < b : h >= a || h < b); }

// ---------------------------------------------------------------- signals
/** state for one approach group: thru 'g'|'y'|'r'; left 'g' (protected arrow) | 'p' (permissive, yield) | 'y' | 'r';
 * walk = pedestrians may START crossing this group's street (its traffic is held red); fdw = flashing don't walk. */
export function signalState(off, t, grp) {
  const k = (((t + off) % CYCLE) + CYCLE) % CYCLE, a = grp ? (k + CYCLE / 2) % CYCLE : k, b = (a + CYCLE / 2) % CYCLE;
  const { LEFT, GREEN, YELLOW, WALK } = SIG; let thru, left;
  if (a < LEFT) { thru = 'r'; left = 'g'; } else if (a < LEFT + GREEN) { thru = 'g'; left = 'p'; } else if (a < LEFT + GREEN + YELLOW) { thru = 'y'; left = 'y'; } else { thru = 'r'; left = 'r'; }
  // the OTHER group's clock decides when people walk across this street: during its through green (not its arrow)
  const walk = b >= LEFT && b < LEFT + WALK, fdw = b >= LEFT + WALK && b < LEFT + GREEN;
  return { thru, left, walk, fdw };
}
/** classic 3-lamp colour for the signal heads ('g' 'y' 'r'), plus whether the left arrow is lit */
export function lampState(off, t, grp) { const s = signalState(off, t, grp); return { ball: s.thru, arrow: s.left === 'g' ? 'g' : s.left === 'y' && s.thru !== 'y' ? 'y' : null }; }

// ---------------------------------------------------------------- IDM
export function idm(v, v0, gap, dv, p) {
  const { a, b = 2.6, T = 1.25, s0 = 2.0 } = p; const ss = s0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(a * b)));
  const free = 1 - Math.pow(Math.max(0, v) / Math.max(.1, v0), 4), inter = gap > .05 ? (ss / gap) * (ss / gap) : 1e3;
  return Math.max(-9, a * (free - (gap < 1e8 ? inter : 0)));
}
export const curveSpeed = (R, aLat = 2.6) => Math.sqrt(Math.max(.5, R) * aLat);

// ---------------------------------------------------------------- street geometry
export const streetLen = s => s.type === 'ring' ? 2 * Math.PI * s.r : Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
export function streetAt(s, m) {   // point + unit tangent at metre m along the street (rings: m = arc from angle 0, ccw in angle)
  if (s.type === 'ring') { const a = m / s.r; return { x: s.c.x + Math.cos(a) * s.r, z: s.c.z + Math.sin(a) * s.r, tx: -Math.sin(a), tz: Math.cos(a) }; }
  const L = streetLen(s), tx = (s.b.x - s.a.x) / L, tz = (s.b.z - s.a.z) / L; return { x: s.a.x + tx * m, z: s.a.z + tz * m, tx, tz };
}
export function mOn(s, x, z) { if (s.type === 'ring') { const a = Math.atan2(z - s.c.z, x - s.c.x); return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * s.r; } const L = streetLen(s), vx = s.b.x - s.a.x, vz = s.b.z - s.a.z; return ((x - s.a.x) * vx + (z - s.a.z) * vz) / L; }
export function distToStreet(s, x, z) { if (s.type === 'ring') return Math.abs(Math.hypot(x - s.c.x, z - s.c.z) - s.r); const vx = s.b.x - s.a.x, vz = s.b.z - s.a.z, L2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - s.a.x) * vx + (z - s.a.z) * vz) / L2)); return Math.hypot(s.a.x + vx * t - x, s.a.z + vz * t - z); }
/** junctions = street crossings (same rule as citylife.js `intersections`, so signal poles and lanes agree) */
export function findJunctions(st) {
  const raw = [], add = (x, z, a, b) => raw.push({ x, z, s: [a, b] });
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const A = st[i], B = st[j];
    if (A.type === 'line' && B.type === 'line') {
      const r = { x: A.b.x - A.a.x, z: A.b.z - A.a.z }, s = { x: B.b.x - B.a.x, z: B.b.z - B.a.z }, den = r.x * s.z - r.z * s.x; if (Math.abs(den) < 1e-6) continue;
      const qx = B.a.x - A.a.x, qz = B.a.z - A.a.z, t = (qx * s.z - qz * s.x) / den, u = (qx * r.z - qz * r.x) / den;
      if (t > -.01 && t < 1.01 && u > -.01 && u < 1.01) add(A.a.x + r.x * t, A.a.z + r.z * t, i, j);
    } else if (A.type === 'ring' && B.type === 'ring') {
      const dx = B.c.x - A.c.x, dz = B.c.z - A.c.z, d = Math.hypot(dx, dz); if (d < 1 || d > A.r + B.r || d < Math.abs(A.r - B.r)) continue;
      const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)), mx = A.c.x + dx * a / d, mz = A.c.z + dz * a / d;
      add(mx + h * dz / d, mz - h * dx / d, i, j); add(mx - h * dz / d, mz + h * dx / d, i, j);
    } else {
      const ri = A.type === 'ring' ? i : j, li = A.type === 'ring' ? j : i, R = st[ri], Ln = st[li], dx = Ln.b.x - Ln.a.x, dz = Ln.b.z - Ln.a.z, fx = Ln.a.x - R.c.x, fz = Ln.a.z - R.c.z;
      const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - R.r * R.r, disc = b * b - 4 * a * c; if (disc < 0) continue;
      for (const sg of [-1, 1]) { const t = (-b + sg * Math.sqrt(disc)) / (2 * a); if (t > -.01 && t < 1.01) add(Ln.a.x + dx * t, Ln.a.z + dz * t, i, j); }
    }
  }
  const out = [];
  for (const p of raw) { const q = out.find(o => Math.hypot(o.x - p.x, o.z - p.z) < 8); if (q) { for (const s of p.s) if (!q.s.includes(s)) q.s.push(s); } else out.push({ x: p.x, z: p.z, s: [...p.s] }); }
  return out;
}

// ---------------------------------------------------------------- lane graph
function polyLen(xs, zs) { const cum = new Float32Array(xs.length); for (let i = 1; i < xs.length; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); return cum; }
function mkLane(G, o, pts) {
  const xs = new Float32Array(pts.map(p => p[0])), zs = new Float32Array(pts.map(p => p[1])), cum = polyLen(xs, zs);
  const lane = { id: G.lanes.length, xs, zs, cum, L: cum[cum.length - 1], outs: [], cars: [], occ: 0, ...o }; G.lanes.push(lane); return lane;
}
function minRadius(xs, zs) { let m = 1e9; for (let i = 1; i + 1 < xs.length; i++) { const ax = xs[i] - xs[i - 1], az = zs[i] - zs[i - 1], bx = xs[i + 1] - xs[i], bz = zs[i + 1] - zs[i], la = Math.hypot(ax, az), lb = Math.hypot(bx, bz); const ang = Math.abs(wrapA(Math.atan2(bz, bx) - Math.atan2(az, ax))); if (ang > 1e-3) m = Math.min(m, ((la + lb) / 2) / ang); } return m; }
export function lanePoint(l, s, out) { // position + heading on a lane at metre s (clamped), using a cursor hint in out.i
  s = Math.max(0, Math.min(l.L, s)); let i = Math.min(out.i | 0, l.cum.length - 2); if (i < 0) i = 0;
  while (i > 0 && l.cum[i] > s) i--; while (i < l.cum.length - 2 && l.cum[i + 1] < s) i++;
  const seg = (l.cum[i + 1] - l.cum[i]) || 1, f = (s - l.cum[i]) / seg, hx = (l.xs[i + 1] - l.xs[i]) / seg, hz = (l.zs[i + 1] - l.zs[i]) / seg;
  out.i = i; out.x = l.xs[i] + (l.xs[i + 1] - l.xs[i]) * f; out.z = l.zs[i] + (l.zs[i + 1] - l.zs[i]) * f; out.hx = hx; out.hz = hz; return out;
}
/**
 * Build directed lanes: road lanes between junctions (right-hand offset), turn connectors inside every junction (cubic
 * curves stop line -> stop line), U-turn bulbs at dead ends, closed loops for rings with no junction.
 * streets: [{type:'ring',c:{x,z},r} | {type:'line',a:{x,z},b:{x,z}, kind?:'link'|'market'}]; junctions: [{x,z,s:[streetIdx], off?, signal?}]
 */
export function buildGraph(streets, junctions, opt = {}) {
  const G = { lanes: [], juncs: [], streets }; const step = opt.step || 3;
  junctions.forEach((J, k) => G.juncs.push({ id: k, x: J.x, z: J.z, s: J.s, off: J.off ?? hash(J.x, J.z) * 26, signal: J.signal !== false, grp: new Map(J.s.map((s, i) => [s, i === 0 ? 0 : 1])), ins: [], outs: [], conns: [], xw: [], ped: new Float32Array(8) }));
  const limitOf = s => s.limit || (s.kind && LIMIT[s.kind]) || (s.type === 'ring' ? LIMIT.ring : LIMIT.line);
  streets.forEach((s, si) => {
    const len = streetLen(s), ring = s.type === 'ring'; const marks = [];
    for (const J of G.juncs) if (J.s.includes(si)) marks.push({ m: mOn(s, J.x, J.z), J });
    if (!ring) for (const [m0, end] of [[0, 'a'], [len, 'b']]) if (!marks.some(k => Math.abs(k.m - m0) < 8)) marks.push({ m: m0, dead: end });
    marks.sort((a, b) => a.m - b.m);
    const segs = [];
    if (ring && !marks.length) segs.push({ m0: 0, m1: len, loop: true });
    else if (ring) for (let i = 0; i < marks.length; i++) { const A = marks[i], B = marks[(i + 1) % marks.length]; segs.push({ A, B, m0: A.m, m1: B.m + (i + 1 === marks.length ? len : 0) }); }
    else for (let i = 0; i + 1 < marks.length; i++) segs.push({ A: marks[i], B: marks[i + 1], m0: marks[i].m, m1: marks[i + 1].m });
    for (const sg of segs) {
      const t0 = sg.loop ? 0 : (sg.A.J ? STOP : 0), t1 = sg.loop ? 0 : (sg.B.J ? STOP : 0), a = sg.m0 + t0, b = sg.m1 - t1; if (b - a < 1) continue;
      for (const dir of [1, -1]) {
        const n = Math.max(2, Math.ceil((b - a) / (ring ? step : 12))), pts = [];
        for (let i = 0; i <= n; i++) { const m = dir > 0 ? a + (b - a) * i / n : b - (b - a) * i / n; const p = streetAt(s, ring ? ((m % len) + len) % len : m), hx = p.tx * dir, hz = p.tz * dir; pts.push([p.x - hz * LANE, p.z + hx * LANE]); }
        if (sg.loop) pts[pts.length - 1] = [...pts[0]];
        const from = dir > 0 ? sg.A : sg.B, to = dir > 0 ? sg.B : sg.A;
        const lane = mkLane(G, { kind: 'road', street: si, dir, limit: limitOf(s), loop: !!sg.loop, fromJ: from && from.J ? from.J.id : -1, toJ: to && to.J ? to.J.id : -1, dead: to && to.dead ? 1 : 0, r: ring ? s.r : 0, mid: streetAt(s, ring ? ((((a + b) / 2) % len) + len) % len : (a + b) / 2) }, pts);
        if (lane.toJ >= 0) G.juncs[lane.toJ].ins.push(lane); if (lane.fromJ >= 0) G.juncs[lane.fromJ].outs.push(lane);
      }
    }
  });
  // loops feed themselves; dead ends get a U-turn bulb onto the opposite lane
  for (const l of G.lanes) if (l.kind === 'road' && l.loop) l.outs.push(l);
  for (const l of G.lanes) if (l.kind === 'road' && l.dead) {
    const opp = G.lanes.find(o => o.kind === 'road' && o.street === l.street && o.dir === -l.dir && Math.hypot(o.xs[0] - l.xs[l.xs.length - 1], o.zs[0] - l.zs[l.zs.length - 1]) < 4); if (!opp) continue;
    const ex = l.xs[l.xs.length - 1], ez = l.zs[l.zs.length - 1], n = l.xs.length, hx = (ex - l.xs[n - 2]), hz = (ez - l.zs[n - 2]), hl = Math.hypot(hx, hz) || 1, ux = hx / hl, uz = hz / hl, R = LANE, pts = [];
    for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; pts.push([ex + ux * Math.sin(a) * R * 1.6 + uz * (1 - Math.cos(a)) * R, ez + uz * Math.sin(a) * R * 1.6 - ux * (1 - Math.cos(a)) * R]); }
    const c = mkLane(G, { kind: 'conn', move: 'U', in: l, out: opp, J: -1, vmax: 2.2, pri: 2, conf: [], xw: [] }, pts); l.outs.push(c); c.outs.push(opp);
  }
  // junction connectors
  for (const J of G.juncs) {
    for (const li of J.ins) for (const lo of J.outs) {
      if (li.street === lo.street && li.dir !== lo.dir && streets[li.street].type !== 'ring') continue;   // no U-turns at junctions
      if (li.street === lo.street && li.dir !== lo.dir) continue;
      const n = li.xs.length, P0 = [li.xs[n - 1], li.zs[n - 1]], h0 = norm(li.xs[n - 1] - li.xs[n - 2], li.zs[n - 1] - li.zs[n - 2]), P3 = [lo.xs[0], lo.zs[0]], h3 = norm(lo.xs[1] - lo.xs[0], lo.zs[1] - lo.zs[0]);
      const cr = h0[0] * h3[1] - h0[1] * h3[0], dt = h0[0] * h3[0] + h0[1] * h3[1], right = (-h0[1]) * h3[0] + h0[0] * h3[1];
      const move = dt > .8 ? 'S' : right > 0 ? 'R' : 'L';
      const D = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]), k = D * (move === 'S' ? .36 : .52), pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, u = 1 - t; const x = u * u * u * P0[0] + 3 * u * u * t * (P0[0] + h0[0] * k) + 3 * u * t * t * (P3[0] - h3[0] * k) + t * t * t * P3[0], z = u * u * u * P0[1] + 3 * u * u * t * (P0[1] + h0[1] * k) + 3 * u * t * t * (P3[1] - h3[1] * k) + t * t * t * P3[1]; pts.push([x, z]); }
      void cr;
      const c = mkLane(G, { kind: 'conn', move, in: li, out: lo, J: J.id, conf: [], xw: [] }, pts);
      c.vmax = move === 'S' ? Math.min(li.limit, lo.limit, curveSpeed(minRadius(c.xs, c.zs), 3)) : Math.min(7, curveSpeed(minRadius(c.xs, c.zs)));
      c.pri = J.signal ? (move === 'L' ? 1 : 2) : li.street === J.s[0] ? (move === 'L' ? 2 : 3) : 1; c.grp = J.grp.get(li.street) ?? 0;
      li.outs.push(c); c.outs.push(lo); J.conns.push(c);
    }
    // conflicts: two connectors whose swept paths come closer than a car width, or that merge into the same lane
    for (let i = 0; i < J.conns.length; i++) for (let j = i + 1; j < J.conns.length; j++) {
      const A = J.conns[i], B = J.conns[j]; if (A.in === B.in) continue;
      let hit = A.out === B.out;
      if (!hit) { let m = 1e9; for (let p = 1; p < A.xs.length - 1; p++) for (let q = 1; q < B.xs.length - 1; q++) m = Math.min(m, Math.hypot(A.xs[p] - B.xs[q], A.zs[p] - B.zs[q])); hit = m < 2.3; }
      if (hit) { A.conf.push(B); B.conf.push(A); }
    }
    // crosswalks: one across each approach street, 4 m from the centre (ring: both arms; avenue: its mouth). id = J.xw index
    for (const si of J.s) {
      const s = streets[si], m = mOn(s, J.x, J.z), len = streetLen(s);
      for (const sg of [1, -1]) { const mm = m + sg * 4; if (s.type !== 'ring' && (mm < 0 || mm > len)) continue; const p = streetAt(s, ((mm % len) + len) % len); J.xw.push({ street: si, side: sg, x: p.x, z: p.z, tx: p.tx, tz: p.tz }); }
    }
    for (const c of J.conns) for (const [w, k] of J.xw.map((w, k) => [w, k])) { for (let p = 0; p < c.xs.length; p++) { const dx = c.xs[p] - w.x, dz = c.zs[p] - w.z, along = Math.abs(dx * w.tx + dz * w.tz), across = Math.abs(-dx * w.tz + dz * w.tx); if (along < 1.4 && across < 3) { c.xw.push(k); break; } } }
  }
  for (const l of G.lanes) if (l.kind === 'road' && !l.outs.length && !l.loop) l.stuck = 1;
  G.road = G.lanes.filter(l => l.kind === 'road');
  return G;
}
function norm(x, z) { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }

// ---------------------------------------------------------------- simulation
/**
 * createSim({ streets, junctions, cap, seed }) -> { G, cars, step(dt, env), ... }
 * env: { t (s, signal clock), hour, cam:{x,z}, units:[{x,z,hx,hz,siren}], player:{x,z}|null, ped(J, xwIndex) -> bool, frozen }
 */
export function createSim({ streets, junctions, cap = 120, seed = 7, minFill = .2 }) {
  const G = buildGraph(streets, junctions), R = rng(seed), cars = [];
  const W = VEHICLES.reduce((a, v) => a + v.w8, 0);
  const pickType = () => { let x = R() * W; for (let i = 0; i < VEHICLES.length; i++) { x -= VEHICLES[i].w8; if (x <= 0) return i; } return 0; };
  for (let i = 0; i < cap; i++) {
    const ti = pickType(), T = VEHICLES[ti], pal = T.id === 'taxi' ? PAINT.taxi : T.id === 'truck' ? PAINT.truck : T.id === 'bus' ? PAINT.bus : PAINT.car;
    cars.push({ i, type: ti, T, len: T.len, w: T.w, col: pal[(R() * pal.length) | 0], drv: .86 + R() * .24, on: false, lane: null, s: 0, v: 0, next: null, commit: false, cur: { i: 0 }, x: 0, z: 0, hx: 0, hz: 1, lat: 0, brake: 0, blink: 0, yieldT: 0, wait: 0 });
  }
  const roadW = G.road.map(l => { const r = Math.hypot(l.mid.x, l.mid.z); return l.L * downtown(r) * (l.loop ? .6 : 1); }), roadWT = roadW.reduce((a, b) => a + b, 0);
  const pickRoad = () => { let x = R() * roadWT; for (let i = 0; i < G.road.length; i++) { x -= roadW[i]; if (x <= 0) return G.road[i]; } return G.road[0]; };
  const st = { active: 0, target: 0, spawned: 0, despawned: 0, entries: 0, redRuns: 0, yields: 0, pedYields: 0, pullovers: 0, maxWait: 0 };
  function chooseNext(car, lane) {
    if (!lane.outs.length) return null; if (lane.outs.length === 1) return lane.outs[0];
    if (car.T.len > 6) { const sOut = lane.outs.find(o => o.move === 'S' || o.kind === 'road'); if (sOut) return sOut; }   // buses + box trucks run their ring routes: no tight corner turns
    let tot = 0; const w = lane.outs.map(o => { let x = o.move === 'S' ? 1.5 : o.move === 'U' ? 1 : 1; const out = o.out || o; if (out && out.mid) x *= .55 + downtown(Math.hypot(out.mid.x, out.mid.z)); if (out) x /= 1 + 4 * fill(out); if (car.T.len > 6 && o.move !== 'S') x *= .5; tot += x; return x; });
    let x = R() * tot; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return lane.outs[i]; } return lane.outs[0];
  }
  const fill = l => { let m = 0; for (const q of l.cars) m += q.len + 2.5; return m / Math.max(1, l.L); };   // 0 empty .. 1 bumper to bumper
  function place(car, lane, s) { car.lane = lane; car.s = s; car.cur.i = 0; car.next = chooseNext(car, lane); car.commit = false; lane.cars.push(car); }
  function spawn(force) {
    const car = cars.find(c => !c.on); if (!car) return false;
    for (let tries = 0; tries < (car.T.len > 6 ? 16 : 6); tries++) {
      const lane = pickRoad(); if (lane.L < car.len + 4 || fill(lane) > .3 || (car.T.len > 6 && !lane.r)) continue; const s = car.len / 2 + R() * (lane.L - car.len - 1);
      if (lane.cars.some(o => Math.abs(o.s - s) < (o.len + car.len) / 2 + 7)) continue;
      if (!force && env0.cam) { const p = lanePoint(lane, s, { i: 0 }); if (Math.hypot(p.x - env0.cam.x, p.z - env0.cam.z) < 70) continue; }
      car.on = true; car.v = lane.limit * .5 * car.drv; car.lat = 0; car.wait = 0; place(car, lane, s); st.active++; st.spawned++; return true;
    }
    return false;
  }
  function remove(car) { const a = car.lane.cars, k = a.indexOf(car); if (k >= 0) a.splice(k, 1); if (car.lane.kind === 'conn') car.lane.occ = Math.max(0, car.lane.occ - 1); if (car.next && car.commit && car.next.kind === 'conn') car.next.occ = Math.max(0, car.next.occ - 1); car.on = false; car.lane = null; car.commit = false; st.active--; st.despawned++; }
  let env0 = {}, stamp = 0;
  const sigOK = (J, c, t, car, dist) => {   // may this car enter connector c now (signal only)?
    if (!J || !J.signal) return true; const s = signalState(J.off, t, c.grp);
    if (c.move === 'L') { if (s.left === 'g') return true; if (s.left === 'p') return 'yield'; if (s.left === 'y') return dist < car.v * car.v / 6 + .5; return false; }
    if (s.thru === 'g') return true; if (s.thru === 'y') return dist < car.v * car.v / 6 + .5; return false;
  };
  function canEnter(car, c, t, dist, env) {
    const J = c.J >= 0 ? G.juncs[c.J] : null;
    const sg = sigOK(J, c, t, car, dist); if (!sg) return false;
    for (const o of c.conf) {
      if (o.occ > 0) return false;
      // priority traffic about to use a conflicting movement (oncoming through traffic for a permissive left, the main road at a yield)
      const prio = (sg === 'yield' || (J && !J.signal && o.pri > c.pri) || (!J && o.pri > c.pri));
      if (prio || (J && !J.signal && o.pri === c.pri && o.in.street !== c.in.street && o.move === 'S' && c.move !== 'S')) {
        for (const q of o.in.cars) if (q.next === o) { const d = o.in.L - q.s; if (d < q.v * 3.2 + 6 && (!J || !J.signal || sigOK(J, o, t, q, d) === true)) return false; }
      }
    }
    const out = c.out; if (out) { let tail = 1e9; for (const q of out.cars) tail = Math.min(tail, q.s - q.len / 2); if (tail < car.len + 2.5) return false; }
    if (env.ped && J) for (const k of c.xw) if (env.ped(J, k)) { st.pedYields++; return false; }
    return true;
  }
  function step(dt, env) {
    env0 = env; const t = env.t;
    if (env.hour != null) { st.target = Math.round(cars.length * Math.max(minFill, demand(env.hour))); }
    else st.target = cars.length;
    // fill / thin out toward the demand target (instant fill on the first step)
    if (!st.init) { st.init = 1; let k = 0; while (st.active < st.target && k++ < cars.length * 3) spawn(true); }
    else { for (let k = 0; k < 2 && st.active < st.target; k++) if (!spawn(false)) break; }
    // a car stuck in a queue for a long time off camera turns off into a side street (despawn); the fleet refills elsewhere
    for (const c of cars) if (c.on && c.wait > 45 && c.lane.kind === 'road' && (!env.cam || Math.hypot(c.x - env.cam.x, c.z - env.cam.z) > 80)) { remove(c); st.cleared = (st.cleared || 0) + 1; break; }
    if (st.active > st.target * 1.04 + 1) { for (const c of cars) if (c.on && c.lane.kind === 'road' && (!env.cam || Math.hypot(c.x - env.cam.x, c.z - env.cam.z) > 110)) { remove(c); break; } }
    for (const l of G.lanes) if (l.cars.length > 1) l.cars.sort((a, b) => a.s - b.s);
    const sub = Math.max(1, Math.ceil(dt / .05)), h = dt / sub;
    for (let it = 0; it < sub; it++) { stamp++; for (const l of G.lanes) for (let k = l.cars.length - 1; k >= 0; k--) { const car = l.cars[k]; if (car && car.lane === l && car.stamp !== stamp) { car.stamp = stamp; drive(car, k, h, env, t); } } }
    for (const c of cars) if (c.on) pose(c);
  }
  function leaderOn(lane, s0, me) { let best = null; for (const q of lane.cars) if (q !== me && q.s > s0 && (!best || q.s < best.s)) best = q; return best; }
  function drive(car, k, dt, env, t) {
    const l = car.lane, T = car.T; let v0 = l.limit ? l.limit * car.drv * T.v : (l.vmax || 6);
    if (l.kind === 'conn') v0 = Math.min(v0, l.vmax);
    let gap = 1e9, dv = 0, stopAt = 1e9;
    const ahead = l.cars[k + 1];
    if (ahead) { gap = ahead.s - car.s - (ahead.len + car.len) / 2; dv = car.v - ahead.v; }
    else {
      let d = l.L - car.s, ln = car.next, guard = 0; // look through the next lanes for the first car
      while (ln && d < 70 && guard++ < 3) { const q = leaderOn(ln, -1, car); if (q) { gap = d + q.s - (q.len + car.len) / 2; dv = car.v - q.v; break; } d += ln.L; ln = ln.kind === 'conn' ? ln.out : null; }
    }
    // connectors that leave the same lane share their first metres: a car that just turned off ahead is still a leader
    { const src = l.kind === 'conn' ? l.in : l, base = l.kind === 'conn' ? -car.s : l.L - car.s;
      if (src && base > -10 && base < 30) for (const sib of src.outs) if (sib !== l && sib.kind === 'conn') for (const q of sib.cars) { if (q === car || q.s > 10) continue; const g = base + q.s - (q.len + car.len) / 2; if (g < gap && base + q.s > 0) { gap = g; dv = car.v - q.v; } } }
    // approaching the end of a road lane: turn speed + permission to enter the junction
    let blink = 0;
    if (l.kind === 'road' && car.next && car.next.kind === 'conn') {
      const c = car.next, dist = l.L - car.s - car.len / 2;
      if (c.move === 'L' || c.move === 'U') blink = -1; else if (c.move === 'R') blink = 1;
      if (dist < 45) { const vt = c.vmax; v0 = Math.min(v0, Math.sqrt(vt * vt + 2 * 2.2 * Math.max(0, dist))); }
      if (!car.commit && dist < 40) {
        const ok = canEnter(car, c, t, dist, env);
        if (ok && dist < 2.5) { car.commit = true; c.occ++; st.entries++; if (c.J >= 0 && G.juncs[c.J].signal) { const s = signalState(G.juncs[c.J].off, t, c.grp); if (c.move === 'L' ? s.left === 'r' : s.thru === 'r') st.redRuns++; } }
        if (!ok) stopAt = Math.min(stopAt, dist - .4);
      }
    } else if (l.kind === 'conn') { if (l.move === 'L' || l.move === 'U') blink = -1; else if (l.move === 'R') blink = 1; }
    // emergency vehicles: pull to the curb and stop (never inside a junction); other service units are obstacles
    let pull = 0;
    if (env.units) for (const u of env.units) {
      const dx = u.x - car.x, dz = u.z - car.z, d = Math.hypot(dx, dz); if (d > 40) continue;
      const fwd = dx * car.hx + dz * car.hz, side = Math.abs(-dx * car.hz + dz * car.hx);
      if (u.siren && d < 36) pull = 1;
      if (fwd > 0 && fwd < 18 && side < 1.7) { gap = Math.min(gap, fwd - car.len / 2 - (u.len || 5) / 2); dv = car.v; }
    }
    if (env.player) { const dx = env.player.x - car.x, dz = env.player.z - car.z, fwd = dx * car.hx + dz * car.hz, side = Math.abs(-dx * car.hz + dz * car.hx); if (fwd > 0 && fwd < 14 && side < 1.7) { gap = Math.min(gap, fwd - car.len / 2 - .8); dv = car.v; } }
    if (stopAt < 1e8) { const g2 = stopAt + 2.0; if (g2 < gap) { gap = Math.max(.01, g2); dv = car.v; } }   // virtual stopped car at the stop line (s0 = 2)
    let acc = idm(car.v, Math.max(.5, v0), gap, dv, { a: T.a, b: 2.6 });
    if (pull && l.kind === 'road') acc = Math.min(acc, -3);   // ease to a stop at the curb (inside a junction: clear it first)
    const nv = Math.max(0, car.v + acc * dt);
    car.brake = acc < -.6 || (nv < .3 && gap < 8) ? 1 : 0; car.blink = blink;
    let ds = (car.v + nv) / 2 * dt; car.v = nv;
    if (ahead && car.s + ds > ahead.s - (ahead.len + car.len) / 2 - .25) { ds = Math.max(0, ahead.s - (ahead.len + car.len) / 2 - .25 - car.s); car.v = Math.min(car.v, ahead.v); }
    if (stopAt < 1e8 && ds > stopAt + .3) { ds = Math.max(0, stopAt); car.v = 0; }
    car.lat += ((pull ? .75 : 0) - car.lat) * Math.min(1, dt * 1.5); if (pull) st.pullovers++;
    car.wait = car.v < .2 ? car.wait + dt : 0; st.maxWait = Math.max(st.maxWait, car.wait);
    car.s += ds;
    // lane change at the end
    let guard = 0;
    while (car.s > car.lane.L && guard++ < 4) {
      const cl = car.lane, nx = car.next;
      if (!nx) { car.s = cl.L; car.v = 0; break; }
      if (cl.kind === 'road' && nx.kind === 'conn' && !car.commit) { car.s = cl.L; car.v = 0; break; }
      const over = car.s - cl.L; const a = cl.cars, i = a.indexOf(car); if (i >= 0) a.splice(i, 1);
      if (cl.kind === 'conn') cl.occ = Math.max(0, cl.occ - 1);
      car.lane = nx; car.s = over; car.cur.i = 0; car.commit = false; nx.cars.push(car);
      car.next = nx.kind === 'conn' ? nx.out || nx.outs[0] : chooseNext(car, nx);
      if (nx.kind === 'conn') car.commit = true;   // already reserved at the stop line
    }
  }
  const P = { i: 0 };
  function pose(car) {
    const l = car.lane; P.i = car.cur.i; lanePoint(l, car.s, P); car.cur.i = P.i;
    // smooth heading: average of the tangent a little ahead and behind (no snapping at polyline joints)
    const Q = { i: P.i }; lanePoint(l, Math.min(l.L, car.s + 1.2), Q); const B = { i: P.i }; lanePoint(l, Math.max(0, car.s - 1.2), B);
    let hx = Q.x - B.x, hz = Q.z - B.z; const hl = Math.hypot(hx, hz); if (hl > .05) { hx /= hl; hz /= hl; } else { hx = P.hx; hz = P.hz; }
    car.hx = hx; car.hz = hz; car.x = P.x - hz * car.lat; car.z = P.z + hx * car.lat;
  }
  /** take over the cars of an older sim on the same streets (used when Market Street joins the graph): same street + direction, nearest lane point */
  function adopt(old) {
    const P2 = { i: 0 };
    for (const oc of old.cars) {
      if (!oc.on || !oc.lane) continue; const car = cars[oc.i]; if (!car || car.on) continue;
      const src = oc.lane.kind === 'conn' ? oc.lane.out : oc.lane; if (!src || src.street == null) continue;
      let best = null, bd = 2.5, bs = 0;
      for (const l of G.road) { if (l.street !== src.street || l.dir !== src.dir) continue; for (let i = 0; i + 1 < l.xs.length; i++) { const ax = l.xs[i], az = l.zs[i], vx = l.xs[i + 1] - ax, vz = l.zs[i + 1] - az, L2 = vx * vx + vz * vz || 1; const u = Math.max(0, Math.min(1, ((oc.x - ax) * vx + (oc.z - az) * vz) / L2)); const d = Math.hypot(ax + vx * u - oc.x, az + vz * u - oc.z); if (d < bd) { bd = d; best = l; bs = l.cum[i] + u * Math.sqrt(L2); } } }
      if (!best || best.cars.some(q => Math.abs(q.s - bs) < (q.len + car.len) / 2 + .5)) continue;
      Object.assign(car, { type: oc.type, T: oc.T, len: oc.len, w: oc.w, col: oc.col, drv: oc.drv, on: true, v: oc.v, lat: 0, wait: 0 }); place(car, best, Math.min(bs, best.L - .1)); st.active++; P2.i = 0;
    }
    st.init = 1;
  }
  return { G, cars, st, step, spawn, remove, adopt, lanePoint };
}

// ---------------------------------------------------------------- pedestrians at crosswalks
/** ring street index -> [{ th (junction angle), side (+1 = the avenue joins on the outside), J, xs: [stem crosswalk index], xr: [ring crosswalk index -side, +side] }] */
export function pedCrossings(G) {
  const out = new Map();
  for (const J of G.juncs) {
    const ringI = J.s.find(si => G.streets[si].type === 'ring'); if (ringI == null) continue; const R = G.streets[ringI];
    for (const si of J.s) { if (si === ringI) continue; const L = G.streets[si]; const far = Math.hypot(L.a.x - J.x, L.a.z - J.z) > Math.hypot(L.b.x - J.x, L.b.z - J.z) ? L.a : L.b;
      const rOut = Math.hypot(far.x - R.c.x, far.z - R.c.z) > R.r ? 1 : -1, th = Math.atan2(J.z - R.c.z, J.x - R.c.x);
      const xs = J.xw.findIndex(w => w.street === si), xr = [J.xw.findIndex(w => w.street === ringI && w.side === -1), J.xw.findIndex(w => w.street === ringI && w.side === 1)];
      if (!out.has(ringI)) out.set(ringI, []); out.get(ringI).push({ th, side: rOut, J, xs, xr, stem: si }); }
  }
  return out;
}
export const angDiff = (a, b) => wrapA(a - b);
