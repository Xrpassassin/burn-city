# Estates IMG/RLUSD treasury policy

Policy 2 replaces the allocation for **new** verified property purchases: 99%
is earmarked for IMG/RLUSD and 1% remains XRP operating funding (rounded up to
the next drop). The network reserve and existing guard margin remain protected.
Sale principal is never recorded as income. The receipt remains reserved until
each acquisition or deposit has independent validated ledger proof.

Existing policy-1 records, positions, payouts and cost basis remain intact. This
release does not unwind legacy PLX holdings or reallocate earlier purchases.

## Owner setup

1. Create and seed the IMG/RLUSD pool using the genuine assets:
   - IMG issuer: `rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd`, currency `IMG`.
   - RLUSD issuer: `rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`, currency
     `524C555344000000000000000000000000000000`.
2. Seed it at a price consistent with executable IMG/XRP and XRP/RLUSD prices.
   Initial liquidity is a separate owner contribution, not Estates earnings.
3. Ensure the Estates treasury `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb` has usable
   IMG and RLUSD trustlines, enough limit headroom and spare XRP for reserves
   and bounded network costs. Do not send XRP directly to the AMM address.
4. Supply the pool's **AMM account address** or its creation transaction hash.
   Keep the treasury's LP tokens redeemable; do not burn or lock these LP tokens.
5. Run `node scripts/estate-rlusd-readiness.cjs <AMM_ACCOUNT>`. This only checks
   ledger identity, market-price agreement, treasury trustlines and indicative
   acquisition capacity. It does not verify server signing or operating reserves.
6. Configure the existing Fly app with `ESTATE_IMG_RLUSD_POOL_ACCOUNT=<address>`
   and `ESTATE_RLUSD_ENABLED=1` after those checks pass. Existing liquidity,
   accounting, distribution flags and treasury signing configuration are reused.
   No new Fly token or new treasury seed is required by this change.

Absent activation or a valid pool, new-sale proceeds remain reserved in the
treasury. Acquisition is capped at 1% modeled price impact per transaction;
large purchases may wait for deeper IMG/XRP liquidity. The readiness command's
capacity figure is indicative, excludes some costs, and is not a trade quote.
There is no automatic bypass or forced fill when liquidity is insufficient.

## Execution and rewards

The existing durable transaction journal acquires IMG and RLUSD using bounded
XRP conversion payments, then deposits both assets. The treasury retains the LP
tokens. Pending, failed, ambiguous and expired transactions require proof or
review rather than replacement signatures. Watchdog and reserve guards remain
active. New-policy signatures also require the explicit RLUSD activation flag.

Hourly checks compare conservative exit quotes with recorded XRP cost basis
and expected costs. No new-policy lot is harvested while another new-policy
lot is underwater or incompletely reconciled. A profitable lot is fully redeemed
and its two assets converted to XRP with bounded transactions. Actual proceeds
less cost basis, realized loss carry, unsold residual cost holdback and fees
determine distributable profit. Fresh portfolio checks run again before booking
rewards. Unsold residuals are not treated as recovered principal.

This is a realization-and-reinvestment cycle, not a native AMM fee-claim API.
Repeated withdrawals and conversions cost money; minimum economic checks can
cause many hours with no harvest. Price appreciation can contribute to realized
profit. Fees alone are not separately distributed or presented as total return.
Remaining capital reenters the same IMG/RLUSD route.

New-policy profits follow the wallet's IMG/XRP preference. The choice freezes
when settlement starts. IMG payouts acquire only the funded entitlement using
earned XRP, verify the recipient trustline and deduct conversion/network costs.
XRP payouts need no holder token trustline. Unused XRP and tiny payments remain
owner credits. Transactions are eligible only after a validated ledger closes
the reward hour. Existing legacy pool profits remain XRP payouts; eligible
legacy Pollux receipts keep their existing settlement pipeline.

The UI distinguishes pool funding, XRP-equivalent allocations, credits and
confirmed XRP/IMG deliveries with transaction links. No hourly return, principal
protection, price floor or fixed yield is promised.

## Verification

`npm run test:estate-rlusd` covers exact policy allocation, old-schema migration,
preserved basis/indexes, activation and market guards, funding, proof recovery,
loss/no-reward behavior and closed-hour XRP/IMG settlement. The existing
liquidity testnet script continues to exercise legacy execution; new-policy
integration tests use a simulated ledger. Production first-deposit and first-
reward verification remain required after the owner creates the mainnet pool.

## Confirmed manual PLX exit

An owner-confirmed manual withdrawal can be reconciled using the internal
`estate-manual-pool-migration` maintenance module. It requires independently
verified withdrawal and seed LP movements, sufficient unencumbered replacement
LP, and a conservative executable exit quote. Original basis, unsold residual
cost and verified migration costs carry into the replacement position. Cash
reservations stay identical; no profit receipt or payout is created. Original
position JSON and ledger references are retained in an immutable migration
journal. The historical funding identity remains present to prevent restart
from repurchasing PLX. This module has no HTTP route and never signs a trade.
