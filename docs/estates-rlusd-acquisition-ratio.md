# Estates — purchase-capital allocation for proportional IMG/RLUSD liquidity

**Read-only engineering preview.** No transactions are signed; new sales, automatic funding and future rewards remain disabled.

## Protocol distinction

An XRPL `tfTwoAsset` AMMDeposit supplies two assets according to the AMM's existing reserve ratio without a swap-style AMM trading fee. This is different from the preceding XRP-to-IMG and XRP-to-RLUSD acquisitions, whose market depth, transfer terms, slippage and network fees may require multiple bounded fills. The deposit itself is not capped by an estimated maximum XRP swap size.

The user's intended "50/50" means half the **value at the pool's own price** on each side. An equal-number-of-tokens split is almost never correct. A literal 50/50 *XRP spending* split is only appropriate when independently executable prices agree with the pool's current ratio. Any mismatch can leave excess IMG or RLUSD outside the pool.

## New pure reference-price planner

`planEstateRlusdAcquisitionSplit()` takes the earmarked XRP capital **after** the 1% operating reserve, the current IMG/RLUSD pool asset amounts, and two same-ledger indicative **XRP-per-token** reference prices. It divides the entire earmarked budget with integer-drop arithmetic in proportion to the costs of the two pool asset legs:

`IMG XRP budget / RLUSD XRP budget = (pool IMG quantity × XRP per IMG) / (pool RLUSD quantity × XRP per RLUSD)`

This creates a *sizing target*, not a quote. It does not assume that the amounts will be filled at those prices and does not change the pool's relative price. If fills differ due to market impact, the actual acquired balances must be rechecked against a fresh validated `amm_info` snapshot before attempting the full two-sided deposit; unmatched inventory stays accounted for as purchase principal.

**Example** for a 300 XRP mansion: reserve 3 XRP and earmark 297 XRP. With an illustrative pool holding 1000 IMG and 10 RLUSD, and hypothetical external acquisition prices of 0.002 XRP/IMG and 0.2 XRP/RLUSD, the aligned budget is 148.5 XRP for IMG and 148.5 XRP for RLUSD. If the external IMG acquisition price rises to 0.0020204 XRP/IMG while RLUSD remains 0.2 XRP/RLUSD, equal XRP budgets no longer acquire the exact pool reserve ratio. The planner shifts a small additional amount of the purchase budget toward IMG; it does not execute either trade or promise the resulting fills.

## What must still be implemented to activate actual funding

1. Only accept a validated, reconciled customer purchase into the server-owned capital journal; never spend unverified signed requests.
2. Get independently validated live market-depth and asset-acquisition quotes for the exact XRP budget. Apply side-specific impact, transfer fee, slippage, issuer and XRP reserve checks. Revalidate after each leg; stop if conditions change.
3. Acquire both assets with crash-safe durable, idempotent transaction intents and exact validated-debit/token-credit proofs. Maintain residual XRP and token principal separately, and protect existing estates liabilities.
4. Verify same-ledger IMG/RLUSD pool identity, issuer/trustline state, existing pool ratio, actual spendable IMG and RLUSD, minimum expected LP output, and fee budget before any `AMMDeposit`.
5. Apply on-chain validation to actual debits and minted LP, persist acquired lots and cost basis, and only afterward consider whether separately realized **net profit** exists. New purchase funds and minted LP are never income.
6. Test the actual `tfTwoAsset` field combination including the optional `LPTokenOut` interpretation against the active network implementation on a **disposable testnet account**. Official AMMDeposit reference documents `Amount` / `Amount2`; the published XLS-0030 proposal includes optional `LPTokenOut`. Do not silently remove a minimum-LP safeguard or claim production compatibility solely from static tests.

The original frozen treasury and property-sale gates stay unchanged. A successful read-only preflight or merge does **not** authorize real customer sales, automatic pool funding, distributions, or legal launch.
