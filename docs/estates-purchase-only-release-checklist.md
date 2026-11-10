# Estates purchase release checklist — HOLD until verified

> **Nov 9, 2026 — operator decision:** the operator (Derrik) waived outside legal review for Estates property purchases and approved the IMG/RLUSD monthly plan (policy v3, no PLX). The counsel-signoff gate (`ESTATE_PURCHASE_LEGAL_SIGNOFF` / `ESTATE_PURCHASE_LEGAL_REFERENCE`) is replaced by an explicit operator acceptance flag: `ESTATE_OPERATOR_TERMS_ACCEPTED=1` plus `ESTATE_OPERATOR_ACCEPTANCE_REFERENCE=operator-waiver-2026-11-09`. Published, hash-pinned purchase terms are still required. The go-live steps for the monthly plan are in `docs/estates-monthly-img-rlusd-plan.md`.

The purchase flow and optional rewards are distinct. This checklist is a **release procedure**, not authorization or evidence that launch requirements are satisfied. Never turn on customer XRP payment requests based solely on a green GitHub Actions run.

## Release blockers (currently unresolved)

1. The shared treasury guard is **paused** following an unexpected external AMM transaction. Independently reconcile the flagged IMG/PLX withdrawal and the registered legacy position, including any existing liabilities and signer security before unpausing. Do **not** bypass or disable the guard merely to accept new deposits.
2. Legal review: **waived by the operator on Nov 9, 2026** (reference `operator-waiver-2026-11-09`). `docs/estates-arizona-legal-launch-review.md` is kept for history only.
3. The purchase terms must be versioned and served over HTTPS. Current version: `estates-terms-2026-11-09`, served by the app at `/terms/estates-purchase-terms-2026-11-09.html`, SHA-256 `ab16c483a252b4592b087b7d126f28a24fa9a19db2b17693533281d9b469898c` (a unit test pins this hash; editing the page requires a new version + hash). After deploying, run `node scripts/estate-purchase-terms-preflight.cjs` with the ESTATE_PURCHASE_* and operator acceptance variables; it fetches the exact public bytes and rejects redirects, oversized or empty responses, nonpublic URLs and hash mismatches.
4. Validate purchase reserve, Xaman signed payment, exact buyer/treasury and amount, invoice expiration and delayed settlement, server-side ownership persistence, prior-purchase recovery, refund/cancellation/support, and DB backup/restore with new versioned consent columns.

## Purchase-only configuration after independent release approval

Keep the following **disabled** until funding and reward mechanisms have their own verification and legal clearance:

```text
ESTATE_LIQUIDITY_ENABLED=0
ESTATE_XRP_PROFIT_HARVEST_ENABLED=0
ESTATE_DISTRIBUTIONS_ENABLED=0
```

Only **after** clearing the treasury incident, verified terms and operator acceptance, reserve sufficiency and approved payment-flow tests, the purchase-only service can be configured with:

```text
ESTATE_SALES_ENABLED=1
ESTATE_OPERATOR_TERMS_ACCEPTED=1
ESTATE_OPERATOR_ACCEPTANCE_REFERENCE=operator-waiver-2026-11-09
ESTATE_PURCHASE_TERMS_VERSION=estates-terms-2026-11-09
ESTATE_PURCHASE_TERMS_SHA256=ab16c483a252b4592b087b7d126f28a24fa9a19db2b17693533281d9b469898c
ESTATE_PURCHASE_TERMS_URL=https://burn-city-game.fly.dev/terms/estates-purchase-terms-2026-11-09.html
```

These inputs combine with existing mainnet, `DRY_RUN=false`, Xaman credentials and treasury address checks. A **paused** treasury still blocks new reservation and Xaman payment creation. A previously signed payment can be finalized after validation while paused so customer funds are not stranded.

The public property quote includes the approved terms URL/version/digest. The UI requires a buyer checkbox and submits the exact version and digest to the server; each accepted reservation stores immutable terms version, hash and acceptance time. A legacy reservation with missing acceptance cannot create a **new** payment request. Confirm the deployed backend and frontend versions match before public access.

## First controlled real purchase (only after all above approvals)

- Use a separate authenticated buyer wallet, not the treasury.
- Verify the actual quoted tier price and published terms before approving the Xaman XRP payment.
- Verify the validated on-chain transaction hash, destination, amount, unique property ownership, reservation settlement, and v3 capital earmark.
- With funding disabled, **keep earmarked capital protected in the treasury**, not silently spent or classified as profit. Automatic IMG/RLUSD deposits (`ESTATE_MONTHLY_PLAN_ENABLED`) stay **OFF** for the first controlled purchase; hourly distributions are retired.
- Confirm no late/duplicate payments and that any expired payment remains in review rather than making the property available for a second buyer.
- Stop additional offers immediately if the ledger, treasury pause, reconciliation, terms, or property state is inconsistent.

**No guaranteed return:** property purchases do not convey real property, pool ownership or a claim to AMM income. Unverified, discretionary potential bonuses are not entitlements. None of the settings above guarantee investment principal preservation.

## Additional Xaman payment gate

Even if a caller bypasses the normal reservation route, a Xaman session configured with `requiredTerms` now independently verifies the reservation's accepted terms version, SHA-256, and timestamp before creating a new XRP payment request. Previously accepted terms remain in the reservation; advancing the terms version blocks creation of **new** payment requests against stale accepted versions. Existing signed payloads still require the ordinary validated-ledger and expiration/late-payment reconciliation paths; a policy update must not simply discard customer payments.
