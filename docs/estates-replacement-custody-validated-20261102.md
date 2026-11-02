# Estates — verified replacement-custody snapshot (2026-11-02)

**Status: read-only reconciliation evidence. Does NOT execute or approve a historical capital migration, release the treasury pause, turn on property sales or create payouts.** The future operating pair remains **IMG/RLUSD only**. IMG/PLX and IMG/XRP here are historical custody evidence, not permitted new funding rails.

Validated from [CI audit #41531353835](https://github.com/Xrpassassin/burn-city/actions/runs/41531353835), XRPL **ledger 108075308**, with simultaneous `amm_info` and treasury `account_lines` at exactly that ledger. The original **3 XRP purchase** was independently verified as a validated mainnet payment from the recorded buyer to the Estates treasury.

## Gross LP custody

| Pool (all values are matched to ledger 108075308) | Treasury LP tokens | Pool LP supply | Observed treasury ownership |
|---|---:|---:|---:|
| Historical IMG/PLX | 0 | 8,788.377075829513 | Zero LP |
| Historical IMG/XRP | 1,057,422.96985061 | 11,529,857.64696958 | ~9.1712% |
| New IMG/RLUSD | 98.1262902666762 | 98.1262902666762 | 100% |

The **recorded historical customer positions** are 1,940.67982383456 IMG/PLX LP and 11,157.61391981 IMG/XRP LP. The latter is covered by treasury-owned LP quantity. The former is **not** covered by the corresponding old LP, consistent with the known unjournaled manual withdrawal; this is not automatically a loss or debt valuation.

The new IMG/RLUSD pool contains **2,296.68301327368 IMG** and **4.203520103571771 RLUSD** in gross AMM reserves. The treasury owns the corresponding entire LP supply. Neither this ownership nor the initial `AMMCreate` transaction proves that its principal is beneficially attributable to the single historical Estate purchase.

The retired IMG/XRP position's **gross treasury share of reserves** is about **40.8871 XRP** plus **27,655.60 IMG** at the snapshot; these are **not** a guaranteed withdrawal quote, distributable funds, or assets assigned to the historical customer. Fees, pool changes, transaction costs, slippage, other owners, and treasury-wide liabilities remain to be reconciled. The deposited cost-basis journal and gross reserve proportions are not equivalent to actual economic gain.

## Itemized historical reward balances

A later [read-only liability audit #41532264796](https://github.com/Xrpassassin/burn-city/actions/runs/41532264796) inspected production records alongside validated XRPL ledger **108075402**. It found:

- 4 historic IMG entitlement rows containing **161207 recording units** in total.
- 4 corresponding hourly payout rows, **all state = confirmed**, also totaling **161207 recording units**.
- No queued, preparing, submitted or held hourly payout rows.
- 1 IMG payout-credit row, but its outstanding value is **0**.
- No reward carryovers, XRP reward credits, XRP-profit payout rows, or XRP-profit credits.

The apparent match between entitlements and confirmed payout totals is useful, but those totals **overlap** and must never be added as separate liabilities. Recorded confirmed status does not independently validate historical transfer delivery; review transaction proofs before formally declaring all obligations discharged. The historical 3 XRP capital claim is **separate** from this reward accounting and remains unresolved. No earlier earnings are automatically cancelled or retroactively recalculated.

## Evidence and release requirements

- The reproducible audit is `scripts/estate-replacement-custody-evidence.cjs` with pure, same-ledger validation in `server/estate-replacement-custody-snapshot.js`. It can read the production database in query-only mode and **never writes it**.
- Its original purchase is validated, and two old LP positions are matched to their exact issued-token currency and pool issuer. It reports separate booleans for *LP quantity coverage*, *new-pool custody*, *capital attribution* and *activation*. The final three remain explicitly unproven or unauthorized as applicable.
- Obtain independent owner/operator asset attribution and conservatively executable net value, resolve unpaid credits and held capital, and document an authorized, append-only executed migration or settlement of the old capital. A proposed 2.97 XRP IMG/RLUSD + 0.03 XRP reserve is a **planning split**, not a completed migration.
- Complete independent legal review of the property/bonus offering and final purchase terms. Issue [#517](https://github.com/Xrpassassin/burn-city/issues/517) remains **open** until independently reconciled.

**Do not restore PLX, manipulate historical entries, sign new payments, or clear the shared treasury hold solely on these balances.**
