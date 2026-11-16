# Estates policy v4: IMG/PLX 90 · IMG/XRP 5 · IMG/RLUSD 5, Pollux hourly IMG to holders

Operator spec, Nov 15, 2026. **Ships OFF.** Nothing changes until `ESTATE_POLICY_V4_ENABLED=1` and `ESTATE_IMG_PLX_POOL_ACCOUNT=rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ` are set, together with the existing monthly-plan gates.

## Purchases

- **Start snapshot.** The first v4-enabled run records `estate_v4_program.started_ms`.
- **Purchases before the snapshot.** They keep their v3 IMG/RLUSD deposit.
- **New purchases.** They keep the 1% XRP reserve (unchanged allocation row, policy 3). The principal is split and ledgered in `estate_v4_splits`:
  - 90% to IMG/PLX: XRP → IMG via the IMG/XRP AMM and XRP → PLX via the PLX/XRP AMM, then one two-sided `AMMDeposit`.
  - 5% to IMG/XRP: half is swapped to IMG, then one two-sided IMG + XRP `AMMDeposit`.
  - 5% to IMG/RLUSD: the existing `estate_mp_deposits` pipeline.
  - A leg under 2 × `ESTATE_MIN_SWAP_DROPS` (for example, the 5% legs of a 3 XRP trailer) is folded into IMG/PLX, and the fold is recorded.
- **Ledgering.** Each leg has its own row in `estate_v4_deposits` (or `estate_mp_deposits`): XRP spent, IMG and counter-asset deposited, and LP received.
- **Guard reserve.** XRP not yet deposited stays protected from game payouts by the guard reserve.
- **Chunking and guards.** Deposits are chunked like v3: at most `ESTATE_MAX_DEPOSIT_DROPS` per run, halved while a swap leg would exceed the 1% impact cap. The pool-vs-market deviation guard holds a chunk until the pool is back within 3%.

## Auto-compound

All three positions are kept in their pools. v4 has no withdraw path: `assertSafeV4Transaction` rejects `AMMWithdraw`. While v4 is on, the IMG/RLUSD daily/monthly fee harvest is skipped. AMM trading fees therefore stay in the pools and compound into the LP value.

## Holder income from Pollux

Pollux (`r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V`) can deliver IMG or XRP for the Estates PLX/IMG LP position. The scanner verifies delivered amounts, the sender, the treasury destination and the reward memo. Standalone PLX holder rewards stay outside this accounting. Eligibility follows the settled owner and property weight at receipt time, including when a property is resold before the reward is processed.

With the existing v4, accounting and Pollux switches enabled, owners receive the asset delivered by Pollux. IMG credits below 0.05 IMG, or credits where the wallet cannot receive IMG, carry forward. XRP credits from closed hours accumulate until a wallet has at least 0.001 XRP. The payout fee comes out of that wallet's XRP credit and is capped at 100 drops. The authenticated Estates portfolio shows both balances and validated payments.

The default 3.22% burn share accrues separately from owner credits. IMG waits until at least 1 IMG has accrued and its quoted XRP value covers ten times the maximum burn fee. XRP burn credits wait until at least 0.01 XRP has accrued. The executor converts only that earmarked XRP into IMG within the existing impact and slippage limits, then sends the resulting IMG to its issuer. Swap and burn fees are deducted from that XRP burn reserve. Owner settlement can proceed while a burn carries forward.

The XRP scanner backfills from the earlier of v4 activation or the completed LP migration. Both the read-only checkpoint and each payout use durable records to resume on restart. The legacy hourly executor remains retired.

## Safety

- v4 runs inside the monthly-plan single-flight tick.
- Every transaction passes `assertSafeV4Transaction`. The only allowed transactions are two-sided deposits into IMG/PLX or IMG/XRP, self-swaps (XRP to IMG or PLX with capped `SendMax`, no partial payments), IMG retirement payments to the issuer, and IMG or verified-reward-funded XRP payouts to eligible owners. Payments to AMM accounts are rejected.
- Every transaction is journaled in `estate_mp_txs` before submit, which `watch.js` treats as known.
- **Kill switches:** unset `ESTATE_POLICY_V4_ENABLED` (new purchases go back to v3 IMG/RLUSD; already-split purchases are never re-queued whole), unset `ESTATE_POLLUX_PAYOUTS_ENABLED`, or use the treasury pause.

## Tests

`node server/estate-v4-plan.test.js` (in `npm test`).

## Existing IMG/RLUSD funds
The one-shot move of 90% of the IMG/RLUSD position into IMG/PLX is in [estates-plx-migration.md](estates-plx-migration.md).
