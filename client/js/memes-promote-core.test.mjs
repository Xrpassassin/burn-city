// Promoted meme districts: placement (memes-promote-core.mjs) + client wiring guards. Run: node client/js/memes-promote-core.test.mjs
import assert from 'assert';
import fs from 'fs';
import { placePromoted, HOME, quarterA0, LANDMARKS, besideZone } from './memes-promote-core.mjs';
import { QUARTER } from './memes-circle-core.mjs';

const cen = HOME, a0 = quarterA0(cen), R = QUARTER.R;
assert(Math.abs(Math.hypot(cen.x, cen.z) - 500) < .01, 'HOME = r 500');
// 25 districts, mostly Kings Row like the live list (Nov 27): sizes 12..37 m
const qs = 'kings kings kings kings kings kings kings kings kings kings degens kings kings kings kings kings kings kings kings kings kings kings kings kings kings'.split(' ');
const items = qs.map((q, i) => ({ name: 'T' + i, q, r: 12 + (i * 7) % 26 }));
// existing downtown districts (a ring of discs inside r 305) must never be touched
const taken = Array.from({ length: 28 }, (_, i) => ({ x: Math.cos(i) * (120 + (i % 3) * 60), z: Math.sin(i) * (120 + (i % 3) * 60), r: 30 }));
const P = placePromoted(items, { cen, a0, taken });
assert.equal(P.length, 25, 'all 25 placed');
assert.deepEqual(P, placePromoted(items, { cen, a0, taken }), 'deterministic');
const segD = (x, z, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz, u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l)); return Math.hypot(a.x + u * dx - x, a.z + u * dz - z); };
const mkt = a0 - Math.PI / 4, gate = { x: cen.x + Math.cos(mkt) * R, z: cen.z + Math.sin(mkt) * R }, k = 320 / Math.hypot(gate.x, gate.z), roadEnd = { x: gate.x * k, z: gate.z * k };
for (const p of P) {
  const d0 = Math.hypot(p.x, p.z);
  assert(d0 - p.r >= LANDMARKS.cityR, p.name + ' clear of the downtown tower field');
  assert(Math.hypot(p.x - cen.x, p.z - cen.z) >= R + 9 + p.r, p.name + ' outside the quarter disc');
  assert(p.z - p.r >= LANDMARKS.zmin, p.name + ' clear of the airport');
  assert(segD(p.x, p.z, gate, roadEnd) >= p.r + 6, p.name + ' clear of the Market Street approach road');
  for (const m of LANDMARKS.discs) assert(Math.hypot(p.x - m.x, p.z - m.z) >= m.r + p.r, p.name + ' clear of ' + m.id);
  const a = Math.atan2(p.z, p.x), aa = a < 0 ? a + 2 * Math.PI : a, b = LANDMARKS.bands[0];
  assert(!(aa > b.a0 && aa < b.a1 && d0 + p.r > b.r0 && d0 - p.r < b.r1), p.name + ' clear of the wind farm');
  for (const t of taken) assert(Math.hypot(p.x - t.x, p.z - t.z) >= t.r + p.r, p.name + ' clear of an existing district');
  for (const q of P) if (q !== p) assert(Math.hypot(p.x - q.x, p.z - q.z) >= p.r + q.r + 4, p.name + ' vs ' + q.name + ' overlap');
}
// the best spots go to the best ranks, beside their own zone
assert.equal(besideZone(P[0].x, P[0].z, cen, a0), 'kings', 'rank 1 sits beside Kings Row');
assert.equal(besideZone(P.find(p => p.name === 'T10').x, P.find(p => p.name === 'T10').z, cen, a0), 'degens', 'the Degen Strip token sits beside Degen Strip');
// Watchline / unknown quarters fall back to Kings Row's side (never placed by the Watchline)
assert.equal(placePromoted([{ name: 'W', q: 'watchline', r: 15 }], { cen, a0 })[0].zone, 'kings');

// client wiring
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8'), mc = fs.readFileSync(new URL('./memes-circle.mjs', import.meta.url), 'utf8'), sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert(/import \{placePromoted,HOME as PROMO_HOME,quarterA0\} from '\.\/memes-promote-core\.mjs'/.test(app));
assert(/E\.nodes=\[\.\.\.E\.nodes\.filter\(n=>!isP\(n\)\),\.\.\.E\.nodes\.filter\(isP\)\]/.test(app), 'promoted nodes always last');
assert(/kids=\{\};E\.nodes\.filter\(n=>!n\.pos&&!n\.promoted\)/.test(app), 'promoted never become core-ring kids');
assert(/promoted-rails/.test(app) && /promoted-impostors/.test(app), 'merged rails + far impostors');
assert(/const moodTok=[^;]*&&!n\.promoted\)/.test(app), 'weather/mood ignores promoted districts');
assert(/BASE_NODES\.forEach\(satsFor\)/.test(app) && /E\.nodes\.filter\(n=>n\.promoted\)\.forEach\(satsFor\)/.test(app), 'promoted satellites after the infill');
assert(/window\.__memesPromote/.test(mc) && /p\.ptr/.test(mc), 'quarter pins its centre + turns promoted towers into pointers');
assert(!/S\.fog\s*=|U\.(storm|wet|day)\.value\s*=/.test(fs.readFileSync(new URL('./memes-promote-core.mjs', import.meta.url), 'utf8')), 'no weather writes');
assert(/'js\/memes-promote-core\.mjs'/.test(sw), 'sw precaches the module');
// no "// comment" dropped into the middle of an app.js one-liner (Hover Mage tip: it swallows the rest of the line)
for (const line of app.split('\n')) if (/!n\.promoted/.test(line) && /\/\/ /.test(line)) { const i = line.indexOf('// '); assert(!/[;)}]\s*\S/.test(line.slice(i).replace(/^\/\/.*$/, '')), 'comment swallows code'); }
console.log('memes-promote-core ok');
