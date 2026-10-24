'use strict';

// Resolve private property rights from the authenticated account and the server-owned
// Estates ledger. Never accept an owner, permission list, or grant from the browser.
const { authorizeEstateAction } = require('./estates-access-policy');

const PRIVATE_PERMISSIONS = Object.freeze(['enter', 'inspect', 'build']);

function resolveEstateRights({ account, propertyId, action = 'enter', estates, now = Date.now } = {}) {
  if (typeof account !== 'string' || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(account)) {
    return Object.freeze({ allowed: false, reason: 'authenticated-account-required', propertyId: null, permissions: [] });
  }
  if (typeof propertyId !== 'string' || !propertyId.trim() || propertyId.length > 128) {
    return Object.freeze({ allowed: false, reason: 'property-id-required', propertyId: null, permissions: [] });
  }
  if (!estates || typeof estates.getState !== 'function') {
    return Object.freeze({ allowed: false, reason: 'ownership-service-unavailable', propertyId, permissions: [] });
  }

  let owned;
  try {
    const state = estates.getState(account);
    owned = Array.isArray(state?.owned) ? state.owned : [];
  } catch {
    return Object.freeze({ allowed: false, reason: 'ownership-service-unavailable', propertyId, permissions: [] });
  }
  const row = owned.find(item => item && item.propertyId === propertyId && item.acct === account);
  if (!row) {
    return Object.freeze({ allowed: false, reason: 'verified-property-rights-not-found', propertyId, permissions: [] });
  }

  const timestamp = now();
  if (!Number.isFinite(timestamp)) {
    return Object.freeze({ allowed: false, reason: 'invalid-clock', propertyId, permissions: [] });
  }
  const grant = {
    verifiedBy: 'estate-authorization-service',
    status: 'active',
    subjectId: account,
    propertyId,
    expiresAt: timestamp + 30_000,
    permissions: [...PRIVATE_PERMISSIONS]
  };
  const decision = authorizeEstateAction({
    area: 'private', action, principal: { authenticated: true, subjectId: account },
    propertyId, grant, now: timestamp
  });
  return Object.freeze({
    ...decision,
    propertyId,
    permissions: decision.allowed ? [...grant.permissions] : [],
    expiresAt: decision.allowed ? grant.expiresAt : null
  });
}

module.exports = { resolveEstateRights };
