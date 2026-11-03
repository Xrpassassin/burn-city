# Estates policy-v2 real XRPL testnet acceptance

**Scope: disposable public-testnet assets only. Absolutely no mainnet/Xaman/production funds, accounts, credentials or activation toggles.**

The newly added `scripts/estate-rlusd-policy2-testnet.cjs` drives the current repository's **real** sale-verification/orchestration and liquidity-signing modules, not a locally emulated ledger. Every wallet is newly faucet-funded, and the mock IMG and mock RLUSD tokens share a brand-new disposable issuer. The mock RLUSD uses the expected 40-hex currency but never the live RLUSD issuer. XRP/IMG, XRP/mock-RLUSD, and IMG/mock-RLUSD pools are built independently on the public XRPL testnet with consistent opening reference ratios.

## What is verified on validated testnet ledgers

1. A disposable buyer reserves the public catalog's 3 XRP trailer, signs an exact XRP Payment to a disposable testnet treasury with the reservation memo, and proves validated successful on-ledger delivery and time.
2. The real sale settlement orchestrator checks the original purchase proof, writes one ownership row and exactly one capital allocation: 2.97 XRP liquidity principal, 0.03 XRP reserve, zero retired PLX allocations. A replay of the exact validated purchase must be idempotent.
3. The actual v2 liquidity executor is injected with the disposable treasury wallet/client and one of the newly created mock AMM pool addresses, with no profit harvesting or distributions. It performs guarded XRP-to-IMG and XRP-to-mock-RLUSD acquisitions and a proportional two-asset AMMDeposit. Transactions are durably journaled, signed and reconciled using real validated XRPL metadata.
4. It validates actual minted LP from the ledger's trustline balance changes, the matching recorded LP balance, and nonzero cost basis. There are no profit receipts or owner rewards from new capital.
5. A runtime restart with the same SQLite journal does not duplicate any treasury transaction, deposit, property or payout.

Testnet-only guard reserves original purchase principal and additional XRP network fee budget. Runtime limits remain max 100 bps per-acquisition price impact, 300 bps worst-case slippage, 100-drop fee cap, 128-stage hard ceiling, and the separate market-price mismatch check. The test starts with sufficiently deep **independent** XRP source AMMs to avoid knowingly moving quoted prices outside the configured policy.

## Evidence status

The workflow `.github/workflows/estates-policy2-testnet.yml` runs syntax and non-network staging regressions first, then the **real testnet acceptance run**. Any live success must be documented from Actions logs with actual hashes and ledger indexes. The script prints one `ESTATES_POLICY2_ACTUAL_TESTNET` object on success or `ESTATES_POLICY2_TESTNET_FAILURE` otherwise. **A syntax pass, simulated test, or existing two-asset testnet success does not count as this test passing.**

## Operational limits

- Public testnet faucet throttling, transaction-confirmation latency, resets and AMM creation cost may cause external CI failures. Those failures must not be reported as success or ignored; rerun only after diagnosing them.
- This intentionally tests one **3 XRP** purchase with a small acquisition impact, not a large 300 XRP mansion. Large-tier staged acquisition is tested by a separate simulated ledger fixture; actual large-tier sourcing and its failure/refund policy still need real verification.
- Mock RLUSD is **not** issued by Ripple's issuer and cannot establish live RLUSD issuer terms or actual liquidity depth.
- All production gates stay closed: no pool identity activated, live purchases, treasury unpause, automatic deposits or forward-owner payout settlement.
- This covers purchase→AMM principal, not profitable rewards or securities/legal clearance. LP principal can lose market value and cannot be guaranteed.
- Testnet credentials must never be supplied from an actual user wallet or production environment. The script fails closed if known production secret variable names are present.

Related: [Issue #537](https://github.com/Xrpassassin/burn-city/issues/537), [PR #536](https://github.com/Xrpassassin/burn-city/pull/536).

## First independently validated policy-v2 end-to-end testnet run

GitHub Actions: [successful public-testnet acceptance run #41606682153](https://github.com/Xrpassassin/burn-city/actions/runs/41606682153), Node 22 on 2026-11-03 UTC. This test was executed by GitHub Actions and produced **actual validated XRPL public-testnet hashes**, not a local simulation. It used disposable mock assets issued by a newly generated issuer. No mainnet assets or real RLUSD were involved.

| Validated testnet action | Transaction hash | Ledger |
| --- | --- | --- |
| XRP purchase and memo-backed ownership settlement | `D3919638419BAA6A299BA04789B9EBFEDD01280F690D65FF3ABA0B2FB7EAF879` | 22033026 |
| XRP to mock IMG acquisition | `FFC81B63C439C0DF0B8C557152EAD18A385DBC74501748B7444A2739505C8AFE` | 22033027 |
| XRP to mock RLUSD acquisition | `194E51FE131ABB77280DDEF48C9985188C06D1DB9868FD452FAD60CF662DC919` | 22033029 |
| Actual `tfTwoAsset` AMMDeposit | `29C3FE8FB6438DEF5516FB28A697A2686F3B236DFB8063A251029B005A0213E8` | 22033031 |

Observed LP minted `14.325936178035`; actual recorded LP basis `2880724` XRP drops; uninvested principal `89312` XRP drops. The source purchase was exactly 3 XRP, allocated 2,970,000 drops to liquidity and 30,000 drops to operating reserve. The script verified idempotent ownership and treasury recovery and zero profit/reward receipts from new principal.

Initial run #41606486691 failed **before any pool transactions** because the public test XRP faucet's default funding was below the test's explicit >620 XRP market-maker prerequisite. The test was corrected to request sufficient disposable faucet funding; no risk guard, production setting, or mainnet dependency was weakened. The subsequent real testnet run above **passed**.

This proof does not replace production pool/issuer verification, full large-tier sourcing tests, security review, operator go-live controls, or legal approval. Live property sales and automated rewards remain disabled.
