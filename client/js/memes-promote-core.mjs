// Promoted meme districts: pure placement (no three.js, no DOM). Used by app.js at layout time; tested by memes-promote-core.test.mjs.
// Server side: server/memes-promote.js picks the tokens (top 25 of the Alpha List that are not already city districts, with
// hysteresis) and eco.js turns them into ordinary ECO nodes + pools flagged `promoted`.
// Placement rule (Derrik, Nov 27, 2026: keep everything that exists): each district goes just outside the Circle of XRPL Memes
// quarter, as close as possible to its own zone's wedge (Kings Row, Grinder Yards, Degen Strip), clear of the quarter disc, its
// Market Street approach road, the downtown tower field, the power station, the wind farm, the airport band, the Wilds gate,
// the Estates lake/bridge, AEGIS and every existing district. Deterministic: same input, same layout.
import { QUARTER, ORDER, zoneAngles } from './memes-circle-core.mjs';

// The quarter's home: the spot pickCenter() lands on with today's city (r 500 at 3.63 rad, HANDOFF "City layout audit").
// When promoted districts exist, memes-circle.mjs uses this exact centre so the districts and the quarter always line up.
export const HOME = { x: +(Math.cos(3.63) * 500).toFixed(2), z: +(Math.sin(3.63) * 500).toFixed(2) };
export const quarterA0 = cen => Math.atan2(-cen.z, -cen.x) + Math.PI / 4;   // same a0 as memes-circle.mjs init()

// Fixed landmarks outside downtown (measured in the running city, HANDOFF "City layout audit"; citylife power plant a 2.6 r 440,
// wind farm wa = 2.98 ± 0.24 rad, r 520-610; airport z < -426; Wilds gate (0, 394); Estates lake ≈ (363, 69) + its bridge from
// ≈ (234, 22); AEGIS pyramid (84, 214)). Pads are generous on purpose: citylife claims its lots AFTER the towers are built.
export const LANDMARKS = {
  discs: [
    { id: 'power', x: Math.cos(2.6) * 440, z: Math.sin(2.6) * 440, r: 62 },
    { id: 'wilds-gate', x: 0, z: 394, r: 40 },
    { id: 'lake', x: 363, z: 69, r: 140 },
    { id: 'estates-bridge', x: 270, z: 40, r: 40 },
    { id: 'aegis', x: 84, z: 214, r: 30 },
  ],
  bands: [{ id: 'wind-farm', a0: 2.6, a1: 3.36, r0: 492, r1: 645 }],
  zmin: -416,        // airport (z < -426) + 10 m
  cityR: 340,        // downtown tower field (the quarter itself keeps 330 m clear of the centre)
  maxR: 1080,        // stay well inside the ground disc (1420) and the mountains (1500)
};

const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); return a < 0 ? a + Math.PI : a - Math.PI; };
const segD = (x, z, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l)); return Math.hypot(a.x + u * dx - x, a.z + u * dz - z); };

// items: [{ name, q, r }] in priority order (Alpha rank), r = district radius (app.js distR). taken: existing districts [{x,z,r}].
// Returns [{ name, x, z, zone, ang, ring }] (ang = angle around the quarter centre); items that found no spot are left out.
export function placePromoted(items, { cen = HOME, R = QUARTER.R, a0 = quarterA0(cen), taken = [], marks = LANDMARKS, gap = 5, step = 7, rings = 34 } = {}) {
  const A = zoneAngles(a0), mkt = a0 - Math.PI / 4;
  const gate = { x: cen.x + Math.cos(mkt) * R, z: cen.z + Math.sin(mkt) * R };
  const L = Math.hypot(gate.x, gate.z), k = Math.max(.1, 320 / L), roadEnd = { x: gate.x * k, z: gate.z * k };
  const placed = [], out = [];
  const clear = (x, z, r) => {
    const d0 = Math.hypot(x, z); if (d0 - r < marks.cityR || d0 + r > marks.maxR) return false;
    if (z - r < marks.zmin) return false;
    if (Math.hypot(x - cen.x, z - cen.z) < R + 9 + r + 4) return false;                       // the quarter's ground disc + rim road
    if (segD(x, z, gate, roadEnd) < 6 + r + 6) return false;                                    // Market Street approach road
    for (const m of marks.discs) if (Math.hypot(x - m.x, z - m.z) < m.r + r) return false;
    for (const b of marks.bands) { const a = Math.atan2(z, x), aa = a < 0 ? a + 2 * Math.PI : a, pad = r / Math.max(1, d0);
      if (aa > b.a0 - pad && aa < b.a1 + pad && d0 + r > b.r0 && d0 - r < b.r1) return false; }
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < t.r + r + gap) return false;
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < p.r + r + gap) return false;
    return true;
  };
  for (const it of items) {
    const zone = A[it.q] != null && it.q !== 'watchline' ? it.q : 'kings', want = A[zone], r = Math.max(8, +it.r || 12);
    let best = null, bs = Infinity;
    for (let ring = 0; ring < rings; ring++) {
      const rr = R + 13 + r + ring * step; if ((ring * step) * .8 >= bs) break;   // farther rings cannot beat the best score any more
      const n = Math.ceil(Math.PI * rr / step);
      for (let j = 0; j <= n; j++) for (const s of j ? [1, -1] : [1]) {
        const off = s * j * step / rr; if (Math.abs(off) > Math.PI) continue;
        const score = Math.abs(off) * rr + ring * step * .8; if (score >= bs) continue;
        const x = cen.x + Math.cos(want + off) * rr, z = cen.z + Math.sin(want + off) * rr;
        if (!clear(x, z, r)) continue; bs = score; best = { name: it.name, x: +x.toFixed(2), z: +z.toFixed(2), zone, ang: +wrap(want + off).toFixed(4), ring, r };
      }
    }
    if (best) { placed.push(best); out.push(best); }
  }
  return out;
}

// which zone a promoted spot is "beside": the wedge whose centre line is closest in angle
export function besideZone(x, z, cen, a0) { const A = zoneAngles(a0), a = Math.atan2(z - cen.z, x - cen.x); let best = null, bd = 9;
  for (const id of ORDER) { const d = Math.abs(wrap(a - A[id])); if (d < bd) { bd = d; best = id; } } return best; }
