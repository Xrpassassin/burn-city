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

## Independent historical payment verification

[GitHub Actions run 41537663524](https://github.com/Xrpassassin/burn-city/actions/runs/41537663524) fetched every recorded confirmed Estate payout by its transaction hash and independently checked the validated XRPL Payment, payer, owner destination, original submitted transaction, memo, delivered token amount, actual treasury IMG balance debit, spent amount and zero remainder.

- Exactly **4 / 4** historical payouts independently verified.
- IMG issued-token balance debited across those four transactions: **0.161207 IMG** (161207 IMG micro-units).
- The existing payout credit row records **zero IMG** due; the checked native reward/XRP credit tables are empty.
- No additional historical rewards were minted, transferred, promised or waived by this audit.

Thus the previous confirmed-payout status now has on-chain evidence. This does not discharge the original capital allocation or any unrelated legal obligations.

## Verified legacy PLX conversion output

The same [validated historical transaction audit](https://github.com/Xrpassassin/burn-city/actions/runs/41537663524) fetched treasury self-payment `2762310505CB5C6B4F556C77CACDDD114281331F90F6964BCBBB5B5297D82F3C`, ledger **108015978**. The validated ledger metadata proves a treasury balance change of **−13,330.3455626686 PLX** and **+2,397,661 XRP drops (2.397661 XRP)** excluding the transaction fee of **12 XRP drops**. There was **no IMG or RLUSD balance change** in this transaction. The PLX quantity spent exceeds the 13,172.413752276136 PLX credited in the earlier manual LP withdrawal; other treasury PLX balances were therefore involved or available. This is an asset swap in an operator-controlled wallet, not independently verified beneficial ownership transfer for the one old Estate.

The conversion output is **not** proof that 2.397661 XRP is currently on hand, belonged specifically to the 3 XRP purchase, remains unencumbered, or was later invested into IMG/RLUSD. Do not rebook customer capital merely because an earlier swap grossed XRP proceeds. The old 1,940.67982383456 IMG/PLX LP custody gap remains unresolved.

The custody audit is resilient to transient public-node lag, using one stable previously validated ledger for all pool balances and retrying only transient RPC availability errors. Neither recovery handling nor these forensic transaction reports can clear the treasury pause.

## Operator-attested retirement and RLUSD funding sequence

**2026-11-02 operator clarification:** The operator states that **they personally sold the retired PLX, acquired RLUSD, and contributed liquidity to the IMG/RLUSD pool**. This is an operator statement of intent/authorization; it is not a standalone on-chain proof that a specific historical buyer's entire purchase cost basis was transferred.

The previous phrase “unexpected outgoing transaction” refers to the accounting service's **unreconciled journal entry**, not an unknown actor or suspected unauthorized third-party attack. Do **not** infer theft from that pause reason. The operator-directed conversion explains why old IMG/PLX LP custody is zero and does **not** justify requiring a new PLX purchase or deposit. Existing validated evidence covers the IMG/PLX withdrawal, PLX-to-XRP conversion (2.397661 XRP credited), and subsequent IMG/RLUSD AMM creation (3,100 IMG and 3.106054465 RLUSD supplied). The intermediate RLUSD acquisition path remains to be checked independently.

The remaining task is **append-only attribution/settlement** of the original historical 3 XRP Estate purchase, any accrued liabilities and net executable value, plus independent legal release review—not restoring legacy PLX LP tokens. No retrospective reward reset, fund movement, revenue guarantee or sales activation follows from this clarification.

## Intermediate XRP → RLUSD acquisition now independently verified

Following the operator's first-person clarification that they personally retired PLX, sold it and bought RLUSD for the new pool, the **validated event-by-event read-only trace** in [GitHub Actions #41539537672](https://github.com/Xrpassassin/burn-city/actions/runs/41539537672) completed. The transaction sequence within ledgers 108015969–108016045 is:

| Ledger | Transaction hash | Validated treasury balance movement |
|---|---|---|
| 108015969 | `581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2` | IMG/PLX LP withdrawal; +1,598.741351076311 IMG, +13,172.413752276136 PLX |
| 108015978 | `2762310505CB5C6B4F556C77CACDDD114281331F90F6964BCBBB5B5297D82F3C` | Sold 13,330.3455626686 PLX; received 2.397661 XRP, plus separate network fee |
| 108016026 | `1405C49328D81079BE24D47C5D7A2A09A974807216BA09F957D25E375B264C27` | Spent 2.5 XRP; received 3.106054465 RLUSD |
| 108016045 | `59FAA96D8EF6A5C35747E22E664A7E0A8FBEA5F373D746B5EF3A58E5558FBE43` | IMG/RLUSD AMMCreate; debited 3,100 IMG + **exactly 3.106054465 RLUSD**, minted 98.1262902666762 LP |

Additional treasury transactions and fees are visible in the full scan; no attempt is made to conceal or attribute them to the Estate. The **RLUSD purchased at ledger 108016026 exactly matches the RLUSD contributed to AMMCreate** 19 ledgers later. The purchase's 2.5 XRP cost exceeds the 2.397661 XRP proceeds of the preceding PLX sale by **0.102339 XRP**, and the 3,100 IMG pool contribution exceeds the earlier LP withdrawal's 1,598.741351076311 IMG return by **1,501.258648923689 IMG**. These differences establish other treasury inventory was used; fungible tokens cannot be tagged as unique proceeds.

**Conclusion:** The operator-initiated transition from retired IMG/PLX through XRP into IMG/RLUSD is now strongly supported by both the operator's explicit statement and independently verified validated-ledger activity. This resolves the *mystery of transaction intent and RLUSD sourcing*, not automatically the original 3 XRP Estate purchase's contractual/economic cost basis or formal ledger classification. No restoration of PLX is needed.

**Remaining release work:** an append-only operator/owner-approved designation of the historical position's treatment in the current treasury, conservative economic valuation and applicable legal clearance. Do not call an old missing IMG/PLX LP an unexplained attack; do not authorize new purchases or erase old books based solely on the migration trace.
