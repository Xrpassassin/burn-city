// Circle of XRPL Memes: pure scoring (no I/O). Used by server/memes-circle.js; tested by server/memes-circle.test.js.
// Method follows the @BurnXrp28366 "Circle of XRPL Memes" chart (Nov 27, 2026), approximated from xrpl.to fields only:
//   universe  = xrpl.to 'Memes'-tagged tokens, top 150 by the average of their market-cap, AMM-TVL and holder ranks
//   X axis    = Market Strength: percentiles of mcap 25%, TVL 25%, holders 20%, 7d volume 15%  (the chart's X-followers 15%
//               needs the X API, so it is dropped and the other weights are renormalised to 100%)
//   Y axis    = Holder Health: starts at 60, +/- top-10 concentration, creator %, insider %, LP burned %, sell pressure,
//               serial creator, a recent creator withdraw/sell/transfer, TVL/mcap
//   Alpha     = 50% Market Strength + 35% Holder Health + 15% Momentum (7d price change 40%, 24h holder growth 35%,
//               24h buyer pressure 25%, each a percentile). The Watchline (the chart's "Under Surveillance") is left out
//               of the Alpha List.
// All of it is a data-driven sort of on-chain signals, not an accusation and not financial advice.
'use strict';

const N = 150;
const W_MS = { mcap: 25, tvl: 25, holders: 20, vol7d: 15 };   // X followers (15) dropped -> renormalised by the sum (85)
const QUADS = ['kings', 'grinders', 'degens', 'watchline'];
const HEALTHY = 55, STRONG = 50;   // Holder Health >= 55 = healthy holders; Market Strength >= 50 (median) = strong market
const DAY = 864e5;

const num = v => { const x = +v; return Number.isFinite(x) ? x : 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;

// rank percentile 0..100 (ties share their average rank); bigger value = higher percentile
function percentiles(vals) {
  const n = vals.length, idx = vals.map((v, i) => [num(v), i]).sort((a, b) => a[0] - b[0]), out = new Array(n);
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const p = n > 1 ? 100 * ((i + j) / 2) / (n - 1) : 50; for (let k = i; k <= j; k++) out[idx[k][1]] = p; i = j + 1; }
  return out;
}

// universe: rank by average of mcap / TVL / holders ranks (1 = best), keep the top n
function pickUniverse(tokens, n = N) {
  const list = tokens.filter(t => t && num(t.marketcap) > 0);
  const rank = key => { const s = [...list].sort((a, b) => num(b[key]) - num(a[key])); const m = new Map(); s.forEach((t, i) => m.set(t, i + 1)); return m; };
  const rm = rank('marketcap'), rt = rank('tvl'), rh = rank('holders');
  return list.map(t => ({ t, avg: (rm.get(t) + rt.get(t) + rh.get(t)) / 3 })).sort((a, b) => a.avg - b.avg || num(b.t.marketcap) - num(a.t.marketcap)).slice(0, n).map(x => x.t);
}

// Holder Health: 60 +/- the signals; returns { hh, flags } (flags are short codes shown in-game as plain words)
function holderHealth(t, now = Date.now()) {
  let h = 60; const flags = [];
  const top10 = num(t.top10), creator = num(t.creatorHoldingPercent), insider = num(t.insiderPct), lpb = num(t.lpBurnedPercent);
  if (t.top10 != null) { h += clamp((30 - top10) * .5, -25, 8); if (top10 >= 50) flags.push('top10'); }   // unknown (seed rows before the daily xrpl.to read): neutral
  h -= Math.min(15, creator * .6); if (creator >= 10) flags.push('creator');
  h -= Math.min(15, insider * .5); if (insider >= 10) flags.push('insider');
  h += Math.min(12, lpb * .12); if (lpb >= 90) flags.push('lp_burned');
  const bp = t.buyerPressure == null ? 1 : num(t.buyerPressure);
  if (bp < .6) { h -= 6; flags.push('sell_pressure'); } else if (bp < .85) h -= 3; else if (bp > 1.25) h += 2;
  const ctc = num(t.creatorTokenCount); if (ctc >= 5) { h -= 8; flags.push('serial_creator'); } else if (ctc >= 3) h -= 3;
  const a = t.creatorLastAction, side = a && String(a.side || a.type || '').toLowerCase(), age = a && a.time ? now - num(a.time) : Infinity;
  const dumpy = side && /withdraw|sell|transfer_out/.test(side);
  if (dumpy && age < 14 * DAY) { h -= 10; flags.push('creator_recent_exit'); } else if (dumpy && age < 60 * DAY) h -= 4;
  const mc = num(t.marketcap), ratio = mc > 0 ? num(t.tvl) / mc : 0;
  if (ratio < .02) { h -= 8; flags.push('thin_liquidity'); } else if (ratio < .05) h -= 3; else if (ratio > .3) h += 6; else if (ratio > .15) h += 4;
  if (t.highConcentrationRisk) h -= 3;
  return { hh: clamp(h, 0, 100), flags };
}

// severe risk signals send an unhealthy token to the Watchline whatever its market strength
const SEVERE = new Set(['creator_recent_exit']);
function severe(t, flags) { return num(t.creatorHoldingPercent) >= 30 || num(t.insiderPct) >= 30 || flags.some(f => SEVERE.has(f)); }

function quadrant(ms, hh, isSevere) {
  if (hh >= HEALTHY && !isSevere) return ms >= STRONG ? 'kings' : 'grinders';
  return ms >= STRONG && !isSevere ? 'degens' : 'watchline';
}

const SAFE_NAME = /^[A-Za-z0-9 ._\u00B7$-]{1,24}$/;   // names reach browsers: same rule as eco.js (tighter length)
function curName(c) { c = String(c || ''); let n = c; if (/^[0-9A-F]{40}$/i.test(c)) n = Buffer.from(c, 'hex').toString('latin1').replace(/\0/g, '').trim();
  return SAFE_NAME.test(n) ? n : null; }
function safeName(t) { const n = typeof t.name === 'string' && SAFE_NAME.test(t.name) ? t.name : curName(t.currency); return n || ('TKN-' + String(t.issuer || '').slice(1, 5)); }

// full computation: raw xrpl.to token rows -> scored, quadrant-tagged list (sorted by Alpha, Watchline last)
function score(raw, now = Date.now()) {
  const seen = new Set(), memes = [];
  for (const t of raw || []) { if (!t || !t.issuer || !t.currency) continue; const k = t.issuer + '-' + t.currency; if (seen.has(k)) continue;
    if (Array.isArray(t.tags) && !t.tags.includes('Memes')) continue; seen.add(k); memes.push(t); }
  const U = pickUniverse(memes);
  const pm = percentiles(U.map(t => t.marketcap)), pt = percentiles(U.map(t => t.tvl)), ph = percentiles(U.map(t => t.holders)),
    pv = percentiles(U.map(t => t.vol7dxrp != null ? t.vol7dxrp : num(t.vol24hxrp) * 7)),
    p7 = percentiles(U.map(t => t.pro7d)), pg = percentiles(U.map(t => num(t.holders) > 0 ? num(t.holders24h) / num(t.holders) : 0)),
    pb = percentiles(U.map(t => t.buyerPressure == null ? 1 : t.buyerPressure));
  const wsum = W_MS.mcap + W_MS.tvl + W_MS.holders + W_MS.vol7d;
  const names = new Map(); for (const t of U) { const n = safeName(t); names.set(n, (names.get(n) || 0) + 1); }
  const rows = U.map((t, i) => {
    const ms = (pm[i] * W_MS.mcap + pt[i] * W_MS.tvl + ph[i] * W_MS.holders + pv[i] * W_MS.vol7d) / wsum;
    const { hh, flags } = holderHealth(t, now), sev = severe(t, flags);
    const mom = .4 * p7[i] + .35 * pg[i] + .25 * pb[i];
    const q = quadrant(ms, hh, sev), alpha = .5 * ms + .35 * hh + .15 * mom;
    const name = safeName(t), label = names.get(name) > 1 ? `${name} (${String(t.issuer).slice(0, 4)})` : name;
    return { key: t.issuer + '-' + t.currency, name, label, issuer: t.issuer, currency: t.currency, md5: /^[0-9a-f]{32}$/.test(t.md5 || '') ? t.md5 : null,
      q, ms: r1(ms), hh: r1(hh), mom: r1(mom), alpha: r1(alpha), flags,
      mcap: Math.round(num(t.marketcap)), tvl: Math.round(num(t.tvl)), holders: Math.round(num(t.holders)), vol7d: Math.round(num(t.vol7dxrp)),
      pro24h: Math.round(num(t.pro24h) * 100) / 100, pro7d: Math.round(num(t.pro7d) * 100) / 100, top10: t.top10 == null ? null : r1(num(t.top10)), lp_burned: t.lpBurnedPercent == null ? null : r1(num(t.lpBurnedPercent)), amm: typeof t.AMM === 'string' && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(t.AMM) ? t.AMM : null };
  });
  rows.sort((a, b) => (a.q === 'watchline') - (b.q === 'watchline') || b.alpha - a.alpha);
  let rank = 0; for (const r of rows) r.rank = r.q === 'watchline' ? null : ++rank;
  const counts = Object.fromEntries(QUADS.map(q => [q, rows.filter(r => r.q === q).length]));
  return { tokens: rows, counts };
}

module.exports = { score, pickUniverse, holderHealth, percentiles, quadrant, safeName, QUADS, HEALTHY, STRONG, N, W_MS };
