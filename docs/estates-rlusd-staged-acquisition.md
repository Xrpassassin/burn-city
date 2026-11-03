# Estates IMG/RLUSD bounded XRP asset acquisition — staged executor

Status: **implemented behind existing disabled production financial gates. No live property sale, treasury unpause, pool transfer, reward or payout authorization.**

## Why staging is needed

Purchases arrive in XRP, but a proportional IMG/RLUSD AMMDeposit requires already-owned issued assets. Two-asset deposits may be large with no swap-style price impact. The **preceding XRP-to-asset acquisitions** still face market liquidity and price-impact limits. A sufficiently large purchase may need multiple separately signed acquisitions. Increasing target pool liquidity through deposits does not automatically improve the unrelated sourcing pools or fix their price mismatch.

## Implementation

The IMG/RLUSD-only purchase path now:

- Uses a **durable first IMG signed intent** to fix the initial IMG and RLUSD XRP ceilings from one validated same-ledger pool-price snapshot.
- Chooses each XRP acquisition tranche by the current source pool's validated XRP reserves and the unchanged maximum 100 bps impact policy: max spend is floor(reserves × limit / (10000 − limit)).
- Allocates a unique transaction ID for each stage while retaining the old one-shot first-stage ID for existing in-flight signing/reconciliation.
- Advances the per-asset cumulative authorized maximum and stage count **only after validated ledger proof** of a successful acquisition. The persisted signer envelope, not a fresh quote, controls recovery.
- Tracks authorized XRP SendMax ceilings separately from actual XRP spent. Any savings remain in the purchase's cash principal reserve, and unspent IMG allowance is not silently repurposed toward RLUSD.
- Requires a **fresh validated quote and market mismatch check** before every new trade. If the market drifts outside the price threshold, the next stage stops; the software does not force a trade or silently widen the limit.
- Enforces up to **128 validated acquisition tranches per issued asset**, then holds for review. This is a bound, not a trading schedule.
- Builds one ratio-preserving two-asset AMMDeposit using the actual reconciled inventory after both acquisition ceilings are completed, preserving minimum LP protections and validated cost-basis proof.

Existing historical signed IMG/RLUSD first-stage transactions without the new stage-budget fields remain one-shot and continue their prior reconciliation semantics. Legacy PLX and IMG/XRP automated liquidity routes remain retired.

## Verification and limitations

The pure stage calculator is tested in server/estate-rlusd-next-acquisition-stage.test.js. The simulated integration fixture in server/estate-rlusd-staged-acquisition-runtime.test.js models a 300 XRP mansion sale and manually re-aligns external pool prices between trades to exercise multiple stages; that test **does not prove real markets will rebalance**. It also validates price-drift halts, unique durable transaction IDs, treasury-disabled behavior, and absence of false rewards.

Remaining gaps before any real mainnet launch:

1. Public-testnet acceptance for the entire policy-v2 purchase → multistage issued-token acquisition → full two-sided deposit → persisted LP and cost basis on actual ledgers.
2. Market-depth/fee budgets and live issuer/trustline state on the configured production pool; independent approval of staged partial acquisition and refund/failure policy.
3. Validated future-profit ingestion and hourly reward settlement, operational monitoring, legal/terms clearance, and verified staging of production pool address.

**Risk:** A two-sided AMM deposit preserves pool ratio at execution, not XRP or RLUSD principal value. Liquidity providers remain exposed to issuer, market, arbitrage, and impermanent-loss risks. A property purchase is not guaranteed to earn a return.
