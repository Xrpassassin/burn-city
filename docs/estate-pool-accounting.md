# BURN City Estates: ownership and AMM-profit accounting foundation

## Current scope

The existing 3D district has nine individually addressable property plots. The property catalog is `client/data/estate-catalog.json`, which is also read by the server-side economy module.

Each plot has a stable ID. Proposed relative weights are currently:

| Property tier | Proposed units |
|---|---:|
| Trailer home | 1 |
| Apartment unit | 2 |
| Two-bedroom starter home | 3 |
| Four-bedroom family home | 5 |
| Luxury lakefront mansion | 10 |

**These are provisional relative units, not final percentages, property prices, or a promise of return.** Property prices and the payment currency intentionally remain unset. Sales and distributions are disabled until the wallet adapter and economic terms are approved.

## Accounting model

For a completed weekly accounting period:

`property allocation = distributable profit × property share units / total eligible owned-property share units`

The allocation helper uses integer XRPL drops and the largest-remainder method, so the sum of all allocations exactly equals the input distributable amount. Equal remainders are resolved by stable property ID for deterministic results.

The accounting process must distinguish:
- gross AMM fees / revenue;
- realized profit, after accounting for inventory value and trading losses rather than treating all fees or wallet inflows as profit;
- operating costs, network fees, and any disclosed reserves;
- the final distributable amount approved for the week;
- each property owner's recorded entitlement;
- a submitted transaction from a ledger-validated, settled transaction.

A share weight only determines relative allocation among eligible properties. It does not create profit where none exists, and weekly distributions can be zero or negative at the strategy level. Losses, reserves, eligibility cutoffs, snapshot time, and treatment of properties bought or transferred mid-week need final written rules.

## Wallet integration contract

The external wallet implementation should provide a narrow adapter with:
1. a public receiving address and explicit network/token identifiers for property purchases;
2. a way to validate the purchaser's authenticated XRPL account and confirm a payment on-ledger (validated ledger, destination, asset, exact amount, memo/intent ID, and replay protection);
3. an independently verified source for AMM activity, wallet balances, realized profit, expenses, and reserves;
4. a weekly signed accounting snapshot and idempotent payout queue;
5. transaction hashes and ledger validation for completed payouts;
6. operator controls, rate limits, monitoring, and an auditable correction/refund process.

Never accept a client-supplied transaction hash, wallet balance, profit figure, or property owner as proof by itself. Do not store or expose a wallet seed/private key in game code, browser storage, logs, or the database. Any signer should be isolated from the public game server; use the wallet provider's supported signing flow and appropriate multi-approval controls.

## Required wallet ownership decision: use the user's existing Grok-connected wallet

**Provider identified by owner:** Xaman (formerly Xumm).  
**Owner-supplied public XRPL account:** `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb`  
**Network status:** owner confirms this is a live XRPL Mainnet wallet.  
**Verification status:** address and network are owner-reported; the app has not yet independently checked the account or completed a Xaman SignIn flow.

This address is a configuration candidate only. Do not enable sales, label it as a verified treasury, or initiate payments until the address is confirmed on-ledger and the owner proves control through Xaman's documented authentication/signing flow. Do not infer that Grok's connection grants this game access to the account.


The intended treasury/payment wallet is the existing wallet the project owner has connected to Grok. Do not silently generate, substitute, or deploy a second treasury wallet. Treat that existing wallet as the intended destination for property-sale proceeds and the source account for AMM activity and weekly distributions, subject to confirmation of its exact public address, XRPL network, supported signing/approval interface, and permissions.

Important integration boundary: connecting a wallet to Grok does not by itself give this game server, this coding session, or the BURN City runtime access to the wallet or its private keys. The implementation must integrate only through a documented, authorized wallet interface or a deliberately approved transaction-signing workflow. Never ask the owner to paste a seed phrase or secret key into chat, source code, browser storage, or server logs. Use public addresses for identification and verify all relevant transactions directly against the XRPL ledger.

Before enabling sales, confirm:
- the owner-supplied address is active on XRPL Mainnet and a Xaman SignIn proves control of that same address;
- which documented Xaman API/SDK integration is used (Grok's existing connection is separate and does not automatically authorize BURN City);
- whether it supports receiving purchase payments, viewing validated ledger transactions, interacting with AMM positions, and approving/signing outbound payouts;
- whether the wallet's owner intends to keep control of every outgoing transaction or authorize a narrowly scoped, audited payout mechanism.

Xaman integration notes: use the official Xaman SDK or documented backend API for SignIn and sign requests. Backend API credentials belong only in server-side environment secrets; never expose an API secret in browser/client code. A SignIn payload identifies the user's account without submitting a financial transaction. Any purchase or payout must be a separate, human-reviewed transaction request with the destination, asset, and amount plainly displayed.

Until these facts are available and reviewed, this branch must keep purchases and payouts disabled. The game should never claim it is connected to or managing that wallet before an actual, tested integration exists.

## API and persistence status

- `GET /api/estates` returns the property catalog and, when authenticated, the caller's recorded ownership.
- `POST /api/estates/buy` deliberately returns `sales_not_configured` until the verified wallet/payment adapter, prices, and finalized share weights are connected.
- SQLite tables are prepared for ownership, weekly profit snapshots, and per-property allocations.
- The current branch does not accept purchases, record real ownership, create payout promises, or submit transfers. The accounting helper is a tested calculation primitive, not a payout service.

## Legal/product review before opening sales

A product that sells property-like digital assets and advertises a share of AMM profits may create securities, investment-product, consumer-protection, tax, and jurisdictional obligations. Obtain qualified legal and tax review before accepting funds or marketing profit sharing. Clearly define whether these are in-game digital property rights or real-world property interests; the current 3D homes do not convey real-estate title. Avoid guaranteed-return language and publish risks, fees, custody, eligibility, and dispute rules before any sale.

## Validation

Run `npm run test:estates`. Before merge, also run the existing server/security test suite and inspect the district in desktop and mobile builds. Do not merge or deploy this draft until Hark's integration review and the external wallet contract are complete.
