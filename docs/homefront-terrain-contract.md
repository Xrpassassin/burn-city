# Homefront terrain contract

This is the first authoritative terrain-integration pass for the Graveyard scene. Keep this contract intact as terrain grows.

## Shared sampling

- Browser sampling lives in `client/arena/homefront-terrain-generation.mjs`.
- Server-side synchronous sampling lives in `server/homefront-terrain.js`; it mirrors the same seeded hash/noise and road corridor flattening.
- `server/homefront-terrain.test.mjs` compares both implementations across a grid of coordinates and checks road centerlines and chunk seam samples.
- `TERRAIN_ELEVATION_SCALE` is currently `0.42` in both implementations. Scene actors, landmarks, props, loot, POIs, buildings, and camera target use `terrainElevation(x, z)`; saved world state continues to store authoritative horizontal `x/z` coordinates.

## Road and chunk continuity

The current authored road grid is spaced at 20 world units, centered at coordinates congruent to 10 modulo 20. Terrain height smoothly blends to zero at those centerlines so the existing flat road strips do not float above or cut through the ground. Terrain samples are functions of absolute world coordinates, so neighboring chunk edges remain identical regardless of load order.

## Server movement rules

- Player movement validates the proposed authoritative step with `Terrain.canTraverse`. If that step is blocked, it requests a bounded A* route to the requested destination and advances along the first `MOVE_STEP` units of the route.
- Infected pursuit uses the same grade gate and requests bounded A* only when the direct pursuit step is blocked. If no route is found within the search budget, the infected waits rather than clipping through terrain.
- `Terrain.findTerrainPath` uses an 8-neighbor grid (4-unit spacing by default), checks grade along every edge, keeps the search inside world bounds, and has a hard expansion limit. It returns a list of waypoints, or `null` when no route is found within that limit.
- Direct movement remains the fast path. A* is a fallback for blocked terrain, not a per-frame pathfinding loop.
- The current landscape is deliberately gentle; the pathfinder is groundwork for future steeper terrain, not a replacement for collision or grounding. Do not simply increase the grade threshold until entities clip through slopes.
- Keep server position authority, survival distance accounting, party movement, combat range checks, and persistent saves in horizontal world coordinates unless a deliberate schema migration is made.

## Integrated movement regression coverage

- `test/homefront-world-sim.js` now simulates a blocked ridge at the shared terrain-module boundary and verifies that player movement follows a safe detour, infected pursuit follows the same detour, and both actors stop rather than cross when the pathfinder reports no route.
- These are server-side integration tests with a controlled terrain gate/pathfinder seam; they validate that world/combat code honors the contract, but they do not replace tests against the real generated terrain or browser/device playtesting.

## Remaining before calling terrain complete

1. Add terrain-aware collision/grounding for movement and interactions rather than relying on horizontal coordinates alone.
2. Conform road geometry, building footprints, and large props to terrain; road centerlines are currently levelled, but the roads remain flat meshes.
3. Add integrated movement tests that force a blocked slope through player movement and infected pursuit, plus spawn placement on future steeper terrain.
4. Tune grid spacing and search budgets against measured gameplay latency once the browser/server loop can be exercised end-to-end.
5. Run the complete `npm run test:homefront` suite and browser/device smoke tests before merge or deployment.

This branch is intentionally unmerged and undeployed pending Hark's review.
