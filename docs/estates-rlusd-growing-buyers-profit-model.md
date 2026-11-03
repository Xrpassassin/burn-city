# Estates IMG/RLUSD — growing property purchases without paying from principal

**Status: pure forward-only calculation previews. No signer, hourly payment generator, treasury allocation, conversion, or legal/financial activation.**

## The two accounting streams must stay separate

**Capital:** Every *validated settled property purchase* adds its XRP amount to the running owner-contribution denominator. The current purchase policy earmarks 99% for IMG/RLUSD and 1% XRP reserve, but that earmark **is not a confirmed AMM deposit**. Contributions are weights for **future** profit-sharing previews only, not revenue or spendable profits. When a buyer acquires another property, the buyer's weight increases. Unsettled sales, missing verified capital-allocation records, conflicting amounts and duplicated purchase hashes are excluded or rejected.

**Profit:** Profit is the excess of *completed, verified* IMG/RLUSD LP withdrawal proceeds, including the separately sold IMG leg, above the conservatively allocated cost basis of the burned LP units, expenses, and prior realized losses. Deposits from future Estates **increase LP principal basis when independently verified**, never the amount recognized as profit. Increases in unrealized LP price or an unsold IMG leg do not produce an available payout.

## What happens with more Estate buyers?

At each independently validated profit-realization timestamp, include only purchases that settled by then. The owner's share is:

`owner's cumulative settled XRP purchase amounts / all eligible settled XRP purchase amounts`.

Use exact integer micro-RLUSD accounting and deterministic largest-remainder rounding so the total allocated **preview** equals the verified distributable amount, with no lost remainder or floating-point drift.

Example, if an actual **10 RLUSD net profit** were verified and separately released for allocation:

| When | Eligible purchases | Future profit preview |
|---|---|---|
| First owner alone | 3 XRP trailer | First owner: 10 RLUSD |
| Second buyer settles | 3 XRP trailer + 15 XRP apartment | First: 1.666667 RLUSD; second: 8.333333 RLUSD |
| Further purchases settle | First: 3 XRP; second: 15 + 3 XRP; third: 75 XRP | First: 0.3125 RLUSD; second: 1.875 RLUSD; third: 7.8125 RLUSD |

Those examples refer to a **new** profit event in each case; later buyers never claim earlier settled profit. Each purchase remains independently identifiable by its validated purchase transaction hash. The original policy-v1 owner's property may still be included for future eligibility based on settled ownership; that **does not** reclassify their old PLX capital, erase liability history, or prove it backs the IMG/RLUSD pool.

The proportion above implements the present **contribution-based owner weighting**. It deliberately does not infer share ownership from the purchase's original catalog `share_units`, nor from unsigned client input.

## LP capital lots and cost basis

The separate pure calculator `previewRlusdRealization()` takes previously reviewed, pool-specific LP acquisition lots. Each lot must identify its actual acquisition hash, ledger index, remaining LP units, and cost denominated in micro-RLUSD. When an on-chain withdrawal burns LP, it consumes those cost lots in deterministic FIFO acquisition order. Fractional LP consumption allocates basis with **ceil rounding**, preserving principal conservatively.

- RLUSD received is converted to micro-units rounding **down** (never fictitiously rounding up spendable funds).
- IMG received is **not valued as realized cash** until independently verified disposition into RLUSD is available.
- Net profit preview is `max(0, realized RLUSD receipts + net realized IMG proceeds − LP basis consumed − costs − prior loss carry)`.
- Any unverified costs or unsold IMG means **zero prospective profit** (pending further evidence).
- Losses carry forward; they cannot be erased by adding new buyers or liquidity.

**Critical:** This is an operator-reviewed **math preview**; it does not prove the supplied LP lot valuations, verify IMG sale transactions, reconcile current account liquid surplus, or grant authority to distribute. All results explicitly state `availableForOwnerDistributionMicroRlusd:'0'`, `profitApproved:false`, and `executionEnabled:false`. The full verified provenance and release decisions must be provided by separate audited services before mainnet use.

## Release controls remain

- PLX is retired; historical PLX accounting is not future profit.
- New Estates purchases and rewards remain disabled behind the treasury hold and independent legal offering review.
- No guaranteed profit, no guaranteed payment each hour. Hourly evaluation can produce zero, and dust must carry until economical and safe to settle.
- Before live payouts, reconcile the LP cost lots and actual IMG disposals on-chain, apply liquid surplus caps against cumulative held/paid rewards, then implement a signer/reconciler with exactly-once recovery and trustline/fee checks.
