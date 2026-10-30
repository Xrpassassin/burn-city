# Estates portfolio and allocation scenarios

The Estates page reads live sales/reward controls from `/api/estates/status`. It does not infer live availability from the catalog's older planning metadata. The authenticated `/api/estates/portfolio` endpoint uses the bearer session's wallet; an owner query parameter cannot select another wallet. No reporting or calculator request signs a transaction or changes allocations.

Owned-property cards show current verified weights and recorded allocations over a rolling 24-hour window, with approximate hourly averages over all 24 hours, including zero-reward hours. Averages are observations, not future payout rates. IMG amounts come from persisted property allocations joined to verified receipts. XRP property amounts reproduce the original largest-remainder allocation at each receipt's realized timestamp and must reconcile to the owner's immutable base allocation. Rolled-forward fee credits are excluded from new earnings. If reconciliation fails or historical fields are unavailable, the report displays unavailable history rather than a partial rate. Scanner coverage and delays are visible.

Actual wallet payments are presented separately, with validated transaction links and actual delivered currency/amount where recorded. IMG earnings paid as XRP are not mislabeled as IMG transfers. Wallet payments may combine several properties, earlier credits, or delayed entitlements; allocated amounts are not claimed as already paid.

The owner-only share calculator starts at zero. A user supplies hypothetical system-wide net distributable rewards, excluding principal and after costs, losses and reserves. The tool applies current weights to that assumed amount; it does not fetch prices, invent an earnings baseline, annualize returns, advertise APY, or extrapolate past allocations. Negative and zero scenarios allocate zero. Actual eligibility, changing ownership weights, rounding, and settlement timing can differ. These UI choices do not constitute a legal opinion or certify the pooled rewards model's compliance. The model and its marketing require review by qualified counsel; removing guarantees or adding disclaimers alone does not settle securities-law classification.

Sources reviewed October 30, 2026:
- SEC/CFTC interpretive release, March 2026: https://www.sec.gov/files/rules/interp/2026/33-11412.pdf
- SEC staff FAQs, September 2026 (staff guidance, not binding law): https://www.sec.gov/about/divisions-offices/division-corporation-finance/faqs-crypto-assets

## Ownership inspection and received rewards

`/api/estates/ownership` deliberately exposes only settled property IDs and their owner wallet addresses, as requested for public in-world inspections. It does not expose allocations, purchase amounts, or payment histories. Owned lot borders are blue, unowned lot borders yellow; cosmetic previews do not alter ownership colors. The public snapshot refreshes during island play and immediately after purchase settlement.

The private portfolio additionally reports confirmed wallet deliveries across all owned properties, with IMG and XRP kept separate. Converted IMG payouts count as the XRP actually delivered, not as an additional IMG delivery. Queued/submitted/held payments are excluded. Malformed or duplicate confirmation evidence produces unavailable totals. Received rewards are not labeled net investment profit: purchase costs and unrealized changes in pool assets are not included. Inspection shows these private totals only when the authenticated portfolio confirms the inspected property belongs to that session, and clears them when the wallet changes.

The island hides city Tour, mode controls, the combined Movement & Games hub, and the city view menu. Walking, touch controls, interaction, and the explicit return-to-city button remain available. City tour, view shortcuts, and travel callbacks are guarded while island admission is active; normal controls return on island exit or disposal.

## My properties directory filter

The in-island directory includes a My properties filter. It reads owned IDs from the authenticated server session and intersects them with known manifest properties; public ownership snapshots and decoded local tokens do not determine this list. Search reuses the current session's verified list rather than requesting again on every keystroke. Closing the directory discards its cache and listeners. Token changes clear cached IDs, and responses from a prior wallet cannot restore old results. Selecting an owned home teleports to its walkable public approach while preserving island admission and private access rules.
