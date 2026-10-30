# Estates portfolio and allocation scenarios

The Estates page reads live sales/reward controls from `/api/estates/status`. It does not infer live availability from the catalog's older planning metadata. The authenticated `/api/estates/portfolio` endpoint uses the bearer session's wallet; an owner query parameter cannot select another wallet. No reporting or calculator request signs a transaction or changes allocations.

Owned-property cards show current verified weights and recorded allocations over a rolling 24-hour window, with approximate hourly averages over all 24 hours, including zero-reward hours. Averages are observations, not future payout rates. IMG amounts come from persisted property allocations joined to verified receipts. XRP property amounts reproduce the original largest-remainder allocation at each receipt's realized timestamp and must reconcile to the owner's immutable base allocation. Rolled-forward fee credits are excluded from new earnings. If reconciliation fails or historical fields are unavailable, the report displays unavailable history rather than a partial rate. Scanner coverage and delays are visible.

Actual wallet payments are presented separately, with validated transaction links and actual delivered currency/amount where recorded. IMG earnings paid as XRP are not mislabeled as IMG transfers. Wallet payments may combine several properties, earlier credits, or delayed entitlements; allocated amounts are not claimed as already paid.

The owner-only share calculator starts at zero. A user supplies hypothetical system-wide net distributable rewards, excluding principal and after costs, losses and reserves. The tool applies current weights to that assumed amount; it does not fetch prices, invent an earnings baseline, annualize returns, advertise APY, or extrapolate past allocations. Negative and zero scenarios allocate zero. Actual eligibility, changing ownership weights, rounding, and settlement timing can differ. These UI choices do not constitute a legal opinion or certify the pooled rewards model's compliance. The model and its marketing require review by qualified counsel; removing guarantees or adding disclaimers alone does not settle securities-law classification.

Sources reviewed October 30, 2026:
- SEC/CFTC interpretive release, March 2026: https://www.sec.gov/files/rules/interp/2026/33-11412.pdf
- SEC staff FAQs, September 2026 (staff guidance, not binding law): https://www.sec.gov/about/divisions-offices/division-corporation-finance/faqs-crypto-assets
