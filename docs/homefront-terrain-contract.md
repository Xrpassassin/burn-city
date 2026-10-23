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

- Player movement validates the proposed authoritative step with `Terrain.canTraverse`.
- Infected pursuit uses the same grade gate.
- The current landscape is deliberately gentle; the grade guard is groundwork for steeper terrain, not a substitute for full navigation.
- If steeper hills are introduced, rejected paths must be handled by a real pathfinder with alternate routes. Do not simply increase the grade threshold until entities clip through slopes.
- Keep server position authority, survival distance accounting, party movement, combat range checks, and persistent saves in horizontal world coordinates unless a deliberate schema migration is made.

## Remaining before calling terrain complete

1. Add terrain-aware pathfinding around steep slopes for players and infected.
2. Add collision/grounding for movement and interactions rather than relying on horizontal coordinates alone.
3. Conform road geometry, building footprints, and large props to terrain; road centerlines are currently levelled, but the roads remain flat meshes.
4. Add automated movement tests for blocked slopes, alternate routes, spawn placement, and infected pursuit.
5. Run the complete `npm run test:homefront` suite and browser/device smoke tests before merge or deployment.

This branch is intentionally unmerged and undeployed pending Hark's review.
