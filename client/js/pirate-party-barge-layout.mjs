// Coordinates follow the existing docks: dir points into the lake.
export const BARGE_DECK_Y = 3.8;
const HALF_WIDTH = 11;
const STERN = -22;
const BOW = 22;
export const PIER_START = -4;
export const PIER_RAMP_END = 12;

export function findPartyBargeBerth({ shoreAt, inLake, dir, side, decks, colliders }) {
  for (const across of [-150, -175, -200, 70, 120, 150, 175]) {
    const shore = shoreAt(across);
    const point = (u, v) => ({
      x: shore.x + side.x * u + dir.x * v,
      z: shore.z + side.z * u + dir.z * v,
    });
    const start = point(0, PIER_START);
    if (inLake(start.x, start.z)) continue;
    const blocked = (u, v, padding) => {
      const p = point(u, v);
      return decks.some(d => {
        const dx = p.x - d.base.x, dz = p.z - d.base.z;
        const along = dx * d.dir.x + dz * d.dir.z;
        const across = dx * d.side.x + dz * d.side.z;
        return along > d.v0 - padding && along < d.v1 + padding && Math.abs(across) < d.hw + padding;
      });
    };
    for (const offset of [40, 46, 52]) {
      // Include the bow, rails and several metres of clear water around the hull.
      const footprint = [-15, -10, -5, 0, 5, 10, 15].flatMap(u =>
        [-29, -23, -16, -8, 0, 8, 16, 23, 31].map(v => [u, offset + v]));
      if (footprint.some(([u, v]) => {
        const p = point(u, v);
        return !inLake(p.x, p.z) || blocked(u, v, 7);
      })) continue;
      const pierEnd = offset + STERN + 1;
      const pierSamples = [-4, 0, 4].flatMap(u =>
        Array.from({ length: pierEnd - PIER_START + 1 }, (_, i) => [u, i + PIER_START]));
      if (pierSamples.some(([u, v]) => {
        const p = point(u, v);
        return blocked(u, v, 5) || colliders.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 1.5);
      })) continue;
      const site = point(0, offset);
      const pierHeight = v => BARGE_DECK_Y * Math.min(1, (v - PIER_START) / (PIER_RAMP_END - PIER_START));
      return {
        site, shore, pierEnd, pierHeight, yaw: Math.atan2(dir.x, dir.z),
        decks: [
          { base: shore, dir, side, v0: PIER_START, v1: pierEnd, hw: 1.9, heightAt: pierHeight },
          { base: site, dir, side, v0: STERN, v1: BOW, hw: HALF_WIDTH, h: BARGE_DECK_Y },
        ],
      };
    }
  }
  return null;
}

export function partyBargeBlocksBoat(berth, x, z) {
  const { dir, side } = berth.decks[0];
  const dx = x - berth.site.x, dz = z - berth.site.z;
  const u = Math.abs(dx * side.x + dz * side.z);
  const v = dx * dir.x + dz * dir.z;
  const bowWidth = Math.min(12, Math.max(0, (31 - v) * 1.8));
  const shoreX = x - berth.shore.x, shoreZ = z - berth.shore.z;
  const alongPier = shoreX * dir.x + shoreZ * dir.z;
  return (v > -26 && v < 31 && u < bowWidth)
    || (u < 3.5 && alongPier > PIER_START && alongPier < berth.pierEnd);
}
