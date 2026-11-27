// Circle of XRPL Memes: pure layout + zone rules for the City's meme quarter (no three.js, no DOM). Rendered by memes-circle.mjs.
// Data: GET /api/memes-circle (server/memes-circle.js). Tests: client/js/memes-circle-core.test.mjs.
// Phase 2 slots in here: logos (xrp-ledger.toml / xrpl.to md5 icons) attach per token via `logoUrl(t)` and all 150 tokens via
// `pickTowers(data, { max: 150 })` + smaller LOD tiers; nothing else in this file needs to change shape.

// The four quadrants of the chart -> in-game districts. In-game names only: the chart's "Under Surveillance" is "The Watchline".
export const ZONES = {
  kings:     { id: 'kings',     name: 'Kings Row',     blurb: 'Strong market + healthy holders', col: 0xffc44d, haze: 0xffb347, tint: [1.0, .78, .42] },
  grinders:  { id: 'grinders',  name: 'Grinder Yards', blurb: 'Healthy holders, still building size', col: 0x3dff8a, haze: 0x2bd46a, tint: [.35, 1.0, .55] },
  watchline: { id: 'watchline', name: 'The Watchline', blurb: 'Concentrated holders / risk signals, watched closely', col: 0xff3b3b, haze: 0xc81e1e, tint: [1.0, .22, .2] },
  degens:    { id: 'degens',    name: 'Degen Strip',   blurb: 'Big following, concentrated holders', col: 0xc04dff, haze: 0x8a2be2, tint: [.72, .3, 1.0] },
};
// counter-clockwise order around the circle, as on the chart (Kings top-right, Grinders top-left, Watchline bottom-left, Degens bottom-right)
export const ORDER = ['kings', 'grinders', 'watchline', 'degens'];
export const QUARTER = { R: 150, AVE: 6, PLAZA: 24, EDGE: 12, BLEND: 14 };   // radius, half avenue width, central plaza, rim, zone blend band (m)
export const MAX_TOWERS = 40, WATCH_TOWERS = 6;

// Same ruler as the City's token towers (app.js towerH/towerW): height = log10(mcap in XRP), 100 XRP -> 12 u, +15.4 u per 10x,
// cap 122; footprint width from TVL (sqrt), here relative to the deepest meme in the list.
export const towerH = mcap => Math.min(122, Math.max(12, 12 + 15.4 * (Math.log10(Math.max(100, +mcap || 0)) - 2)));
export const towerW = (tvl, maxTvl) => +(2 + 7.5 * Math.sqrt(Math.max(0, +tvl || 0) / Math.max(1, +maxTvl || 1))).toFixed(2);

// Which tokens become towers: top `max` by Alpha (the Alpha List order, Watchline excluded), plus BURN always, plus a floor of
// `floor` towers for Grinder Yards (top Grinders by Alpha: smaller tokens rarely reach the top 40) and for the Watchline (top by
// market strength; they never appear on the Alpha List), so no district stands empty.
export function pickTowers(data, { max = MAX_TOWERS, floor = WATCH_TOWERS } = {}) {
  const toks = Array.isArray(data?.tokens) ? data.tokens.filter(t => t && ZONES[t.q] && typeof t.name === 'string') : [];
  const ranked = toks.filter(t => t.q !== 'watchline' && t.rank != null).sort((a, b) => a.rank - b.rank);
  const out = ranked.slice(0, max);
  const burn = toks.find(t => t.name === 'BURN' && /^rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd-/.test(t.key || '')) || toks.find(t => t.name === 'BURN');
  if (burn && !out.includes(burn)) out.push(burn);
  const have = q => out.filter(t => t.q === q).length;
  for (const t of ranked.filter(t => t.q === 'grinders')) { if (have('grinders') >= floor) break; if (!out.includes(t)) out.push(t); }
  out.push(...toks.filter(t => t.q === 'watchline').sort((a, b) => b.ms - a.ms).slice(0, floor));
  return out;
}
export function alphaList(data, n = 15) {
  return (Array.isArray(data?.tokens) ? data.tokens : []).filter(t => t && t.q !== 'watchline' && t.rank != null).sort((a, b) => a.rank - b.rank).slice(0, n);
}

// Quadrant geometry. `a0` = world angle (atan2(z, x)) of the Kings wedge's centre line; the wedges follow ORDER counter-clockwise.
export function zoneAngles(a0) { const o = {}; ORDER.forEach((id, i) => { o[id] = a0 + i * Math.PI / 2; }); return o; }
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); return a < 0 ? a + Math.PI : a - Math.PI; };

// zone weights at a point: each 0..1, smooth across the avenues and the rim (used for atmosphere blending + ambient sound)
export function zoneWeights(x, z, center, a0, R = QUARTER.R, band = QUARTER.BLEND) {
  const dx = x - center.x, dz = z - center.z, r = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), w = {};
  const rim = Math.max(0, Math.min(1, (R + band * .5 - r) / band));   // fades out just past the rim
  const A = zoneAngles(a0);
  for (const id of ORDER) {
    const da = Math.abs(wrap(ang - A[id]));   // 0 at the wedge centre, PI/4 at its edge (an avenue)
    const edge = (Math.PI / 4 - da) * Math.max(r, 1);   // metres inside the wedge from its avenue edge
    w[id] = rim * Math.max(0, Math.min(1, .5 + edge / band)) * (r < QUARTER.PLAZA * .5 ? r / (QUARTER.PLAZA * .5) : 1);
  }
  return w;
}
export function zoneAt(x, z, center, a0, R = QUARTER.R) { const w = zoneWeights(x, z, center, a0, R); let best = null, bw = .5; for (const id of ORDER) if (w[id] > bw) { bw = w[id]; best = id; } return best; }

// Tower slots: rings inside each wedge, clear of the avenues, plaza and rim. Preference: inner rings first, wedge centre first.
export function slotsFor(zone, center, a0, R = QUARTER.R) {
  const A = zoneAngles(a0)[zone], out = [];
  for (let r = QUARTER.PLAZA + 12, ring = 0; r <= R - QUARTER.EDGE; r += 17, ring++) {
    const half = Math.PI / 4 - (QUARTER.AVE + 7) / r; if (half <= 0) continue;
    const n = Math.max(1, Math.floor(2 * half * r / 15) + 1);
    const ks = [...Array(n).keys()].map(k => n === 1 ? 0 : -half + 2 * half * k / (n - 1)).sort((p, q) => Math.abs(p) - Math.abs(q));
    for (const off of ks) out.push({ x: center.x + Math.cos(A + off) * r, z: center.z + Math.sin(A + off) * r, r, ring, ang: A + off });
  }
  return out;
}

// Place towers (already in priority order) into their zone's slots, skipping slots too close to a placed neighbour. If a district
// runs out of room (flat TVL spread = many wide towers), footprints shrink step by step until everyone fits (heights never change).
export function layoutTowers(towers, center, a0, R = QUARTER.R) {
  const maxTvl = Math.max(1, ...towers.map(t => +t.tvl || 0));
  let best = [];
  for (const k of [1, .85, .7, .58, .48, .4]) {
    const placed = [], free = {}; for (const id of ORDER) free[id] = slotsFor(id, center, a0, R);
    for (const t of towers) {
      const w = +(towerW(t.tvl, maxTvl) * k).toFixed(2), h = towerH(t.mcap), list = free[t.q]; if (!list) continue;
      const i = list.findIndex(s => placed.every(p => Math.hypot(p.x - s.x, p.z - s.z) > (p.w + w) * .75 + 4));
      if (i < 0) continue; const s = list.splice(i, 1)[0];
      placed.push({ t, x: s.x, z: s.z, w, h, zone: t.q, ring: s.ring, face: Math.atan2(center.z - s.z, center.x - s.x) });
    }
    if (placed.length > best.length) best = placed;
    if (placed.length === towers.filter(t => free[t.q]).length) break;
  }
  return best;
}

// Pick the quarter's centre: first candidate whose disc is clear of everything in `blocked(x, z, r)`.
export function pickCenter(cands, blocked, R = QUARTER.R) { for (const c of cands) if (!blocked(c.x, c.z, R + 8)) return { ...c, clear: true }; return { ...cands[0], clear: false }; }

export const fmtXrp = v => { v = +v || 0; return v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v)); };
// Phase 2: token logos. xrpl.to serves icons by md5 (https://s1.xrpl.to/token/<md5>); issuer xrp-ledger.toml icons come later.
export const logoUrl = t => null;   // Phase 1: no logos (towers use name plates). Phase 2 returns a URL here.

export const FLAG_WORDS = { top10: 'top-10 wallets hold a lot', creator: 'creator holds a large share', insider: 'insider-held supply', lp_burned: 'LP mostly burned',
  sell_pressure: 'more sellers than buyers (24h)', serial_creator: 'creator launched many tokens', creator_recent_exit: 'recent creator withdraw/sell/transfer', thin_liquidity: 'thin liquidity for its market cap' };
