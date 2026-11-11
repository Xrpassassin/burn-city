# Zombie model variants

These three animated GLB files are from the original character assets in [Storm Apocalypse](https://github.com/mars-tw/storm-apocalypse/tree/main/public/models/custom/zombies).

- [`zombie-ash.glb`](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/custom/zombies/zombie-ash.glb) — Ash variant
- [`zombie-frost.glb`](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/custom/zombies/zombie-frost.glb) — Frost variant
- [`zombie-rust.glb`](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/custom/zombies/zombie-rust.glb) — Rust variant
- Ash, Frost, and Rust are from the MIT-licensed upstream project; the full MIT license text is copied into this directory.
- `quaternius-zombie.glb` is from Quaternius' Zombie Apocalypse Kit, released under CC0 1.0. The retained upstream copy is [here](https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/zombie.glb), and its [credits](https://github.com/mars-tw/storm-apocalypse/blob/main/CREDITS.md) attribute the asset to Quaternius. CC0 license: https://creativecommons.org/publicdomain/zero/1.0/.
- All four models are binary glTF 2.0 with skinned rigs and shared core clips (`Idle`, `Walk`, `Idle_Attack`, `HitReact`, and `Death`); the Quaternius model also includes `Crawl`, `Run`, and additional animations.
- Use in BURN City is an opt-in visual experiment only. The procedural zombie renderer remains the default/fallback.
\n## Current default model casting\n\nThe three bundled human-infected `zombie-ash.glb`, `zombie-frost.glb`, and `zombie-rust.glb` are the only models in the main Zombies mode's close-range animated rotation. `quaternius-zombie.glb` remains a retained CC0 reference/test asset and is **not** automatically spawned. The existing procedural horde renderer is used only for farther enemies and on constrained devices, with naturalized undead styling; Homefront renderers are not imported.\n