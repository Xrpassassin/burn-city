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
