# CinderWilds pathfinding spike

This prototype is intentionally isolated. It does not replace existing creature steering or change player movement, local saves, or the live server.

- Core: `client/js/wilds-pathfinding-core.mjs`
- World adapter: `client/js/wilds-pathfinding-world.mjs`
- Node tests: `client/js/wilds-pathfinding-core.test.mjs`
- Manual visualization: `client/wilds-pathfinding-lab.html` (served as `/wilds-pathfinding-lab.html`)
- Algorithm: bounded breadth-first search on integer X/Z grid cells, with four-way movement
- World conversion: configurable origin and cell size map world metres to grid cells and map waypoints back to world metres
- Obstacle callback: the adapter supplies each candidate cell's world-space center and integer cell coordinates
- Safety cap: `maxVisited` bounds work per search; unreachable and malformed cases are explicit

Run the browser-independent test under Node 22:

```sh
node client/js/wilds-pathfinding-core.test.mjs
```

The lab is a **synthetic grid** for manually testing routes and obstacles on desktop or mobile. It does not read the real forest terrain, Three.js colliders, or NPCs. The next validation stage is a test-only overlay against the actual forest's world coordinates, then a measured comparison of cell sizes on mobile hardware. Do not enable pathfinding for live NPCs until that terrain/collider mapping and waypoint following are validated.

## Real-terrain debug preview (test mode only)

With the forest loaded in a development visit using `?wildstest` or `?debug=1`, the existing `window.__wilds.test` hook exposes:

```js
window.__wilds.test.previewPath(targetX, targetZ)
window.__wilds.test.clearPathPreview()
```

The preview chooses the nearest currently spawned creature (or the player if no creature is available), searches the forest's bounded X/Z region, treats the forest ellipse edge and the existing obstacle spatial grid (trees, rocks, logs, and registered colliders) as blocked, then draws a temporary gold line in the loaded forest. It is an on-demand developer diagnostic, not autonomous NPC movement.

Important limitations: this is a coarse 2.5 m grid, the forest boundary is approximated by the existing ellipse, and it does not yet model water depth, slopes, narrow clearances, vertical surfaces, or the separate deep-area geometry perfectly. A successful route proves only that the sampled cells are open according to the current obstacle data. Verify it visually in the actual scene before considering any movement integration. The path preview is only exposed in test mode.
