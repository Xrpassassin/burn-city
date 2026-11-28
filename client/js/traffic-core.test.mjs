// node client/js/traffic-core.test.mjs  (npm run test:traffic)
import fs from 'fs';
import assert from 'assert/strict';
import * as TC from './traffic-core.mjs';

const here = new URL('.', import.meta.url), root = new URL('../../', here);
const { streets } = JSON.parse(fs.readFileSync(new URL('test/traffic-city-fixture.json', root)));
let pass = 0; const ok = (name, fn) => { fn(); pass++; console.log('ok -', name); };

// ---------------------------------------------------------------- signals
ok('signal plan: the two groups never hold a go (green, yellow, arrow, permissive) at the same time; all-red gaps exist', () => {
  const go = s => s.thru !== 'r' || s.left !== 'r'; let allRed = 0;
  for (let t = 0; t < TC.CYCLE; t += .05) { const a = TC.signalState(3.3, t, 0), b = TC.signalState(3.3, t, 1); assert.ok(!(go(a) && go(b)), `conflicting greens at t=${t.toFixed(2)}`); if (!go(a) && !go(b)) allRed += .05; }
  assert.ok(Math.abs(allRed - 2 * TC.SIG.ALLRED) < .2, 'all-red ' + allRed);
});
ok('signal plan: protected left arrow leads the green, then permissive left; yellow lasts 3 s', () => {
  const seq = []; for (let t = 0; t < TC.CYCLE; t += .25) { const s = TC.signalState(0, t, 0); const k = s.thru + s.left; if (seq[seq.length - 1] !== k) seq.push(k); }
  assert.deepEqual(seq, ['rg', 'gp', 'yy', 'rr']);
  let y = 0; for (let t = 0; t < TC.CYCLE; t += .05) if (TC.signalState(0, t, 1).thru === 'y') y += .05; assert.ok(Math.abs(y - TC.SIG.YELLOW) < .1);
});
ok('walk phase: people only start across a street while its own traffic is held red', () => {
  let walk = 0; for (let t = 0; t < TC.CYCLE; t += .05) for (const g of [0, 1]) { const s = TC.signalState(7, t, g); if (s.walk) { walk++; assert.equal(s.thru, 'r'); assert.equal(s.left, 'r'); } }
  assert.ok(walk > 0);
});
ok('lamp heads: the arrow lamp is lit only during the protected left', () => { assert.equal(TC.lampState(0, 1, 0).arrow, 'g'); assert.equal(TC.lampState(0, 1, 0).ball, 'r'); assert.equal(TC.lampState(0, 8, 0).arrow, null); });

// ---------------------------------------------------------------- clock, demand, shops
ok('city hour: override, real Phoenix clock, slider read-back', () => {
  assert.equal(TC.cityHour({ override: 26 }), 2);
  assert.equal(TC.cityHour({ realtime: true, now: Date.UTC(2026, 10, 27, 15, 30) }), 8.5);   // 15:30 UTC = 08:30 MST
  assert.equal(TC.cityHour({ day: 1 }), 12.5); assert.equal(TC.cityHour({ day: 0 }), 23);
  const h = TC.cityHour({ day: .5 }); assert.ok(h > 6 && h < 12.5);
});
ok('demand: quiet nights, peaks at the morning and evening rush, downtown weighs more', () => {
  assert.ok(TC.demand(3) < .25); assert.ok(TC.demand(8) > .75); assert.ok(TC.demand(17.5) > .85); assert.ok(TC.demand(12.5) > TC.demand(22) && TC.demand(22) > TC.demand(3));
  assert.ok(TC.rushHour(8) && TC.rushHour(17) && !TC.rushHour(12)); assert.ok(TC.downtown(50) > TC.downtown(300));
});
ok('shop hours', () => {
  assert.ok(TC.shopOpen('mart', 3)); assert.ok(!TC.shopOpen('disp', 23)); assert.ok(TC.shopOpen('disp', 9)); assert.ok(!TC.shopOpen('coffee', 17)); assert.ok(TC.shopOpen('coffee', 7)); assert.ok(TC.shopOpen('arcade', 23.5)); assert.ok(!TC.shopOpen('smoke', 3));
});
ok('IDM: free road accelerates, a stopped car ahead brakes hard, at speed v0 nothing changes', () => {
  assert.ok(TC.idm(5, 12, 1e9, 0, { a: 1.5 }) > 1); assert.ok(TC.idm(10, 12, 6, 10, { a: 1.5 }) < -5); assert.ok(Math.abs(TC.idm(12, 12, 1e9, 0, { a: 1.5 })) < 1e-6);
});

// ---------------------------------------------------------------- graph
const J = TC.findJunctions(streets), G = TC.buildGraph(streets, J);
ok('lane graph: every road lane leads somewhere, junction connectors never U-turn, every junction is reachable', () => {
  assert.ok(G.road.length > 100); for (const l of G.road) assert.ok(l.outs.length > 0, 'dead lane ' + l.id);
  for (const c of G.lanes) if (c.kind === 'conn' && c.J >= 0) assert.notEqual(c.move, 'U');
  for (const j of G.juncs) { assert.ok(j.ins.length >= 2 && j.outs.length >= 2, 'junction ' + j.id); const stub = j.s.some(si => streets[si].type === 'line' && TC.streetLen(streets[si]) < 2 * TC.STOP + 1); assert.ok(j.conns.length >= 4 || stub, 'junction movements ' + j.id); }
  const conf = G.lanes.filter(l => l.kind === 'conn'); for (const c of conf) for (const o of c.conf) assert.ok(o.conf.includes(c), 'conflicts symmetric');
});
ok('right-hand traffic: every road lane runs 1.25 m to the right of its street centreline', () => {
  for (const l of G.road) { const s = streets[l.street], k = (l.xs.length / 2) | 0, hx = l.xs[k + 1] - l.xs[k], hz = l.zs[k + 1] - l.zs[k], hl = Math.hypot(hx, hz);
    const m = TC.mOn(s, l.xs[k], l.zs[k]), c = TC.streetAt(s, s.type === 'ring' ? m : Math.max(0, Math.min(TC.streetLen(s), m)));
    const off = ((l.xs[k] - c.x) * (-hz) + (l.zs[k] - c.z) * hx) / hl; assert.ok(Math.abs(off - TC.LANE) < .15, `lane ${l.id} offset ${off}`); }
});
ok('turns: left turns cross oncoming traffic (conflict), rights are tight + slow, through movements keep the limit', () => {
  const C = G.lanes.filter(l => l.kind === 'conn' && l.J >= 0), L = C.filter(c => c.move === 'L'), R = C.filter(c => c.move === 'R'), S = C.filter(c => c.move === 'S');
  assert.ok(L.length && R.length && S.length); assert.ok(L.every(c => c.conf.length > 0)); assert.ok(R.every(c => c.vmax < 6.5)); assert.ok(S.every(c => c.vmax > 7));
});

// ---------------------------------------------------------------- simulation
function sat(a, b) { // OBB penetration depth (m), 0 when apart
  let best = 1e9; for (const [ux, uz] of [[a.hx, a.hz], [-a.hz, a.hx], [b.hx, b.hz], [-b.hz, b.hx]]) { const pr = c => { const e = Math.abs(c.hx * ux + c.hz * uz) * c.len / 2 + Math.abs(-c.hz * ux + c.hx * uz) * c.w / 2, m = c.x * ux + c.z * uz; return [m - e, m + e]; };
    const A = pr(a), B = pr(b), o = Math.min(A[1], B[1]) - Math.max(A[0], B[0]); if (o <= 0) return 0; best = Math.min(best, o); } return best;
}
function run(sim, secs, envf, every = .5) {
  let worst = 0, n = 0, t = 0; for (let f = 0; f * .05 < secs; f++) { t = f * .05; sim.step(.05, envf(t));
    if (f % Math.round(every / .05) === 0) { const on = sim.cars.filter(c => c.on); for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) { const a = on[i], b = on[j]; if (Math.abs(a.x - b.x) > 11 || Math.abs(a.z - b.z) > 11) continue; const d = sat(a, b); if (d > worst) worst = d; if (d > .35) n++; } } }
  return { worst, n };
}
ok('rush hour on the real street network: no red-light running, no cars driving through each other, traffic keeps moving', () => {
  const sim = TC.createSim({ streets, junctions: J, cap: 160, seed: 5 });
  const r = run(sim, 240, t => ({ t, hour: 17.5 }));
  const on = sim.cars.filter(c => c.on), avg = on.reduce((a, c) => a + c.v, 0) / on.length;
  console.log('   ', JSON.stringify({ active: sim.st.active, entries: sim.st.entries, redRuns: sim.st.redRuns, cleared: sim.st.cleared || 0, worstPen: +r.worst.toFixed(2), overlaps: r.n, avg: +avg.toFixed(2) }));
  assert.equal(sim.st.redRuns, 0); assert.ok(r.n <= 2, 'overlaps ' + r.n); assert.ok(sim.st.entries > 400, 'throughput ' + sim.st.entries); assert.ok(avg > 2.5, 'avg speed ' + avg);
  assert.ok(sim.cars.filter(c => c.on).every(c => c.wait < 60), 'gridlock');
  const kinds = new Set(on.map(c => c.T.id)); assert.ok(kinds.size >= 6, 'vehicle mix ' + [...kinds]);
});
ok('time of day: the overnight fleet is a fraction of the rush-hour fleet', () => {
  const a = TC.createSim({ streets, junctions: J, cap: 160, seed: 2 }), b = TC.createSim({ streets, junctions: J, cap: 160, seed: 2 });
  a.step(.05, { t: 0, hour: 3 }); b.step(.05, { t: 0, hour: 17.5 }); assert.ok(a.st.active < b.st.active * .35, `${a.st.active} vs ${b.st.active}`);
  for (let f = 0; f < 400; f++) a.step(.05, { t: f * .05, hour: 17.5, cam: { x: 9999, z: 9999 } }); assert.ok(a.st.active > b.st.active * .5, 'refills toward rush hour');
});
ok('pedestrians on a crosswalk hold turning cars at the line', () => {
  const sim = TC.createSim({ streets, junctions: J, cap: 120, seed: 9 }), blocked = new Set();
  sim.G.juncs.forEach(j => blocked.add(j));
  let before = 0; for (let f = 0; f < 600; f++) { sim.step(.05, { t: f * .05, hour: 12, ped: (j, k) => true }); }
  before = sim.st.entries;
  const withXw = sim.G.lanes.filter(l => l.kind === 'conn' && l.J >= 0 && l.xw.length).length, all = sim.G.lanes.filter(l => l.kind === 'conn' && l.J >= 0).length;
  assert.equal(withXw, all, 'every junction movement crosses at least one crosswalk');
  assert.ok(sim.st.pedYields > 0); assert.ok(before < 40, 'entries while every crosswalk is busy: ' + before);
});
ok('sirens: cars nearby pull to the curb and stop', () => {
  const sim = TC.createSim({ streets, junctions: J, cap: 80, seed: 4 }); sim.step(.05, { t: 0, hour: 12 });
  const car = sim.cars.find(c => c.on && c.lane.kind === 'road' && c.lane.L - c.s > 30); const u = { x: car.x - car.hx * 15, z: car.z - car.hz * 15, siren: true, len: 6 };
  for (let f = 0; f < 120; f++) sim.step(.05, { t: f * .05, hour: 12, units: [u] });
  assert.ok(car.v < .3, 'stopped ' + car.v); assert.ok(car.lat > .6, 'pulled over ' + car.lat); assert.ok(sim.st.pullovers > 0);
});
ok('cars stop for the player standing in their lane', () => {
  const sim = TC.createSim({ streets, junctions: J, cap: 60, seed: 8 }); sim.step(.05, { t: 0, hour: 12 });
  const car = sim.cars.find(c => c.on && c.lane.kind === 'road' && c.lane.L - c.s > 40); const pl = { x: car.x + car.hx * 12, z: car.z + car.hz * 12 };
  for (let f = 0; f < 200; f++) sim.step(.05, { t: f * .05, hour: 12, player: pl });
  assert.ok(Math.hypot(car.x - pl.x, car.z - pl.z) > 2.2, 'kept clear of the player');
});
ok('Market Street link: a new street + yield junction joins the graph and the old cars are adopted', () => {
  const s0 = TC.createSim({ streets, junctions: J, cap: 100, seed: 6 }); for (let f = 0; f < 40; f++) s0.step(.05, { t: f * .05, hour: 12 });
  const ri = streets.findIndex(s => s.type === 'ring' && Math.abs(s.c.x + 123.7) < .5 && Math.abs(s.c.z + 123.7) < .5 && s.r > 30), R = streets[ri];
  const th = Math.atan2(-.2, -1), P = { x: R.c.x + Math.cos(th) * R.r, z: R.c.z + Math.sin(th) * R.r }, E = { x: P.x + Math.cos(th) * 120, z: P.z + Math.sin(th) * 120 };
  const st2 = [...streets, { type: 'line', a: P, b: E, kind: 'link' }], J2 = [...J, { x: P.x, z: P.z, s: [ri, streets.length], signal: false }];
  const s1 = TC.createSim({ streets: st2, junctions: J2, cap: 100, seed: 7 }); s1.adopt(s0);
  assert.ok(s1.st.active > s0.st.active * .8, `adopted ${s1.st.active} of ${s0.st.active}`);
  const yieldJ = s1.G.juncs[s1.G.juncs.length - 1]; assert.equal(yieldJ.signal, false); assert.ok(yieldJ.conns.filter(c => c.in.street === streets.length).every(c => c.pri === 1), 'side street yields');
  const deadU = s1.G.lanes.find(l => l.kind === 'conn' && l.move === 'U'); assert.ok(deadU, 'dead end gets a turnaround');
  let reached = 0; for (let f = 0; f < 4000; f++) { s1.step(.05, { t: f * .05, hour: 12 }); if (s1.cars.some(c => c.on && c.lane.street === streets.length)) reached++; }
  assert.ok(reached > 50, 'traffic uses the new street');
});

// ---------------------------------------------------------------- wiring (client modules + service worker)
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
ok('wiring: app.js imports traffic.mjs, delegates ground traffic + pedestrians, flips stop bars only when not classic', () => {
  const app = read('client/js/app.js'); assert.match(app, /import '\.\/traffic\.mjs'/); assert.match(app, /TR\.update\(dt\)/); assert.match(app, /window\.__traffic\.ped/); assert.match(app, /traffic=classic/);
  const tr = read('client/js/traffic.mjs'); assert.match(tr, /traffic'\) === 'classic'/);
  for (const [re, what] of [[/\bU\.day\.value\s*=/, 'time of day'], [/\bS\.fog\b\s*=/, 'fog'], [/setMarketMood|wTarget|wCur/, 'weather']]) assert.ok(!re.test(tr), 'traffic.mjs must not write ' + what);
  const cl = read('client/js/citylife.js'); assert.match(cl, /L\.phaseFn/); assert.match(cl, /afterHours/);
  const sw = read('client/sw.js'); assert.match(sw, /'js\/traffic\.mjs'/); assert.match(sw, /'js\/traffic-core\.mjs'/); assert.match(sw, /const VERSION = 'bc-v\d+-/);
});
console.log(`traffic-core: ${pass} checks passed`);
