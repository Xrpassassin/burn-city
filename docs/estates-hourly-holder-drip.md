# Estates hourly holder drip (IMG/RLUSD, with IMG burn)

Requested by the operator (Derrik) on Nov 15, 2026: bring back hourly payouts to property holders, funded by 90% of the Estates IMG/RLUSD position, and burn IMG on every payout. **Ships OFF.** Merging this changes nothing until `ESTATE_HOURLY_DRIP_ENABLED=1` and `ESTATE_HOURLY_DRIP_MAX_LP` are set.

## Background: the old hourly system (retired Nov 2)

Policy v1 put 70% of each purchase into the IMG/PLX AMM (`rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ`) and 30% into IMG/XRP. Pollux (`r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V`) paid hourly IMG rewards to IMG/PLX LP holders. `estate-hourly-runtime.js` scanned validated ledgers for those receipts, allocated each one by property share units to the owners at receipt time, closed hourly batches and queued payouts (IMG, or XRP by owner preference). It paid 5 receipts (Oct 27–28, about 0.23 IMG total). The operator withdrew the IMG/PLX LP, sold the PLX and created the IMG/RLUSD pool, so the engine had no income source. It now only runs with `ESTATE_LEGACY_HOURLY_ENGINE=1`, which stays unset.

## What the drip does

The new drip has no outside reward source. It pays holders from the LP itself.

1. **Budget.** On the first enabled run, it takes a one-time snapshot: `budget = min(treasury IMG/RLUSD LP × ESTATE_HOURLY_DRIP_BUDGET_BPS (default 9000 = 90%), ESTATE_HOURLY_DRIP_MAX_LP)`. The cap is the LP amount the operator approved, and the drip refuses to start without it. The other 10% stays in the pool as principal under the existing daily/monthly fee harvest.
2. **One slice per UTC hour.** Each slice is `budget / ESTATE_HOURLY_DRIP_HOURS` (default 2160 h = 90 days), and the last slice takes the remainder. Missed hours are not caught up, so the program simply runs longer and a pause or outage never dumps a large withdrawal.
3. **Withdraw.** A proportional `AMMWithdraw` (`tfLPToken`) that pulls both IMG and RLUSD, capped at the slice.
4. **Burn.** `ESTATE_HOURLY_BURN_BPS` (default 322 = 3.22%) of the slice *value* is sent as IMG to the IMG issuer `rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd`, which destroys it. The withdrawal is equal value per side, so this is 6.44% of the IMG withdrawn. RLUSD is never burned.
5. **Pay.** The rest goes to holders pro rata by current `share_units` (Trailer 1, Apartment 5, Starter 25, Family 50, Mansion 100), with the same snapshot rule as the monthly plan. Payouts are in IMG and RLUSD. Amounts below `ESTATE_HOURLY_DUST_RLUSD` (default 0.01 RLUSD of value) carry forward in `estate_hd_carry`. A validated `tec` result (for example, no trust line) also carries forward. Rounding residue carries as `__unallocated__`. At most `ESTATE_HOURLY_MAX_PAYOUTS_PER_RUN` (default 60) payments are made per tick.
6. **Bookkeeping.** Each drip withdrawal reduces the monthly plan's tracked LP and principal pro rata to the start snapshot. The daily harvest then keeps paying fee gains (10% burn / 10% redeposit / 80% holders) on what stays in the pool. New purchases still deposit as principal and are not added to the drip budget.

## Safety

- The drip runs inside the existing monthly-plan tick (single-flight), so it never signs concurrently with deposits or harvests.
- It needs every plan gate: `ESTATE_MONTHLY_PLAN_ENABLED=1`, mainnet, the signer matching the treasury, and the verified pool account.
- Every transaction goes through `assertSafeTransaction`. Only three kinds are allowed: a proportional withdraw capped at the slice, an IMG payment to the issuer, and payments to current holders.
- Every hash and blob is stored in `estate_mp_txs` before submit. A restart resumes the same step and never re-signs. `watch.js` already treats those hashes as known treasury transactions.
- **Kill switches:** unset `ESTATE_HOURLY_DRIP_ENABLED` (stops at the next tick), or use the shared treasury pause (stops every step).
- **Ledger tables:** `estate_hd_program` (immutable start snapshot), `estate_hd_runs` (one row per hour: LP in, IMG/RLUSD out, IMG burned, split), `estate_hd_payouts`, `estate_hd_carry`.
- `/api/estates/status` → `monthlyPlan.hourlyDrip` shows aggregate progress only, with no addresses.

## Go-live (operator approval required)

1. Back up `/data/shop.db`.
2. Set `ESTATE_HOURLY_DRIP_MAX_LP` to the approved LP cap (for example, 90% of the treasury LP at approval time).
3. Optionally set `ESTATE_HOURLY_DRIP_HOURS`, `ESTATE_HOURLY_BURN_BPS` or `ESTATE_HOURLY_DUST_RLUSD`.
4. Set `ESTATE_HOURLY_DRIP_ENABLED=1`.
5. Watch the first hour: look for `[OUTGOING-TX] estate-monthly-submit` with `hd:` steps, and check `monthlyPlan.hourlyDrip`.

No separate lump withdrawal is needed, because the LP stays in the pool and keeps earning fees until each hourly slice is withdrawn.

## Tests

`node server/estate-hourly-drip.test.js` (in `npm test`).
