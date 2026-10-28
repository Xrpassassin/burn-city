# BURN supply audit

Run `node scripts/audit-burn-supply.js` for a read-only mainnet snapshot. No wallet, signing, account_tx scan, or live game changes are involved.

The checked-in launch evidence anchors the original 1 quadrillion issuance at ledger 92601097 and the issuer key lock at ledger 92601106. Each run checks the current issuer restrictions and sequence, pins gateway balances and the complete escrow directory to the same validated ledger, and subtracts outstanding obligations, frozen balances and escrow from that original issuance. Pool holdings remain outstanding. Empty escrow pages with continuation markers must still be followed.

This measures **net supply reduction**, including supply lost through transfer fees. It does not enumerate burn Payments, prove a leaderboard, or replace the existing issuer-return history contract. Gateway totals use XRPL issued-currency rounding, so aggregate token amounts are approximate.

A live run at ledger 107955066 (hash 44D3153A14F504D4517B8A5FADB430EC20307958593662B414E0B078A17D8A86) found approximately 34,843,983,811,577.57 BURN outstanding, no frozen or escrowed BURN, and 96.5156% net supply reduction. The audit required seven RPC calls rather than historical transaction pages. This snapshot is evidence, not a permanently fresh production value.

Sources: validated mainnet RPC at https://xrplcluster.com/; original issuance transaction https://livenet.xrpl.org/transactions/798EADC17691B5D964DEDC5AFCBC67092026667682D039F7FFC2E4F04FA98C66; gateway field definitions https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/gateway_balances.
