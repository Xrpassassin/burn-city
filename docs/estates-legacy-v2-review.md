# Estates — retiring the historical 3 XRP purchase into a future IMG/RLUSD review

**Status: unverified proposed accounting treatment only. No actual transfer, conversion, refund, booking change, or treasury pause release.**

An original purchase funded the policy-v1 arrangement with **3 XRP**:
- 2.1 XRP was allocated to historical IMG/PLX, and 0.9 XRP to historical IMG/XRP.
- The live trading worker has retired both legacy pools. No fresh PLX trade or PLX liquidity is part of the future policy.
- The **proposed policy-v2 breakdown** of the original 3 XRP is 2.97 XRP IMG/RLUSD with a 0.03 XRP operating reserve. This is a **planning target**, not proof that 2.97 XRP is currently held in that pool or that the old purchase has been migrated.

## Review-only implementation

`inspectLegacyEstateCapital(db, purchaseTx)` reads the original settled ownership, both historical policy-v1 liquidity jobs, their recorded LP tokens, initial budgets, residual cash and cost basis. It requires conserved purchase budgets and a complete expected job inventory, then computes a hypothetical v2 split.

`createLegacyEstateReviewJournal(db).stageUnverifiedReview(...)` can store a **single, immutable proposal** for that purchase, including a SHA-256 fingerprint of the original position records. It inserts into a separate `estate_legacy_v2_review_proposals` table and refuses duplicate records; update and delete operations are blocked by database triggers. This does **not** alter `estate_capital_allocations`, `estate_liquidity_jobs`, `estate_property_ownership`, payout credits, owner entitlements, treasury reserve values, or the active automation configuration. No automatic code path calls this method.

The owner's portfolio labels this legacy position **Retired historical allocation (not active liquidity)**, rather than inaccurately displaying the outdated IMG/PLX position as a currently invested earning pool. Property access and historical payment records remain intact.

## Requirements before any actual capital migration

1. Independently verify and document the relevant original purchase, LP mint, manual withdrawal, PLX conversion and IMG/RLUSD acquisition hashes with validated on-chain balance changes.
2. Reconcile any customer/owner capital entitlement with the available **economically valued** assets, and other outstanding credit obligations. A 3 XRP purchase does not imply that 3 XRP or 2.97 XRP is currently available in cash.
3. Identify actual treasury-controlled replacement assets and their beneficial ownership; document conservative liquidation value and transaction costs, or agree a lawful settlement/refund.
4. Obtain any necessary owner consent, operator authorization, and counsel approval of the new transaction terms. Make an independent append-only **executed transfer** record only after validation, not by changing an old `invested` row to `migrated`.
5. After real financial and legal review, assess whether the safety pause can be released. Neither the review proposal nor this branch grants that permission.

## Existing incident

[Issue #517](https://github.com/Xrpassassin/burn-city/issues/517) remains open. The treasury's original IMG/PLX LP balance was **0** versus **1,940.67982383456** recorded in the old job at the checked ledger. We have a validated withdrawal trail, but not sufficient evidence to treat customer capital as replaced. Do **not** reactivate PLX liquidity solely to remove the discrepancy.

The forward policy is **IMG/RLUSD only**. Purchases, bonus distributions and automatic funding remain disabled pending signoff.
