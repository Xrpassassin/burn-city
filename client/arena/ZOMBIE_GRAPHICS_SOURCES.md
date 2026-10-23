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

## Implemented opt-in animated model pilot

- Bundled three animated zombie variants—Ash, Frost, and Rust—from the MIT-licensed [Storm Apocalypse source repository](https://github.com/mars-tw/storm-apocalypse/tree/main/public/models/custom/zombies). Its upstream `CREDITS.md` lists these original R8 zombie models separately from third-party Quaternius models.
- `?zombieModels=1` opts into a small animated-model pilot: up to eight zombies within 28 world units use the already-vendored Three.js GLTFLoader and SkeletonUtils. A deterministic selector chooses nearby models, mixes three distinct variants and per-clone grime/skin tints without shared-material color bleed. Distant zombies remain on the existing instanced renderer, limiting model cost on mobile. The standard renderer remains the default and is used as a fallback if loading fails. When a model leaves the near-player set, its animation mixer and per-instance cloned materials are cleaned up while shared geometry/textures remain cached.
- The model experiment does not alter server-side combat, collision, enemy identity, or gameplay state. Validate orientation, animation timing, and mobile frame time before considering the flag for general play.
- Model attribution and the upstream MIT license are recorded beside the asset in `assets/zombies/README.md`.
