// Pure layout logic for the CC BY sci-fi street buildings around the district towers (citybuildings2.mjs renders them).
// Brief: docs/burn-city-street-building-models.md (PR #631). Every model is by Scarecrow_original, CC BY 4.0 (city-credits.html).

// Frozen district -> model mapping by token name (never re-derived from market cap, so neighbourhoods keep their look).
// BURN's Building 7 is fixed by the brief; IMM and XRPyro are the brief's proposed assignments. IMG, DRGN and RACC are the extra
// BURN-ecosystem districts the owner confirmed for the brief's four remaining models; RACC, the largest of the three, mixes two models
// (each lot takes whichever silhouette fits it best, the street-facing hash breaking ties) so its blocks don't read as clones.
export const ASSIGN = { BURN: ['b7'], IMM: ['b10'], XRPyro: ['b11'], IMG: ['b4'], DRGN: ['b6'], RACC: ['b1', 'b5'] };
export const MODELS = {
  b7: { title: 'Sci-fi building 7', uid: 'b26b4ace15bd48259fcf235d31eec7c8', srcTris: 4178 },
  b10: { title: 'Sci-fi Building 10', uid: '08f1f006b4bb4e04831555cfc1a3ea49', srcTris: 6772 },
  b11: { title: 'Sci-fi Building 11', uid: 'd3029779c7e54ee6afa3890b42a32098', srcTris: 4328 },
  b4: { title: 'Sci-fi Building 4', uid: 'a07af3b8c6c045d89a37a3b3cde7be1b', srcTris: 39054 },
  b1: { title: 'Sci-fi Building', uid: '570874c83da24c788c0f247a51a6814d', srcTris: 1406 },
  b6: { title: 'Sci-fi Building 6', uid: 'e1ec43d7bf1146789553000f49e7e060', srcTris: 2032 },
  b5: { title: 'Sci-fi Building 5', uid: '01bbf6d3b3424694b4c6a1e4693af104', srcTris: 18032 },
};

export function assignment(names) {
  const out = {}; const have = new Set(names);
  for (const [k, m] of Object.entries(ASSIGN)) if (have.has(k)) out[k] = m;
  return out;
}

export function budget(tier, mobile) {
  if (tier === 'low') return { perDistrict: 10, lod: 60, minH: 7 };
  if (mobile || tier === 'medium') return { perDistrict: 20, lod: 90, minH: 6 };
  return { perDistrict: 40, lod: 160, minH: 5 };
}

const segD = (x, z, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l)); return [Math.hypot(a.x + u * dx - x, a.z + u * dz - z), a.x + u * dx, a.z + u * dz]; };
// yaw that turns the model's +Z (its front) toward the nearest street
export function streetYaw(x, z, streets, fallback = 0) {
  let best = 1e9, px = null, pz = null;
  for (const s of streets || []) {
    if (s.type === 'ring') { const dx = x - s.c.x, dz = z - s.c.z, d = Math.hypot(dx, dz) || 1, g = Math.abs(d - s.r); if (g < best) { best = g; px = s.c.x + dx / d * s.r; pz = s.c.z + dz / d * s.r; } }
    else { const [g, qx, qz] = segD(x, z, s.a, s.b); if (g < best) { best = g; px = qx; pz = qz; } }
  }
  if (px == null || best < 1e-3) return fallback;
  return Math.atan2(px - x, pz - z);
}

// Fit a model (dims: rXZ = max horizontal radius from its centre, H = height, in model units) inside a lot. The lot's collider is a circle of
// radius 1.02*w, so the model's whole footprint stays inside the existing collision at any yaw. Height follows the lot's procedural height;
// a model may be stretched vertically up to 35% to reach it. Returns null when the silhouette cannot fit (lot stays procedural).
export function fitLot(s, dims, minH = 5) {
  const top = s.top || s.h; if (!(top >= minH)) return null;
  const kf = (s.w * 1.0) / dims.rXZ, kh = top / dims.H;
  const k = Math.min(kf, kh), sy = Math.min(k * 1.35, kh);
  const h = sy * dims.H; if (h < top * .5) return null;
  return { k, sy, h, r: k * dims.rXZ };
}

// Shared infill block -> the one district it unambiguously belongs to (the brief allows this): just outside that district's outer ring
// (gap <= near) and clearly closer to it than to any other district (by at least margin). hubs: [{name, x, z, R}]. Else null.
export function infillOwner(x, z, hubs, near = 36, margin = 18) {
  let a = null, ga = 1e9, gb = 1e9;
  for (const h of hubs) { const g = Math.hypot(x - h.x, z - h.z) - h.R; if (g < ga) { gb = ga; ga = g; a = h; } else if (g < gb) gb = g; }
  return a && ga <= near && gb - ga >= margin ? a.name : null;
}

// Eligible lots: ordinary filler satellites around a token tower (s.n set) and, when owner() names a district, the shared infill blocks
// right outside it. Never holder buildings (they carry holder data), towers, shops, Estates or anything with a door (not in sats).
export function pickLots(sats, map, dimsOf, streets, B, avoid = [], owner = null) {
  const per = {}, out = [], skipped = {};
  // district fillers first, then the closest infill, so the cap keeps the lots nearest the tower
  const cand = [];
  for (const s of sats) {
    if (!s || s.holder) continue;
    if (s.n && !s.infill) cand.push([s, s.n.name, 0]);
    else if (s.infill && owner) { const o = owner(s); if (o) cand.push([s, o, 1]); }
  }
  cand.sort((p, q) => p[2] - q[2]);
  for (const [s, name] of cand) {
    const list = [].concat(map[name] || []).filter(m => dimsOf(m)); if (!list.length) continue;
    if (avoid.some(a => Math.hypot(s.x - a.x, s.z - a.z) < a.r + s.w * 1.02 + 2)) { skipped[name] = (skipped[name] || 0) + 1; continue; }
    if ((per[name] || 0) >= B.perDistrict) { skipped[name] = (skipped[name] || 0) + 1; continue; }
    const fits = list.map(m => [m, fitLot(s, dimsOf(m), B.minH)]).filter(x => x[1]);
    if (!fits.length) { skipped[name] = (skipped[name] || 0) + 1; continue; }
    // best fill of the lot's height; models within 15% of the best are picked by a position hash for variety
    const top = Math.max(...fits.map(x => x[1].h)), ok = fits.filter(x => x[1].h >= top * .85), [model, f] = ok[Math.floor(hash(s.x, s.z) * ok.length) % ok.length];
    per[name] = (per[name] || 0) + 1;
    out.push({ s, model, name, x: s.x, z: s.z, yaw: streetYaw(s.x, s.z, streets, s.rot), ...f });
  }
  return { lots: out, per, skipped };
}

// deterministic per-lot variation (subtle tint) from position
export const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
