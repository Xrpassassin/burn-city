# Estates XRP purchase and IMG/XRP liquidity proposal — NOT LIVE

## Repository audit
Existing: `client/data/estate-catalog.json` lists 21 properties across trailer, apartment, starter, family and mansion tiers; `server/estate-economy.js` calculates weighted integer-drop allocations and draft weekly accounting snapshots; `docs/estate-pool-accounting.md` documents a Xaman treasury identity verification flow and explicitly disabled sales/payout endpoints. The catalog's `price` fields and currency remain null; this document is not an approved price schedule.

## Draft tiers (illustrative, approval required)
| Tier | Example price XRP | Per-wallet cap | Existing relative units |
| --- | ---: | ---: | ---: |
| Trailer | 25 | 2 | 1 |
| Apartment | 75 | 2 | 2 |
| Starter | 200 | 2 | 3 |
| Family | 600 | 1 | 5 |
| Mansion | 2500 | 1 | 10 |

Prices and caps require owner approval and economic/legal review. Caps are per verified XRPL wallet, not a Sybil-proof individual limit. A separate aggregate cap and anti-concentration controls may be needed.

## Purchase lifecycle
1. Server quotes available property ID, fixed XRP drops, expiry and unique intent ID; reserves a lot atomically for a short interval.
2. Buyer authenticates wallet and signs a payment via a documented Xaman flow; payment destination is the separately verified vault public address.
3. Server independently verifies a validated XRPL Mainnet transaction: sender, destination, amount, currency, destination tag/memo if used, intent, ledger index, no duplicate hash, expiry and no earlier allocation.
4. Atomic DB commit marks property owned and closes the reservation; failures release reservation or enter reviewed refund/reconciliation state. Inventory and per-tier wallet caps are checked in the same transaction.
5. A ledger reconciliation job detects unmatched payments, double-spend claims, transaction failures and reorg/validation anomalies. Never grant property solely on a browser callback.

## Vault and IMG/XRP AMM
The intended Xaman-connected vault is owner-reported as `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb`, **not independently verified here**. Do not sign, submit or automate treasury transfers through Grok merely because Grok has a wallet connection. Grok may prepare unsigned transaction proposals and reconciliation reports. Treasury owner/operator reviews the exact XRPL Mainnet asset pair, IMG issuer, AMM pool identity, slippage, fees, pool liquidity and transactions before signing. Single-sided XRP deposits can expose the treasury to price impact, AMM deposit fees, and inventory risk; they are not risk-free.

## Weekly accounting
Record LP positions, fees earned, deposit/withdrawal flows, inventory mark-to-market, realized trading gains/losses, expenses and reserves. AMM fee accrual is not equivalent to withdrawable net income. Use a reviewed, ledger-backed snapshot with zero-distribution weeks permitted; never advertise fixed yield or guaranteed dividends. Distributions must be idempotent, auditable, and approved by an authorized signer. Consider the legal characterization of property purchases tied to pooled AMM returns: saying “not guaranteed” alone does not resolve securities, investment-contract, custody, tax or consumer-protection obligations. Obtain qualified counsel review before marketing, selling, or distributing.

## Safety gates
- Sales and payouts stay disabled until wallet control, payment verification, IMG issuer/pool identity, pricing, caps, accounting policy and legal review are complete.
- No secrets or signing credentials in client code, repository, game database or logs.
- Tests: simultaneous purchases for last property, cap enforcement under concurrency, replayed payment, wrong vault/issuer/amount, expired quote, failed XRPL validation, refund workflow, AMM snapshot zero/negative outcome, payout idempotency and revocation.
