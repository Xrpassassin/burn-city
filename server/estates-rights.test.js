'use strict';

const assert = require('node:assert/strict');
const { resolveEstateRights } = require('./estates-rights');

const acct = 'rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV';
const other = 'rXYdhW4ZHdzt27VuHJgNwbD1aJjcKZJ9M';
const stateFor = account => ({ owned: account === acct ? [{ propertyId: 'starter-01', acct }] : [] });
const estates = { getState: stateFor };
const fixedNow = () => 1000;

assert.equal(resolveEstateRights({ account: acct, propertyId: 'starter-01', estates, now: fixedNow }).allowed, true);
assert.deepEqual(resolveEstateRights({ account: acct, propertyId: 'starter-01', estates, now: fixedNow }).permissions, ['enter', 'inspect', 'build']);
assert.equal(resolveEstateRights({ account: acct, propertyId: 'starter-01', action: 'trade', estates, now: fixedNow }).reason, 'permission-not-granted');
assert.equal(resolveEstateRights({ account: other, propertyId: 'starter-01', estates, now: fixedNow }).reason, 'verified-property-rights-not-found');
assert.equal(resolveEstateRights({ account: acct, propertyId: 'mansion-01', estates, now: fixedNow }).allowed, false);
assert.equal(resolveEstateRights({ account: 'attacker', propertyId: 'starter-01', estates, now: fixedNow }).reason, 'authenticated-account-required');
assert.equal(resolveEstateRights({ account: acct, propertyId: '', estates, now: fixedNow }).reason, 'property-id-required');
assert.equal(resolveEstateRights({ account: acct, propertyId: 'starter-01', estates: null, now: fixedNow }).reason, 'ownership-service-unavailable');
assert.equal(resolveEstateRights({ account: acct, propertyId: 'starter-01', estates: { getState() { throw Error('db down'); } }, now: fixedNow }).reason, 'ownership-service-unavailable');
assert.equal(resolveEstateRights({ account: acct, propertyId: 'starter-01', estates, now: () => NaN }).reason, 'invalid-clock');
// A client-provided owner field or grant is not an input to this API and cannot grant access.
assert.equal(resolveEstateRights({ account: other, propertyId: 'starter-01', owner: acct, grant: { verifiedBy: 'estate-authorization-service' }, estates, now: fixedNow }).allowed, false);
assert.equal(resolveEstateRights({ account: acct, propertyId: 'starter-01', estates: { getState: () => ({ owned: [{ propertyId: 'starter-01', acct: other }] }) }, now: fixedNow }).allowed, false);
// #237 invite list: an invited wallet gets enter/inspect, never build/invite/trade; tour/no-access roles grant nothing here.
const access = { accessFor: (a, p) => a === other && p === 'starter-01' ? { allowed: true, role: 'guest' } : p === 'mansion-01' ? { allowed: true, role: 'tour' } : { allowed: false, reason: 'no_access' } };
assert.deepEqual(resolveEstateRights({ account: other, propertyId: 'starter-01', estates, access, now: fixedNow }).permissions, ['enter', 'inspect']);
assert.equal(resolveEstateRights({ account: other, propertyId: 'starter-01', estates, access, now: fixedNow }).role, 'guest');
assert.equal(resolveEstateRights({ account: other, propertyId: 'starter-01', action: 'build', estates, access, now: fixedNow }).reason, 'permission-not-granted');
assert.equal(resolveEstateRights({ account: other, propertyId: 'starter-01', action: 'invite', estates, access, now: fixedNow }).allowed, false);
assert.equal(resolveEstateRights({ account: other, propertyId: 'mansion-01', estates, access, now: fixedNow }).allowed, false);
assert.equal(resolveEstateRights({ account: other, propertyId: 'starter-01', estates, access: { accessFor() { throw Error('db'); } }, now: fixedNow }).reason, 'ownership-service-unavailable');
assert.deepEqual(resolveEstateRights({ account: acct, propertyId: 'starter-01', estates, access, now: fixedNow }).permissions, ['enter', 'inspect', 'build']);
console.log('estates-rights: verified property rights tests passed');
