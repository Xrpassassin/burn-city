# Estates IMG/RLUSD — full proportional two-sided liquidity (read-only correction)

**Status:** Planning helpers and diagnostics only. Purchases, outgoing AMM deposits and future rewards remain explicitly disabled. No treasury unpause, real-money transaction, or promise of LP capital preservation is approved here.

## Clarified protocol rule

XRPL's `AMMDeposit` `tfTwoAsset` mode supplies **both** tokens, proportional to the AMM's **current pool balances**, and is not an in-pool swap. There is no swap-style price impact and no AMM trading fee for that proportional liquidity addition (ordinary network transaction fees still apply). The supplied `Amount` and `Amount2` are **maxima**; the ledger may debit less of one or both. Proportional amounts are equal **value at the existing pool spot price**, not equal numeric IMG/RLUSD quantities, and not necessarily equal value at an external reference market. See https://xrpl.org/docs/references/protocol/transactions/types/ammdeposit.

A two-asset deposit can be bigger than the existing AMM reserves. It is incorrect to impose a default 1%-of-reserves liquidity deposit limit or the separate 9.097480 XRP indicative **asset-acquisition** trade-depth limit on the eventual proportional **deposit**. We removed the former from the read-only balanced-deposit helper. The dedicated `previewProportionalEstateDeposit()` is an uncapped read-only ratio math helper that also reports leftover token quantities.

## What a property purchase actually funds

A property purchase **arrives as XRP**. Under purchase policy v2, 1% rounded up to drops remains an XRP operating reserve. The other 99% is reserved for IMG/RLUSD, but is **not already IMG and RLUSD**. The treasury must acquire both, potentially across several bounded XRP-to-token swaps or independent counterparty fills. That **acquisition** can have price impact, slippage, transfer limits, network fees and thin market capacity. Do not confuse the acquisition preflight's `indicativeMaxPurchaseDrops` with a maximum `AMMDeposit` size. After inventory is actually acquired, a single matched two-asset deposit of all usable inventory may be possible even when the acquisitions needed staging.

If inventories cannot be matched at the AMM's existing pool ratio, the unmatched remainder stays owned, reserved and tracked by its original purchase until independently reconciled. Never call leftover principal "fees earned" or property-holder rewards. Existing LP principal, other positions, and previous payout liabilities are unchanged.

## Economic and production controls

- A proportional deposit **does not correct** the price mismatch between IMG/RLUSD and external XRP pairs. A larger pool at a mispriced exchange rate exposes **more** liquidity to arbitrage risk. The read-only deposit math reports the deviation as a warning; the live asset-acquisition guard still independently blocks out-of-policy trading.
- Validate the issuer states, trustlines, authorized inventory, pool address, current `amm_info`, executable acquisition quotes, fee/reserve budgets and signed hash for every financial transaction. Require ledger-validated transaction metadata to prove actual debits and LP tokens minted, since the submitted two-asset maxima do **not** promise exact consumption.
- **Open implementation review:** `server/estate-liquidity-runtime.js` currently builds a `tfTwoAsset` deposit with `Amount`, `Amount2` **and `LPTokenOut`**. The published protocol mode describes `tfTwoAsset` with only `Amount` and `Amount2`. Before activating the currently disabled liquidity executor, separately audit and test the exact signed transaction field set and enforce an appropriate failure/price-risk policy. Do not use the new read-only quote as authorization to sign it.
- Continue to require independent legal/terms review of property sales combined with planned discretionary holder distributions. The reward system must never treat purchase principal or LP-token minting as realized profit.

## Verification

- `node server/estate-rlusd-two-asset-deposit-preview.test.js` verifies a deposit three times current pool reserves, a smaller limiting-token inventory, no/vanishing inventory, deviation warnings and input rejection.
- `node server/estate-rlusd-balanced-deposit.test.js` verifies no implicit 1% reserve-size cap; an optional explicit cap still works, and the existing stricter market-price planning guard remains intact.
- `node server/estate-rlusd-tier-funding-capacity.test.js` verifies that staging labels are **acquisition** warnings, not AMM deposit size limits.

**None of these tests prove a production payment, asset acquisition, deposit or owner reward.**
