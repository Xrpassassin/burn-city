'use strict';

// Pure, fail-closed contract for an Estates waterfront -> BURN City boat transition.
// Call only with server-resolved ownership, property, dock, and boat records.
// This module prepares a route plan; it does not authenticate wallets, reserve boats,
// persist an idempotency key, or perform a world transition.

const XRPL_ACCOUNT = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const WORLDS = Object.freeze({ ESTATES: 'estates-island', CITY: 'burn-city' });

function deny(reason) {
  return Object.freeze({ allowed: false, reason });
}

function buildWaterfrontLaunchPlan({
  account,
  property,
  dock,
  boat,
  destinationWorld = WORLDS.CITY,
  transitionId,
  spawnAnchor,
  now = Date.now()
} = {}) {
  if (typeof account !== 'string' || !XRPL_ACCOUNT.test(account)) {
    return deny('verified-account-required');
  }
  if (!property || typeof property !== 'object' || typeof property.id !== 'string' ||
      !property.id.trim()) return deny('server-property-required');
  if (property.waterfront !== true) return deny('waterfront-property-required');
  if (property.ownerAccount !== account) return deny('verified-owner-required');
  if (!dock || typeof dock !== 'object' || typeof dock.id !== 'string' ||
      !dock.id.trim() || dock.propertyId !== property.id || dock.status !== 'active') {
    return deny('active-property-dock-required');
  }
  if (!boat || typeof boat !== 'object' || typeof boat.id !== 'string' ||
      !boat.id.trim()) return deny('server-boat-required');
  if (boat.ownerAccount !== account) return deny('verified-boat-owner-required');
  if (boat.status !== 'docked' || boat.dockId !== dock.id) {
    return deny('boat-not-docked-at-authorized-dock');
  }
  if (destinationWorld !== WORLDS.CITY) return deny('unsupported-destination-world');
  if (typeof transitionId !== 'string' || !ID.test(transitionId)) {
    return deny('valid-transition-id-required');
  }
  if (typeof spawnAnchor !== 'string' || !ID.test(spawnAnchor)) {
    return deny('server-spawn-anchor-required');
  }
  if (!Number.isSafeInteger(now) || now < 0) return deny('invalid-clock');

  // Explicit allowlist prevents client-facing route envelopes from copying arbitrary
  // wallet, inventory, or server fields into a second world.
  const boatSnapshot = Object.freeze({
    id: boat.id,
    classId: typeof boat.classId === 'string' ? boat.classId : 'unknown',
    tier: Number.isSafeInteger(boat.tier) && boat.tier >= 0 ? boat.tier : 0,
    hull: Number.isFinite(boat.hull) && boat.hull >= 0 ? boat.hull : null,
    fuel: Number.isFinite(boat.fuel) && boat.fuel >= 0 ? boat.fuel : null
  });

  return Object.freeze({
    allowed: true,
    reason: 'waterfront-launch-plan-prepared',
    transitionId,
    playerAccount: account,
    propertyId: property.id,
    dockId: dock.id,
    fromWorld: WORLDS.ESTATES,
    toWorld: WORLDS.CITY,
    spawnAnchor,
    issuedAt: now,
    boat: boatSnapshot,
    requiresAtomicReservation: true
  });
}

module.exports = { buildWaterfrontLaunchPlan, WORLDS };
