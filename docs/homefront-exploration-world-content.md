# Homefront Exploration World Content

## Purpose

This is an authored content layer for the existing XRPL Graveyard expedition map. It turns the current point-of-interest list into recognizable places with objectives, narrative hooks, interior spaces, interactions, hazards, route links, and connected story threads.

## Files

- `client/arena/homefront-exploration-content.mjs`: browser-safe static content catalog; no runtime dependencies.
- `client/arena/homefront-exploration-content.test.mjs`: checks catalog integrity against the server's authoritative `POINTS_OF_INTEREST`.

## Design rules

- `server/homefront-world.js` remains authoritative for coordinates, movement, encounter state, loot, rescue state, and rewards.
- This catalog does not grant items or unlock routes. It describes content for the presentation/mission layer to consume after a server-authorized interaction.
- Existing point IDs and coordinates must match exactly; content must not create a second source of truth for physical POIs.
- District risk uses the existing established expedition zones. The high-risk subway and research annex are endgame destinations.
- Use this as the blueprint for building geometry: landmark archetype, interior-space list, interactables, hazards, soundscape, and route links are explicit rather than inferred from decorative props.
- No new runtime dependency, CDN asset, server API, save schema, or gameplay behavior is introduced in this proposal.

## Current content

Seven districts are authored: Ash Ring, Hollow Blocks, Exchange Market, St. Mercy Quarantine, Ironworks Belt, The Buried Line, and Blackglass Annex. All existing server points receive a purpose-built objective and narrative hook. Three multi-location story threads connect evacuation clues, the hospital transfer order, and the Ironworks power puzzle. Route metadata marks the outer-ring road, freight cut-through, market service passage, hospital link, and buried line.

## Integration sequence

1. Run `node client/arena/homefront-exploration-content.test.mjs`.
2. Render district titles and POI descriptions in the world map/mission UI.
3. Build each `archetype` using locally bundled licensed assets and deterministic prop placement.
4. Add server-authoritative interactions for doors, switches, loot, and story flags as separate, reviewed changes.
5. Test third-person navigation and mobile performance before wiring content into the live scene.
