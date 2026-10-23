# Homefront CC0 assets

These binary GLB files are bundled locally for BURN City Homefront. They are not loaded from a remote CDN.

- `zombie.glb`: Quaternius, Zombie Apocalypse Kit, CC0 1.0. Upstream file: https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/zombie.glb
- `survivor.glb`: Quaternius, Zombie Apocalypse Kit, CC0 1.0. Upstream file: https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/survivor.glb
- `fence.glb`: Kenney, Nature Kit, CC0 1.0. Upstream file: https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/fence.glb
- `fence-gate.glb`: Kenney, Nature Kit, CC0 1.0. Upstream file: https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/fence-gate.glb
- `campfire-stones.glb`: Kenney, Nature Kit, CC0 1.0. Upstream file: https://github.com/mars-tw/storm-apocalypse/blob/main/public/models/campfire-stones.glb

The upstream [credits manifest](https://github.com/mars-tw/storm-apocalypse/blob/main/CREDITS.md) identifies these asset packs and licenses separately from the repository's MIT-licensed code. CC0 1.0 permits reuse, modification, and redistribution. Source URLs are retained for provenance. The GLBs are copied unchanged; BURN City code controls placement and presentation.

## Kenney Survival Kit 2.0 (added Oct 23, 2026, `kenney-survival/`)
CC0 1.0 (see `kenney-survival/License.txt`, copied from the pack). Downloaded from the official pack page https://kenney.nl/assets/survival-kit (`kenney_survival-kit.zip`, SHA-256 `c3586341b5932c87eb43d75d915434f47daed168b17ed36a03e8ca9977c7443e`). Files copied unchanged from `Models/GLB format/`:
- `fence-fortified.glb` → refuge wall; `fence-doorway.glb` → gate / entrance / exit; `workbench.glb` → workshop; `box-large.glb` → storage; `tent-canvas.glb` → infirmary.
- `Textures/colormap.png` is the shared palette texture those GLBs reference by relative URI.
Turrets, sandbags, barbed wire, trenches and farm plots stay procedural (not in the pack). If a model fails to load, `drawStructure` falls back to the procedural shape.

## Survivor presentation and animation

Homefront currently bundles the Quaternius Zombie Apocalypse Kit survivor rig and its embedded animation clips under CC0 1.0. The refuge now layers lightweight role equipment onto cloned rigs (guard helmet, farmer hat, mechanic hardhat, medic marking, and field packs) and adds deterministic small gear variations. These are presentation-only attachments: they do not alter server-owned role, task, inventory, combat, or save state.

Animation selection is clip-name tolerant. Homefront searches the bundled rig's actual clips for locomotion, role work, defensive/aiming, and idle patterns, then falls back safely when a particular animation is absent. This lets a future additional CC0 survivor rig or animation pack be added through the existing GLTFLoader path without requiring every model to contain an identical clip set.

Potential next asset expansion: add a small, locally bundled set of visibly different CC0 human rigs and compatible animation clips after validating their skeletons, licenses, scale, forward axis, and mobile draw cost. Do not hotlink runtime character assets from a third-party CDN; keep the selected files and their source/license notes in this directory.
