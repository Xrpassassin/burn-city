'use strict';
// Elevated gun platforms for the Homefront refuge yard: a 2.2 × 2.2 deck 2.4 units up with a
// stair ramp on its local +z side. Pure geometry shared by the server (line of sight, posts,
// placement) and mirrored in client/arena/homefront-platforms.mjs (walking, camera, rendering);
// test/homefront-platforms.test.mjs checks the two agree on random points.
const DECK_HEIGHT = 2.4, DECK_HALF = 1.1, STAIR_HALF_WIDTH = 0.45, STAIR_LENGTH = 2.6, MAX_STEP = 0.45;
const EYE = 1.5;                 // shooter eye above the floor they stand on
const YARD_HALF = 9.5;           // build bounds (same clamp as homefront-core)
const PLATFORM_GAP = 2.6;        // centre spacing between a platform and anything else
// Approximate standing heights of yard structures, used to decide what blocks a shot.
const BLOCK_HEIGHT = Object.freeze(Object.assign(Object.create(null), {
  wall: 1.7, gate: 1.9, entrance: 1.9, exit: 1.9, watchtower: 2.6, sandbags: 0.8, barbed_wire: 0.65, trench: 0.3,
  turret: 1.1, workshop: 1.5, storage: 1.4, infirmary: 1.6, garden: 0.4, quarry: 1.3, smelter: 1.8, salvage_yard: 1.2,
  gun_platform: 0, mortar_pit: 0.5
}));
const BLOCK_RADIUS = 0.9;

function toLocal(p, x, z) {
  const r = Number.isFinite(p.rotation) ? p.rotation : 0, c = Math.cos(r), s = Math.sin(r);
  const dx = x - p.x, dz = z - p.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
function toWorld(p, lx, lz) {
  const r = Number.isFinite(p.rotation) ? p.rotation : 0, c = Math.cos(r), s = Math.sin(r);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}
function platformHeight(p, x, z) {
  const { lx, lz } = toLocal(p, x, z);
  if (Math.abs(lx) <= DECK_HALF && Math.abs(lz) <= DECK_HALF) return DECK_HEIGHT;
  if (Math.abs(lx) <= STAIR_HALF_WIDTH && lz > DECK_HALF && lz <= DECK_HALF + STAIR_LENGTH) return DECK_HEIGHT * (1 - (lz - DECK_HALF) / STAIR_LENGTH);
  return 0;
}
function platformsOf(structures) { return (Array.isArray(structures) ? structures : []).filter(s => s && s.type === 'gun_platform' && s.hp > 0); }
function heightAt(structures, x, z) {
  let h = 0;
  for (const p of platformsOf(structures)) h = Math.max(h, platformHeight(p, x, z));
  return h;
}
// Walking: a step is allowed when the floor height changes by at most MAX_STEP, so the stairs
// work in both directions but the deck sides act as railings (no climbing or falling off).
function canStep(structures, fromX, fromZ, toX, toZ) {
  const d = Math.hypot(toX - fromX, toZ - fromZ), n = Math.max(1, Math.ceil(d / 0.2));
  let prev = heightAt(structures, fromX, fromZ);
  for (let i = 1; i <= n; i++) {
    const t = i / n, h = heightAt(structures, fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t);
    if (Math.abs(h - prev) > MAX_STEP) return false;
    prev = h;
  }
  return true;
}
// Line of sight from an eye point to a target point: blocked when the segment passes over a
// structure footprint lower than that structure's height. Elevated platforms see over walls.
function lineOfSight(structures, from, to, ignoreId = null) {
  const dx = to.x - from.x, dz = to.z - from.z, len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return true;
  for (const s of Array.isArray(structures) ? structures : []) {
    if (!s || s.hp <= 0 || s.id === ignoreId) continue;
    const h = BLOCK_HEIGHT[s.type] || 0;
    if (h <= 0) continue;
    const t = Math.max(0, Math.min(1, ((s.x - from.x) * dx + (s.z - from.z) * dz) / len2));
    if (t <= 0.02 || t >= 0.98) continue;
    const px = from.x + dx * t, pz = from.z + dz * t;
    if (Math.hypot(s.x - px, s.z - pz) > BLOCK_RADIUS) continue;
    const y = from.y + (to.y - from.y) * t;
    if (y < h) return false;
  }
  return true;
}
// Placement: platforms (deck + stairs) need more room than the 1.65 default spacing.
function structureGap(typeA, typeB) {
  if (typeA === 'gun_platform' || typeB === 'gun_platform') return PLATFORM_GAP;
  if (typeA === 'barbed_wire' || typeB === 'barbed_wire') return 1.0;
  return 1.65;
}
// The stair foot must stay inside the yard so the ramp is always walkable.
function footprintInBounds(type, x, z, rotation = 0) {
  if (Math.abs(x) > YARD_HALF || Math.abs(z) > YARD_HALF) return false;
  if (type !== 'gun_platform') return true;
  const foot = toWorld({ x, z, rotation }, 0, DECK_HALF + STAIR_LENGTH);
  return Math.abs(foot.x) <= YARD_HALF + 0.4 && Math.abs(foot.z) <= YARD_HALF + 0.4 && Math.hypot(foot.x, foot.z) >= 1.9;
}
// Where a defender or guard stands: the deck centre of a platform, or the ground.
function postEye(structure) {
  if (structure && structure.type === 'gun_platform') return { x: structure.x, y: DECK_HEIGHT + EYE, z: structure.z, elevated: true };
  if (structure) return { x: structure.x, y: EYE, z: structure.z, elevated: false };
  return null;
}
// Path a guard (or avatar) walks from the stair foot up to the deck centre.
function stairPath(p) {
  return [toWorld(p, 0, DECK_HALF + STAIR_LENGTH + 0.3), toWorld(p, 0, DECK_HALF + STAIR_LENGTH * 0.5), toWorld(p, 0, DECK_HALF), toWorld(p, 0, 0)]
    .map(q => ({ x: q.x, z: q.z, y: platformHeight(p, q.x, q.z) }));
}
module.exports = { DECK_HEIGHT, DECK_HALF, STAIR_HALF_WIDTH, STAIR_LENGTH, MAX_STEP, EYE, YARD_HALF, PLATFORM_GAP, BLOCK_HEIGHT, toLocal, toWorld, platformHeight, heightAt, canStep, lineOfSight, platformsOf, structureGap, footprintInBounds, postEye, stairPath };
