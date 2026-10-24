# Estates Island scene foundation

This scene manifest is renderer-agnostic: it defines stable world-space objects for a Three.js or other renderer adapter to instantiate. It does not claim to be a rendered, networked, or deployed scene.

## World layout
- Y-up metre coordinates, one rounded buildable island surrounded by a continuous lake.
- Collision-enabled lake surface and shoreline; swimming and boats disabled in the first pass.
- Primary bridge from the city-side entrance, secondary service bridge, and public dock.
- Six named districts, road/path network, 21 lot anchors, and seeded woodland-edge vegetation.
- Nine property catalog records are assigned in catalog order; remaining anchors stay unassigned rather than fabricating property ownership.
- Entrance proximity only presents a prompt. Explicit confirmation still flows through the entry adapter and server-backed authorization.

## Renderer contract
Map each descriptor's kind, position, dimensions, material, and collision/navigation metadata to engine meshes and colliders. Implement terrain before roads, access, lots, and vegetation; use stable IDs for streaming and interaction lookup. Use lot buildingFootprint as a blockout only; saved owner building layouts must override the default and live in persistent storage outside this transient scene.

## Test
Run npm run test:estates-island-scene. It validates deterministic scene metadata, object IDs, lot bounds, lake/access constraints, and proximity prompt transitions. It is not a renderer screenshot or multiplayer integration test.
