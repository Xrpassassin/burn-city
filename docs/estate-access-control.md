# Estates property access control

## Rules
- A property's current owner wallet has full access and is the only account allowed to manage invitations.
- Other wallets can enter only when a current owner has invited them.
- Guests cannot invite or revoke other guests. Invites do not convey ownership, sale proceeds, or any other property rights.
- Access is tied to the authenticated XRPL account from Xaman sign-in, never to a wallet address typed into an unauthenticated client field.
- Revocation takes effect on the next server access check. Unknown, unowned, or unregistered wallets fail closed.
- Registered-wallet search requires at least four valid XRPL address characters and returns at most 12 prefix matches; only wallets that have signed into the game are eligible for invites.
- Invitations are limited to 100 per property; the owner may revoke any guest.
- Property purchases remain disabled until the separately audited payment and ownership settlement flow is ready. This feature does not enable sales or distributions.

## API
All endpoints require a valid Bearer token from Xaman sign-in.
- `GET /api/estates/access/search?q=<address-prefix>` — registered wallet suggestions.
- `GET /api/estates/access/check?propertyId=<id>` — current caller's owner/guest access decision.
- `GET /api/estates/access?propertyId=<id>` — owner-only guest list.
- `POST /api/estates/access/invite` with `{propertyId, guestAcct}` — owner invites a registered wallet.
- `POST /api/estates/access/revoke` with `{propertyId, guestAcct}` — owner revokes access.

The server is authoritative for access decisions. The client checks access before opening a residence; the interior entry hook must not be treated as a substitute for server-side checks in any future persistent or multiplayer interior service.
