# Estates legacy IMG/PLX custody mismatch — 2026-11-02

**Operational status: HOLD. Read-only evidence. Do not clear treasury pause, enable sales, authorize new Xaman requests or sign withdrawals until reconciliation and legal signoff.**

## Verified evidence

- Customer purchase ledger: exactly one historical 3 XRP Estate purchase, policy v1, capital earmarked 2.1 XRP IMG/PLX and 0.9 XRP IMG/XRP. Source: [legacy accounting audit](https://github.com/Xrpassassin/burn-city/actions/runs/41427840119).
- Production position journal: IMG/PLX job says `invested`, holds **1,940.67982383456 LP** with 2,038,880 drops recorded basis and 32,448 drops residual cash. IMG/XRP job says `invested`, holds **11,157.61391981 LP** with 869,056 drops recorded basis and 30,968 drops residual cash. The two initial budgets exactly total 3 XRP.
- XRPL account_lines/amm_info at **validated ledger 108064988**: treasury holds **0 IMG/PLX LP**, despite 1,940.67982383456 LP recorded as invested. For IMG/XRP it holds **1,057,422.96985061 LP**, greater than the recorded 11,157.61391981. Quantity coverage is **not a proof of value or owner attribution**.
- The independently verified [manual withdrawal](https://livenet.xrpl.org/transactions/581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2) at ledger 108015969 burned **4553.942509978547 IMG/PLX LP**, credited **1598.741351076311 IMG + 13172.413752276136 PLX**, and paid 12 drops fee. It is **not in the five applied rows of the Estates treasury journal**. The burning of 4,553 LP cannot be confidently allocated to a particular customer or operator position from this evidence alone.
- Independently verified [current balances](https://github.com/Xrpassassin/burn-city/actions/runs/41428677429) at validated ledger 108065048: treasury XRP balance **2,068,263 drops**, IMG balance **1171.497684483161**, PLX balance **0**, OwnerCount 4. These are fungible balances; they neither demonstrate that the withdrawal proceeds are unspent nor establish replacement customer-owned collateral. Do **not** aggregate them into a supposed recovered XRP value without market valuations, liabilities, reserve and provenance analysis.
- Existing reward tables: 4 IMG entitlement rows and 4 confirmed payout records; an owner-credit table has 1 row whose **amount has not been quantified in this report**. Do not waive, overwrite or assume all historic obligations settled merely because an owner declines discretionary bonus backfill.
- [LP coverage audit](https://github.com/Xrpassassin/burn-city/actions/runs/41428135805) intentionally **fails** when the required LP tokens are absent. This failure is a financial safeguard, not an incidental CI error.

## Investigation

The recorded customer IMG/PLX position currently lacks specified LP-token custody. That can arise from manual withdrawal, conversion or other unjournaled ownership actions. The exact effect on the customer's economic interests, including whether alternative treasury holdings cover it, is **unverified**, not necessarily a permanent loss. See blocking [issue #517](https://github.com/Xrpassassin/burn-city/issues/517).

### Prove before remediating

1. Read all **validated** treasury IMG and PLX changes following ledger 108015969. Identify and reconcile relevant swaps/transfers and the creation of the separate IMG/RLUSD LP position, avoiding unsupported attribution of fungible proceeds.
2. Confirm source and cost basis of capital attributed to the **single existing purchase**, including what happened to the original 2.1 XRP position and residual cash. Determine whether operator-supplied capital covered/was mixed with purchase deposits. Record every hash and custody change.
3. Value current positions at conservative executable liquidation prices, separately reserve legal/tax/network and unpaid payout liabilities. Do not represent a quote or unsold LP appreciation as cash or realized gain.
4. Correct customer position books using a **versioned, append-only migration journal**, with operator approval, conservation checks, verified custody or an approved refund. Never edit past job positions in place just to satisfy the circuit breaker.
5. Re-run the custody audit, legal offer review, Xaman test, public status, and funds ledger checks before operator-authorized pause clearance. Keep distributions and automated funding off until independently cleared.

## Options for authorized remediation

- **Restore the legacy pool position** through a new independently verified capital contribution and deposit, if economically justified and lawfully authorized. Original basis and history must remain auditable.
- **Reassign the legacy customer obligation to other demonstrably controlled assets**, but only after verified asset provenance, fair valuation, customer/owner contractual basis, an append-only capital transfer record, and approval.
- **Refund/settle the old customer's position** under applicable purchase terms, while retaining records and legal/tax obligations. Do not treat this as automatic forfeiture of entitlements.

None of these alternatives has been selected or executed. Mainnet customer payments stay disabled, and all treasury protection holds remain in force.

## Follow-on validated asset movement trace

The corrected [full-range validated treasury history run 41429312233](https://github.com/Xrpassassin/burn-city/actions/runs/41429312233) inspected **9** transactions at ledgers 108015969–108065129 with complete pagination. Regression tests confirm balance changes are distinguished from flag-only trustline edits. Relevant confirmed steps:

1. `581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2`: IMG/PLX AMMWithdraw; **+1,598.741351076311 IMG, +13,172.413752276136 PLX**.
2. `2762310505CB5C6B4F556C77CACDDD114281331F90F6964BCBBB5B5297D82F3C`: a successful Payment **from the treasury back to itself**; actual treasury PLX balance change **−13,330.3455626686 PLX**. The outgoing PLX balance movement is verified; the delivered counter-asset and value still require direct verification, so do not call this a realized profit or customer capital replacement.
3. `D3A34E3FBB3D108D393485701C595416ADD0809A23D317B0EDB164B189387976`: another Payment to the PLX issuer, treasury PLX balance change **−0.00000000003 PLX**.
4. `C4390EC090ACDD434AEBFAF93089E4CD9D8376064274D7E4651BF20653D0CA09`: TrustSet, **zero PLX balance change**.
5. `59FAA96D8EF6A5C35747E22E664A7E0A8FBEA5F373D746B5EF3A58E5558FBE43`: IMG/RLUSD AMMCreate, treasury debit **−3,100 IMG**.

The PLX debit in the treasury self-payment exceeds the manual withdrawal's PLX credit; this means simply earmarking that withdrawal as new customer capital is unsupported. The record supplies a transaction trail but **not** independent owner attribution, purchase cost or authorization to erase a legacy job.

The workflow remains **red intentionally** because it fails the customer LP custody test, even though the follow-on token-flow scanner and its regression test now pass. Resolve the outstanding customer LP shortfall before any financial activation.
