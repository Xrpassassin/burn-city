# IMM and XRPyro singularities — launch-relative burn accounting

## Scope
Each tower receives one black hole, independent of how many AMM pools use its token. AMM LP tokens burned or locked are **not** token burns. The BURN tower's verified supply logic is unchanged.

## On-ledger identities
- IMM issuer: `rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP`; currency: `IMM`
- XRPyro issuer: `rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va`; currency: `58525079726F0000000000000000000000000000` (**case-sensitive display name**, not `XRPYRO` and not `58525059524F...`, which identifies a different currency).

## User-provided original launch baselines
- IMM: **888,888,888,888,888**
- XRPyro: **1**

These are supplied project figures, not yet signed off as validated launch-ledger evidence. The verification layer refuses to scale black holes from them as if they were audited.

## Provisional appearance
The existing checked-in `client/data.js` incomplete issuer-return scan reports approximately 31,310,513,918,336.77 IMM returns (13 transactions) and 0.0005958474732607322 XRPyro returns (19 transactions). It explicitly flags both histories `burn_complete: false`.

The preview module uses **only these observed amounts, divided by the user-provided launch baseline**, as indicative lower-bound relative sizes. This is neither a cumulative burn total nor an asserted current burn percentage. The renderer marks the state `partial`, uses differently colored singularities (IMM turquoise, XRPyro ember), and does not label it verified. When no suitable observation or verified issuer status exists, the preview is omitted; a fixed issuer marker may remain. BURN's verified visual has precedence.

## Conflicting outstanding supply reports
As inspected on 2026-11-06:
- IMM: the project dataset reports approximately **800.54 trillion**; XRPL.to reports approximately **800.47 trillion**; XRPLWin shows **1.16 quadrillion**.
- XRPyro: the project dataset reports **0.6054**; XRPLWin shows approximately **1.42**.
These figures are neither interchangeable nor proof of burns. In particular, a figure greater than original issuance requires checking subsequent minting and/or different indexer definitions. Do **not** calculate `1 - 1.42` as a burn fraction.

External review links:
- https://xrplwin.com/token/rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP/IMM
- https://xrplwin.com/token/rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va/58525079726F0000000000000000000000000000
- https://xrpl.to/token/rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM

## Required for verified scaling
1. Pin the correct original `Payment` transaction(s), supply at launch, ledger index and hash; check no later issuance/reissuance or account-key exceptions.
2. Confirm the issuer's signing capability has been disabled (regular key and signer lists included).
3. Pin issuer info and `gateway_balances` at the **same validated ledger hash**. Account for obligations, frozen funds and escrow. Reconcile market/indexer discrepancies.
4. Show verified net supply reduction only if the existing `reconcileEcosystemSupply` and `verifiedEcosystemSupplyFraction` gates pass. If outstanding exceeds the launch baseline, the verified fraction must remain absent; a historical mint-and-burn accounting or a corrected issuance baseline must be used.

No writes to the ledger, wallet operations or changes to LP lock semantics are performed by this branch.
