'use strict';

const { authorizeEstateAction } = require('./estates-access-policy.js');

const GRID = 0.5;
const BUILDINGS = Object.freeze({
  barricade: Object.freeze({ width: 2, depth: 0.5, height: 1.2, cost: { timber: 8 } }),
  garden: Object.freeze({ width: 2, depth: 2, height: 0.4, cost: { timber: 4, water: 2 } }),
  generator: Object.freeze({ width: 2.5, depth: 2, height: 2, cost: { metal: 12, components: 4 } }),
  storage_shed: Object.freeze({ width: 3, depth: 2.5, height: 2.4, cost: { timber: 18, metal: 3 } }),
  workshop: Object.freeze({ width: 5, depth: 4, height: 3.2, cost: { timber: 30, metal: 12, components: 6 } })
});

function fail(reason) {
  return Object.freeze({ ok: false, reason });
}
function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
function snap(n) { return Math.round(n / GRID) * GRID; }
function footprint(width, depth, rotationY) {
  const quarter = Math.round(rotationY / (Math.PI / 2));
  const rotated = Math.abs(quarter % 2) === 1;
  return { width: rotated ? depth : width, depth: rotated ? width : depth };
}
function overlaps(a, b) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
    Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;
}

/**
 * Validate a proposed build using trusted server-side lot, session, grant, and
 * saved-placement data. Do not expose this function as a route that accepts
 * those objects directly from an untrusted client.
 */
function planEstatePlacement({
  principal, grant, lot, buildingType, position, rotationY = 0,
  existingPlacements = [], now = Date.now(), placementId
} = {}) {
  if (!lot || typeof lot.propertyId !== 'string' || !lot.propertyId.trim()) return fail('mapped-property-required');
  if (!finite(lot.x) || !finite(lot.z) || !finite(lot.width) || !finite(lot.depth) ||
      lot.width <= 0 || lot.depth <= 0) return fail('invalid-lot');
  if (!principal || principal.authenticated !== true) return fail('authentication-required');
  if (!BUILDINGS[buildingType]) return fail('unknown-building-type');
  if (!position || !finite(position.x) || !finite(position.z) || !finite(rotationY)) return fail('invalid-placement');
  if (!Array.isArray(existingPlacements)) return fail('invalid-existing-placements');
  if (typeof placementId !== 'string' || !placementId.trim()) return fail('placement-id-required');

  const decision = authorizeEstateAction({
    area: 'private', action: 'build', principal,
    propertyId: lot.propertyId, grant, now
  });
  if (!decision.allowed) return fail('authorization:' + decision.reason);

  const definition = BUILDINGS[buildingType];
  // Restrict rotations to quarter turns so collision footprints stay axis-aligned.
  const quarterTurns = Math.round(rotationY / (Math.PI / 2));
  if (Math.abs(rotationY - quarterTurns * (Math.PI / 2)) > 1e-6) return fail('rotation-must-be-quarter-turn');
  const rotation = ((quarterTurns % 4) + 4) % 4 * Math.PI / 2;
  const size = footprint(definition.width, definition.depth, rotation);
  const x = snap(position.x), z = snap(position.z);
  const halfW = size.width / 2, halfD = size.depth / 2;
  const minX = lot.x - lot.width / 2, maxX = lot.x + lot.width / 2;
  const minZ = lot.z - lot.depth / 2, maxZ = lot.z + lot.depth / 2;
  if (x - halfW < minX || x + halfW > maxX || z - halfD < minZ || z + halfD > maxZ) {
    return fail('outside-lot-boundary');
  }
  const candidate = { placementId, propertyId: lot.propertyId, buildingType, x, z, width: size.width, depth: size.depth };
  for (const saved of existingPlacements) {
    if (!saved || saved.propertyId !== lot.propertyId) continue;
    if (saved.placementId === placementId) return fail('duplicate-placement-id');
    if (![saved.x, saved.z, saved.width, saved.depth].every(finite) || saved.width <= 0 || saved.depth <= 0) {
      return fail('invalid-saved-placement');
    }
    if (overlaps(candidate, saved)) return fail('overlaps-existing-building');
  }

  return Object.freeze({
    ok: true,
    placement: Object.freeze({
      ...candidate, y: 0, rotationY: rotation,
      height: definition.height,
      cost: Object.freeze({ ...definition.cost }),
      grid: GRID, status: 'validated-not-persisted'
    })
  });
}

module.exports = { BUILDINGS, GRID, planEstatePlacement };
