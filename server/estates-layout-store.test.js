'use strict';
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createEstatesLayoutStore } = require('./estates-layout-store');

const db = new DatabaseSync(':memory:');
const owner = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const guest = 'r' + 'a'.repeat(25);
const stranger = 'r' + 'b'.repeat(25);
const access = {
  accessFor(acct, propertyId) {
    if (propertyId === 'missing') return { allowed:false, reason:'unknown_property' };
    if (acct === owner) return { allowed:true, role:'owner', permissions:['enter','inspect','build'] };
    if (acct === guest) return { allowed:true, role:'guest', permissions:['enter','inspect'] };
    return { allowed:true, role:'tour', permissions:['enter','inspect'] };
  },
  canAct(acct, propertyId, action) {
    return acct === owner && propertyId !== 'missing' && action === 'build';
  }
};
let clock = 1000;
const store = createEstatesLayoutStore({ db, access, now:() => clock });
assert.equal(store.list(owner, 'trailer-01').ok, true);
assert.equal(store.list(owner, 'trailer-01').placements.length, 0);
assert.equal(store.list(guest, 'trailer-01').role, 'guest');
assert.equal(store.list(stranger, 'trailer-01').role, 'tour');
assert.equal(store.list('not-a-wallet', 'trailer-01').reason, 'authenticated-account-required');
assert.equal(store.list(owner, 'missing').reason, 'unknown-property');
assert.equal(store.savePlacement(guest, { propertyId:'trailer-01', placementId:'garden-guest', buildingType:'garden', position:{x:-35,z:-91} }).reason, 'build-permission-required');
assert.equal(store.savePlacement(stranger, { propertyId:'trailer-01', placementId:'garden-tour', buildingType:'garden', position:{x:-35,z:-91} }).reason, 'build-permission-required');

const placed = store.savePlacement(owner, {
  propertyId:'trailer-01', placementId:'garden-001', buildingType:'garden',
  position:{x:-35.1,z:-91.1}, rotationY:0
});
assert.equal(placed.ok, true);
assert.equal(placed.placement.x, -35);
assert.equal(placed.placement.z, -91);
assert.equal(placed.placement.status, 'persisted');
assert.equal(placed.placement.createdAt, 1000);
const publicLayout = store.publicPlacements();
assert.equal(publicLayout.ok, true);
assert.equal(publicLayout.placements.length, 1);
assert.equal(publicLayout.placements[0].propertyId, 'trailer-01');
assert.equal(publicLayout.placements[0].placementId, 'garden-001');
assert.equal(Object.hasOwn(publicLayout.placements[0], 'createdByAcct'), false, 'public exterior snapshot omits creator wallet');
assert.equal(store.list(guest, 'trailer-01').placements.length, 1, 'invited guests can inspect saved placements');
assert.equal(store.savePlacement(owner, {
  propertyId:'trailer-01', placementId:'garden-002', buildingType:'garden',
  position:{x:-35,z:-91}
}).reason, 'overlaps-existing-building');
assert.equal(store.savePlacement(owner, {
  propertyId:'trailer-01', placementId:'garden-003', buildingType:'garden',
  position:{x:-42,z:-91}
}).reason, 'overlaps-existing-building', 'placements cannot overlap the lot\'s base building');
assert.equal(store.savePlacement(owner, {
  propertyId:'trailer-01', placementId:'garden-004', buildingType:'garden',
  position:{x:-31,z:-91}
}).reason, 'outside-lot-boundary');
assert.equal(store.savePlacement(owner, {
  propertyId:'trailer-01', placementId:'garden-001', buildingType:'garden',
  position:{x:-35,z:-91}
}).reason, 'duplicate-placement-id');
assert.equal(store.savePlacement(owner, {
  propertyId:'trailer-01', placementId:'bad type', buildingType:'unknown',
  position:{x:-35,z:-91}
}).reason, 'invalid-placement-id');
assert.equal(store.savePlacement(owner, {
  propertyId:'trailer-01', placementId:'bad-building', buildingType:'unknown',
  position:{x:-35,z:-91}
}).reason, 'unknown-building-type');

clock = 2000;
const restartedStore = createEstatesLayoutStore({ db, access, now:() => clock });
assert.equal(restartedStore.list(owner, 'trailer-01').placements[0].placementId, 'garden-001', 'saved layouts survive store recreation');
assert.equal(restartedStore.removePlacement(guest, 'trailer-01', 'garden-001').reason, 'build-permission-required');
assert.deepEqual(restartedStore.removePlacement(owner, 'trailer-01', 'garden-001'), {
  ok:true, removed:true, propertyId:'trailer-01', placementId:'garden-001'
});
assert.equal(restartedStore.list(owner, 'trailer-01').placements.length, 0);
assert.equal(restartedStore.removePlacement(owner, 'trailer-01', 'garden-001').reason, 'placement-not-found');
db.close();
console.log('estates-layout-store: all tests passed');
