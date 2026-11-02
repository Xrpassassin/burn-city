# IMG/RLUSD Estates — future reward delivery acceptance criteria

The original owner is presently the only recorded property holder. Past IMG rewards have independent validated payment proofs and do **not** require an invented backfill. Historical purchase capital records remain intact for financial accounting and lawful treatment.

This document concerns the **new IMG/RLUSD rewards stream**, **not** the retired Pollux payout scanner. The new stream is **not live**. Never treat the existing `distributionsEnabled`, `distributionSchedule`, or `accountingEnabled` fields, which belong to the legacy reward service, as confirmation of forward IMG/RLUSD payouts.

## What needs to work before enabling a single live future payment

1. **Verified program start.** Establish a validated ledger boundary, live LP inventory, independently reconciled protected capital, reserve and any outstanding liabilities. Do not retroactively calculate pre-start pool appreciation as distributable profit. Stage the immutable start only after evidence approval.
2. **Real profit, not pool activity.** Reconcile validated on-chain AMM withdrawal or other actual realization events against original position basis, loss carry, trading/withdrawal costs, XRP transaction fees and independent liquid surplus. Accrued fees sitting inside an unsold LP position are **not spendable income**. Any loss or insufficient surplus results in **no payout**, not debt to the owner.
3. **Hourly catch-up.** Walk every fully verified UTC hour since the start, including hours with no realized profit. Store a durable scanner watermark and distinguish `no_verified_profit` from `scanner_unavailable`; never advance the watermark past a failed proof. A restart must recover without skipping or duplicating an hour.
4. **Idempotent owner allocations.** Use immutable verified receipt hashes, ownership snapshots at validated realization times and one deterministic allocation per owner/hour. Enforce cumulative claims below independently verified profit **and** liquid net proceeds after principal/obligation/reserve protection, including earlier held or already paid claims.
5. **Executable delivery with fee control.** Only settle if wallet-appropriate IMG or XRP is demonstrably liquid and spendable, trustlines and fees checked, any required conversion economically safe and transaction cost bounded. If too small, carry the amount in a protected ledger rather than spend disproportionate fees. Reconcile every submitted transaction by exact XRPL hash, destination, delivered amount and source debit.
6. **Recover without double payment.** On timeout or ambiguous submit, persist the exact signed transaction hash and wait for validation. Never create a replacement payout while an earlier transfer could still validate. Maintain proof through restart and carry only proven unpaid residuals.
7. **Safety and legal release.** Obtain terms/counsel review for the Estates offering and reward operation, authorize the financial migration treatment and treasury release separately, and complete a controlled testnet plus independently reconciled initial mainnet settlement before broad operation.

## End-to-end acceptance tests

- Same verified receipt processed twice gives **exactly one** owner reward.
- Two hours of valid net profit credit both; an intermediate failed hour is retried, never silently skipped.
- Zero profit, capital shortfall or unpaid liabilities produce **zero payout**.
- A small reward is carried until net-of-fee settlement is rational, without erasing the balance.
- A payout submission interrupted before server restart settles **once**, without a replacement transaction.
- Every paid owner sees the actual validated hash, amount and currency. Unconfirmed payments remain pending with a clear reason.
- Owner's choice of IMG versus XRP never causes treasury reserves to bleed from fees or forced conversions.

## Current software status

`forwardImgRlusdRewards` in the public/internal Estate status is read-only. The current forward-only components on draft PR #515 hold accounting drafts but are **not** connected to an independently validated realized-profit scanner, catch-up scheduler or signer. The status intentionally reports `livePaymentsEnabled:false` regardless of legacy hourly flags. This is an explicit warning about unfinished work, not a readiness certification.

**Do not promise fixed hourly income, pretend unrealized LP fees are paid or mark a held draft as a completed transfer.** PLX remains retired.
