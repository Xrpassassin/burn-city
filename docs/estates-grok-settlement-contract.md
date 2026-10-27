# Grok Estates settlement integration contract (draft; no live payments)

## Ownership of responsibilities
ChatGPT-side draft code provides `server/estate-purchase-contract.js` (read-only catalog quotes) and `server/estate-draft-reservations.js` (local SQLite reservation state). Grok owns payment provider setup, custody and transaction verification. Neither draft module is wired to an API route or authorizes financial transactions. Existing `POST /api/estates/buy` MUST continue returning `409 sales_not_configured` until a separate, reviewed activation.

## Prepayment sequence
1. Authenticate buyer from the existing server-side verified wallet session, never from an arbitrary posted account string.
2. Validate property ID against the server catalog; compute XRP drops from `quoteEstate(propertyId)`. Ignore client-supplied prices, weights, destinations and ownership.
3. Verify the lot is available, the per-wallet tier cap is not exceeded (counting settled ownership and unexpired reservations), and create an atomic, expiring reservation.
4. Persist a unique payment intent bound to wallet, property, price, currency, destination, expiration, and network.
5. Display wallet signing instructions only when the payment integration is explicitly enabled.

## Settlement verification — Grok implementation
Verify on XRPL Mainnet from a trusted ledger source: validated transaction, correct Payment type, sender, destination, delivered amount in drops, currency, network, destination tag if used, and linkage to the unique payment intent. Use `delivered_amount`, not merely the requested Amount. Handle partial payments, destination tags, expiration, retries, stale ledger responses and reorg/validation semantics. Never accept a client assertion that payment succeeded. Reject duplicate hashes globally.

Commit verified settlement and ownership in one durable database transaction with unique constraints on property ID and transaction hash. Check the reservation still belongs to the authenticated wallet and is not expired; handle late-valid payments via an explicit reconciliation/refund queue, never silently retain funds or assign a different property. A reservation is not a completed sale. Treat reconciliation and recovery as first-class states.

## Failure and abuse cases
- Two wallets attempt the same lot concurrently: one reservation at most.
- Five properties in one tier across ownership + active reservations: sixth denied.
- Repeat same intent, replay same tx hash, wrong recipient, wrong sender, wrong delivered amount, wrong chain, expired reservation: never assign title.
- Process crash after payment validation or during ownership commit: idempotent recovery, no double grants.
- A wallet transfer or guest invitation must not alter economic accounting without a documented snapshot rule.

## Distribution and compliance gates
Keep property ownership separate from financial allocations. Weekly allocations require an immutable Monday UTC ownership snapshot and approved, ledger-reconciled distributable amount; Sunday payout should refer to the last fully completed week. Do not automate payouts or promise yield until the legal/regulatory and custody reviews are completed. Marketing language must not call this a bonding curve or imply guaranteed fees.

## Required review before enabling sales
Document exact treasury account and IMG issuer/AMM IDs, authorized signing model, refund policy, tax/legal review, database migrations, endpoint authentication, ledger reconciliation, operational monitoring, failure drills, and independent tests. Current draft code is not a payment integration.
