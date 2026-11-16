# Estates: move 90% of the IMG/RLUSD position into IMG/PLX (one-shot)

Operator decision, Nov 15, 2026 (MT): "Move 90% of the IMG/RLUSD position into IMG/PLX". **Ships OFF.**
Code: `server/estate-plx-migration.js` (planner, guard, ledger), `runPlxMigration` in `server/estate-monthly-executor.js`,
CLI `scripts/estate-plx-migration.cjs`, test `server/estate-plx-migration.test.js`.

## What it does
1. **Withdraw** `ESTATE_PLX_MIGRATION_BPS` (default 9000 = 90%) of the treasury's *entire* IMG/RLUSD LP balance with a
   proportional `AMMWithdraw` (tfLPToken). The default base is the full on-ledger balance (1,106.44 LP on Nov 15, 2026), which
   includes the operator's 98.13 AMMCreate LP, because the instruction was "the entirety of the IMG/RLUSD pool". To move only
   90% of the holder principal tracked by the monthly plan (1,008.31 LP), set `ESTATE_PLX_MIGRATION_MAX_LP=907.48`.
2. **Convert RLUSD → PLX** in chunks of `ESTATE_PLX_MIGRATION_CHUNK_RLUSD` (default 10). Each chunk is quoted on both routes,
   direct PLX/RLUSD AMM or RLUSD → XRP → PLX (two self-payments), and the better quote wins. Each chunk is held to ≤1% hop
   impact (it halves until it fits), uses an exact-minimum `Amount` with 1% slippage on `SendMax`, and never uses tfPartialPayment.
   A chunk that fails with tec is requoted (up to 3 failures). XRP held between hops is counted as protected estate cash.
3. **Deposit** IMG+PLX two-sided into IMG/PLX (`rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ`) at the pool ratio. Before depositing, the
   IMG/PLX price must be within 300 bps of the IMG/XRP × PLX/XRP market. Otherwise the run holds with the funds in the treasury and resumes later.
   Whatever does not fit the ratio (usually some IMG) stays in the treasury and is recorded as `residual`.
4. **Ledger.** Every transaction is journaled in `estate_mp_txs` (`mig:v1:*`, blob and hash stored before submit, so `watch.js`
   sees known transactions). `estate_plx_migration` (row `v1`) records the state machine, the amounts, the LP out and the residual. The monthly plan's
   tracked LP and principal are reduced pro rata, so daily fee harvest on the remaining 10% stays correct.
   The new IMG/PLX LP belongs to the holder pool. Pollux IMG rewards on it are paid hourly to holders (3.22% burned) once
   `ESTATE_POLICY_V4_ENABLED=1` and `ESTATE_POLLUX_PAYOUTS_ENABLED=1` are set. Payouts start at the hour the migration completes.

Safety: `assertSafeMigrationTransaction` allows only the withdraw (capped at the confirmed LP), self-payments with no Paths, and
two-sided IMG/PLX deposits. Each step is idempotent and resumes from the journal. tefPAST_SEQ, tefMAX_LEDGER and terPRE_SEQ (a game
payout took the sequence) are re-signed up to 3 times, because those results never apply on ledger.

## Run
```
node scripts/estate-plx-migration.cjs --dry-run          # read-only; prints the plan and the confirm token
ESTATE_PLX_MIGRATION_ENABLED=1 node scripts/estate-plx-migration.cjs --execute --confirm=MIGRATE-<lp>
```
The confirm token pins the exact LP amount. If the treasury's LP changes, the token changes and execution refuses with
`confirm_mismatch`. A PLX trust line must exist first (`plx_trustline_required`). The bot never signs a TrustSet.

## Go-live (each step needs operator approval)
1. Approve and merge the PR (auto-deploys in about 3 minutes). Everything stays OFF.
2. Back up `/data/shop.db`.
3. Operator signs a PLX TrustSet for the treasury (issuer `rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q`) in Xaman.
4. Make sure the treasury has at least 0.4 XRP of spare reserve for the PLX line and the IMG/PLX LP line (top up if needed).
5. Run `--dry-run` on the server and review it.
6. `fly secrets set ESTATE_PLX_MIGRATION_ENABLED=1`, then `--execute --confirm=<token from step 5>`. Rerun with the same token until it reports `completed`.
7. `fly secrets unset ESTATE_PLX_MIGRATION_ENABLED`.
8. Turn on v4: `ESTATE_IMG_PLX_POOL_ACCOUNT=rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ`, `ESTATE_POLICY_V4_ENABLED=1`,
   `ESTATE_POLLUX_PAYOUTS_ENABLED=1`, and keep `ESTATE_ACCOUNTING_ENABLED=1` (the Pollux scanner).
9. Monitor `/api/estates` status (`plxMigration`, `policyV4`), the first Pollux hour, and the burn transactions.
