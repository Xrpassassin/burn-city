// Server-side, fail-closed authorization contract for Estates Island.
// Callers must obtain the grant from a trusted server-side ownership/permission service.
// Never pass a browser-supplied wallet address or owner ID as proof of authority.
'use strict';

const ACTIONS = new Set(['enter', 'inspect', 'build', 'invite', 'trade']);
const PUBLIC_ACTIONS = new Set(['enter', 'inspect']);

function deny(reason) {
  return Object.freeze({ allowed: false, reason });
}

function authorizeEstateAction({
  area,
  action,
  principal,
  propertyId,
  grant,
  now = Date.now()
} = {}) {
  if (!ACTIONS.has(action)) return deny('unknown-action');
  if (!Number.isFinite(now)) return deny('invalid-clock');

  if (area === 'public') {
    return PUBLIC_ACTIONS.has(action)
      ? Object.freeze({ allowed: true, reason: 'public-area' })
      : deny('public-action-not-supported');
  }
  if (area !== 'private') return deny('unknown-area');
  if (!principal || principal.authenticated !== true ||
      typeof principal.subjectId !== 'string' || !principal.subjectId.trim()) {
    return deny('authentication-required');
  }
  if (typeof propertyId !== 'string' || !propertyId.trim()) {
    return deny('property-id-required');
  }

  // This marker describes a server-internal grant contract, not a cryptographic
  // signature. The grant must be loaded/validated by trusted server code; never
  // accept this object directly from a client request.
  if (!grant || grant.verifiedBy !== 'estate-authorization-service' ||
      grant.status !== 'active') {
    return deny('server-verified-grant-required');
  }
  if (grant.subjectId !== principal.subjectId) return deny('principal-mismatch');
  if (grant.propertyId !== propertyId) return deny('property-mismatch');
  if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= now) {
    return deny('grant-expired-or-invalid');
  }
  if (!Array.isArray(grant.permissions) ||
      !grant.permissions.every(permission => typeof permission === 'string')) {
    return deny('grant-permissions-invalid');
  }
  if (!grant.permissions.includes(action)) return deny('permission-not-granted');

  return Object.freeze({ allowed: true, reason: 'server-grant-permits-action' });
}

module.exports = { authorizeEstateAction };
