// Token tower shape (Derrik, Nov 28, 2026): "the larger their liquidity is, the wider the base, and the thicker the market cap,
// the taller the tower. Thin liquidity and high market cap = a pencil. Thick liquidity and good market cap = bigger, nicer building."
// Pure (no three.js, no DOM): app.js (ECO + promoted districts) and memes-circle-core.mjs (meme-quarter towers) share it, and
// tower-shape-core.test.mjs pins the pencil / fat-and-tall cases. Kill switch: ?shape=classic restores the old relative ruler.
//
//   BASE WIDTH (radius-like `w`, the same unit app.js always used) = total AMM liquidity in XRP across the token's pools, on an
//     ABSOLUTE log ruler: 200 XRP -> 1.6, +2.47 per 10x, clamped at 9.5 (~316K XRP). Absolute, so one whale pool never re-scales
//     every other tower, and the clamp keeps whales from swallowing the map.
//   HEIGHT = market cap in XRP on the City's existing log ruler: 100 XRP -> 12, +15.4 per 10x, clamped 12..122.
//   GRADE  = how "built out" the token is: the weaker of its normalised width and height.
//     'grand'  both strong (min >= .5): setbacks, richer lit facade, crown + spire.
//     'plain'  either weak (min < .2) or a pencil: slim, plain, no setbacks or extra lights.
//     'standard' everything between.
//   PENCIL = tall and thin: height / base diameter >= 7 with a base of 3 or less (high market cap on thin liquidity).
export const W_MIN = 1.6, W_MAX = 9.5, TVL_MIN = 200, TVL_DECADES = 3.2;
export const H_MIN = 12, H_MAX = 122;
export const GRAND = .5, PLAIN = .2, PENCIL_ASPECT = 7, PENCIL_W = 3;

const clamp01 = v => Math.max(0, Math.min(1, v));
export const shapeW = tvl => +(W_MIN + (W_MAX - W_MIN) * clamp01((Math.log10(Math.max(1, +tvl || 0)) - Math.log10(TVL_MIN)) / TVL_DECADES)).toFixed(2);
export const shapeH = mcap => +Math.min(H_MAX, Math.max(H_MIN, H_MIN + 15.4 * (Math.log10(Math.max(100, +mcap || 0)) - 2))).toFixed(2);

// Grade + pencil from the base that is actually drawn (w after any plot fit) and the height.
export function gradeOf(w, h) {
  const qw = (w - W_MIN) / (W_MAX - W_MIN), qh = (h - H_MIN) / (H_MAX - H_MIN), q = Math.max(0, Math.min(qw, qh));
  const pencil = w <= PENCIL_W && h / (2 * w) >= PENCIL_ASPECT;
  const grade = pencil || q < PLAIN ? 'plain' : q >= GRAND ? 'grand' : 'standard';
  return { grade, pencil, q: +q.toFixed(3) };
}

// tvl, mcap in XRP. mcap null/undefined -> height falls back to TVL (same fallback app.js always used for tokens without a price).
// opts.maxW: widest base the plot takes (fitW); the grade is judged on the fitted base, so a pencil always looks like one.
export function towerShape(tvl, mcap, opts = {}) {
  const raw = shapeW(tvl), w = opts.maxW != null ? fitW(raw, opts.maxW) : raw, h = shapeH(mcap != null ? mcap : tvl);
  return { w, h, raw, ...gradeOf(w, h) };
}

// Fit a shaped base into a plot that already exists (keep everything that exists: positions never move). `maxW` is the widest
// base the plot can take; the height is never touched.
export const fitW = (w, maxW) => +Math.max(W_MIN * .75, Math.min(w, maxW)).toFixed(2);

// Widest base a district plot takes (district positions and radii stay exactly as they were):
//   hub plot  (distR = 3w+28 etc.): the pad (2.05 w) stays inside the inner ring road (62% of the radius) with 3.5 m to spare.
//   minor plot (distR = 3.4w+5, incl. promoted districts): the satellite band (distR - 2.5w - 2) keeps at least 2 m.
export const plotMaxW = (distR, minor = false) => minor ? Math.max(W_MIN, (distR - 4) / 2.5) : Math.max(W_MIN, (distR * .62 - 3.5) / 2.05);

export const GRADE_ID = { plain: 0, standard: 1, grand: 2 };
export const shapeMode = search => (new URLSearchParams(search || '').get('shape') === 'classic' ? 'classic' : 'shaped');
