# Homefront: Ashfall Thermal Station / urban visual pass

## Objective

Introduce a recognizable derelict power-station skyline in the Ironworks Belt, with a ruined industrial silhouette reminiscent of abandoned Eastern European thermal plants. Improve the existing downtown and medical landmarks without changing movement, loot, UI menus, Estates, or XRPL endpoints.

## Implemented

- **Ashfall Thermal Station**: twin low-poly curved cooling towers, a reactor/boiler hall, stacked turbine housing, rooftop service pipes, two smokestacks, warning bands, broken upper windows, and static red aviation beacons.
- **Ironworks Yard**: a raised maintenance gantry, tall rooftop smokestack, warning rails, and overhead power-header equipment.
- **Residential apartments**: a roof fire-escape remnant, exposed antenna, upper building scars, and a broken upper sign.
- **Exchange Market**: a torn canopy, blocked rooftop sign, overhead support, and boarded upper glazing.
- **St. Mercy Hospital**: rooftop helipad hints, exhaust and unpowered siren.

These are *visual geometry only*. The built-in Homefront scene, materials, player movement, and server authority are preserved.

## Engineering constraints

- Every Ashfall station footprint is placed entirely beyond **x = -100** (root x = -122, z = 34), which is outside the authoritative world's 100-unit radial traversal boundary. Each mesh enforces a strict easternmost-edge bound at construction time.
- It is anchored in the existing **homefront:-2,0** chunk, visible when exploring Ironworks (-16,22) and culled from distant districts.
- The Ashfall station does **not** appear in the server POI list, grant rewards, block traversal, enable interactions, or claim that it is accessible. It is a *distant skyline backdrop*, not an explorable mission site.
- The skyline uses a shared nine-color material palette and **no shadows, animated lights, smoke simulation, physics bodies, or new postprocessing**. Geometry is low-poly; the deterministic test caps it at 48 mesh draws.
- Added playable-area landmark details are **rooftop or above head height**, leaving the existing base geometry and gameplay ground collision contracts unchanged.
- Existing server-confirmed Ironworks and nearby cache POIs, exploration objectives, and story links remain unmodified.

## QA and visual acceptance

1. Visit the industrial district and approach the existing Ironworks Yard. Confirm both cooling tower silhouettes, boiler hall, stacks, and warning stripes are visible beyond the ruined factory roofline; expect fog to soften distance.
2. Move toward Ironworks, the secure crate, and neighboring research ruins. Verify there is no accessible off-map path or false "Enter station" prompt.
3. Explore Exchange Market, the collapsed apartments, and St. Mercy Hospital. Look for new rooftop/overhead accents while confirming existing entrances, cover, doorways and pickups behave exactly as before.
4. On mobile, compare fps and WebGL draw calls with the same view before this change. New tower meshes should be chunk-culled when outside the industrial region.
5. Confirm no skybox/terrain seams or floating scenery at station coordinates. Visual altitude is sampled from the same deterministic terrain function.
6. Run `node client/arena/homefront-power-station.test.mjs`, `node client/arena/homefront-landmark-builder.test.mjs`, and `node test/homefront-graveyard-3d.test.mjs`.

## Next phase (not part of this PR)

An **explorable** reactor compound requires an authored interior layout, a safe reachable location, a collision catalog mirrored server/client, escape routes, and explicit authenticated story/loot actions. An inaccessible skyline should not silently become a walk-through building. The power-station exterior is intentionally only the first visual milestone; player feedback can guide where a playable compound belongs.

UI overlap and device-specific camera framing are reserved for a later user playtest.
