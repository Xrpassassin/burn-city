# Homefront open-source survival adaptation notes

## Goal

Borrow compatible, license-cleared survival-game engineering patterns while keeping Homefront's current Node.js server, browser client, authenticated save system, and shared Graveyard world authoritative. Do not transplant another game's full project, art, maps, branding, or engine-specific code.

## Reviewed candidates

- [meltuhamy/survive](https://github.com/meltuhamy/survive) — an MIT-licensed online survival RPG with hunger, thirst, health, energy, a server-side model, and a rewrite toward Phaser. Its broad needs-loop and authoritative-model concepts are close to Homefront's JavaScript stack. Review the exact files and current LICENSE before copying any source into the repository.
- [SeloSlav/2d-multiplayer-survival](https://github.com/SeloSlav/2d-multiplayer-survival) — an MIT-licensed React/Vite/SpacetimeDB starter with survival vitals, inventory, resource gathering, cooking, crafting, and persistence. The client/server architecture is not a drop-in fit, but its inventory and interaction boundaries are useful design references.
- [z3dd4-de/Survival-Game](https://github.com/z3dd4-de/Survival-Game) — a Godot tutorial project with hunger/thirst and consumables. It is engine-specific, so adapt only general mechanic ideas unless an individual asset or code file is separately verified for compatibility.
- [dwade30/threejs-survival-game](https://github.com/dwade30/threejs-survival-game) — a small Three.js survival prototype with resource gathering and crafting. Its repository license and individual files must be checked before source reuse; use it as a design reference for gatherable objects and interaction flow.
- [Three.js Raycaster documentation](https://threejs.org/docs/pages/Raycaster.html) — official documentation for pointer-based 3D object selection. Homefront uses its existing vendored Three.js raycaster to select local pickup meshes.

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
- Eating, drinking, and bandaging consume carried items only. Scavenging, supply caches, rescue operations, boss trips, and infected combat use carried supplies; scavenge/cache salvage moves into the pack when capacity permits, with overflow left in refuge stores.
- Inventory actions are authenticated/server-authoritative. The UI exposes carried counts, capacity, packing buttons, and a stash action.
- Added `server/homefront-loot.js` with eight authored shared-world supply nodes, server-owned weighted item tables, distance validation, persistent shared cooldowns, inventory capacity handling, and overflow reporting. The client renders local 3D supply containers and requires explicit selection plus a Search action.
- Added focused loot tests for successful collection, unknown IDs, out-of-range attempts, cooldown enforcement, malformed legacy state, and full-pack overflow. These checks are wired into `npm run test:homefront`.
- Still future work: item spoilage, dirty-water purification, cooking, equipment durability, more physical pickup types, and live desktop/mobile playtesting. Do not treat those as implemented yet.

## Phase 1: expandable world-region foundation

- Added `client/arena/homefront-world-streaming.mjs`, a deterministic 64-unit chunk planner with stable chunk IDs, bounds, visible-neighborhood selection, and a manifest generator. It is presentation infrastructure only; it does not override server-side movement or world limits.
- The Graveyard renderer now groups generated ruined buildings by spatial chunk and hides structure groups outside the player's neighboring 3×3 chunk neighborhood. Roads and the base terrain remain shared scene geometry for this first pass.
- Added `client/arena/homefront-world-streaming.test.mjs` and wired it into `npm run test:homefront`.
- This is the first streaming seam, not a claim that the world is already infinite or seamless. The authoritative world remains bounded at ±100 until a later server/world migration deliberately expands region coordinates, movement validation, spawn selection, persistence, and encounter/loot ownership together.
- Next: split long road segments and terrain into chunk-owned pieces, add chunk-aware landmark placement, then extend authoritative world coordinates and persistent regional state without breaking existing saves.


## Phase 1B: deterministic terrain-generation core

- Added `client/arena/homefront-terrain-generation.mjs`, a dependency-free, seeded world-coordinate height sampler. It combines broad and fine smooth value-noise layers into a deliberately shallow first-pass height profile.
- Added `terrainChunkSamples` to produce repeatable vertex samples for a chunk using absolute world coordinates. Adjacent chunks therefore calculate the same shared-edge heights regardless of generation order.
- Added `client/arena/homefront-terrain-generation.test.mjs` for deterministic output, seed variation, invalid-input handling, bounded height values, and shared-edge continuity; wired it into `npm run test:homefront`.
- This is the generation core, not yet a visible raised terrain surface. The current ground, pointer hit surface, server movement validator, and collision assumptions are planar. Rendering relief before those systems share a common height/collision contract would create visual floating or inaccessible terrain.
- Third-party evaluation: THREE.Terrain is an MIT-licensed candidate with richer terrain generators and material/foliage tools, but its documented Three.js compatibility needs to be checked against this repo's vendored runtime before adoption. Keep the initial sampler dependency-free until a compatibility spike proves a benefit.
- Next integration step: introduce a shared terrain contract for height sampling and walkability, then align the rendered ground, pointer hit testing, server movement validation, roads, and structure placement before enabling meaningful elevation.
