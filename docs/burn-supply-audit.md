# BURN supply audit

Run `node scripts/audit-burn-supply.js` for a read-only mainnet snapshot. No wallet, signing, account_tx scan, or live game changes are involved.

The checked-in launch evidence anchors the original 1 quadrillion issuance at ledger 92601097 and the issuer key lock at ledger 92601106. Each run checks the current issuer restrictions and sequence, pins gateway balances and the complete escrow directory to the same validated ledger, and subtracts outstanding obligations, frozen balances and escrow from that original issuance. Pool holdings remain outstanding. Empty escrow pages with continuation markers must still be followed.

This measures **net supply reduction**, including supply lost through transfer fees. It does not enumerate burn Payments, prove a leaderboard, or replace the existing issuer-return history contract. Gateway totals use XRPL issued-currency rounding, so aggregate token amounts are approximate.

A live run at ledger 107955066 (hash 44D3153A14F504D4517B8A5FADB430EC20307958593662B414E0B078A17D8A86) found approximately 34,843,983,811,577.57 BURN outstanding, no frozen or escrowed BURN, and 96.5156% net supply reduction. The audit required seven RPC calls rather than historical transaction pages. This snapshot is evidence, not a permanently fresh production value.

Sources: validated mainnet RPC at https://xrplcluster.com/; original issuance transaction https://livenet.xrpl.org/transactions/798EADC17691B5D964DEDC5AFCBC67092026667682D039F7FFC2E4F04FA98C66; gateway field definitions https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/gateway_balances.


## Live black-hole integration

The AMM-lock refresh checks BURN first and publishes a distinct `supply_reconciliation` record. BURN skips the old account-lines/holder scan. It refreshes on the existing two-hour schedule and the client rejects snapshots older than six hours, future timestamps, mismatched token identities or missing evidence. Failed refreshes cannot retain a verified percentage. The card and tooltip call the result net supply reduction, separately from enumerated issuer-return history.

The visual uses an opaque dark core and one thin accretion disk, shared across tokens with instancing. Hidden singularities are removed from the instance count. No particles, textures, lights or post-processing passes are added. The core and disk use two shared draw calls; existing bridge halos bring the module's total budget to three. One visible low-quality singularity uses 232 triangles (648 at higher quality). Animation uses a shared shader clock and freezes with reduced motion. Matrix updates retain the existing two-second cadence, with no per-frame object creation.
