# Enemy model workshop

Open `/client/dungeon/enemy-model-workshop.html` on a running BURN City instance to use the isolated workshop.

## Current prototype set

The workshop creates four original, lightweight Three.js mesh archetypes from built-in geometry:

- **Cryptbound** — plated undead melee silhouette and rusted sword
- **Ashen Brute** — broad torso, oversized arms and heavy cleaver
- **Plague Ghoul** — hunched, lean frame, long limbs and sickly eye glow
- **Gravecaller** — robe/hood silhouette, staff and arcane focus

These are in-repository procedural prototypes, not downloaded or rigged third-party models. They exist to establish readable silhouettes, relative proportions and material palettes before we select and integrate production assets.

## Visual controls

- Archetype selector
- Overall scale, body mass, head size and weapon size
- Skin/base, armor, accent/emissive and metal/bone colors
- Emissive intensity, wireframe inspection, auto-rotation, ground/plinth toggle
- Idle and attack poses
- Export a JSON look preset for review and later translation into model/material settings

The export does not change live game assets. The workshop is isolated from combat, saves, progression, enemy AI, and server protocol.

## Production asset plan

The vendored Three.js copy currently exposes the core build and selected example modules; a GLTFLoader was not confirmed in the inspected loader path. Before importing external glTF/GLB assets, confirm the exact Three.js version and add a matching loader if needed.

A strong candidate is Quaternius **Ultimate Monsters** (50 animated monsters, glTF among the listed formats, CC0 on the official pack page): https://quaternius.com/packs/ultimatemonsters.html

The official pack page is evidence for the pack-level license, not proof that any archive has already been downloaded. Before committing any production model:
1. Download and inspect the actual archive.
2. Keep the included license/readme alongside the selected assets.
3. Choose 2–3 models by silhouette and animation clips; do not import the entire pack by default.
4. Optimize geometry and textures, lazy-load by zone, and retain sprite fallback for low-end/mobile.
5. Test scale/orientation, materials, animation playback, load failures and mobile frame rate.
6. Integrate models into the existing enemy visual path only after review; do not introduce a second combat system.

## Verification status

No browser/device runtime test or automated repository test suite has been run for this prototype. Test on desktop and mobile before merging.
