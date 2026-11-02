# Prospective-only Estates IMG/RLUSD rewards — implementation boundary

**Status:** New reward start/gate components are calculation and staging infrastructure only. No production start has been staged, no earnings have been credited, and no payment authorization is implied.

## Scope

The existing Pollux IMG scanner, legacy hourly batches, recorded entitlements, payment credits, and prior owner payout records remain untouched. An owner's decision not to pursue historical discretionary bonuses does **not** erase previously accrued, confirmed, or queued obligations. Reconciliation, any authorized cancellation, and audit evidence must be separate, deliberate operator processes.

Future IMG/RLUSD distributions may begin at a new independently verified ledger boundary, without historical reward backfills for the *new* stream:

1. Confirm legal authorization, designated pool/LP issuer, verified treasury ownership, all relevant liabilities, and conservative accounting of capital and reserves.
2. At the validated start ledger, calculate the LP position's realizable value in a **single reporting currency**. Set protected principal floor to the higher of original invested capital's independently reconciled value and the current opening liquidation value. The latter avoids retroactively paying accumulated, unrealized pre-activation appreciation as new profit.
3. Use `planProspectiveRlusdStart` and `createEstateRlusdForwardStartStore.stage` only after the upstream ledger and financial evidence checks have passed. This stages an immutable start in a new additive table. It cannot move the start backwards. No automatic startup, funding, signing, or payout actions use the staging API.
4. The earliest eligible reward hour is the **first complete UTC hour beginning after** the start ledger's close time. Only validated, de-duplicated, post-start realization receipts from the correct IMG/RLUSD pool can pass the calculator.
5. For each candidate receipt, verify the retained pool basis, new deposits, existing liabilities, operating reserve, prior realized losses, fresh liquidation value, independent liquid reward surplus, and owners as of the receipt's verified time.
6. Enqueue a payment only after a separately reviewed, transactional, idempotent reward execution integration is implemented, audited, and enabled. The current `inspectProspectiveRlusdReward` is not a signer or a credit-allocation worker.

## Explicitly prohibited

- Treating the currently held LP balance, pool reserves, AMM fee estimates, historical price appreciation, or a manually withdrawn position as realized earnings.
- Resetting `estate_hourly_payouts`, `estate_img_hourly_entitlements`, credits, previous scanner checkpoints, original acquisition cost, or existing treasury intent journals.
- Reducing protected capital merely to create a positive reward capacity.
- Enabling live Estate sales/rewards or unpausing the treasury on the basis of this module alone.

AMMs carry market risk. The protection here is an accounting and execution ceiling, **not** a guarantee that the market value of treasury liquidity cannot decline.

## Held forward-only allocation ledger (draft implementation)

`createEstateRlusdForwardAllocationStore(db)` records **only nonpaying accounting drafts** from independently verified, prospective, realized IMG/RLUSD profit evidence. It requires a previously staged immutable start and an exact `micro_RLUSD` reporting unit, uses settled estate ownership snapshots at the validated realization timestamp, and allocates with deterministic largest remainders across weighted owners.

For every candidate realization the store subtracts ALL prior held forward allocations from three independent ceilings: cumulative realized profit after carried losses, independently verified liquid surplus, and liquidation headroom above principal and other reserves. A unique realization hash and SQLite `BEGIN IMMEDIATE` prevent accidental replay/concurrent double allocation. Each row is permanently `held` in a separate forward-only table; no existing IMG hourly payout, credits, scanner checkpoints, or ownership tables are modified.

`previewClosedHour(epochStartMs, verifiedThroughMs)` groups drafts by owner for the requested full UTC hour and checks their sum. The verified-through watermark **must come from a separately authenticated validated ledger scanner**, not wall-clock time. This is a display/accounting preview, **not** an executable claim, approval or authorization to pay.

The caller must independently prove the profit receipt, cumulative realized amounts, loss carry, valuation freshness, source identity, liabilities, treasury reserve, and pool ownership. Input booleans alone are **not** evidence. No live ingestion adapter or signer is connected yet, and status remains `held`.

### Additional conditions before enabling any hourly payment

- Independent validated receipt ingestion with durable proof of actual realized liquidity (not an AMM fee estimate or unrealized gain), transaction uniqueness, and exact treasury inventory.
- Atomic reservation and reconciliation across IMG/RLUSD draft allocations and ALL other treasury obligations.
- Verified conversion/trustline/fee-budget mechanics for the chosen IMG or XRP settlement, followed by a manual-reviewed testnet and carefully reconciled first mainnet settlement.
- Counsel clearance and reviewed, versioned terms before public sales or payout activation; current unexpected-outgoing-transaction pause remains intact.

## Verified IMG/RLUSD withdrawal evidence (audit snapshot)

The validated-ledger read-only scan in [Estates safety audit run 41398395951](https://github.com/Xrpassassin/burn-city/actions/runs/41398395951) examined 87 treasury transactions through ledger **108061175**, with complete account-history pagination, and found **zero IMG/RLUSD `AMMWithdraw` transactions**. Consequently it reported **zero independently verified distributable profit** and did not create entitlements.

`server/estate-rlusd-realized-withdrawal-evidence.js` verifies the dual-asset withdrawal shape using actual ledger-state deltas for IMG and RLUSD treasury credits, a positive IMG/RLUSD LP burn, the XRP network fee, treasury identity, pool LP issuer, success and validation. Even a valid withdrawal is still **capital plus assets returned**; the code intentionally reports `distributableProfitUnits:'0'` and `realizedProfitVerified:false`. It cannot be used to label returned principal as income.

For real hourly rewards, the accounting engine must independently verify economic gain **after** the asset cost basis, prior loss carry, pool position liquidation value, outstanding historical obligations, network fees and settlement costs. AMM fees normally accrue inside the pool and are **unrealized** until a validated economic realization occurs. An hourly check can show no payout for an unprofitable hour and must not withdraw liquidity merely to force an hourly reward. No APR, yield, profit or principal stability is guaranteed.

The present forward allocation store is deliberately a held **simulation/accounting draft** interface: its numeric profit fields and Boolean verification flags are **not independently authenticated inputs**. Do not attach it to customer-accessible endpoints or a signer; build a validated realization-and-valuation ingestion adapter before any actual reward claim or payout. Treasury remains paused for unrelated unresolved withdrawal reconciliation, customer-capital checks and legal review.
