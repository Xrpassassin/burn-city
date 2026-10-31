# Homefront Field Survey Rewards (non-XRPL)

## Gameplay loop

1. A survivor visits three authored sites along one of four geographically connected expedition circuits. The server authenticates each discovery against the survivor's actual coordinates and records that visit per account in `homefront-exploration.json`.
2. The existing Field Journal shows what is left to visit, route readiness, and the modest one-time pack supply bundle. This is separate from story-thread completion; visiting sites does **not** automatically complete plot missions.
3. A survivor manually presses **Claim field supplies**. The server reads the already persisted discovered site IDs. Clients cannot supply site lists or reward amounts.
4. The server checks that the player is in the active expedition, the survey is fully discovered, the claim is not already recorded, and the backpack has room for **every** item.
5. The inventory and per-account claim ledger are stored together in the **single** `homefront-world.json` save operation. If backpack capacity is insufficient, **nothing is consumed or awarded**; the player can free space and try again.

## Supply bundles

| One-time contract | Authenticated site visits | Field supplies |
| --- | --- | --- |
| Evacuation Road Survey | North Bus Depot, River Checkpoint, Wrecked Depot | 1 food, 1 water |
| Industrial Feeder Survey | Old Rail Yard, Ironworks Yard, Ashfall Power Station Access | 2 scrap, 1 ammo |
| Medical Corridor Survey | Collapsed Apartments, Quarantine Shelter, St. Mercy Hospital | 1 meds, 1 water |
| Deep Wastes Survey | Buried Subway, Research Annex, Ashfall Power Station Access | 2 ammo, 1 meds |

These rewards are in-game consumables and crafting materials. They are **not** XRP, BURN, IMM, IMG, NFTs, token distributions, cash-equivalent rewards, or promises of financial returns. Current per-site discovery XP continues unchanged.

## Security and multiplayer

- Four one-time claims per account at most, with an allowlisted immutable server catalog and bounded reward amounts.
- No custom reward quantities, item IDs, target accounts, wallet addresses, or client-defined proof accepted.
- Per-account ledger in the same persistent world as inventory. Even if multiple survivors explore together, each must individually discover the route and can claim only once.
- Fail-closed on invalid catalog or server time, unknown claims, stale expedition presence, or an overfull pack.
- Backpack items are committed all-or-nothing; there is no cross-file refuge overflow on this route.
- Existing container cooldowns and one-time room searches are untouched.
- Tests exercise pure claim behavior, account isolation, persistence, forged request bodies, full-pack retry and replay through the authenticated route.

## Potential later phase

Add **story-specific** rewards only after actions confirm the actual clues in the rooms, not merely site discovery. Consider a server-owned supply contract refresh system with strict caps and abuse tests before any recurring or tradable rewards.
