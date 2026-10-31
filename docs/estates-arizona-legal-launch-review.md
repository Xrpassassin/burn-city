# Estates Arizona / U.S. legal launch review — HOLD pending counsel

**Status:** Engineering checklist for independent legal review, not legal clearance or legal advice. No public sales or bonus distributions should be activated merely because these items have been documented.

## Product choice to review
Purchasers obtain virtual property gameplay/access rights. The operator intends to manage sales proceeds in XRPL AMMs (initially IMG/RLUSD; later ecosystem RLUSD pools). A possible separate bonus would be discretionary, potentially calculated by property tier or shares, and possibly settled in XRP or IMG. The mere use of the word *discretionary* does not determine securities classification.

## Critical counsel questions
1. Do combined property rights, marketing, allocation weights, the capital pool and proposed cash/token bonuses constitute an investment contract, profit-sharing interest, or other security under federal law and Arizona A.R.S. 44-1801? Examine all public communications and prior representations, including historic hourly rewards, earning rates, 'shares', liquidity participation, and expected profit.
2. If a security, determine registration or a specifically justified exemption, offering limitations, solicitation restrictions, and any issuer/broker/adviser obligations **before offers**, not just before payments. Do not assume a disclaimer or optional payout cures the issue.
3. Determine FinCEN/BSA and Arizona DIFI licensing implications of accepting XRP for digital goods, operator-owned AMM transactions, token conversions and distributing XRP/IMG to third parties. Do not assume owner-operated transfers are categorically exempt.
4. Review property licensing terms (not real estate/title), term and termination, game availability, transferability, account suspension, wallet verification, refund/cancellation rights, service outages, minors, privacy, disputes and enforceability.
5. Review Arizona Consumer Fraud Act disclosures: pricing, actual in-game utility, 'forever' and ownership claims, fees, material risks, bonus discretion, historical/expected returns, conflicts of interest and own-token pricing.
6. Review tax/accounting: dollar fair value of all received XRP, cost basis, token/LP acquisitions and disposals, recognized revenue, rewards, reserves, beneficial ownership, and customer records.
7. Determine appropriate entity structure and who legally owns Treasury assets, signing controls, authorized operators, emergency stops, data retention and records for audits.
8. If gameplay purchases are offered to users outside Arizona, evaluate other states and countries; Arizona residence alone does not limit distribution-law reach.

## Engineering gates before launch
- Keep `ESTATE_SALES_ENABLED`, `ESTATE_DISTRIBUTIONS_ENABLED`, and automatic IMG/RLUSD funding disabled until all applicable reviews and operational tests are complete.
- Make property purchases independently useful for gameplay; do not show payout rate, APY, guaranteed hourly drops, expected revenue, investment principal, yield comparisons or investment invitation in purchase UI.
- Do not tie entitlement or purchase price to a guaranteed financial return. Consider completely separating the purchase program and any future bonus program pending legal analysis; changing a label alone is insufficient.
- No automatic rewards for purchasers until legal approval of that model. A future optional bonus must have explicit eligibility rules, authorized issuance, change/termination notice, proof of funding, record retention and no retroactive elimination of already-awarded obligations.
- Any approved terms require versioned presentation, affirmative acceptance, timestamp, wallet reference and immutable audit evidence before enabling purchases. No legal text drafted here should be represented as final attorney-approved terms.
- Require issuer/AMM identity, price impact, slippage, treasury reserves, LP cost basis, profit realization, payout accounting and restart/rollback controls to pass independent mainnet verification.
- Maintain audit logs and customer support/refund process; never expose treasury seeds, Xaman credentials or PII in public API/logs.

## External references for counsel (verify applicability on review date)
- Arizona Corporation Commission Securities FAQs: https://www.azcc.gov/faqs/securities-faqs
- Arizona AG Consumer Fraud Act A.R.S. 44-1522: https://www.azleg.gov/ars/44/01522.htm
- SEC 2026 crypto interpretation: https://www.sec.gov/files/rules/interp/2026/33-11412.pdf
- Arizona DIFI financial enterprises licensing: https://difi.az.gov/licensing/financial-enterprises
- FinCEN convertible virtual currency guidance: https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering
- IRS digital-asset recordkeeping: https://www.irs.gov/filing/digital-assets

**Release decision:** Legal clearance remains **NOT OBTAINED**. Approve public offers/sales or bonus distributions only after actual counsel review and independent technical preflight. This file never changes runtime controls.
