# Estates fixed-price and fixed-unit policy (approved design, not live sales)

## Final design direction
No purchase-date multiplier, NAV entry bonus, tranche system or bonding curve. Each property carries fixed allocation units by tier, regardless of when acquired. Existing owners retain their number of units, but their percentage of all eligible units may decline as new properties are sold.

| Tier | XRP price | Units per property | Maximum properties per wallet in tier |
|---|---:|---:|---:|
| Trailer | 3 | 1 | 5 |
| Apartment | 15 | 5 | 5 |
| Starter | 75 | 25 | 5 |
| Family | 150 | 50 | 5 |
| Mansion | 300 | 100 | 5 |

For an approved distributable amount, each eligible wallet receives its owned units divided by all eligible units, multiplied by that amount. This is a relative allocation formula, not a guaranteed yield. Existing `server/estate-economy.js` accounting uses catalog weights. Never treat gross AMM fee accrual as net withdrawable income without reconciling liquidity positions, inventory changes, realized gains/losses, fees and reserves.

## Ownership and sale safeguards
- Enforce per-wallet/per-tier caps on the server in a serializable database transaction covering owned properties plus active reservations. Multiple wallets can bypass a per-wallet cap; disclose this limitation.
- Reserve each lot atomically with an expiry and unique payment intent. Reject concurrent reservations for the same property, duplicate settlement hashes, incorrect destinations, wrong amounts and unvalidated XRPL payments.
- Property title in the game is recorded only after verified settlement and atomic ownership assignment. Include cancellation, refund and reconciliation procedures.
- Preserve property IDs, rights and owner records as the island adds districts.
- The catalog currently sets `saleStatus: not_configured`. Do not enable sales in this PR.

## Weekly cadence
Monday UTC: freeze eligible holdings at a documented ledger/time cutoff and snapshot units. Sunday UTC: pay only an approved distribution for the **previous fully completed** accounting period, not the in-progress week. Specify cutoff, treatment of midweek transfers, payout rounding, dust thresholds, failed transactions and carryforward before launch. No profit or zero approved distributable amount means no payout.

## Treasury and compliance
The proposed vault and IMG/XRP deployment require verified custody/authority, exact IMG issuer and AMM pool identification, authorized signing, independent ledger reconciliation, and legal/tax review. Marketing purchases as rights to pooled AMM earnings can trigger securities and other financial regulation even without guaranteed returns. Keep financial distribution functionality separately gated from ordinary in-game property ownership.
