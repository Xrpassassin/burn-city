# Estates IMG/RLUSD staged funding — read-only capital plan

**Status: advisory only. No customer sale, staged trade, AMM deposit, refund or payout is authorized or implemented by this feature.**

The current read-only Fly production preflight reports an indicative gross XRP purchase capacity, bounded by the configured price-impact policy. That is **not** a market order quote or a guaranteed amount of liquidity. For the 99% IMG/RLUSD earmark and 1% rounded-up XRP operating reserve, the preview converts gross capacity into a conservative integer-drop *net* first-stage ceiling. It then partitions each catalog tier's earmarked capital into illustrative first-stage and reserved remainder. All amounts are XRP drops. The entire reserve is accounted for before any stage math.

Example: at 9,097,480 drops of gross indicative capacity, the first-stage ceiling is 9,006,505 drops of earmarked capital. A 15 XRP apartment produces 14,850,000 drops of earmarked principal, a 9,006,505-drop illustrative first stage, and 5,843,495 drops that remain unallocated capital. A 300 XRP mansion produces 297,000,000 drops earmarked, with 287,993,495 drops still unallocated after the same illustrative first stage. The preview also reports an *illustrative* count at unchanged depth, **not a schedule or authority to execute that many trades**.

## What this does not solve

- Two-sided deposits in the pool's **existing ratio** increase depth but do **not** correct preexisting IMG/RLUSD price divergence from other markets. Preserve the market-mismatch/issuer/trustline safeguards.
- Every actual conversion or AMM deposit must obtain fresh, executable quotes using a validated ledger, verify minimum net output, FX rates, network costs, XRP reserve, pool price deviation, and two-sided inventory. A prior indicative depth number cannot be reused as permission for subsequent stages.
- The staged-funding mechanism still needs durable per-purchase principal ledgers, bounded signed transactions, exactly-once reconciliation, LP token and cost-basis proof, refund/failure handling and crash recovery before it can safely route real purchase proceeds. Incomplete investment is **not** earned income, and must not be included in realized profit or owner payout calculations.
- Independent legal, disclosures and terms approval remain required before sales or reward distributions. This module does not bypass the treasury pause or retired Pollux 70/30 activation path.

Use `node server/estate-rlusd-tier-funding-capacity.test.js` and `node server/estate-rlusd-staged-funding-preview.test.js` to verify capacity and integer-drop invariants without network access. The GitHub Actions production preflight is read-only and reports the staged preview, but its successful completion is **not** financial release authorization.
