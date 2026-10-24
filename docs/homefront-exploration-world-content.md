# Homefront Exploration World Content

## Purpose

This is an authored content layer for the existing XRPL Graveyard expedition map. It turns the current point-of-interest list into recognizable places with objectives, narrative hooks, interior spaces, interactions, hazards, route links, and connected story threads.

## Files

- `client/arena/homefront-exploration-content.mjs`: browser-safe static content catalog; no runtime dependencies.
- `client/arena/homefront-exploration-content.test.mjs`: checks catalog integrity against the server's authoritative `POINTS_OF_INTEREST`.
- `client/arena/homefront-exploration-guidance.mjs` and its test: computes contextual route/story breadcrumbs; the 3D client renders account-saved field notes in the Field Journal.
- `client/arena/homefront-interior-world.mjs`: seven authored, connected room networks with inspect/search/power/door interactions and open-roof Three.js room shells.
- `client/arena/homefront-interior-world.test.mjs`: validates room links, interaction requirements, door gating, and state transitions.
- `client/arena/homefront-terrain-generation.mjs` and `server/homefront-terrain.js`: share the amplified deterministic height field so the visible relief and server traversal checks remain aligned.

## Design rules

- `server/homefront-world.js` remains authoritative for coordinates, movement, encounter state, loot, rescue state, and rewards.
- This catalog does not grant items or unlock routes. It describes content for the presentation/mission layer to consume after a server-authorized interaction.
- Discovering all named locations in a story thread marks its route as surveyed, not its story as complete. Narrative completion and rewards must follow explicit clue/objective interactions.
- Existing point IDs and coordinates must match exactly; content must not create a second source of truth for physical POIs.
- District risk uses the existing established expedition zones. The high-risk subway and research annex are endgame destinations.
- Frontier depth is measured inward from the map's outer edge: the perimeter remains the safest band, with risk bands and encounter pressure rising toward the city core. The server exposes a bounded 0–100 depth value; the director uses it for a small continuous pressure increase and modestly shorter reinforcement intervals without raising the local alive cap. Gunfire/noise remains an independent threat multiplier.
- Use this as the blueprint for building geometry: landmark archetype, interior-space list, interactables, hazards, soundscape, and route links are explicit rather than inferred from decorative props.
- Interior room flags, clue discoveries, used searches, and open-door state are now normalized and persisted in `homefront-world.json` per account. Authenticated endpoints validate proximity and room requirements before accepting enter/action/door/leave requests. Search rewards are granted through the existing server inventory rules; duplicate searches are rejected by persisted state.
- Server collision now includes authored room-wall segments and closed-door blockers. Inactive interior shells are ignored for normal exterior movement; the active player's shell is enforced during server movement. Player-approved traversal removes that door's blockers, while infected can path to ordinary closed doors and batter them open over multiple AI ticks. Doors guarded by story/power requirements cannot be bypassed by the breach mechanic.
- Power switches, shutters, locks, and searches produce server-owned noise and a sound-source position; the existing director/combat pursuit logic can investigate it. Physical loot containers now add a 12-second server-recorded noise signature when opened: perimeter containers are quieter, while high-risk caches can trigger assault-level pressure. High-value secure-cache objectives use the same risk-scaled noise profile, and survivor rescues create a louder, risk-dependent signature to represent extraction calls and movement.
  
## Survivor rarity

- Every newly recruited survivor receives a server-generated, deterministic rarity tier that is saved with the roster: Common (70%), Uncommon (20%), Rare (8%), Epic (1.8%), or Legendary (0.2%).
- The tier roll is independent of the existing recruit/rescue encounter chance. Finding a survivor can still be uncommon in the first place, and top-tier survivors are rarer still.
- The refuge roster shows a rarity label with a tier-specific color. Existing saves migrate safely: survivors without a rarity field default to Common.
- Each survivor also receives two deterministic personality traits and one specialist talent. Traits include Optimistic, Resilient, Keen-Eyed, Green Thumb, Steady Hands, Compassionate, Vigilant, and Resourceful. Talents include Master Farmer, Scavenger Ace, Combat Veteran, Field Medic, and Engineer.
- Survivor cards also show a deterministic pre-outbreak background (for example, former EMT, transit operator, volunteer firefighter, or community gardener), so recruited people read as individuals rather than interchangeable roster entries. The roster also surfaces the strongest current same-role bond or rivalry, when one exists.
- Work teams have deterministic pair chemistry: a friendly pair adds a small amount of effective labor when assigned to the same role; a rivalry subtracts the same amount. Relationship rolls are derived from stable survivor IDs, symmetric, and server-authoritative, so reconnecting cannot reroll the outcome. The effect is deliberately modest and never changes combat damage directly.
- Traits have small role- or morale-specific effects; talents provide a stronger role-specific bonus. Specialist bonuses only apply when the survivor is assigned to the matching job. Field Medics need an active infirmary for their extra medicine.
- The MIT-licensed [OpenNPC framework](https://github.com/LISK819129/OpenNPC) was reviewed as a reference for data-driven character personas. Its model-backed dialogue service is not a good fit for this deterministic settlement simulation, so no external runtime or third-party code was added; survivor profiles remain server-authoritative and dependency-free.

- Rarity assignment is server-authoritative and derived from the recruitment seed, so clients cannot choose a tier. Higher rarity has a modest gameplay effect: Common 1.00×, Uncommon 1.05×, Rare 1.10×, Epic 1.15×, Legendary 1.20× survivor contribution to assigned work and guard strength. Morale modifiers still apply, and the rarity multiplier is additive to the existing morale-based model.
 Both actions write noise and its source coordinates to the server-owned player state and return a tactical warning for the HUD. Loot remains server-rolled and its existing shared cooldown is unchanged. Infected breach state is persisted and appears in world snapshots so the client can remove the door slab and emit a `homefront:interior-breach` event.
- API tests cover authenticated entry, clue/power gating, one-time searches, real inventory rewards, persistence after exit, and overflow returns to refuge storage. Browser QA is still needed to verify wall clearance, doorway approach, room grounding, and breach presentation.

## Open-source and terrain strategy

- The interior shell builder uses the repository's already-bundled Three.js runtime; it adds no CDN or package dependency.
- The Graveyard now adds deterministic biome-tinted ground micro-details as two instanced batches per chunk. These are presentation-only, avoid the spawn clearing and main road lanes, and share the existing chunk visibility system; no individual mesh is created per pebble or grass tuft.
- The refuge yard now uses low-contrast procedural vertex-color mottling and batched perimeter stones/grass to break up the flat ground. The grid overlay is subdued so placement remains readable.
- Authored interiors now receive three per-building instanced detail batches: scattered low-poly floor rubble, subtle wall grime, and warm emergency-light fixtures. These use the existing Three.js runtime, preserve open-roof visibility for third-person play, and add no new asset downloads or runtime dependencies.
- Rendering quality is device-tiered: desktop keeps antialiasing and a sharper pixel-ratio cap; touch devices use a lower render-buffer scale, disable MSAA, and disable dynamic yard shadows. This prioritizes stable frame pacing while retaining the more detailed ground geometry.
- Two MIT-licensed projects were evaluated as possible accelerators: [threejs-procedural-dungeon](https://github.com/majidmanzarpour/threejs-procedural-dungeon) for seeded room graphs and room semantics, and [THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain) for terrain generation.
- The first interior pass stays authored and data-driven to preserve mission readability. The terrain height field remains deterministic and mirrored in `server/homefront-terrain.js`; importing a client-only terrain runtime without porting its sampler into server traversal would create visual/collision disagreement. A later pass can selectively adapt compatible MIT algorithms after dependency and attribution review.

## Environmental identity and damage readability

- Seven authored interiors now use landmark-specific, instanced silhouettes: dispatch furniture at the bus depot, apartment furniture, market shelving, hospital beds, industrial machinery, subway utility cabinets, and research consoles.
- The interior set-dressing batches are presentation-only and deterministically seeded from landmark and room IDs. They add no network assets and preserve the authored room graph, interactables, and center movement lanes.
- Refuge structures now express damage visually from the server-returned HP ratio: scuffs appear as health falls, wall/building cracks deepen at lower health, and small debris appears on severely damaged structures. The existing health bar remains available for precise readability.
- Damage meshes are generated only for structures below the wear threshold; intact structures do not pay that extra geometry cost. No per-frame damage simulation was added.
- Regression checks in `client/arena/homefront-interior-world.test.mjs` verify landmark-specific instanced batches; `test/homefront-assets.test.mjs` checks the refuge wear rendering path.
- CI checks are not a substitute for browser playtesting or FPS profiling on target mobile devices. Review collision clearance, silhouette readability, and frame pacing before release.

## Exploration loop and field notes

- The 3D expedition view now reports a landmark as unmapped, newly discovered, or known as the player approaches it. Discovery is triggered within 8 world units; nearby context is available within 20 units.
- A discovered site surfaces up to two connected, not-yet-discovered route leads. This makes POIs act as navigational choices rather than isolated map pins.
- Existing story-thread metadata powers contextual breadcrumbs. For example, finding the North Bus Depot points toward the next clue in **The Last Convoy**; hospital and Ironworks leads guide players through multi-stop story chains toward Blackglass.
- Discovery progress is account-persisted in `homefront-exploration.json` through authenticated `GET /api/homefront/world/exploration` and `POST /api/homefront/world/exploration/discover`. The server validates the active expedition player's distance (8 world units) and landmark ID before recording a discovery.
- Each first discovery creates a persistent field note, reveals unexplored connected route leads, and advances the relevant multi-stop story breadcrumb. Duplicate requests are idempotent. This progression layer grants no inventory items; all item rewards remain under existing server-authoritative loot/interior systems.
- The 3D client loads account progress and submits discovery requests as players approach sites. The UI may still show generic exploration guidance if the network is unavailable; it cannot locally grant a discovery or reward.
- Regression coverage: `node server/homefront-exploration.test.js` and `node client/arena/homefront-exploration-guidance.test.mjs` run at the start of the focused `test:homefront` suite.

## Current content

Seven districts are authored: Ash Ring, Hollow Blocks, Exchange Market, St. Mercy Quarantine, Ironworks Belt, The Buried Line, and Blackglass Annex. All existing server points receive a purpose-built objective and narrative hook. Three multi-location story threads connect evacuation clues, the hospital transfer order, and the Ironworks power puzzle. Route metadata marks the outer-ring road, freight cut-through, market service passage, hospital link, and buried line.

## Integration sequence

1. Run `node client/arena/homefront-exploration-content.test.mjs`.
2. Render district titles and POI descriptions in the world map/mission UI.
3. Build each `archetype` using locally bundled licensed assets and deterministic prop placement.
4. Add server-authoritative interactions for doors, switches, loot, and story flags as separate, reviewed changes.
5. Test third-person navigation and mobile performance before wiring content into the live scene.
