# CinderWilds world-path smoothing prototype

This is an isolated post-processing helper for the existing grid pathfinder output. It removes redundant waypoints when a straight line between two route points appears clear according to a caller-provided X/Z obstacle predicate.

- Module: `client/js/wilds-path-smoothing.mjs`
- Test: `client/js/wilds-path-smoothing.test.mjs`
- Run: `node client/js/wilds-path-smoothing.test.mjs`
- No dependencies; compatible with the project's Node 22 baseline.
- No live gameplay or scene imports.

## Safety and limitations

The caller provides `isBlocked(worldX, worldZ)`. The helper samples straight segments at a configurable spacing (default 0.5 world units), keeps original waypoints when a shortcut is blocked, and caps sample work per candidate segment. It validates inputs and preserves the first and last points.

This is a geometric approximation, not a collision guarantee. It does not account for agent radius, vertical terrain, slope, water, moving obstacles, or Three.js collision volumes unless the caller explicitly models them in `isBlocked`. The helper is not yet integrated with the terrain preview or NPC movement. Keep it test-only until Hark verifies sample spacing against the real forest obstacle map and confirms the route remains clear in the scene.
