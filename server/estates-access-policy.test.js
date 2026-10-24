'use strict';

const assert = require('node:assert/strict');
const { authorizeEstateAction } = require('./estates-access-policy.js');

const principal = { authenticated: true, subjectId: 'session-user-7' };
const validGrant = {
  verifiedBy: 'estate-authorization-service',
  status: 'active',
  subjectId: 'session-user-7',
  propertyId: 'estate-101',
  expiresAt: 5000,
  permissions: ['enter', 'inspect', 'build']
};
const decide = overrides => authorizeEstateAction({
  area: 'private', action: 'enter', principal, propertyId: 'estate-101',
  grant: validGrant, now: 1000, ...overrides
});

assert.equal(authorizeEstateAction({ area: 'public', action: 'enter' }).allowed, true);
assert.equal(authorizeEstateAction({ area: 'public', action: 'inspect' }).allowed, true);
assert.equal(authorizeEstateAction({ area: 'public', action: 'build' }).reason, 'public-action-not-supported');
assert.equal(authorizeEstateAction({ area: 'public', action: 'trade' }).allowed, false);
assert.equal(decide().allowed, true);
assert.equal(decide({ action: 'build' }).allowed, true);
assert.equal(decide({ action: 'invite' }).reason, 'permission-not-granted');
assert.equal(decide({ grant: null }).reason, 'server-verified-grant-required');
assert.equal(decide({ grant: { ...validGrant, verifiedBy: 'client' } }).allowed, false);
assert.equal(decide({ principal: { authenticated: false, subjectId: 'session-user-7' } }).reason, 'authentication-required');
assert.equal(decide({ principal: { authenticated: true, subjectId: 'attacker' } }).reason, 'principal-mismatch');
assert.equal(decide({ propertyId: 'estate-202' }).reason, 'property-mismatch');
assert.equal(decide({ grant: { ...validGrant, expiresAt: 1000 } }).reason, 'grant-expired-or-invalid');
assert.equal(decide({ grant: { ...validGrant, permissions: 'build' } }).reason, 'grant-permissions-invalid');
assert.equal(decide({ area: 'unknown' }).reason, 'unknown-area');
assert.equal(decide({ action: 'mint' }).reason, 'unknown-action');
assert.equal(decide({ now: NaN }).reason, 'invalid-clock');
assert.equal(decide({ propertyId: '' }).reason, 'property-id-required');
assert.equal(authorizeEstateAction({ area: 'private', action: 'inspect', propertyId: 'estate-101' }).reason, 'authentication-required');
console.log('estates-access-policy: authorization contract tests passed');
