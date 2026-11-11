# Zombie model variants

These three animated GLB files are from the original character assets in [Storm Apocalypse](https://github.com/mars-tw/storm-apocalypse/tree/main/public/models/custom/zombies).

- [`zombie-ash.glb`](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/custom/zombies/zombie-ash.glb) — Ash variant
- [`zombie-frost.glb`](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/custom/zombies/zombie-frost.glb) — Frost variant
- [`zombie-rust.glb`](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/custom/zombies/zombie-rust.glb) — Rust variant
- Ash, Frost, and Rust are from the MIT-licensed upstream project; the full MIT license text is copied into this directory.
- `quaternius-zombie.glb` is from Quaternius' Zombie Apocalypse Kit, released under CC0 1.0. The retained upstream copy is [here](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/zombie.glb), and its [credits](https://github.com/mars-tw/storm-apocalypse/blob/main/CREDITS.md) attribute the asset to Quaternius. CC0 license: https://creativecommons.org/publicdomain/zero/1.0/.
- All four models are binary glTF 2.0 with skinned rigs and shared core clips (`Idle`, `Walk`, `Idle_Attack`, `HitReact`, and `Death`); the Quaternius model also includes `Crawl`, `Run`, and additional animations.
- The original files above are **retained only**, not used as the default first-person Zombies enemy visuals.

## Current default Arena Zombies casting

The **realistic**, skinned and animated infected are now the default close-range replacements:

- **Aiden Studios Zombie**: `zombie-aiden.glb` (CC BY 4.0), for ordinary shamblers and other standard humans.
- **LxNazarov Hazmat Zombie**: `zombie-hazmat.glb` (CC BY 4.0), for contaminated / armored specials.
- **Rosswet Mobile Thin Zombie**: `zombie-thin.glb` (CC BY 3.0), for fast, emaciated infected.

These are actual textured, rigged GLBs, validated by the per-file SHA-256 and animation audit in `sketchfab-verified-asset-manifest.json`. Full creator credits, source URLs and modifications are in [ATTRIBUTION-SKETCHFAB.md](ATTRIBUTION-SKETCHFAB.md), linked from the Arena menu.

The earlier Ash/Frost/Rust and Quaternius models remain retained for historical use, licensing preservation and future isolated art review, **but are not auto-spawned in the original Zombies game**. The low-cost procedural horde remains a device-aware distant fallback until a high-fidelity impostor/LOD pass can replace it. Homefront content is not imported.
