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
- A low-poly cinder embankment joins the terrain mesh's western edge at x = -102, so the skyline is not suspended above the map boundary. Its entire footprint remains outside x = -100.
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

## Shared playable buildings (next release)

The off-map Ashfall cooling towers remain **visual-only scenery** beyond x = -100. A distinct **Ashfall Power Station Access** POI at (-42, 8) now provides real server-authoritative entry into its reachable service wing, with four interconnected areas: Security Vestibule, Turbine Gallery, Reactor Control Room, and Cooling Pump Bay. Switchgear power is shared across all connected players in this building instance, whereas salvage remains personal to each account. Physical room walls/doors are generated from the same room blueprint as server collision, not client-only geometry.

Three more pre-existing real-world points become accessible interiors: Wrecked Depot (office and warehouse), Old Rail Yard (signal cabin and freight car), and Quarantine Shelter (triage desk and isolation ward). Their room/door graph, loot/search locations, and shared occupant presence are validated on the server.

This is not a new separately booted game or a private lobby: all participants share the current Homefront world and persistent building state. Existing player movement, weapons, rewards, and server validation are retained.

## Next phase (not part of this PR)

The service-wing rooms, reachable entrance and server-mirrored collision are now included. The giant cooling towers, reactor shell and outdoor cooling ponds are **not** yet traversable; expanding the main compound will need additional collision-safe routes, exterior entrances, and performance tests. Procedural unmarked ruined buildings also remain scenery until they get validated room layouts.

UI overlap and device-specific camera framing are reserved for a later user playtest.
