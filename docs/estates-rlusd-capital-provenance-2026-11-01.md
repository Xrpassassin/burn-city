# Estates IMG/RLUSD liquidity provenance — read-only evidence

Status: **LP history proven; economic cost basis and legacy liabilities NOT reconciled. No activation authorization.**

Validated XRPL checks run from draft PR #515, all read-only:
- [LP creation/history audit](https://github.com/Xrpassassin/burn-city/actions/runs/41392013334): 87 validated treasury transactions, one AMMCreate mint, total LP changes exactly match current treasury LP balance.
- [Initial deposit and debit checks](https://github.com/Xrpassassin/burn-city/actions/runs/41392251115): transaction `59FAA96D8EF6A5C35747E22E664A7E0A8FBEA5F373D746B5EF3A58E5558FBE43` at ledger 108016045 used **3,100 IMG** and **3.106054465 RLUSD**, minted **98.1262902666762 LP**, and paid **200000 XRP drops (0.2 XRP)**.
- [Legacy withdrawal evidence](https://github.com/Xrpassassin/burn-city/actions/runs/41392350451): transaction `581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2` at ledger 108015969 burned **4553.942509978547 legacy IMG/PLX LP**, credited **1598.741351076311 IMG** and **13172.413752276136 PLX**, and paid 12 XRP drops. This successful manual withdrawal is flagged by the treasury pause.

The IMG/RLUSD pool creator transaction occurred after the legacy withdrawal; chronology alone does **not** assign the withdrawn IMG or PLX to any given property, liquidity position, treasury owner, or acquisition basis. In particular, 3100 IMG contributed to the new pool exceeds the 1598.741351076311 IMG from that one withdrawal. Proven token movements cannot establish historic IMG acquisition cost without tracing earlier funding.

Production SQLite previously reported zero `img-rlusd` liquidity jobs, while validated XRPL account lines showed **98.1262902666762 LP** in the treasury. Do not silently insert a synthetic purchase-funded job, mark an historical balance as distributable revenue, or create new customer rewards.

## Required release work
1. Trace the IMG and RLUSD funding sources and determine custody, ownership, and defensible historic economic basis, with validated transaction hashes.
2. Reconcile legacy IMG/PLX withdrawal with the recorded 3-XRP policy-v1 purchase, LP basis, existing accrued rewards and liabilities. Do not clear `unexpected_outgoing_tx` pause on the basis of matching LP mint amounts alone.
3. Value the full current LP liquidation conservatively, separately reserve operating balances, and withhold prior realized losses. Quoted prices and pool supply do not establish realized earnings.
4. Wire the read-only `estate-rlusd-reward-capacity` and `estate-rlusd-positions-readonly` logic to independently verified accounting before **any** execution. These modules do not sign or authorize payouts.
5. Complete counsel review, versioned buyer terms, payment/recovery testing and verified first-mainnet purchase before opening sales.

AMM exposure can lose market value; software can constrain distributions of principal but cannot guarantee principal's market value. **Do not enable sales, funding, harvest, distributions or clear the treasury pause based solely on this report.**
