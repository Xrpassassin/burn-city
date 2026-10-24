# Estates Island access-policy contract

`server/estates-access-policy.js` is a server-side, fail-closed policy function for the next private-property integration step. It is intentionally not wired to the public browser prompt yet: the current game has no connected authenticated Estate session/ownership service in this path.

## Decision rules

- Public areas allow entry and inspection only. Build, invite, and trade actions are denied by this policy.
- Private actions require an authenticated server session, an exact property ID, and an active, unexpired permission grant matching both the session subject and property.
- Permissions are explicit action names (`enter`, `inspect`, `build`, `invite`, `trade`). A property owner is not inferred from a catalog row, a client-supplied wallet address, or an NFT token identifier.
- Missing, mismatched, expired, malformed, or insufficient grants fail closed with a machine-readable reason.
- The `verifiedBy` field is a contract marker, **not a cryptographic signature**. Trusted server code must load/validate grants from its authorization/ownership service and must never accept a grant object supplied by the browser.

This policy is a decision helper, not an authentication system, XRPL verifier, wallet-signature verifier, database, or persistence API. Before enabling private doors/building, connect it to a server-owned session and a trusted ownership/permission lookup, then test the HTTP routes against forged, expired, cross-property, and revoked grants.

## Validation

Run `npm run test:estates-access-policy`. The tests cover public/private separation, action allowlists, missing authentication, subject/property mismatch, expiry, malformed grants, and fail-closed behavior.
