# Homefront terrain contract

This is the first authoritative terrain-integration pass for the Graveyard scene. Keep this contract intact as terrain grows.

## Shared sampling

- Browser sampling lives in `client/arena/homefront-terrain-generation.mjs`.
- Server-side synchronous sampling lives in `server/homefront-terrain.js`; it mirrors the same seeded hash/noise and road corridor flattening.
- `server/homefront-terrain.test.mjs` compares both implementations across a grid of coordinates and checks road centerlines and chunk seam samples.
- `TERRAIN_ELEVATION_SCALE` is currently `0.42` in both implementations. Scene actors, landmarks, props, loot, POIs, buildings, and camera target use `terrainElevation(x, z)`; saved world state continues to store authoritative horizontal `x/z` coordinates.

## Road and chunk continuity

The current authored road grid is spaced at 20 world units, centered at coordinates congruent to 10 modulo 20. Terrain height smoothly blends to zero at those centerlines so the existing flat road strips do not float above or cut through the ground. Terrain samples are functions of absolute world coordinates, so neighboring chunk edges remain identical regardless of load order.

## Terrain-safe placement

- `Terrain.isSafePosition` rejects non-finite/out-of-bounds coordinates and checks an eight-direction local footprint against the same grade gate used by movement.
- New explorers are assigned a safe position near a balanced authored perimeter spawn. If a saved coordinate becomes invalid after a terrain change, normalization searches bounded concentric rings near that player's recorded spawn and recovers there rather than retaining an invalid position.
- Infected encounter spawns validate their deterministic candidate and search nearby safe positions before falling back to the player's safe location. Party followers are also placed through the safe-position search during group movement.
- `server/homefront-collision.js` mirrors the deterministic procedural building footprints, selected environmental blockers (including standing-water pools, fallen logs, trees, rubble, and vehicles), and solid cache/rescue props. It applies a horizontal actor radius to movement and placement checks.
- Spawn and save recovery now require both terrain safety and unoccupied space. If a save is embedded in a solid obstacle, recovery searches around the recorded spawn before using the world-center fallback.

## Server movement rules

- Player movement validates the proposed authoritative step against both `Terrain.canTraverse` and `Collision.canTraverse`. If either gate blocks it, collision-aware A* searches for a route and movement advances along the first `MOVE_STEP` units of that route.
- Infected pursuit uses the same terrain and collision gates and requests bounded collision-aware A* only when the direct step is blocked. If no route is found within the search budget, the infected waits rather than clipping through terrain or solid blockers.
- `Terrain.findTerrainPath` uses an 8-neighbor grid (4-unit spacing by default), checks grade along every edge, accepts an optional `edgeAllowed` predicate for authoritative collision, keeps the search inside world bounds, and has a hard expansion limit. `Collision.findPath` supplies the solid-occupancy gate. The pathfinder returns waypoints or `null` when no route is found within the limit.
- Direct movement remains the fast path. A* is a fallback for blocked terrain, not a per-frame pathfinding loop.
- The current landscape is deliberately gentle; the pathfinder is groundwork for future steeper terrain, not a replacement for collision or grounding. Do not simply increase the grade threshold until entities clip through slopes.
- Keep server position authority, survival distance accounting, party movement, combat range checks, and persistent saves in horizontal world coordinates unless a deliberate schema migration is made.

## Integrated movement regression coverage

- `test/homefront-world-sim.js` now simulates a blocked ridge at the shared terrain-module boundary and verifies that player movement follows a safe detour, infected pursuit follows the same detour, and both actors stop rather than cross when the pathfinder reports no route.
- These are server-side integration tests with a controlled terrain gate/pathfinder seam; they validate that world/combat code honors the contract, but they do not replace tests against the real generated terrain or browser/device playtesting.

## Remaining before calling terrain complete

1. Extend the collision manifest to every visible landmark and prop class; the first pass blocks generated buildings, selected environmental props, water pools, and cache/rescue structures, but not every decorative mesh or the full height/shape of every landmark.
2. Add explicit authoritative interaction-volume validation for all POIs and dynamic objects; solid collision currently protects movement and placement, while interaction eligibility remains a separate API concern.
3. Conform road geometry, building footprints, and large props to terrain; road centerlines are currently levelled, but the roads remain flat meshes.
4. Expand integrated tests to cover synthetic steep-terrain spawn recovery, dynamic collision, and browser-ground alignment.
5. Tune grid spacing and search budgets against measured gameplay latency once the browser/server loop can be exercised end-to-end.
6. Run the complete `npm run test:homefront` suite and browser/device smoke tests before merge or deployment.

This branch is intentionally unmerged and undeployed pending Hark's review.
