# Eternal Grind — 3D Dungeon Layout Lab

Open `/client/dungeon/dungeon-layout-lab.html` while serving the repository with the normal development server.

- Enter a seed and select **Generate** to reproduce a deterministic graph.
- Drag to orbit and scroll/pinch-style touch zoom is supported via wheel on desktop; pointer dragging supports touch orbit.
- The preview uses the existing locally vendored Three.js module and the isolated `dungeon-layout-core.mjs`.
- The geometry is deliberately blockout quality. Corridors are abstracted from the graph; room doors, navigation meshes, enemy/loot placements, and floor progression are not implemented.
- This is not imported into the live Eternal Grind entry point and does not touch character saves or combat.
- No new third-party dependency is introduced.

Validation: run `node client/dungeon/dungeon-layout-core.test.mjs`. The preview still needs manual browser/device inspection before any production integration.
