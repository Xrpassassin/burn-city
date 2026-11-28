// tower-shape-core tests (Derrik, Nov 28, 2026): wider base = more AMM liquidity, taller = more market cap,
// thin liquidity + high cap = a pencil, thick liquidity + good cap = a grand building. Run: node client/js/tower-shape-core.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as TS from './tower-shape-core.mjs';

const near = (a, b, e = .02) => Math.abs(a - b) <= e;

// ---- clamps
assert.equal(TS.shapeW(0), TS.W_MIN); assert.equal(TS.shapeW(-5), TS.W_MIN); assert.equal(TS.shapeW(null), TS.W_MIN); assert.equal(TS.shapeW(TS.TVL_MIN), TS.W_MIN);
assert.equal(TS.shapeW(1e9), TS.W_MAX); assert.equal(TS.shapeW(400000), TS.W_MAX, '~316K XRP and up = widest base');
assert.ok(TS.shapeW(310000) < TS.W_MAX && TS.shapeW(310000) > 9.4);
assert.equal(TS.shapeH(0), TS.H_MIN); assert.equal(TS.shapeH(1), TS.H_MIN); assert.equal(TS.shapeH(1e30), TS.H_MAX);
assert.ok(near(TS.shapeH(1e6), 12 + 15.4 * 4), 'height = the City mcap ruler (100 XRP -> 12, +15.4 per 10x)');
// absolute ruler: a whale does not rescale anyone else, and the ruler is monotone
let prev = 0; for (const v of [83, 500, 2e3, 1e4, 5e4, 2.32e5]) { const w = TS.shapeW(v); assert.ok(w > prev, 'wider with more liquidity'); prev = w; }
prev = 0; for (const v of [98, 1e3, 1e5, 1e7, 1e9]) { const h = TS.shapeH(v); assert.ok(h > prev, 'taller with more mcap'); prev = h; }
assert.ok(near(TS.shapeW(2000), TS.W_MIN + (TS.W_MAX - TS.W_MIN) / TS.TVL_DECADES), '+1 decade of liquidity = one step of the ruler');

// ---- the pencil: thin liquidity, high market cap (live examples: OURO ~153 XRP TVL / ~1B mcap, BITx ~1.2K / ~146M)
const ouro = TS.towerShape(153, 1.03e9);
assert.equal(ouro.w, TS.W_MIN); assert.ok(ouro.h >= 119); assert.equal(ouro.pencil, true); assert.equal(ouro.grade, 'plain');
const bitx = TS.towerShape(1201, 1.46e8, { maxW: 2.42 });
assert.equal(bitx.pencil, true, 'thin pool + 146M cap on its plot = pencil'); assert.equal(bitx.grade, 'plain');
assert.ok(bitx.h / (2 * bitx.w) >= TS.PENCIL_ASPECT);

// ---- fat and tall: deep liquidity, good market cap (live: BCHAMP ~232K / ~3.7M, 666 ~84K / ~1.6M) = grand
const champ = TS.towerShape(231944, 3.65e6);
assert.equal(champ.grade, 'grand'); assert.equal(champ.pencil, false); assert.ok(champ.w > 9 && champ.h > 80);
const t666 = TS.towerShape(84413, 1.59e6);
assert.equal(t666.grade, 'grand'); assert.ok(t666.w > ouro.w * 4, 'deep pool = far wider base than the pencil');
assert.ok(champ.w / champ.h > 5 * (ouro.w / ouro.h), 'grand is stocky, pencil is needle-thin');

// ---- tiny token = small plain stub (not a pencil: it is short); mid = standard
const dnc = TS.towerShape(104, 98); assert.equal(dnc.w, TS.W_MIN); assert.equal(dnc.h, TS.H_MIN); assert.equal(dnc.pencil, false); assert.equal(dnc.grade, 'plain');
assert.equal(TS.towerShape(36091, 24373).grade, 'standard');
// deep liquidity but a tiny cap is NOT grand (height is the weak side)
assert.equal(TS.towerShape(2e5, 200).grade, 'plain');
// high cap + medium pool, wide enough = standard, not pencil
assert.equal(TS.towerShape(5698, 7.76e8).pencil, false);

// ---- mcap missing -> height from TVL (the fallback app.js always had)
assert.equal(TS.towerShape(5000, null).h, TS.shapeH(5000));

// ---- plot fit: never wider than the plot, never below 1.2, height untouched; grade judged on the fitted base
assert.equal(TS.fitW(9, 4), 4); assert.equal(TS.fitW(2, 4), 2); assert.equal(TS.fitW(.5, 4), 1.2);
const fitted = TS.towerShape(84413, 1.59e6, { maxW: 3 }); assert.equal(fitted.w, 3); assert.equal(fitted.h, t666.h); assert.notEqual(fitted.grade, 'grand');
// hub plot: pad (2.05 w) stays inside the inner ring (62% of the radius) with 3.5 m; minor plot keeps a 2 m satellite band
for (const cw of [2, 4, 6, 9.5]) { const R = cw * 3 + 28, m = TS.plotMaxW(R); assert.ok(m * 2.05 + 3.5 <= R * .62 + 1e-9 || m === TS.W_MIN); }
for (const cw of [2, 3, 5, 9.5]) { const R = cw * 3.4 + 5, m = TS.plotMaxW(R, true); assert.ok(R - m * 2.5 - 2 >= 2 - 1e-9); assert.ok(m >= cw, 'a minor plot always fits its classic width'); }

// ---- kill switch
assert.equal(TS.shapeMode('?shape=classic'), 'classic'); assert.equal(TS.shapeMode('?debug=1'), 'shaped'); assert.equal(TS.shapeMode(''), 'shaped'); assert.equal(TS.shapeMode(undefined), 'shaped');

// ---- wiring (app.js + memes-circle): shaped districts keep their classic plot radius; quarter uses the same ruler; no xrpl.to
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8'), mcs = readFileSync(new URL('./memes-circle.mjs', import.meta.url), 'utf8'), mcc = readFileSync(new URL('./memes-circle-core.mjs', import.meta.url), 'utf8');
assert.match(app, /from '\.\/tower-shape-core\.mjs'/); assert.match(app, /n\.w=towerWClassic\(n\);\s*\n\s*n\.distR=/, 'district radius from the classic width (positions never move)');
assert.match(app, /n\.wMax=\+plotMaxW\(n\.distR,n\.minor\)/); assert.match(app, /uniform float d,t,day,flash,uLit;/, 'grand facade = a uniform, one program');
assert.match(mcs, /shapeMode\(location\.search\)/); assert.match(mcc, /shapeW\(t\.tvl\)/);
assert.ok(!/xrpl\.to/.test(readFileSync(new URL('./tower-shape-core.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), 'no data calls in the shape core');
assert.match(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /'js\/tower-shape-core\.mjs'/, 'precached');
console.log('tower-shape core tests ok');
