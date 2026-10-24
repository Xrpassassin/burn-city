# Estates combined-owner weekly reward model

## Decision

Use one combined eligible-value weight per XRPL account. A wallet that owns several eligible properties receives one allocation based on the sum of the configured relative share units for all its eligible properties. It is not paid separately per property.

`ownerWeight = sum(property tier shareUnits for every eligible property owned by account)`

`ownerReward = distributableDrops × ownerWeight / totalEligibleOwnerWeight`

The implementation uses integer XRPL drops and largest-remainder allocation, assigning every distributable drop exactly once. Equal remainders are resolved by account address for deterministic results. Property IDs must be unique in a snapshot, and every holding must map to a known property tier and non-empty account.

## Snapshot contract

Callers must supply a finalized, authoritative holdings snapshot for the stated weekly cutoff. This helper does not discover ownership, confirm ledger payments, determine eligibility, value AMM positions, calculate profit, or submit payouts. Transfers and purchases during a week require a separately approved cutoff policy; do not silently recalculate an already finalized week.

## Profit safety

Only pass a non-negative amount that has already been approved as distributable realized profit after losses, costs and reserves. Gross AMM fees, deposits, token price appreciation, and unrealized inventory gains are not automatically distributable profit. A week with no approved distributable profit results in zero rewards.

## Status

This is a deterministic accounting primitive and test, not a payout service. It does not connect to XRPL, move funds, enable property sales, or promise returns. Before production use, connect it to ledger-verified ownership and reviewed treasury accounting, then persist immutable weekly snapshots and allocation records with idempotency keys and ledger transaction hashes.
