# Estates treasury and property-owner payout policy

## Trust lines
- The **treasury** needs IMG and PLX trust lines for IMG/PLX AMM liquidity operations.
- A **property owner** receiving IMG needs an IMG trust line only.
- A **property owner** receiving XRP needs neither IMG nor PLX trust lines for that XRP payment.
- **Never** require a property owner to establish a PLX trust line.
- Do not send PLX to property owners as part of Estates rewards.

## Reward preference
Each eligible property owner can choose **IMG** or **XRP** settlement. Preferences must be recorded and applied to an immutable reward epoch before settlement, with a deterministic default and explicit pending state if not set. Never infer a preference from wallet trust lines.

For IMG settlement, verify the recipient's IMG trust line before transfer. If missing, hold the reward and prompt the owner to establish IMG trust; do not silently convert to XRP.

For XRP settlement, swap **only the IMG reward allocation** into XRP through a constrained, audited execution plan. The recipient needs no trust line for XRP. Confirm the actual XRP proceeds and ledger-validated transaction before marking paid. If a swap fails or cannot meet slippage limits, hold the reward; never debit AMM principal to cover it.

## AMM capital controls
- Treasury liquidity contributions to IMG/PLX pools require both treasury trust lines and sufficient available balances/reserves.
- Double-sided deposits must be computed from the selected pool's actual on-ledger asset ratios and available treasury balances, with fees, reserve, price impact and LP-token custody accounted for.
- Keep capital contributions, LP positions, realized earnings, unrealized changes, and distributable reward balances separate in a durable ledger.
- Distribute **realized, verified earnings only**; never use property sale principal or liquidity capital as rewards.
- XRP conversion is not a guarantee of a particular rate or payout. Require explicit trade limits, idempotency, signed authorization, validated settlement and audit records.

## Security and rollout
- Xaman developer API credentials create approval requests; they do not authorize unattended wallet signing.
- Existing sales and distributions remain disabled until wallet ownership, profit attribution, owner preference, trust-line preflight, trade authorization, payout idempotency, and reconciliation are implemented and tested.
- This document is policy, **not** live AMM execution or payout activation.
