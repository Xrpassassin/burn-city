# Estates — XRPL two-sided AMMDeposit protocol acceptance (public testnet)

This focused **public-testnet-only** test resolves a field-compatibility question before any IMG/RLUSD treasury activation. It creates disposable wallets, issues mock `IMG` and `RLU` tokens, creates a new two-asset AMM, and submits a genuine `tfTwoAsset` AMMDeposit containing both maximum issued-asset `Amount` fields and an optional minimum `LPTokenOut`.

The test verifies successful validated transaction metadata, ledger-proven actual token debits, credited LP, a satisfied minimum LP constraint and preservation of the pool reserve ratio.

The official transaction reference currently lists `tfTwoAsset` as `Amount` + `Amount2` and says other combinations are invalid, while the published XLS-0030 spec explicitly permits optional `LPTokenOut` in that mode. That discrepancy must be resolved against actual network behavior, not assumptions or just locally mocked ledger semantics.

- Reference: https://xrpl.org/docs/references/protocol/transactions/types/ammdeposit
- Published specification: https://xls.xrpl.org/xls/XLS-0030-automated-market-maker.html
- Workflow: `.github/workflows/estates-rlusd-two-asset-testnet.yml`
- Script: `scripts/estate-rlusd-two-asset-testnet.cjs`

**Boundaries:** All wallet keys are generated anew inside the test and never printed. Mock `RLU` is NOT real RLUSD, does not have the same issuer policy and proves only generic two-issued-token AMM mechanics. The test does not exercise current production pool identity, LIVE XRPL issuer terms, the capital journal, the full acquisition engine, or actual customer purchases. It cannot authorize sales, funding, a restart, a pause release, LP withdrawals or future owner rewards.

A successful public testnet proof is an input to engineering review, **not** a production release authorization. The signing, liquidity and distribution flags remain disabled.
