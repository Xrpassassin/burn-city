# Estates purchase-only release checklist — HOLD until verified

The purchase flow and optional rewards are distinct. This checklist is a **release procedure**, not authorization or evidence that launch requirements are satisfied. Never turn on customer XRP payment requests based solely on a green GitHub Actions run.

## Release blockers (currently unresolved)

1. The shared treasury guard is **paused** following an unexpected external AMM transaction. Independently reconcile the flagged IMG/PLX withdrawal and the registered legacy position, including any existing liabilities and signer security before unpausing. Do **not** bypass or disable the guard merely to accept new deposits.
2. Counsel review for the actual Estates offer and purchase/bonus representations remains marked **NOT OBTAINED** in `docs/estates-arizona-legal-launch-review.md`. A virtual property purchase may be presented as a simple consumptive game feature only when the gameplay rights and all marketing/terms support that description. The separate AMM funding and possible future bonuses still require review. A server environment flag does not constitute legal clearance.
3. The attorney-approved purchase terms must be versioned and accessible via HTTPS. The operator must verify the SHA-256 of the actual approved terms, record the counsel signoff reference, and confirm client and server use the exact same version/digest. The code does not independently validate a lawyer's identity.
4. Validate purchase reserve, Xaman signed payment, exact buyer/treasury and amount, invoice expiration and delayed settlement, server-side ownership persistence, prior-purchase recovery, refund/cancellation/support, and DB backup/restore with new versioned consent columns.

## Purchase-only configuration after independent release approval

Keep the following **disabled** until funding and reward mechanisms have their own verification and legal clearance:

```text
ESTATE_LIQUIDITY_ENABLED=0
ESTATE_XRP_PROFIT_HARVEST_ENABLED=0
ESTATE_DISTRIBUTIONS_ENABLED=0
```

Only **after** clearing the treasury incident, verified terms and counsel signoff, reserve sufficiency and approved payment-flow tests, the purchase-only service can be configured with:

```text
ESTATE_SALES_ENABLED=1
ESTATE_PURCHASE_LEGAL_SIGNOFF=1
ESTATE_PURCHASE_LEGAL_REFERENCE=<actual operator-reviewed counsel reference>
ESTATE_PURCHASE_TERMS_VERSION=<approved version>
ESTATE_PURCHASE_TERMS_SHA256=<SHA-256 hex of exact approved terms>
ESTATE_PURCHASE_TERMS_URL=<public HTTPS URL serving approved terms>
```

These inputs combine with existing mainnet, `DRY_RUN=false`, Xaman credentials and treasury address checks. A **paused** treasury still blocks new reservation and Xaman payment creation. A previously signed payment can be finalized after validation while paused so customer funds are not stranded.

The public property quote includes the approved terms URL/version/digest. The UI requires a buyer checkbox and submits the exact version and digest to the server; each accepted reservation stores immutable terms version, hash and acceptance time. A legacy reservation with missing acceptance cannot create a **new** payment request. Confirm the deployed backend and frontend versions match before public access.

## First controlled real purchase (only after all above approvals)

- Use a separate authenticated buyer wallet, not the treasury.
- Verify the actual quoted tier price and legal terms before approving the Xaman XRP payment.
- Verify the validated on-chain transaction hash, destination, amount, unique property ownership, reservation settlement, and v2 capital earmark.
- With funding disabled, **keep earmarked capital protected in the treasury**, not silently spent or classified as profit. Automatic IMG/RLUSD liquidity contributions and hourly distributions remain **OFF**.
- Confirm no late/duplicate payments and that any expired payment remains in review rather than making the property available for a second buyer.
- Stop additional offers immediately if the ledger, treasury pause, reconciliation, terms, or property state is inconsistent.

**No guaranteed return:** property purchases do not convey real property, pool ownership or a claim to AMM income. Unverified, discretionary potential bonuses are not entitlements. None of the settings above guarantee investment principal preservation.
