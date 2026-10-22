# CinderWilds pathfinding spike

This prototype is intentionally isolated. It does not replace existing creature steering or change player movement, local saves, or the live server.

- Core: `client/js/wilds-pathfinding-core.mjs`
- World adapter: `client/js/wilds-pathfinding-world.mjs`
- Test: `client/js/wilds-pathfinding-core.test.mjs`
- Algorithm: bounded breadth-first search on integer X/Z grid cells, with four-way movement
- World conversion: a configurable origin and cell size map world metres to grid cells and map waypoints back to world metres
- Obstacle callback: the world adapter supplies each candidate cell's world-space center and integer cell coordinates
- Safety cap: `maxVisited` bounds work per search; unreachable and malformed cases are explicit

Run the browser-independent test under Node 22:

```sh
node client/js/wilds-pathfinding-core.test.mjs
```

This is still a navigation experiment, not a full open-world navmesh. The adapter does not automatically know the forest terrain or Three.js colliders; that mapping must be supplied and tested separately. Before gameplay integration, add a debug-only path visualization, map terrain/colliders to walkable cells, and benchmark multiple cell sizes on mobile hardware. Do not enable it for live NPCs until tests and debug visualization demonstrate safe waypoint following.
