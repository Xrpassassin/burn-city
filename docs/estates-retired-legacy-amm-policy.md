# Estates v2 — retire legacy AMM trading without erasing history

**Active financial rail:** IMG/RLUSD (99% purchase allocation) with a 1% XRP operating reserve. **Automatic funding, payouts and sales remain disabled until separately authorized.**

**Retired trading rails:** IMG/PLX and IMG/XRP. These pools remain as historical position and accounting records only. The runtime never automatically creates new jobs from historical policy-v1 capital allocations, nor submits new buys, deposits, harvests or conversions associated with previously recorded legacy positions.

## Guardrails

- `createEstateLiquidityRuntime` defaults `legacyTradingEnabled:false`. `createEstateHourlyService` passes that value explicitly; it cannot be enabled through an operator environment toggle. The true option is used only in historical regression fixtures to verify backwards accounting semantics, not the live service.
- Legacy jobs and purchase records remain untouched for audit and existing legal/credit obligations. Historic transaction submissions can still be reconciled by the unchanged treasury executor, but no fresh legacy transaction is signed.
- A legacy job's existing queued treasury intent is blocked by the independent `beforeSign` restriction, not merely by the scheduler skip.
- An operator-approved future migration must use separately verified historical proof, custody, conservative valuation, fee and reserve checks, and an **append-only journal**. Do not silently treat withdrawn legacy liquidity as IMG/RLUSD principal, assume the 3 XRP customer allocation is already covered, or write over the old jobs.
- New policy-v2 positions continue to be eligible for processing **only** behind the existing treasury pause, pool readiness, signer and funding gates.
- Legacy payout liabilities and confirmed historical owner rewards are not waived or deleted; the corresponding accounting/reconciliation logic is preserved.

## Current blocker

[Issue #517](https://github.com/Xrpassassin/burn-city/issues/517) documents the old customer IMG/PLX LP mismatch. We **do not** need to deposit back into PLX to launch the new model; rather, the customer obligation must be demonstrably resolved or represented by other verified assets before any release of the shared treasury pause. The security hold remains distinct from any choice of AMM trading pool.

**Do not enable purchases or payouts on the basis of this patch.**
