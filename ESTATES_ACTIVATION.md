# Estates activation

The software is deployed disabled. This document describes an operator action;
creating or merging the code does not enable purchases or send any cryptocurrency.

## Implemented flow

Validated ledgers are scanned contiguously from an immutable start ledger/hash.
Eligible receipts must come from the configured Pollux engine, deliver IMG issued by
the configured IMG issuer, and include one structured LP reward memo identifying
pool `rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ`. Other payments do not fund IMG rewards.
XRP floor/minimum payments from Pollux remain outside this IMG accounting pipeline.

Each receipt is allocated using settled ownership as of its ledger close time and
catalog share weights. Rewards received before any eligible owner existed remain
with the treasury. A later purchase cannot claim them. Exact IMG delivery and
sub-micro precision dust are retained for audit; dust is not rounded up or paid.

Hours close only after the scanner crosses their end. Per-owner settlement intents
are durable and unique by hour/owner. Missing currency choices, unusable IMG trustlines,
insufficient source funding, issuer transfer fees/global freeze, destination-tag
requirements and excessive fees prevent submission. IMG liability totals must be
covered by liquid treasury IMG. Liquidity is never withdrawn or deposited by this
pipeline. Property purchase principal never enters the reward receipt ledger.

An IMG preference produces a direct IMG Payment. An XRP preference uses a validated
IMG/XRP AMM quote with a 3% quote haircut, an exact XRP output and IMG SendMax limited
to the entitlement. The default conversion path can use XRPL order books or the AMM;
the destination output and maximum source expense are fixed in the signed transaction.
No PLX trustline is required from owners. Unused whole micro-IMG units are recorded as
owner credit and added once to their next funded hourly settlement. Smaller source
precision residuals remain treasury dust. Credit does not trigger an unfunded payment.

Signed blobs/hashes are persisted before network submission. Ambiguous submissions
are never automatically re-signed, including after LastLedgerSequence. A successful
payment requires validated transaction/hash, matching delivery and metadata proof of
the treasury's IMG debit. Validated failures and interrupted preparation remain for
operator review; there is deliberately no automatic replacement or release endpoint.

Default execution caps: 100 IMG per payment, 1,000 IMG signed per UTC day, 100 drops
maximum network fee per transaction. Existing treasury pause/reserve controls also
apply. The software is designed for one server process using the existing Fly volume.
The shared treasury can also be used externally or by other game jobs; sequence
conflicts are held for review rather than being retried with a new signed payment.

## Operator setup

1. Verify `/api/deploy-version` reports the merged commit and run the repository
   tests. On Fly, initialize the immutable boundary with:

   ```sh
   fly ssh console -a burn-city-game -C "sh -c 'cd /data/gh/cur && node scripts/estate-bootstrap.cjs'"
   ```

   This verifies the designated pool, issuers, treasury and reward-source account
   against validated XRPL responses, then records the current ledger/hash. It does
   not sign, unpause, or enable anything. An existing bootstrap is never overwritten.
   The first hour contains only receipts at or after that boundary; this is not a
   historical backfill or a promise of a full hour's earnings.

2. Enable accounting first using your existing Fly access:

   ```sh
   fly secrets set ESTATE_ACCOUNTING_ENABLED=1 -a burn-city-game
   ```

   Check the authenticated `/api/estates/payouts` endpoint for a progressing checkpoint
   and no processing delay. Receipt scan progress continues while the treasury is paused.

3. Review the treasury watchdog pause before clearing it through the existing
   authenticated `/admin/unpause` route. The diagnosed alert was transaction
   `CDE8F708EB0EF12C796BB675679B0971EAF110364232874D72824AB789A7069F`,
   a validated XPMarket IMG deposit into the designated IMG/PLX pool. Review the
   current alert state as well: clearing the pause also resumes other treasury jobs.
   This code does not clear or bypass it.

4. To enable purchases and settlement, the operator sets:

   ```sh
   fly secrets set ESTATE_SALES_ENABLED=1 ESTATE_DISTRIBUTIONS_ENABLED=1 -a burn-city-game
   ```

   These are the final production activation actions. They are not executed by the
   assistant. Xaman approval remains required for each owner's purchase. Confirm
   the first real purchase and first eligible hourly payout against their validated
   XRPL transactions; simulated tests are not a mainnet payout proof.

The authenticated property panel shows actual server activation status and payout
history. The server never returns signing keys or stored signed blobs in these APIs.
To stop new purchases/payments, set the two activation flags to `0`. Submitted
transactions may still validate and are reconciled without issuing replacements.
