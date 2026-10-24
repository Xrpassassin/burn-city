'use strict';

const assert = require('node:assert/strict');
const { buildWaterfrontLaunchPlan, WORLDS } = require('./estates-waterfront-transit');

const owner = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const guest = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
const property = { id: 'mansion-01', waterfront: true, ownerAccount: owner };
const dock = { id: 'dock-mansion-01', propertyId: property.id, status: 'active' };
const boat = { id: 'boat-17', ownerAccount: owner, status: 'docked', dockId: dock.id, classId: 'offshore-cruiser', tier: 3, hull: 92, fuel: 41, secret: 'must-not-cross-world-boundary' };
const base = { account: owner, property, dock, boat, transitionId: 'transition:abc123', spawnAnchor: 'city-harbor-west', now: 1000 };

const plan = buildWaterfrontLaunchPlan(base);
assert.equal(plan.allowed, true);
assert.equal(plan.fromWorld, WORLDS.ESTATES);
assert.equal(plan.toWorld, WORLDS.CITY);
assert.equal(plan.propertyId, property.id);
assert.equal(plan.dockId, dock.id);
assert.equal(plan.boat.id, boat.id);
assert.equal(plan.boat.tier, 3);
assert.equal(plan.requiresAtomicReservation, true);
assert.equal(Object.hasOwn(plan.boat, 'secret'), false);
assert.equal(Object.isFrozen(plan), true);
assert.equal(Object.isFrozen(plan.boat), true);

for (const [label, input, reason] of [
  ['bad account', { ...base, account: 'not-a-wallet' }, 'verified-account-required'],
  ['non-waterfront property', { ...base, property: { ...property, waterfront: false } }, 'waterfront-property-required'],
  ['not owner', { ...base, account: guest }, 'verified-owner-required'],
  ['property mismatch dock', { ...base, dock: { ...dock, propertyId: 'other-property' } }, 'active-property-dock-required'],
  ['inactive dock', { ...base, dock: { ...dock, status: 'disabled' } }, 'active-property-dock-required'],
  ['boat owned by someone else', { ...base, boat: { ...boat, ownerAccount: guest } }, 'verified-boat-owner-required'],
  ['boat underway', { ...base, boat: { ...boat, status: 'underway' } }, 'boat-not-docked-at-authorized-dock'],
  ['wrong dock', { ...base, boat: { ...boat, dockId: 'public-dock' } }, 'boat-not-docked-at-authorized-dock'],
  ['unsupported world', { ...base, destinationWorld: 'estates-island' }, 'unsupported-destination-world'],
  ['missing transition id', { ...base, transitionId: '' }, 'valid-transition-id-required'],
  ['missing spawn anchor', { ...base, spawnAnchor: '' }, 'server-spawn-anchor-required'],
  ['invalid time', { ...base, now: NaN }, 'invalid-clock']
]) {
  assert.equal(buildWaterfrontLaunchPlan(input).allowed, false, label);
  assert.equal(buildWaterfrontLaunchPlan(input).reason, reason, label);
}

console.log('estates waterfront transit contract: 35 assertions passed');
