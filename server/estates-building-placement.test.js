'use strict';

const assert = require('node:assert/strict');
const { planEstatePlacement } = require('./estates-building-placement.js');

const principal = { authenticated: true, subjectId: 'session-user-7' };
const grant = {
  verifiedBy: 'estate-authorization-service', status: 'active',
  subjectId: 'session-user-7', propertyId: 'estate-101',
  expiresAt: 5000, permissions: ['enter', 'inspect', 'build']
};
const lot = { propertyId: 'estate-101', x: 0, z: 0, width: 20, depth: 18 };
const base = { principal, grant, lot, buildingType: 'workshop', position: { x: 0.13, z: 0.12 }, now: 1000, placementId: 'build-1' };
const planned = planEstatePlacement(base);
assert.equal(planned.ok, true);
assert.equal(planned.placement.x, 0);
assert.equal(planned.placement.z, 0);
assert.equal(planned.placement.grid, 0.5);
assert.equal(planned.placement.status, 'validated-not-persisted');
assert.equal(planned.placement.width, 5);
assert.equal(planned.placement.depth, 4);
assert.equal(planned.placement.cost.metal, 12);
assert.equal(planEstatePlacement({ ...base, position: { x: 8.5, z: 0 } }).reason, 'outside-lot-boundary');
assert.equal(planEstatePlacement({ ...base, buildingType: 'admin_console' }).reason, 'unknown-building-type');
assert.equal(planEstatePlacement({ ...base, rotationY: 0.2 }).reason, 'rotation-must-be-quarter-turn');
assert.equal(planEstatePlacement({ ...base, grant: null }).reason, 'authorization:server-verified-grant-required');
assert.equal(planEstatePlacement({ ...base, principal: { authenticated: false, subjectId: 'session-user-7' } }).reason, 'authentication-required');
assert.equal(planEstatePlacement({ ...base, grant: { ...grant, propertyId: 'estate-999' } }).reason, 'authorization:property-mismatch');
assert.equal(planEstatePlacement({ ...base, grant: { ...grant, permissions: ['inspect'] } }).reason, 'authorization:permission-not-granted');
assert.equal(planEstatePlacement({ ...base, grant: { ...grant, expiresAt: 1000 } }).reason, 'authorization:grant-expired-or-invalid');
assert.equal(planEstatePlacement({ ...base, placementId: '' }).reason, 'placement-id-required');
assert.equal(planEstatePlacement({ ...base, existingPlacements: [{ placementId: 'build-other', propertyId: 'estate-101', x: 0, z: 0, width: 2, depth: 2 }] }).reason, 'overlaps-existing-building');
assert.equal(planEstatePlacement({ ...base, existingPlacements: [{ placementId: 'build-1', propertyId: 'estate-101', x: 8, z: 8, width: 1, depth: 1 }] }).reason, 'duplicate-placement-id');
assert.equal(planEstatePlacement({ ...base, existingPlacements: [{ placementId: 'bad', propertyId: 'estate-101', x: NaN, z: 0, width: 1, depth: 1 }] }).reason, 'invalid-saved-placement');
assert.equal(planEstatePlacement({ ...base, lot: { ...lot, propertyId: '' } }).reason, 'mapped-property-required');
const rotated = planEstatePlacement({ ...base, buildingType: 'barricade', rotationY: Math.PI / 2, placementId: 'build-rotated', position: { x: 9.5, z: 0 } });
assert.equal(rotated.reason, 'outside-lot-boundary');
const otherPropertyOverlap = planEstatePlacement({ ...base, existingPlacements: [{ placementId: 'build-other', propertyId: 'estate-202', x: 0, z: 0, width: 8, depth: 8 }] });
assert.equal(otherPropertyOverlap.ok, true, 'placements belonging to another lot do not block this lot');
console.log('estates-building-placement: all tests passed');
