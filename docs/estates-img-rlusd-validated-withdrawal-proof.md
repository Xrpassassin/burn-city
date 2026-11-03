# Estates IMG/RLUSD — validated withdrawal proceeds before profit calculation

**This code is evidence-only. It does not make a sale, book profit, authorize a refund, create a payout, release the treasury pause, or reactivate PLX.**

The existing forward-only hourly scanner records candidate `AMMWithdraw` transaction hashes in completed, validated UTC hours. That is useful for reliable catch-up, but a candidate does **not** establish what the treasury actually received or whether an investor earned income. The independent verifier in `server/estate-rlusd-validated-withdrawal-proof.js` supplies the missing on-chain receipt evidence.

## Ledger verification

For each closed-hour candidate, the verifier fetches the exact XRPL transaction and the AMM identity at **the same ledger index**, then requires:

- A validated `tesSUCCESS` IMG/RLUSD `AMMWithdraw` by the exact Estates treasury, with the exact original scanner hash and ledger index.
- A validated AMM identity with the expected pool account and the pool's unique LP-token currency and issuer.
- A `LPTokenIn` for that LP token, with a matching validated **negative LP trustline balance delta** proving that the treasury burned the amount.
- Independent **positive treasury IMG and RLUSD balance deltas**, from affected ledger nodes, so one-sided withdrawal metadata cannot be counted as a two-sided payout.
- A bounded network transaction fee. Missing proof, a different pool/issuer, unsupported metadata or transient XRPL errors all fail closed.

The proof stores: withdrawal transaction hash, ledger index, pool account, LP burned, IMG credited, RLUSD credited and the fee. The `estate_rlusd_withdrawal_proofs` table is keyed by withdrawal hash, stores an SHA-256 fingerprint, and has UPDATE/DELETE denial triggers. It does not modify owner property records, legacy positions, reserve balances, saved payouts or the forward scanner's checkpoint. Any missing or corrupted entry causes the verification run to fail without producing a payable amount; restart skips already verified proofs.

**Only manually staged forward starts and already completed validated hours qualify.** There is no live scheduler for this proof-ingestion module yet; it is independently tested and is not connected to treasury signing.

## Why withdrawal proceeds are not automatically profit

A two-sided LP withdrawal returns **IMG + RLUSD**, not a single settled profit currency. Both legs can represent repayment of original investment; the IMG leg is not RLUSD cash until a separate validated and economically safe disposition is documented. The LP's remaining principal, historical cost basis, prior losses, withdrawal/swap fees, encumbered treasury capital and existing reward liabilities must be independently verified before considering any net realized profit.

Until all of those checks are satisfied, this new proof records `realizedNetProfitVerified:false`, `spendableRewardsAuthorized:false` and `payoutsEnabled:false` regardless of pool performance. A successful proof does not activate the future reward engine.

## Next implementation step

Pair immutable withdrawal proof rows with validated IMG→RLUSD disposal receipts, original LP acquisition/increase/decrease cost basis, fee deductions and loss carry in a **conservative realized-profit accounting module**. Then cap allocations against actual unencumbered RLUSD and against previously held and paid rewards. Implement a separate fee-aware settlement/reconciliation service only after legal and operator review.

The user-directed future model remains IMG/RLUSD, with hourly *evaluation* and **no guaranteed payments**.
