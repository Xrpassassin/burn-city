# CinderWilds Pathfinding Prototype

This is an isolated proof-of-concept for grid-based NPC route planning. It does not change player controls, the current creature ecology AI, the forest's obstacle steering, or any saved progression.

## Current implementation

- Dependency-free, bounded breadth-first route search over integer X/Z cells.
- Caller-provided bounds and obstacle predicate, so terrain and collision policy remain owned by BURN City.
- Returns a route, visited-node count, and whether the destination was reached.
- Reports unreachable destinations rather than silently returning a straight-line route.
- Uses four-direction movement, avoiding diagonal corner-cutting in this first spike.
- Has a configurable visited-node cap to limit worst-case work.

## Why this is a spike rather than production NPC navigation

The existing forest uses continuous world coordinates and bespoke colliders. This prototype uses discrete grid cells; a future adapter must define cell size, world/grid conversion, terrain passability, and how moving NPCs follow waypoints. Large open grids also need a priority queue/A* or navmesh implementation before production use.

## Validation checklist

1. Run `node test/wilds-pathfinding-sim.js` once the smoke-test file is added.
2. Validate direct routes, obstacle detours, blocked destinations, out-of-bounds targets, and node caps.
3. Benchmark several grid sizes on mobile-class hardware.
4. Compare the route against current obstacle steering in a non-production debug scene.
5. Only integrate after a separate PR demonstrates no regression in current Wilds tests and player controls.

## Next step

Build a debug-only visualization in the forest test mode that draws grid cells and waypoint paths. Keep it disabled in normal gameplay and do not alter the current movement system until the prototype is measured.
