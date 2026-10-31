# Estates production activation

## Current IMG/RLUSD policy

New purchases use policy version 2: 99% is earmarked for IMG/RLUSD and 1%
is retained as an XRP operating reserve. Existing IMG/PLX and IMG/XRP positions
retain their original accounting; they are not new-purchase destinations.

The sections below describe the **legacy 70/30 activation procedure**.
`scripts/estate-live-operations.mjs` and `scripts/estate-live-ops.cjs` still
require the legacy pools and a recent Pollux receipt. Do not use those scripts
as evidence that IMG/RLUSD purchases and payouts are ready, or change their
confirmation phrase to force activation.

For the current policy, `.github/workflows/estates-pool-address-stage.yml`
only stages the designated pool address with financial switches disabled.
`.github/workflows/estates-rlusd-production-preflight.yml` checks live runtime
state and validated pool identity, trustlines and market depth without signing.
Its pool report explicitly does **not** verify signing and operating reserves.
Neither workflow enables purchases or distributions. Passing tests or merging
these workflows does not prove a mainnet purchase, deposit or owner payout.

Current activation must independently verify the configured pool, treasury pause
and pending transactions, available reserves, scanner progress, purchase gates,
IMG/RLUSD funding gate, harvest gate and distribution gate. Preserve all existing
principal and reward liabilities; do not treat manually withdrawn principal as
profit. Verify the first real purchase and resulting deposits and payouts using
validated transaction hashes. Hourly processing does not guarantee an hourly
payment.

## Legacy 70/30 procedure (historical reference)

Merging/deploying code does not enable purchases, liquidity investment or outgoing
rewards. Existing Fly credentials can be reused; no additional signing secret is
required if the treasury signer already matches the Estates treasury.

## Two earnings streams

Property purchase principal is earmarked 70% for IMG/PLX and 30% for IMG/XRP.
Integer-drop rounding goes to IMG/XRP. Each validated purchase creates two durable
funding jobs. They buy the required assets with bounded XRP SendMax, then submit
**two-sided AMMDeposit** transactions with bounded asset inputs and minimum LP
output. Source XRP debits, acquired tokens and minted LP must be proved from
validated transaction metadata before the accounting changes. Unspent cash and
unused tokens remain principal residuals; they are never reward receipts.
Network fees and additional account reserves require separate liquid XRP funding.
Only the designated IMG/PLX pool is accepted. IMG/XRP and acquisition pool identities
are resolved using the configured issuers at a validated ledger. Existing manual
LP holdings and purchases made before this policy are not silently included.

### Pollux IMG receipts

A contiguous validated-ledger scanner accepts IMG only from the configured Pollux
source, delivered to the treasury, with exactly one structured memo identifying
`payoutType: lp`, `rewardAsset: IMG` and pool account
`rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ`. An immutable ledger/hash establishes the start
boundary. XRP holder/floor receipts remain outside this IMG reward stream.

Receipt-time settled ownership and catalog weights determine allocations. A later
purchase cannot claim earlier receipts; no-owner receipts stay with the treasury.
Hours close only after the scanner crosses their end. Whole micro-IMG is allocated;
sub-micro dust is retained without rounding up. An owner chooses IMG delivery or
bounded conversion of that same entitlement into XRP. This preference is distinct
from the additional XRP profit stream below.

### Additional realized XRP profit

Only IMG/XRP positions acquired and journaled by Estates funding jobs qualify.
Their basis is the actual acquisition/deposit expenditure attributable to the LP,
plus recorded transaction costs. Residual cash/token principal is kept separate.

Once per hour, a position is considered for realization only when a conservative
liquidation quote exceeds its recorded basis and bounded operating/payout costs.
The software redeems that attributable LP position into both assets and converts
the returned IMG to XRP. **A quote or unrealized LP value never creates rewards.**
Actual delivered XRP, IMG debits and LP burn must validate first.

Net proceeds are reduced by the position basis, actual realization fees and any
previous realized loss carried across the Estates XRP pool. Payout fee budgets
are also withheld; unused native fee budgets become owner credits, reserved and
rolled exactly once into a future funded native payout. Only a remaining positive amount is allocated to receipt-time
owners. Principal is reserved for automatic reinvestment into IMG/XRP. A loss or
insufficient net earnings creates no reward; losses must be recovered before new
profits become distributable. The process temporarily withdraws attributable
liquidity and reinvests principal; it is not a passive hourly payment from the AMM.

These XRP rewards always pay native XRP directly to owners, in addition to their
chosen Pollux reward currency. They wait until the scanner closes the realization
hour. Default native payout caps are 1 XRP per payment and 10 XRP submitted per UTC
day; excess entitlements wait rather than being forfeited. The current release
requires an operator-reviewed configuration change to raise those code defaults.
No-owner net proceeds are reinvested rather than retrospectively allocated.

Rewards are variable and not guaranteed. A period with no eligible distributable
earnings creates no new reward allocation. Previously earned pending entitlements
may settle later. Token holdings, deposits, returned principal, quotes and unrealized
price gains never count as distributable earnings by themselves.

## Recovery and shared treasury

One server process uses the existing Fly volume. A durable treasury transaction
journal stores the signed blob/hash before submission. Unknown submissions are
reconciled by that same hash; the software never signs an automatic replacement.
Balances, LP basis, principal release and profit application commit atomically.
Missing/corrupt proofs, validated failures and interrupted preparation require
review. Never delete an intent/blob or release reserved principal to force a retry.

The shared signing claim coordinates the new jobs with existing Estates payments.
Guarded game jobs cannot spend earmarked XRP or reward liabilities, and pause while
an Estates transaction awaits proof/application. External wallet activity cannot be
prevented; concurrent outside signing can cause sequence conflicts and a review hold.
The watchdog recognizes only exact durably created transaction hashes, not arbitrary
AMM activity. Owner APIs never expose signing keys or stored blobs.

Existing IMG caps remain 100 IMG per payment, 1,000 IMG signed per UTC day and a
maximum fee of 100 drops. Issuer fees/freeze, missing trustlines, destination tags,
insufficient reserves/funding, expired quotes and treasury pause block new signatures.

## Activation sequence

1. Confirm `/api/deploy-version` matches the merged, tested commit. Require successful
   full regression, purchase browser tests and the new public-testnet proof. The
   testnet uses disposable faucet wallets and actual purchases, swaps, both AMM
   deposits, realization and owner XRP delivery. Only its hour-close watermark is
   accelerated; production must use the actual contiguous scanner.

2. Review live signer/Xaman configuration, both pool identities, issuer conditions,
   trustlines, fee/reserve funding, pending transactions and the pause reason.
   The known pause was the manual XPMarket AMMDeposit
   `CDE8F708EB0EF12C796BB675679B0971EAF110364232874D72824AB789A7069F`.
   Reverify it and current alerts before unpausing; unpause also resumes other jobs.

3. Initialize the accounting boundary on Fly:

   ```sh
   fly ssh console -a burn-city-game -C "sh -c 'cd /data/gh/cur && node scripts/estate-bootstrap.cjs'"
   fly secrets set ESTATE_ACCOUNTING_ENABLED=1 -a burn-city-game
   ```

   Bootstrap independently checks pool/assets, treasury and reward source against
   validated XRPL data, and never overwrites an existing boundary. It does not sign
   or unpause. The first hour is partial, not a historical backfill. Confirm the
   authenticated `/api/estates/payouts` scanner checkpoint progresses while paused.

4. After reviewing the pause, clear it through the existing authenticated admin
   route. Enable the remaining explicit gates:

   ```sh
   fly secrets set ESTATE_SALES_ENABLED=1 ESTATE_LIQUIDITY_ENABLED=1 ESTATE_XRP_PROFIT_HARVEST_ENABLED=1 ESTATE_DISTRIBUTIONS_ENABLED=1 -a burn-city-game
   ```

   All execution also requires mainnet, `DRY_RUN=false`, matching treasury signer
   and relevant prerequisites. Xaman approval remains necessary for each purchase. Use a purchasing wallet
   different from the treasury: direct XRP payments to the same account are invalid.

5. Verify the first owner's actual purchase, both funding deposits, hourly receipt
   allocation and payout hashes against validated mainnet transactions. Testnet
   evidence is not proof of a mainnet payout. XRP pool profits may take time to
   exceed costs; hourly scheduling does not promise an hourly payment.

To stop new signatures, disable the relevant sales/liquidity/harvest/distribution
flags and/or pause the treasury. Already submitted transactions can still validate
and must be reconciled. Preserve the allocation, liquidity job, treasury transaction,
loss-carry, profit receipt, payout/credit and original IMG accounting tables on rollback.

Production scanner quota handling: read validated ledger headers and paginate only the treasury's account history within each exact ledger range. Every page must confirm the full requested range; receipt verification and ledger parent-hash continuity remain required before checkpoint advancement. Activation waits for a checkpoint within 60 seconds of the present, then verifies health and progress over four samples spanning 80 seconds. A retry may clear only the previously reviewed manual-deposit pause or its preserved activation rollback; other alerts still require review.
