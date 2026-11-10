# Estates Tycoon — affordable upgrade ladder (staged)

## Player model

Every property class, including a 3 XRP trailer, has access to the same item unlock tree. Compact exterior improvements adapt to existing lot dimensions; the structure, ownership and tier are not replaced. The **Build & Upgrade · Estates Tycoon** panel appears in property inspection with a collapsed, grouped catalogue.

| Example upgrade | Cost (XRP) | Added recorded share units |
| --- | ---: | ---: |
| Porch/path lights, flowers or sign | 3 | 1 |
| Awning, privacy fence or fire pit | 6 | 2 |
| Arcade lounge, hidden floor, grow-themed lounge | 9 | 3 |
| Hobby workshop | 12 | 4 |
| Rooftop garden | 15 | 5 |
| Hidden bunker hatch | 18 | 6 |
| Security doors and cameras | 21 | 7 |
| Underground bunker | 30 | 10 |
| Bunker arcade | 36 | 12 |

A 3 XRP trailer owner who buys a 3 XRP porch-light improvement sees **6 XRP recorded development value** and **2 total recorded share units**. The figures are verified spend and accounting units, **not** an appraisal, guaranteed resale price, investment return or claim to underlying AMM assets.

Each upgrade is one-time per property. Prerequisites create a tycoon unlock chain: reinforced floor → concealed hatch → bunker → bunker arcade. A themed secret lounge and its deluxe version are separate unlocks. Upgrades attach to the **property**; a subsequent owner receives the upgraded property and recorded shares.

## Rendering scope

Public island decorations render after the server's public aggregate upgrade-state endpoint reports confirmed unlock IDs. Supported outdoor geometry includes porch lighting, planters, signs, privacy fences, awnings, fire pit, pond, hatch, roof planters and security fixtures. Indoor/grow-room/bunker items have only discreet exterior hints; **no new explorable underground scene, interior production mechanic or physical construction system is enabled by this branch**. Full enterable rooms, underground stairs, ownership-gated interior save slots, furnishings and multiplayer visibility are follow-up work.

## Payments and security

Production purchase flow is **OFF by default**. The independent switch is ESTATE_TYCOON_UPGRADES_ENABLED=1; it also requires mainnet, a non-dry-run config, treasury destination, Xaman credentials and unpaused treasury. Do not enable in production without deployment audit and legal/financial review.

Quotes, amounts, dependencies, current owner, purchase status and share increments are server-owned; session auth supplies the wallet identity. The server creates owner-approved Xaman requests with distinct burncity/estates/tycoon memo and immutable 10-minute reservation. A receipt settles only when XRPL reports validated tesSUCCESS with exact payer, recipient, amount, delivered XRP, unique order memo and time window. Ledger hashes are unique; original property-purchase and cosmetic receipts cannot be reused; browser-provided prices/hashes are ignored. A crash or uncertain remote payload creation remains on hold rather than creating a duplicate payment. Expired but timely paid requests can be reconciled while paused. Ownership change blocks settlement. No implicit refunds, transfers or liquidity deposits are made.

## Share policy — important boundary

The new estate_tycoon_orders table records settled upgrades and derives the owner's **recorded share balance** at 1 unit per 3 XRP. Authenticated Estates tycoon portfolio and existing Estates portfolio APIs expose this recorded balance and documented value.

Existing hourly/monthly distribution modules, historical purchase weights and estate_property_ownership.share_units are **not changed**. liveRewardShareUnits is deliberately separate. The tycoon UI explains recorded upgrade units are **not active distribution units** yet. No past profits are reallocated. To safely activate prospective bonus allocation, a future explicit approval and release must:

1. Obtain legal/treasury review for the combined virtual property/share offer.
2. Reconcile each verified upgrade XRP receipt and its IMG/RLUSD capital treatment.
3. Create effective-time share events and update every eligible forward-only allocation snapshot, including resales.
4. Backtest total weight conservation and historical receipts; add settlement-to-payout tests.
5. Explicitly activate a versioned payout policy without implying guaranteed returns.

Existing cosmetic prestige purchases retain their separate appearance-only contract; this branch does not silently rebook them as shares.

## API

- GET /api/estates/tycoon/world: public catalog and aggregate unlocks, no owner wallets.
- GET /api/estates/tycoon/state?propertyId=...: signed-in state and owner authorization.
- GET /api/estates/tycoon/portfolio: signed-in recorded value and share balance.
- GET /api/estates/tycoon/quote?propertyId=...&itemId=...: authoritative price, prerequisites and eligibility.
- POST /api/estates/tycoon/start: propertyId and itemId, owner only, disabled unless opted in.
- POST /api/estates/tycoon/confirm: orderId, owner only, validated XRPL receipt.

## Validation

Run npm run test:estate-tycoon, node client/js/estates-island-renderer.test.mjs, node client/js/estates-island-live.test.mjs and existing prestige tests. Dedicated PR checks are in .github/workflows/estates-tycoon.yml. Live browser/mobile inspection and WebGL performance QA remain required; a green unit test is not proof of a production-ready build.
