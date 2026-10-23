# BURN City Zombies — open graphics sources and integration notes

## Current visual approach

The live Arena Zombies renderer in `client/arena/fx.js` builds its horde procedurally with Three.js geometry, canvas textures, and instanced meshes. This detail pass adds cosmetic chest plating, irregular wounds, and dorsal mutations to selected existing enemy types. It deliberately does not change server enemy IDs, hitboxes, health, damage, pathfinding, or network state. It adds no runtime dependency and keeps the horde instanced to bound draw calls.

## Open-license assets worth expanding with

- **Quaternius — Zombie Apocalypse Kit (CC0 1.0):** 60 assets; animated characters/enemies plus environment and vehicle models. Formats include glTF. Best first candidate for an opt-in animated zombie model pilot: https://quaternius.com/packs/zombieapocalypsekit.html
- **Quaternius — Ultimate Monsters (CC0 1.0):** animated monster roster with attack/death/walk/run clips; potential source for original mutated special-infected silhouettes, after checking the exact pack archive and clips: https://quaternius.com/packs/ultimatemonsters.html
- **Poly Haven (CC0):** realistic environment props, PBR materials, and HDRIs; useful for the Refinery and Cosmodrome, not a zombie-character source: https://polyhaven.com/
- **ambientCG (CC0):** PBR surface materials for grime, concrete, rust, and metal: https://ambientcg.com/

## Intake rules

1. Download only selected assets, not an entire pack into the live client.
2. Retain the exact archive's license/readme and record creator, source URL, license, conversion steps, and modifications.
3. Prefer GLB/glTF and the already-vendored Three.js `GLTFLoader`; don't add a new engine or runtime CDN.
4. Keep the existing procedural horde as a fallback and preserve the current server-owned combat and hit volumes.
5. Gate animated-model experiments behind a query flag until spawn/despawn, animation, memory disposal, and mobile frame time have been reviewed.
6. Do not import ripped commercial-game models or assume a download is reusable just because it is free.

**Scope note:** this PR adds original procedural visual detail. It documents open-license 3D packs for a subsequent binary-asset intake; it does not claim those external zombie models have been imported yet.
