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

## Holder income: Pollux hourly IMG

Pollux (`r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V`) pays IMG/PLX LPs IMG rewards about every hour.

- **Recording rewards.** The existing validated-ledger scanner (`ESTATE_ACCOUNTING_ENABLED=1`, the old hourly system) records each reward to the treasury. It allocates each reward by the share units owned when the reward arrived and closes the hourly batches.
- **Paying each hour.** With `ESTATE_POLLUX_PAYOUTS_ENABLED=1`, each closed hour from the v4 start onward is processed like this:
  - `ESTATE_POLLUX_BURN_BPS` (default 322 = 3.22%) of the IMG is paid to the IMG issuer `rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd`, which burns it.
  - The rest is paid in IMG to each holder pro rata.
  - Amounts under `ESTATE_POLLUX_DUST_IMG` (default 0.05 IMG) or a validated `tec` (no IMG trust line) carry forward in `estate_px_carry`.
  - Payments are capped at `ESTATE_POLLUX_MAX_PAYOUTS_PER_RUN` per tick.
- **Retired executor.** The legacy hourly payout executor stays retired (`ESTATE_LEGACY_HOURLY_ENGINE` stays unset). Its queued rows are not used.

## Safety

- v4 runs inside the monthly-plan single-flight tick.
- Every transaction passes `assertSafeV4Transaction`. The only allowed transactions are two-sided deposits into IMG/PLX or IMG/XRP, self-swaps (XRP to IMG or PLX with capped `SendMax`, no partial payments), IMG burns to the issuer, and IMG payouts to current holders. Payments to AMM accounts are rejected.
- Every transaction is journaled in `estate_mp_txs` before submit, which `watch.js` treats as known.
- **Kill switches:** unset `ESTATE_POLICY_V4_ENABLED` (new purchases go back to v3 IMG/RLUSD; already-split purchases are never re-queued whole), unset `ESTATE_POLLUX_PAYOUTS_ENABLED`, or use the treasury pause.

## Tests

`node server/estate-v4-plan.test.js` (in `npm test`).

## Existing IMG/RLUSD funds
The one-shot move of 90% of the IMG/RLUSD position into IMG/PLX is in [estates-plx-migration.md](estates-plx-migration.md).
