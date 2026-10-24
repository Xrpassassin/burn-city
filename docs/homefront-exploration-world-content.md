# Homefront Exploration World Content

## Purpose

This is an authored content layer for the existing XRPL Graveyard expedition map. It turns the current point-of-interest list into recognizable places with objectives, narrative hooks, interior spaces, interactions, hazards, route links, and connected story threads.

## Files

- `client/arena/homefront-exploration-content.mjs`: browser-safe static content catalog; no runtime dependencies.
- `client/arena/homefront-exploration-content.test.mjs`: checks catalog integrity against the server's authoritative `POINTS_OF_INTEREST`.
- `client/arena/homefront-interior-world.mjs`: seven authored, connected room networks with inspect/search/power/door interactions and open-roof Three.js room shells.
- `client/arena/homefront-interior-world.test.mjs`: validates room links, interaction requirements, door gating, and state transitions.
- `client/arena/homefront-terrain-generation.mjs` and `server/homefront-terrain.js`: share the amplified deterministic height field so the visible relief and server traversal checks remain aligned.

## Design rules

- `server/homefront-world.js` remains authoritative for coordinates, movement, encounter state, loot, rescue state, and rewards.
- This catalog does not grant items or unlock routes. It describes content for the presentation/mission layer to consume after a server-authorized interaction.
- Existing point IDs and coordinates must match exactly; content must not create a second source of truth for physical POIs.
- District risk uses the existing established expedition zones. The high-risk subway and research annex are endgame destinations.
- Use this as the blueprint for building geometry: landmark archetype, interior-space list, interactables, hazards, soundscape, and route links are explicit rather than inferred from decorative props.
- Interior room flags, clue discoveries, used searches, and open-door state are now normalized and persisted in `homefront-world.json` per account. Authenticated endpoints validate proximity and room requirements before accepting enter/action/door/leave requests. Search rewards are granted through the existing server inventory rules; duplicate searches are rejected by persisted state.
- Server collision now includes authored room-wall segments and closed-door blockers. Inactive interior shells are ignored for normal exterior movement; the active player's shell is enforced during server movement, and door blockers are removed only after the corresponding server-approved door transition. This is an initial collision pass; verify pathfinding through door gaps and exterior entrance alignment in the browser.

## Open-source and terrain strategy

- The interior shell builder uses the repository's already-bundled Three.js runtime; it adds no CDN or package dependency.
- Two MIT-licensed projects were evaluated as possible accelerators: [threejs-procedural-dungeon](https://github.com/majidmanzarpour/threejs-procedural-dungeon) for seeded room graphs and room semantics, and [THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain) for terrain generation.
- The first interior pass stays authored and data-driven to preserve mission readability. The terrain height field remains deterministic and mirrored in `server/homefront-terrain.js`; importing a client-only terrain runtime without porting its sampler into server traversal would create visual/collision disagreement. A later pass can selectively adapt compatible MIT algorithms after dependency and attribution review.

## Current content

Seven districts are authored: Ash Ring, Hollow Blocks, Exchange Market, St. Mercy Quarantine, Ironworks Belt, The Buried Line, and Blackglass Annex. All existing server points receive a purpose-built objective and narrative hook. Three multi-location story threads connect evacuation clues, the hospital transfer order, and the Ironworks power puzzle. Route metadata marks the outer-ring road, freight cut-through, market service passage, hospital link, and buried line.

## Integration sequence

1. Run `node client/arena/homefront-exploration-content.test.mjs`.
2. Render district titles and POI descriptions in the world map/mission UI.
3. Build each `archetype` using locally bundled licensed assets and deterministic prop placement.
4. Add server-authoritative interactions for doors, switches, loot, and story flags as separate, reviewed changes.
5. Test third-person navigation and mobile performance before wiring content into the live scene.
