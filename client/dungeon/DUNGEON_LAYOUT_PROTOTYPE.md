# Eternal Grind — Seeded Dungeon Layout Core (Prototype)

## Purpose
This isolated prototype creates a deterministic room-and-corridor graph from a seed. It is the first safe brick toward replayable floor layouts and later procedural room dressing.

## Run
`node client/dungeon/dungeon-layout-core.test.mjs`

## Contract
- Same seed and options return the same room graph.
- Rooms occupy a bounded grid, with a randomized depth-first spanning tree ensuring every room is reachable.
- Optional extra connections create loops without disconnecting the floor.
- Entrance and boss room IDs are explicit; the boss is selected as a farthest reachable room by graph distance.
- Layout generation is pure: no DOM, Three.js, random global state, storage, saves, combat, loot, or production floor state are touched.

## Current limits
This is a graph/layout prototype, not a finished dungeon renderer. Room dimensions, doors, wall geometry, collision, spawn tables, loot placement, floor progression and save integration are intentionally not wired into the live game. The boss location is farthest by graph distance, not yet by tactical difficulty or authored encounter rules.

## Integration gate
Before production use, Hark should review the graph contract, run the test, then build a separate renderer adapter that maps room/corridor IDs to existing dungeon geometry. Do not regenerate an in-progress floor on reload; persist the seed and generation version with a floor only after save-schema review.
