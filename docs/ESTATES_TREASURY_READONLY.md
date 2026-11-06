# Estates treasury account — public read-only configuration

Treasury XRPL account (confirmed by owner): `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb`.

`server/estate-treasury-config.js` exports the account and fail-closed feature flags. This PR does not integrate live XRPL monitoring, initiate payments, or grant transaction-signing authority. It stores no seed or private key.

## Integration next steps
- Wire a validated-ledger account transaction reader with pagination, retry/backoff and reorg-safe finality checks.
- Maintain independent accounting for sale principal, AMM capital, realized net XRP earnings, IMG rewards, reserves, and outstanding payouts.
- Validate token issuer/currency, trustlines and source ledger index; verify profit and IMG receipts rather than trusting arbitrary funding references.
- Snapshot verified property ownership at each hourly epoch.
- Implement durable atomic idempotency and XRPL settlement reconciliation before any payouts.
- Keep transfers/trades/payouts disabled until separate explicit authorization, security review and integration tests.
- Do not commit Xaman credentials or treasury seeds to source control.

Run `node server/estate-treasury-config.test.js`.
