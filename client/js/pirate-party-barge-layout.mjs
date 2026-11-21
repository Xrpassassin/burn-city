// Blacktide: a moored pirate galleon (Quaternius "Ship_Large", CC0) at cruise-ship scale.
// Coordinates follow the existing docks: dir points into the lake, side runs along the shore.
// The ship lies broadside to the shore; a long gangway climbs from the beach to its main deck.

// Model space (bow toward -x). `f` is metres forward of the model origin in model units (f = -x).
export const SHIP_MODEL = {
  waterY: -0.5,          // model y that sits on the lake surface
  bow: 9.52, stern: -5.92, // f extent incl. bowsprit
  beam: 2.65,            // half-beam incl. cannons
  deckHalf: 1.85,        // walkable half-width inside the rails
  boardF: -0.9,          // gangway lands mid main deck, clear of the deck cannon and main mast
  mainMastF: -1.8, foreMastF: 3.4,
};
export const SHIP_SCALES = [12, 10, 8];   // ~185 m, then smaller if the lake is crowded
export const PIER_START = -6;
const PIER_FLAT = 4;                        // level boardwalk on the beach before the climb
const MIN_RUN_PER_RISE = 2.8;               // gangway no steeper than ~20 degrees

// Deck height (model y) along the ship: quarterdeck, stairs, main deck, stairs, forecastle.
export function shipDeckModelY(f) {
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
  if (f < -3.25) return 1.9;
  if (f < -2.5) return lerp(1.9, 1.0, (f + 3.25) / .75);
  if (f < 1.5) return 1.0;
  if (f < 2.25) return lerp(1.0, 1.5, (f - 1.5) / .75);
  return 1.5;
}
export const shipDeckY = (f, scale) => (shipDeckModelY(f) - SHIP_MODEL.waterY) * scale;
export const mainDeckY = scale => shipDeckY(SHIP_MODEL.boardF, scale);

export function findPartyBargeBerth({ shoreAt, inLake, dir, side, decks, colliders }) {
  for (const scale of SHIP_SCALES) {
    const halfBeam = SHIP_MODEL.beam * scale, rail = SHIP_MODEL.deckHalf * scale;
    const deckY = mainDeckY(scale);
    const minOffset = Math.ceil(PIER_FLAT + deckY * MIN_RUN_PER_RISE + rail - PIER_START);
    // Ship forward runs along +side; the gangway (u = 0) meets the deck at boardF.
    const sternU = (SHIP_MODEL.stern - SHIP_MODEL.boardF) * scale, bowU = (SHIP_MODEL.bow - SHIP_MODEL.boardF) * scale;
    for (const across of [-150, -175, -200, -120, 70, 100, 120, 150, 175]) {
      const shore = shoreAt(across);
      if (!shore) continue;
      const point = (u, v) => ({ x: shore.x + side.x * u + dir.x * v, z: shore.z + side.z * u + dir.z * v });
      const start = point(0, PIER_START);
      if (inLake(start.x, start.z)) continue;
      const blocked = (u, v, padding) => {
        const p = point(u, v);
        return decks.some(d => {
          const dx = p.x - d.base.x, dz = p.z - d.base.z;
          const along = dx * d.dir.x + dz * d.dir.z, off = dx * d.side.x + dz * d.side.z;
          return along > d.v0 - padding && along < d.v1 + padding && Math.abs(off) < d.hw + padding;
        });
      };
      for (const offset of [minOffset, minOffset + 8, minOffset + 16]) {
        const us = [], vs = [];
        for (let u = sternU - 6; u <= bowU + 6; u += (bowU - sternU + 12) / 14) us.push(u);
        for (let v = -halfBeam - 6; v <= halfBeam + 6; v += (halfBeam + 6) / 3) vs.push(offset + v);
        if (us.some(u => vs.some(v => { const p = point(u, v); return !inLake(p.x, p.z) || blocked(u, v, 6); }))) continue;
        const pierEnd = offset - rail + 3;
        const samples = [];
        for (let v = PIER_START; v <= pierEnd; v += 2) for (const u of [-3, 0, 3]) samples.push([u, v]);
        if (samples.some(([u, v]) => {
          const p = point(u, v);
          return blocked(u, v, 4) || colliders.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 1.5);
        })) continue;
        const climb0 = PIER_START + PIER_FLAT, climb1 = offset - rail;
        const pierHeight = v => deckY * Math.min(1, Math.max(0, (v - climb0) / (climb1 - climb0)));
        const site = point(0, offset);                // ship centreline at the gangway
        const origin = point(-SHIP_MODEL.boardF * scale, offset); // model origin (f = 0)
        const fwd = { x: side.x, z: side.z };
        const across2 = { x: dir.x, z: dir.z };       // ship's own "side" axis (toward the lake)
        const deckAt = { base: origin, dir: fwd, side: across2 };
        return {
          scale, deckY, site, shore, origin, fwd, offset, pierEnd, pierHeight,
          yaw: Math.atan2(dir.x, dir.z), shipYaw: Math.atan2(fwd.x, fwd.z),
          decks: [
            { base: shore, dir, side, v0: PIER_START, v1: pierEnd, hw: 2.2, heightAt: pierHeight },
            { ...deckAt, v0: -5.5 * scale, v1: 4.5 * scale, hw: SHIP_MODEL.deckHalf * scale,
              heightAt: v => shipDeckY(v / scale, scale) },
            { ...deckAt, v0: 4.5 * scale, v1: 6.3 * scale, hw: 1.05 * scale, heightAt: v => shipDeckY(v / scale, scale) },
          ],
        };
      }
    }
  }
  return null;
}

export function partyBargeBlocksBoat(berth, x, z) {
  const { origin, fwd, scale, shore, pierEnd } = berth;
  const dx = x - origin.x, dz = z - origin.z;
  const f = (dx * fwd.x + dz * fwd.z) / scale;          // forward along the ship (model units)
  const u = Math.abs(dx * fwd.z - dz * fwd.x) / scale;  // off the centreline
  // Hull half-width tapers to the bow; the bowsprit adds a thin spar.
  const half = f < SHIP_MODEL.stern - .3 || f > SHIP_MODEL.bow + .3 ? -1
    : f > 4.5 ? Math.max(.35, SHIP_MODEL.beam * (1 - (f - 4.5) / 3.2))
    : SHIP_MODEL.beam + .25;
  const { dir } = berth.decks[0];
  const sx = x - shore.x, sz = z - shore.z;
  const along = sx * dir.x + sz * dir.z, off = Math.abs(sx * dir.z - sz * dir.x);
  return u < half || (off < 3.5 && along > PIER_START && along < pierEnd);
}
