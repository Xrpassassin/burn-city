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

## Pollux rewards in IMG or XRP (both work)
Pollux pays the IMG/PLX LP minimum (0.5%/yr on LP value; IMG/PLX is a Base-tier pool, so the minimum is
all it earns) in IMG when its engine holds IMG, and in XRP otherwise (`fallback: thin_inventory`). It also
pays a PLX-holder reward in XRP on the PLX inside the estate LP. As of Nov 17, 2026 Pollux has no IMG trust
line, so every payment is XRP (about 420 drops/hour in total).

- IMG receipts: the hourly scanner reserves 3.22% for the burn, and the rest is paid pro rata (unchanged).
- XRP receipts: allocated by ownership units at receipt time, with 3.22% reserved for the burn (#646).
  - `ESTATE_POLLUX_PAYOUT_ASSET=native` (default): owners are paid in XRP (minimum 1000 drops).
  - `ESTATE_POLLUX_PAYOUT_ASSET=img`: **every hour** (`ESTATE_POLLUX_BATCH_HOURS`, default 1, aligned to the hour):
    - Every owner credit of at least `ESTATE_POLLUX_MIN_PAYOUT_DROPS` (img default **250 drops**) and the hour's XRP burn
      share are converted in **one** XRP→IMG self-swap (exact minimum out, 1% slippage, ≤1% impact, no partial
      payment, no Paths). The swap is skipped if the total is under `ESTATE_POLLUX_MIN_SWAP_DROPS` (default 250).
    - Each owner's credit funds 15 drops for their own IMG payment fee, and the delivered IMG is split pro rata and paid.
    - Smaller credits carry forward.
    - If a payment fails with tec (for example, no IMG trust line), it is held and rolled into the next hour. If a conversion fails with tec, its XRP is released.
- **Burn (held until warranted):** 3.22% of every payout's IMG (IMG-native hours, and the burn share converted
  inside each hourly swap) is ledgered and held in the treasury.
  - It is sent to the IMG issuer only once the accrued amount reaches `ESTATE_POLLUX_BURN_MIN_IMG` (default **1 IMG**).
  - At ~13.5 drops/hour of burn share (≈0.008 IMG/h) that is roughly one burn every 5–6 days.
  - The 12-drop burn fee is <1% of the value burned.
  - Status shows it under `monthlyPlan.policyV4.polluxBurnHeld`.
- Fee economics (img mode, ~420 drops/h total income):
  - One swap per hour costs 12 drops (~3%).
  - Each IMG payment costs 12 drops, and 15 are reserved from the owner's credit, so at the 250-drop minimum that is ≤6%.
  - starter-04 (25/27 units, ~390 drops/h) is paid every hour.
  - The trailers (~15 drops/h each) carry for ~17 hours and are then paid. That is about once a day, at ~6% fee instead of ~80% if paid hourly.
- `ESTATE_POLLUX_INCLUDE_HOLDER_BASE=1` also counts Pollux "PLX holder reward" (`payoutType: base`, roundId
  `PLX-HOLDER-…`) as estate income. Off by default. Only receipts after it is turned on are counted.

Status: `/api/estates/status` → `monthlyPlan.policyV4.polluxXrp` (`receivedByKind`, `payoutAsset`, `imgBatches`,
`imgPaidUnits`) and `polluxBurnHeld`. Per owner: `/api/estates/payouts` → `polluxRewards.xrp.imgPayments`.

## LP bookkeeping adjustments
`scripts/estate-lp-adjustment.cjs` books an operator-initiated IMG/PLX LP send. It defaults to a read-only dry run, signs nothing,
is keyed by tx hash, and the tx is proven on the validated ledger. Tracked IMG/PLX LP = migration LP + v4 IMG/PLX deposits + adjustments,
shown as `plxMigration.imgPlxLpTracked`. The Nov 17, 2026 operator "pool unlock" send of 1,000 LP to Pollux
(`EDF5C1A5…2144`) is booked with `--apply --confirm=ADJUST-EDF5C1A5`.
