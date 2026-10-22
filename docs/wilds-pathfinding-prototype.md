# CinderWilds pathfinding spike

This prototype is intentionally isolated. It does not replace existing creature steering or change player movement and local saves.

- Module: `client/js/wilds-pathfinding-core.mjs`
- Test: `client/js/wilds-pathfinding-core.test.mjs`
- Algorithm: bounded breadth-first search on integer X/Z grid cells
- Inputs: start cell, goal cell, bounds, optional blocked-cell callback, visit cap
- Output: waypoint path, visited count, and explicit reached/unreachable state

Before gameplay integration, add world-to-grid conversion, map the forest's terrain and colliders to walkable cells, and benchmark several grid sizes on mobile hardware. This first version uses four-way movement and is intended for compact local navigation experiments, not a full open-world navmesh. Do not enable it for live NPCs until tests and a debug visualization demonstrate safe waypoint following.
