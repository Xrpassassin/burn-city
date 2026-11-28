// Circle of XRPL Memes client core: tower picking, layout, zones, the City ruler, wiring, and the weather/sky hard rule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as MC from './memes-circle-core.mjs';

const here = new URL('.', import.meta.url);
const read = f => fs.readFileSync(new URL(f, here), 'utf8');

// ---- a fake 150-token payload shaped like /api/memes-circle
const Q = ['kings', 'grinders', 'degens', 'watchline'];
const toks = []; let rank = 0;
for (let i = 0; i < 150; i++) { const q = i < 60 ? (i % 5 === 4 ? 'degens' : 'kings') : i < 125 ? 'grinders' : 'watchline';
  toks.push({ key: 'r' + i + '-X', name: 'T' + i, label: 'T' + i, q, ms: 100 - i * .5, hh: 60, mom: 50, alpha: 90 - i * .4, rank: null, mcap: 1e4 * (151 - i), tvl: 100 * (151 - i), holders: 100 }); }
toks.find(t => t.name === 'T140').name = 'BURN'; toks.find(t => t.name === 'BURN').key = 'rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd-4255524E00000000000000000000000000000000';
toks.find(t => t.name === 'BURN').q = 'kings';
toks.filter(t => t.q !== 'watchline').sort((a, b) => b.alpha - a.alpha).forEach(t => { t.rank = ++rank; });
const data = { tokens: toks, counts: {} };

// ---- pickTowers: top 40 by Alpha + BURN + floor of 6 Grinders + 6 Watchline
const T = MC.pickTowers(data);
assert.ok(T.slice(0, 40).every((t, i) => t.rank === i + 1), 'first 40 are the Alpha List order');
assert.ok(T.some(t => t.name === 'BURN'), 'BURN always gets a tower');
assert.ok(T.filter(t => t.q === 'grinders').length >= 6, 'Grinder Yards never empty');
assert.strictEqual(T.filter(t => t.q === 'watchline').length, 6, 'six Watchline towers');
assert.strictEqual(new Set(T).size, T.length, 'no duplicates');
assert.ok(T.length <= 40 + 1 + 6 + 6);
assert.deepEqual(MC.pickTowers(null), []); assert.deepEqual(MC.pickTowers({ tokens: [{ q: 'nope', name: 'x' }] }), []);
const AL = MC.alphaList(data, 15); assert.strictEqual(AL.length, 15); assert.ok(AL.every((t, i) => t.rank === i + 1 && t.q !== 'watchline'));

// ---- layout: every tower placed in its own wedge, clear of avenues, plaza, rim and each other
const cen = { x: -460, z: -245 }, a0 = Math.atan2(245, 460) + Math.PI / 4, R = MC.QUARTER.R;
const L = MC.layoutTowers(T, cen, a0, R);
assert.strictEqual(L.length, T.length, 'all towers placed');
for (const p of L) {
  assert.strictEqual(MC.zoneAt(p.x, p.z, cen, a0, R), p.zone, 'tower stands in its district');
  const dx = p.x - cen.x, dz = p.z - cen.z, r = Math.hypot(dx, dz);
  assert.ok(r > MC.QUARTER.PLAZA + p.w * .7 && r < R - p.w * .7, 'inside the ring, outside the plaza');
  for (const k of [0, 1]) { const ang = a0 + Math.PI / 4 + k * Math.PI / 2, perp = Math.abs(-Math.sin(ang) * dx + Math.cos(ang) * dz);
    assert.ok(perp > MC.QUARTER.AVE + p.w * .5, 'clear of the avenues'); }
  assert.ok(p.h >= 12 && p.h <= 122);
}
for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) assert.ok(Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z) > (L[i].w + L[j].w) * .75, 'towers do not overlap');
for (const z of Q) assert.ok(MC.slotsFor(z, cen, a0, R).length >= 40, 'room for Phase 1 in any one district: ' + z);

// ---- zone weights: 1 deep inside, blend across avenues, 0 outside
const A = MC.zoneAngles(a0);
for (const z of Q) { const w = MC.zoneWeights(cen.x + Math.cos(A[z]) * 80, cen.z + Math.sin(A[z]) * 80, cen, a0, R); assert.ok(w[z] > .99); for (const o of Q) if (o !== z) assert.ok(w[o] < .01); }
const onAve = MC.zoneWeights(cen.x + Math.cos(a0 + Math.PI / 4) * 80, cen.z + Math.sin(a0 + Math.PI / 4) * 80, cen, a0, R);
assert.ok(Math.abs(onAve.kings - .5) < .05 && Math.abs(onAve.grinders - .5) < .05, 'avenue = half/half blend');
assert.ok(Object.values(MC.zoneWeights(cen.x + 400, cen.z, cen, a0, R)).every(v => v === 0), 'nothing outside the quarter');
assert.strictEqual(MC.zoneAt(cen.x + 400, cen.z, cen, a0, R), null);
// the avenue between Kings Row and Degen Strip ("Market Street") is the one that points at downtown
assert.ok(Math.abs(((A.kings + A.degens) / 2 - (a0 - Math.PI / 4))) < 1e-9 || Math.abs(A.degens - (a0 - Math.PI / 2 + 2 * Math.PI)) < 1e-9);

// ---- pickCenter
assert.deepEqual(MC.pickCenter([{ x: 1, z: 1 }, { x: 2, z: 2 }], (x) => x === 1), { x: 2, z: 2, clear: true });
assert.strictEqual(MC.pickCenter([{ x: 1, z: 1 }], () => true).clear, false);

// ---- same ruler as the City's token towers (app.js towerH / towerW)
const app = read('app.js');
assert.ok(app.includes('return Math.min(122,Math.max(12,12+15.4*(Math.log10(Math.max(100,v||0))-2)))'), 'app.js height ruler unchanged (keep memes-circle-core towerH in step)');
assert.ok(app.includes('2+7.5*Math.sqrt(Math.max(0,n.tvl||0)/MAXT)') || app.includes('2+7.5*Math.sqrt(Math.min(1,Math.max(0,n.tvl||0)/MAXT))'), 'app.js width ruler unchanged (min(1,…) only caps promoted districts, whose TVL is outside MAXT)');
assert.strictEqual(+MC.towerH(1e6).toFixed(3), +(12 + 15.4 * 4).toFixed(3)); assert.strictEqual(MC.towerH(1), 12); assert.strictEqual(MC.towerH(1e20), 122);
assert.strictEqual(MC.towerW(100, 100), 9.5); assert.strictEqual(MC.towerW(0, 100), 2);
assert.strictEqual(MC.fmtXrp(2.71e6), '2.71M'); assert.strictEqual(MC.fmtXrp(17.2e6), '17.2M'); assert.strictEqual(MC.fmtXrp(34329), '34K');
assert.strictEqual(MC.logoUrl({}), null, 'Phase 1: no logos yet');

// ---- in-game naming: the chart's "Under Surveillance" never appears in-game
const mod = read('memes-circle.mjs'), core = read('memes-circle-core.mjs');
for (const src of [mod, core]) assert.ok(!/Under Surveillance/i.test(src.replace(/\/\/[^\n]*/g, '')), 'use "The Watchline" in-game (comments may name the chart)');
assert.strictEqual(MC.ZONES.watchline.name, 'The Watchline');

// ---- HARD RULE: districts never touch the global weather or sky (only live market data drives them)
const code = mod.replace(/\/\/[^\n]*/g, '');   // ignore comments (the header explains the rule)
for (const [re, what] of [[/\bS\.fog\b/, 'S.fog'], [/\.fog\s*\.\s*(density|color)/, 'fog density/color'], [/\bU\.(storm|wet|flash|sunD)\b/, 'weather uniforms'],
  [/\bU\.day\.value\s*=/, 'time of day'], [/setMarketMood|setAegisWeather|wTarget|wCur|__weatherMode\s*=/, 'weather state'], [/\$\(\s*['"]weather['"]\)|getElementById\(\s*['"](weather|tod|todCycle)['"]\)/, 'weather/tod controls'],
  [/toneMappingExposure|bloom\.strength|\bhemi\b|\bamb\.intensity/, 'global lighting'], [/\bsky\b\s*\.\s*material/, 'sky material']])
  assert.ok(!re.test(code), 'memes-circle.mjs must not write ' + what);
assert.ok(/window\.__marketMood\s*\?\s*window\.__marketMood\(\)/.test(code), 'fireworks read the market mood through the read-only getter');
assert.ok(app.includes('window.__marketMood=()=>({mood:moodNow,green:greenNow,tier:moodWeather});'), 'app.js exposes the read-only mood getter');

// ---- wiring: app import, kill switch, gated test hooks, service worker precache
assert.ok(app.includes("import './memes-circle.mjs';"));
assert.ok(/Q\.get\('memes'\) !== '0'/.test(mod), '?memes=0 kill switch');
assert.ok(/const TEST = Q\.has\('memestest'\) \|\| Q\.get\('debug'\) === '1'/.test(mod) && /if \(TEST\) window\.__memes =/.test(mod), 'test hooks gated');
assert.ok(/j\.enabled === false/.test(mod), 'server kill switch honoured');
const sw = read('../sw.js'); assert.ok(sw.includes("'js/memes-circle.mjs', 'js/memes-circle-core.mjs'")); assert.ok(/const VERSION = 'bc-v\d+-/.test(sw));
// names reach the DOM only as text
assert.ok(!/innerHTML/.test(code), 'no innerHTML in memes-circle.mjs (token names are attacker-chosen)');
console.log('memes-circle core tests ok');
