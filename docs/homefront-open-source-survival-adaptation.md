# Homefront open-source survival adaptation notes

## Goal

Borrow compatible, license-cleared survival-game engineering patterns while keeping Homefront's current Node.js server, browser client, authenticated save system, and shared Graveyard world authoritative. Do not transplant another game's full project, art, maps, branding, or engine-specific code.

## Reviewed candidates

- [meltuhamy/survive](https://github.com/meltuhamy/survive) — an MIT-licensed online survival RPG with hunger, thirst, health, energy, a server-side model, and a rewrite toward Phaser. Its broad needs-loop and authoritative-model concepts are close to Homefront's JavaScript stack. Review the exact files and current LICENSE before copying any source into the repository.
- [SeloSlav/2d-multiplayer-survival](https://github.com/SeloSlav/2d-multiplayer-survival) — an MIT-licensed React/Vite/SpacetimeDB starter with survival vitals, inventory, resource gathering, cooking, crafting, and persistence. The client/server architecture is not a drop-in fit, but its inventory and interaction boundaries are useful design references.
- [z3dd4-de/Survival-Game](https://github.com/z3dd4-de/Survival-Game) — a Godot tutorial project with hunger/thirst and consumables. It is engine-specific, so adapt only general mechanic ideas unless an individual asset or code file is separately verified for compatibility.

## Adaptation already applied

Homefront now uses its own implementation of distance-weighted travel metabolism: the server measures the accepted displacement after clamping movement, then applies a bounded stamina cost and small hunger/thirst costs. When a player is already hungry or thirsty, travel becomes more exhausting. This adapts a common survival-game pattern without copying another project's implementation.

## Integration rules

1. Keep all vitals, movement costs, item consumption, rewards, and save changes on the server.
2. Treat client coordinates as requests; only use the displacement actually accepted by the world movement validator.
3. Keep survival logic engine-agnostic in `server/homefront-survival.js`; render bars and warnings in the existing Homefront UI.
4. Before copying any third-party source, preserve its LICENSE and required attribution, inspect asset licenses separately, and record exact upstream commit/file provenance. MIT code can generally be adapted with copyright and license notice preservation; never assume an entire repository shares one license.
5. Do not import SpacetimeDB, Godot, Phaser, or unrelated runtime dependencies just to obtain a hunger/thirst loop.
6. Keep this optional unranked mode isolated from ranked BURN City progression and avoid offline starvation or base loss.

## Next conversion targets

- Server-authoritative carried inventory stacks, capacity limits, pack/stash actions, starter field kit, and transfer of scavenge costs/loot into the field pack are implemented. Further targets: distinct dirty water/food safety states and crafting/purification interactions.
- Distinct clean/dirty water and food safety states, with purification/cooking interactions and clear UI warnings.
- Item spoilage and temperature/wetness only after world weather, shelter, and time-of-day systems exist.
- Persistent player condition separate from transient online presence, with explicit reconnect/death/recovery rules.


## Carried field inventory pass

- Added `server/homefront-inventory.js` with stack limits, weight capacity, normalization, safe add/remove, refuge withdraw, and stash helpers.
- New expeditions take a starter kit from persistent refuge stores; inventory persists in the shared world player record while active. Leaving an expedition automatically stashes carried supplies back into the refuge.
- Eating, drinking, and bandaging consume carried items only. Scavenging consumes carried food/ammo and moves salvage into the pack when capacity permits; overflow remains in refuge stores.
- Inventory actions are authenticated/server-authoritative. The UI exposes carried counts, capacity, packing buttons, and a stash action.
- Item spoilage, dirty-water purification, cooking, equipment durability, and physical 3D loot pickups remain future work; do not simulate them as implemented.
