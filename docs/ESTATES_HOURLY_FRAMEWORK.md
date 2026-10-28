# Estates hourly rewards — disabled framework

This change adds **pure accounting and UI view models only**. It does not enable property purchases, create payouts, hold signing keys, submit XRPL transactions, or change the existing weekly accounting behavior.

- `server/estate-reward-epoch.js`: deterministic integer-string allocation of IMG/XRP reward budgets by authoritative catalog share weights; truncation dust remains unallocated.
- `server/estate-payout-ledger.js`: deterministic per-wallet payout IDs and in-memory state transition contract. It is **not** a durable ledger or a verified funding source.
- `client/js/estates-menu-model.mjs`: disabled marketplace and reward UI model. Not yet wired into the main menu.

Run: `node server/estate-reward-epoch.test.js && node server/estate-payout-ledger.test.js && node client/js/estates-menu-model.test.mjs`.

## Production blockers
1. Verify IMG/PLX reward receipts with validated XRPL ledgers and exact issuer/currency; do not assume an arbitrary `fundingRef` is verified.
2. Verify *realized* XRP AMM profit after fees, losses and principal/reserve accounting.
3. Snapshot eligible ownership by ledger/UTC epoch and handle transfers mid-epoch.
4. Persist budgets, allocations, holds and transaction attempts atomically; reconcile validated hashes and prevent double submission after crashes.
5. Check trustlines, reserve/fee balances and payout minimums. Never use Xaman user authentication as authority to sign treasury transfers.
6. Add integration tests and review relevant securities/payment compliance before any live activation.

The existing estate catalog remains authoritative. No production feature flag is enabled.
