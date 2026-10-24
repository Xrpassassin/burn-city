# Estates waterfront boat transit — first server contract

## Product rule
Estates Island and BURN City are distinct world instances. A wallet that is verified as the owner of a waterfront property may launch a boat from that property's active private dock and transition into the BURN City world. The city arrival point is a server-selected harbor/spawn anchor. The transition carries the same boat identity and a small, allowlisted boat-state snapshot; it must not mint a second boat or duplicate cargo, currency, or ownership.

## Implemented in this change
- `server/estates-waterfront-transit.js` provides a pure, fail-closed launch-plan builder.
- It requires a valid XRPL account string, server-resolved waterfront property with matching owner, an active dock belonging to that property, a server-resolved boat owned by that wallet and currently docked at that exact dock, a supported destination, a transition ID, a server-selected spawn anchor, and a valid timestamp.
- It copies only the boat ID, class, tier, hull, and fuel into the route envelope. Arbitrary server fields are not copied.
- Unit tests cover successful planning and rejection of malformed identity, non-waterfront property, owner mismatch, dock mismatch/disabled dock, boat ownership/state mismatch, unsupported destination, missing id/anchor, and invalid time.

## Deliberate boundaries
This is **not yet a live boat journey**. The plan builder does not authenticate the session, resolve the ownership ledger, create docks, move a player between renderers, reserve the boat, or persist transition state. The existing property catalog must gain an authoritative waterfront flag and the dock system must store owner/property association before this can authorize a real property. Those are integration tasks, not assumptions hidden in this helper.

Before wiring it into an endpoint, the server must atomically reserve the boat and idempotency/transition ID in durable state, then acquire the BURN City instance, transfer the authenticated player and existing boat state, and commit the source-world release. A failed destination load must safely release the reservation or restore the source state. The browser must never choose the destination spawn, claim ownership, or supply the authoritative boat snapshot.

## Next integration sequence
1. Add explicit waterfront metadata to the estate catalog and validate it against the canonical property registry.
2. Persist private dock placement against an owned waterfront property; constrain placement to that property's approved shoreline footprint.
3. Add a server route that derives account identity from the existing signed Xaman session, resolves property/dock/boat records from server-owned stores, and calls this helper.
4. Add durable idempotency + reservation/rollback for boat transfer.
5. Connect the route to separate Estates and BURN City instance adapters, preserving the same player/boat identity.
6. Add integration tests for concurrent launch requests, duplicate transition IDs, destination failure/rollback, revoked ownership, revoked access, and reconnect recovery.

Do not treat this contract as proof that the separate-world runtime, purchasable lots, private docks, or boat transitions are already live.
