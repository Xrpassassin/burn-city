# Estates IMG/RLUSD: validated, restart-safe hourly observations

This is the next infrastructure step toward dependable **future** reward delivery, not an active reward, liquidity or settlement service.

The scanner in `server/estate-rlusd-validated-hour-scanner.js` performs bounded public XRPL history reads, then writes **nonpaying** evidence into additive SQLite tables. It only starts with a previously staged, independently validated immutable IMG/RLUSD forward reward start (the prospective forward-start module remains on draft PR #515 and is **not** live).

## Durability and idempotency

- Revalidates the immutable forward-start ledger hash and close time and the prior durable scan checkpoint against validated XRPL ledger responses on every run.
- Scans every treasury transaction in a bounded exact ledger range using complete forward `account_tx` pagination; rejects missing pages, duplicate transaction hashes, repeating cursors, unvalidated or out-of-window transactions, and invalid source ranges.
- Re-fetches possible IMG/RLUSD `AMMWithdraw` events by hash, checks validated `tesSUCCESS`, asset pair, treasury origin, ledger index, and close time, then saves them **only as candidate withdrawals requiring economic cost-basis review**.
- At the end of a successfully scanned range, records every fully observed UTC hour since the first eligible hour. The only allowed labels are `no_withdrawal_observed` and `withdrawal_needs_cost_basis_review`. Neither means realized profit or a promise of income.
- Candidate insertion, completed-hour observations and the new ledger checkpoint commit atomically. Network failures and corrupt histories cannot advance the checkpoint. Crash/restart resumes at the exact next ledger, with no skipped hour or duplicated candidate.
- A small buffer behind the public validated head avoids cross-server tip races. The batch size and pagination limits are bounded to prevent runaway reads or falsely complete history.

## What this does NOT do

No API route or live timer is connected yet. No automatic forward reward start is staged. It **does not** price pool positions, independently prove realized net profit, allocate owners, convert IMG, create IMG/XRP payouts, execute Xaman payments, sign mainnet transactions, release the treasury pause, or change legacy owner rewards. If a day has no AMM withdrawals it does **not** prove the pool made no fees, only that this scanner saw no matching withdrawal event.

## What is required to go live eventually

1. Reconcile opening capital/obligations, receive reviewed legal authorization and establish a truly validated forward start.
2. Attach a carefully bounded scheduler to the scanner and verify its closed-hour observations from public XRPL data on a staging environment.
3. Build a validated realized-profit and valuation adapter, including original IMG/RLUSD LP cost basis, AMM withdrawal proceeds, disposal proceeds, fees, losses, principal baseline and treasury liquid reserves. Source booleans and LP appreciation are insufficient proof.
4. Allocate only genuine net profit with durable per-hour, per-owner idempotency and an aggregate cap inclusive of *all* already paid and held amounts.
5. Integrate a separate auditable fee-aware signer/reconciler for IMG or XRP, with proof of confirmed delivery, safe recovery from ambiguous submissions, trustline handling and carryover for amounts too small to pay.
6. Pass controlled nonproduction and mainnet verification before public activation. The treasury remains paused, sales disabled and rewards unguaranteed.

At every step the old PLX pool remains retired; no PLX deposits are required.
