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

## Private Hangar Logbook — persistence and returning-home motivation

Premium estate owners get an authenticated, server-persisted **Hangar Logbook** once the 180 XRP helicopter is purchased and verified. It is accessible from the Estates property inspection UI. Each eligible property maintains its own SQLite journal and cosmetic style, which follow the estate on resale. Neither current owner nor previous owner wallet addresses are exposed in the logbook API.

**Customization:** five approved airframe paints (obsidian, ember, arctic, verdant, royal), five trim options (brass, ice, chrome, copper, ivory), and a short uppercase alphanumeric callsign. All input is whitelisted or validated server-side, with an authenticated owner-only save endpoint. The current owner's local Three.js airframe and roof/trim materials adopt the approved paint and trim. Callsign appears in the owner's private Hangar UI. Appearance edits do not change estate value or shares, and do not charge XRP.

**Flight history:** when the helicopter is boarded, the client opens a randomly identified server session. The server limits one active flight per property, expires abandoned sessions, requires the current owning wallet at all write points, enforces plausible elapsed time and only accepts the three known sightseeing marker IDs. The client submits flight time, reported route markers and a distinct normal-landing/emergency-return flag on exit. Previous sessions cannot be reused to create another record. History is capped to the last 30 entries in the UI/API, with overall flight count and total duration retained separately. The public world and unauthenticated users never get owner-specific flight data.

**Non-financial return goals:** first safe landing, ten recorded landings, all three scenic lookout reports, and a three-lookout circuit followed by landing. All markers and achievements are labeled **client-reported** because the flight simulation is local; they are not server-authoritative physical movement proofs. There are **no financial or token rewards, yield, guaranteed returns, leaderboard prizes or payout share modifications**. No claim that a game client's route reports are tamper-proof should be made.

**Current known boundaries:** helicopter flight is still single-client/local and not synchronized to other players. Flight history requires a successful network start + finish; if the journal API is unavailable the flight remains playable but is shown as **not recording**, never invented as a completed entry. Cross-device persistence assumes the server SQLite database is durably stored on the production backend. Live financial upgrade buying remains disabled unless explicitly enabled after review. Desktop/mobile smoke tests and main-branch conflict resolution are still required before merge.

## Private aviation — premium repeatable Estates gameplay

A **180 XRP helicopter and its own helipad** is a single fixed upgrade, item ID **estate-helicopter**. It costs 60% of the 300 XRP mansion price, and the server allows it only for the **150 XRP Family Home** and **300 XRP Luxury Mansion**. Trailer, apartment, starter home and cabin properties cannot buy it. The upgrade follows the estate on resale.

The price adds 180 XRP to recorded property development spend and 60 recorded upgrade-share units; these are **not live payout weights**, a market appraisal, or guaranteed returns.

The helicopter and helipad use original, procedural Three.js geometry: fuselage, glass cabin, boom, skids, spinning main/tail rotors, H-marked landing pad and lights. It introduces no new packages, binary models or third-party assets. The pad sits on the side of each qualifying lot opposite the secret bunker hatch.

Pilot authorization: the signed-in currently owning wallet must pass GET /api/estates/tycoon/helicopter-access?propertyId=... which checks current owner, verified settled helicopter unlock and eligible family/mansion tier. Invited guests may visit according to the estate ACL, but cannot pilot yet. After resale, the prior owner is denied and the new owner inherits verified helicopter access.

Board using the property's **Board estate helicopter** inspection button or at its installed pad with **E/USE**. Existing third-person movement drives horizontal helicopter direction; **Space/R or touch ▲** ascends and **Shift/F or touch ▼** descends. The aircraft must rise above 11 meters for horizontal cruising, with bounded island movement, altitude/speed caps and a smoothed chase camera. To land, return over the home pad, descend, slow down and press E/USE or **Land at pad**. **Return home** is a non-rewarding, safe recovery if the flight cannot be completed.

The flight HUD has a three-stop scenic circuit: North Shore Panorama, Eastern Lake Lookout and Southern Lake Overlook. Routes encourage owners to return to their helipad, but have **no token, XRP, yield, leaderboard, XP payout, or persistent prize**. Flights currently have session-only scores. No multiplayer passenger seat, server-authoritative aircraft replication, cross-instance flight, or realistic physics simulator is claimed.

During flight, public island position broadcasting is stopped; an on-foot presence session resumes after parking. Entitlement is rechecked periodically and after wallet changes. Aircraft are restored to the pad on private access loss or world exit.

Asset sourcing: inspected Skill Issue's agent-skill catalog and publicly available Three.js flight/vehicle reference projects. No external model or third-party flight source code was copied. An original, small Three.js procedural vehicle and deterministic movement module are preferable until license, performance, model quality and mobile input validation justify imported assets.

**No production activation:** ESTATE_TYCOON_UPGRADES_ENABLED stays opt-in/off by default. Do not enable live payments or merge/deploy this slice before focused tests, actual browser/mobile WebGL smoke testing and financial/treasury review.

## Enterable secret-room gameplay (next staged slice)

The first playable bunker/interior pass adds six **private, server-authorized room types**:

- Command bunker: blast door, generator, bunks, map desk, operations monitors, storage and emergency lighting
- Hidden garden lounge: neon plant-wall conservatory, sofa, media screen, table and ornamental foliage
- Deluxe secret lounge: larger aquatic display wall and additional plant alcove
- Hobby workshop: assembly benches, storage racks, parts bins and plans
- Private arcade: playable space with themed cabinet geometry and lounge seating (no arcade minigame implemented yet)
- Bunker vault arcade: upgraded game vault behind the bunker progression

A property can enter each room only after that room's **specific upgrade** has a settled, validated XRPL receipt. A purchased *hidden hatch alone* does not unlock a bunker room. The signed-in wallet must also be the current owner or a current invited guest. Unowned-property tours and uninvited wallets cannot access these rooms.

Entry: walk to the verified outdoor hatch and press E/USE, or use the property's **Explore secret rooms** inspection action. Once in the private room, players move in third person with collision-guarded movement and indoor camera clamping. The marked return door exits back to the exact exterior position, and a side door offers other authorized rooms. Interactive power controls switch between normal/emergency lighting. Server permission checks are repeated periodically and room entry is revalidated after any transition.

No external room models are required. The small procedural mesh generator is derived from the existing island's Three.js patterns, with a room-layout contract, furniture collision footprints, and shared materials. This avoids importing incompatible engine dependencies or unverified redistributed assets. Concepts reviewed from the open-source Three.js agent-skills ecosystem include deterministic floorplans, furniture placement/clearance and door interactions, but no third-party source code is copied.

**Current boundaries:** this is a local private interior visualization attached to the player's authenticated island session. Public multiplayer position broadcasting stops while inside and resumes on exit. Full shared private-room multiplayer, new crafting/production systems, persistent furniture layout, operable arcade games and placement editing are NOT implemented yet. Cannabis-themed content is decorative virtual scenery only; no real-world manufacturing, production advice or financial income mechanic is included. Purchases remain disabled by default, recorded shares are not live payout weights, and there is no claim of live production deployment until PR review and acceptance testing.

## API

- GET /api/estates/tycoon/world: public catalog and aggregate unlocks, no owner wallets.
- GET /api/estates/tycoon/state?propertyId=...: signed-in state and owner authorization.
- GET /api/estates/tycoon/portfolio: signed-in recorded value and share balance.
- GET /api/estates/tycoon/quote?propertyId=...&itemId=...: authoritative price, prerequisites and eligibility.
- POST /api/estates/tycoon/start: propertyId and itemId, owner only, disabled unless opted in.
- POST /api/estates/tycoon/confirm: orderId, owner only, validated XRPL receipt.
- GET /api/estates/tycoon/helicopter-access?propertyId=...: current owner with verified 180 XRP unlock and Family/Mansion tier.
- GET /api/estates/tycoon/hangar?propertyId=...: private recorded flight history, lifetime stats and saved customizations.
- POST /api/estates/tycoon/hangar/style: propertyId + approved paint, trim, callsign; owner only.
- POST /api/estates/tycoon/hangar/flight/start: starts or resumes an authenticated, bounded local flight journal session.
- POST /api/estates/tycoon/hangar/flight/finish: sessionId, durationSeconds, routeVisited and landed flag; owner only, client-reported.

- GET /api/estates/tycoon/interior-options?propertyId=...: signed-in owner/invited guest sees only verified unlocked room choices.
- GET /api/estates/tycoon/interior-access?propertyId=...&roomId=...: signed-in wallet authorization and current paid room entitlement.

## Validation

Run npm run test:estate-tycoon, node client/js/estates-island-renderer.test.mjs, node client/js/estates-island-live.test.mjs and existing prestige tests. Dedicated PR checks are in .github/workflows/estates-tycoon.yml. Live browser/mobile inspection and WebGL performance QA remain required; a green unit test is not proof of a production-ready build.
