# Estates monthly IMG/RLUSD plan (allocation policy v3)

Approved by the operator (Derrik) on Nov 9, 2026. **Everything ships OFF.** Nothing moves funds until the go-live switches below are set by the operator.

## What it does

1. **Purchase**: the buyer pays XRP through Xaman to the Estates treasury (unchanged settlement path). Allocation policy **v3** books it as:
   - an operating reserve kept as XRP (`ESTATE_XRP_RESERVE_BPS`, default 100 = 1%, optional floor `ESTATE_XRP_RESERVE_MIN_DROPS`);
   - the rest as IMG/RLUSD principal, queued for a two-sided deposit.
2. **Deposit** (`server/estate-monthly-executor.js`): each run spends at most `ESTATE_MAX_DEPOSIT_DROPS` (default 8 XRP, sized so a 4 XRP leg into the ~437 XRP IMG/XRP pool stays near the 1% impact cap). About half is swapped to RLUSD (XRP/RLUSD market) and half to IMG (IMG/XRP market). Both swaps are Payments to the treasury itself, with a capped `SendMax`, an exact minimum delivery and no partial-payment flag. Then one `AMMDeposit` with `tfTwoAsset` puts in IMG and RLUSD at the pool's exact ratio. The treasury keeps the LP tokens.
   - **Instant start:** when a purchase settles (normal or late confirm), its deposit is queued and a deposit run starts right away, without delaying the buyer's response.
   - **Cadence:** while any deposit is queued, a chunk runs every `ESTATE_DEPOSIT_CHUNK_INTERVAL_MS` (default 300000 = 5 min, allowed 1–60 min). When the queue is empty, the service goes back to hourly. The harvest check still runs at most hourly.
   - **Sizing:** a chunk is at most `ESTATE_MAX_DEPOSIT_DROPS`, halved while either swap leg would exceed the 1% impact cap.
   - **Guards:** all guards are unchanged. A guard hold waits for the next interval.
   - **Errors:** public-node rate-limit errors back off 10/20/40/60 min. A failed ledger step is never re-signed, and the service drops to hourly checks.
   - **Single-flight:** two deposit runs never overlap.
3. **Harvest**: after each completed reward period ends, the plan withdraws (proportional `AMMWithdraw`, `tfLPToken`) **only** the LP value gained above principal. The period is a UTC month by default (`ESTATE_HARVEST_CADENCE=monthly`, or unset). Set `ESTATE_HARVEST_CADENCE=daily` for one harvest per completed UTC day. Period keys are idempotent (`YYYY-MM` or `YYYY-MM-DD`); a restart never double-pays a period, and a cadence switch cannot re-harvest coverage already recorded under the other key format. Principal is tracked per deposit in constant-product invariant units: `principal_k += LP received × sqrt(IMG×RLUSD)/LP supply`. That ratio grows only from trading fees, not from price moves, so price swings and impermanent loss are never "harvested" and principal stays in the pool. LP the plan did not deposit (for example the operator's own LP) is never touched. A harvest with no gain, or (in daily mode) a gain whose withdrawn value is under the dust threshold, is recorded as `nothing_to_harvest` and the gain stays in the pool.
4. **Split** of the realized period, by value at pool price:
   - **10% IMG burn**: IMG is sent to the IMG issuer `rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd`, which destroys it. It uses the IMG received from the withdrawal, so no extra buy moves the tiny pool.
   - **10% redeposit**: a two-sided deposit back into IMG/RLUSD, which becomes principal.
   - **80% to holders**, pro rata by current `share_units` of `estate_property_ownership` at the moment of the split (the wallet that owns the property when the split is made). Ownership is not time-weighted over the period; a mid-period buyer who still holds at the split receives that period's full pro-rata share. Daily cadence shortens that window to one UTC day.
   A proportional withdrawal from a 50/50 pool is equal value per side, so per asset this is: IMG 20% burn, 10% redeposit, 70% holders; RLUSD 0% burn, 10% redeposit, 90% holders.
5. **Payouts**: in IMG and RLUSD to the owner wallet, on the configured cadence. Amounts below `ESTATE_PAYOUT_DUST_RLUSD` (default 0.05 RLUSD of value) carry forward to a later period. Payments that fail on ledger (for example no trust line, `tecPATH_DRY`) also carry forward. Rounding residue carries as `__unallocated__` and joins the next period's pot. Rewards are not guaranteed; they are paid from realized pool fee gains when available.
6. **No PLX**: no IMG/PLX allocation, no copytrading, and no LP sent to any other wallet. The hourly payout, funding and harvest engine is retired. It only runs with an explicit `ESTATE_LEGACY_HOURLY_ENGINE=1`, which must not be set.

## Hard guards (`assertSafeTransaction`, checked before every signature)

- Only these transaction types: `AMMDeposit`, `AMMWithdraw`, `Payment`.
- **No Payment (or any tx) to the AMM account.**
- **No single-sided deposit**: flags must be exactly `tfTwoAsset`, with both `Amount` and `Amount2` positive and no `EPrice`.
- Withdrawals are proportional `tfLPToken` only, capped at the computed profit LP.
- Payments go only to the treasury itself (swap), the IMG issuer (burn) or a current holder (payout), with no partial payments.
- Before swapping: price impact per leg ≤ `ESTATE_MAX_PRICE_IMPACT_BPS` (default 100 = 1%). Slippage floor is `ESTATE_SWAP_SLIPPAGE_BPS` (default 100). The pool price must be within `ESTATE_MAX_POOL_DEVIATION_BPS` (default 300) of the IMG/XRP × XRP/RLUSD reference.
- If any guard trips, the funds stay queued in the treasury with a note, and nothing is sent.
- The pool is checked on the ledger each run: `amm_info(IMG, RLUSD)` must return `rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f`, not frozen.
- Every signed tx hash and blob is stored before submit (`estate_mp_txs`). A restart resolves the same tx; it never re-signs while one may still validate. `watch.js` treats these hashes, and jetpack IMG-burn batch hashes, as known treasury transactions.
- The shared treasury pause (`guard.paused()`) stops every step.
- XRP still waiting to be deposited is protected from game payouts by the guard reserve.

## #517 reconciliation decision

The single historical sale (trailer-01, 3 XRP, tx `9AE6CD49…288B`) was booked under retired policy v1 (70% IMG/PLX, 30% IMG/XRP). By operator decision on Nov 9, 2026 it is re-booked under policy v3 as IMG/RLUSD principal, pending deposit: 2.97 XRP principal plus 0.03 XRP reserve. The legacy liquidity jobs are marked `superseded_policy3`, and the prior rows are archived verbatim in `estate_mp_migrations`. Run `node scripts/estate-517-rebook.cjs` (dry run) and then `--apply` on the server after backing up `shop.db`. It changes bookkeeping only and sends nothing.

## Go-live checklist (operator)

1. Back up `/data/shop.db`. Run the #517 re-book (dry run, then `--apply`).
2. Resolve the treasury pause (review the flagged transactions, then `POST /admin/unpause`).
3. Make sure the treasury holds enough spendable XRP for the queued principal plus reserves.
4. Set the secrets in `docs/estates-purchase-only-release-checklist.md` (sales and terms), plus `ESTATE_IMG_RLUSD_POOL_ACCOUNT=rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f`.
5. Run the terms preflight against the live URL.
6. Do one controlled real purchase with `ESTATE_MONTHLY_PLAN_ENABLED` still off. Verify ownership and the v3 earmark.
7. Set `ESTATE_MONTHLY_PLAN_ENABLED=1`. Watch the first deposit (`/api/estates/status` → `monthlyPlan`, and `[OUTGOING-TX] estate-monthly-*` logs).
8. Keep `ESTATE_LEGACY_HOURLY_ENGINE`, `ESTATE_LIQUIDITY_ENABLED`, `ESTATE_XRP_PROFIT_HARVEST_ENABLED` and `ESTATE_IMG_RLUSD_FUNDING_ENABLED` unset.
9. Optional daily harvest (default stays monthly until this is set): `ESTATE_HARVEST_CADENCE=daily`. After merge, this is the only plan switch required to change the harvest schedule. `/api/estates/status` then reports `distributionSchedule` and `monthlyPlan.cadence` as `daily`. To publish the period-based terms (`client/terms/estates-purchase-terms-2026-11-10.html`, SHA-256 `04d3c9fc27804a84e2de71bc62a458460ba059354c5a56709df84eccd27d4881`), also point `ESTATE_PURCHASE_TERMS_VERSION`, `ESTATE_PURCHASE_TERMS_SHA256` and `ESTATE_PURCHASE_TERMS_URL` at that document; existing purchases keep the terms they accepted.

## Tests

- `node server/estate-monthly-plan.test.js` (in `npm test`) covers split math, the principal-only harvest, guards, monthly and daily cadence, dust carry, the terms hash pins and the #517 migration.
- `node server/estate-harvest-cadence.test.js` covers daily idempotency, principal-only withdraw, daily under-dust gains left in the pool, snapshot holder shares, crash resume, and unchanged monthly default behavior.
- `TESTNET_WSS=wss://testnet.xrpl-labs.com node scripts/estate-monthly-plan-testnet.cjs` runs the full flow on public testnet with fresh faucet wallets and throwaway IOUs: purchase, chunked two-sided deposit, guard trip, fee growth, harvest, burn, redeposit, payouts and carry.
