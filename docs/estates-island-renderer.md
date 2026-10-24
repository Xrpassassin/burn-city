# Estates Island Three.js renderer adapter

The adapter turns the scene manifest into a Three.js group using the host's existing THREE namespace. It does not load a second copy of Three.js or add a CDN dependency.

## Runtime wiring
1. Load the catalog JSON and call buildEstatesIslandScene({catalog}).
2. Call createEstatesIslandRenderer({THREE, scene, manifest, onInteract}) when the shared instance becomes active.
3. Connect the entrance trigger's interaction callback to the entry adapter's prompt flow. Do not teleport from collision/proximity alone.
4. Dispose the returned renderer handle when the shared instance is unloaded; property ownership and saved builds remain in persistent storage.

The first-pass renderer uses geometric blockouts and simple materials for terrain, lake, shoreline, roads, bridges, dock, lots, buildings, and trees. It is a playable-scene integration seam, not final art, optimized water simulation, or server-authoritative collision/navigation.

Run npm run test:estates-island-renderer for the mocked Three.js lifecycle test.
