# Enemy model workshop

Open `/client/dungeon/enemy-model-workshop.html` on a running BURN City instance to use the isolated workshop.

## Current prototype set

The workshop creates four original, lightweight Three.js mesh archetypes from built-in geometry:

- **Cryptbound** — plated undead melee silhouette and rusted sword
- **Ashen Brute** — broad torso, oversized arms and heavy cleaver
- **Plague Ghoul** — hunched, lean frame, long limbs and sickly eye glow
- **Gravecaller** — robe/hood silhouette, staff and arcane focus

The first four are in-repository procedural prototypes. The workshop also bundles three imported, animated Quaternius CC0 models: Slime, Bat, and Dragon. Their binary GLB files live under `a/models/`, are fetched on demand, and parsed with the vendored Three.js r160 GLTFLoader. The GLB conversion source records that the original Quaternius geometry was not modified and animation names were normalized.

## Visual controls

- Archetype selector: four procedural silhouettes plus Slime, Bat, and Dragon imported animated models
- Overall scale, body mass, head size and weapon size
- Skin/base, armor, accent/emissive and metal/bone colors
- Emissive intensity, wireframe inspection, auto-rotation, ground/plinth toggle
- Idle and attack poses
- Export a JSON look preset for review and later translation into model/material settings

The export does not change live game assets. The workshop is isolated from combat, saves, progression, enemy AI, and server protocol.

## Production asset plan

The workshop now vendors the matching Three.js r160 `GLTFLoader`, its `BufferGeometryUtils` dependency, and `SkeletonUtils` for skinned model cloning. It bundles three animated Quaternius models (Slime, Bat, Dragon) from the public Cairnfall asset repository as binary GLB files under `a/models/` (converted from the original base64 payloads); they are fetched and parsed only when selected. They are not yet optimized (no Draco/meshopt).

Asset record:
- **Slime, Bat, Dragon:** Quaternius LowPoly Animated Monsters, CC0 1.0.
- Source/license: https://quaternius.itch.io/lowpoly-animated-monsters
- Provenance: `a/models/PROVENANCE.txt`; it notes that the public source repository converted the pack's models from FBX to GLB and normalized animation names.

Before any of these models enter live combat:
1. Review the imported silhouettes and available animation clips in the workshop.
2. Convert the base64 payloads to true binary GLB files to avoid text-encoding overhead.
3. Test model orientation, scale, material tinting, animation playback, load failures and mobile frame rate.
4. Optimize geometry and textures, lazy-load by zone, and retain sprite fallback for low-end/mobile.
5. Integrate models into the existing enemy visual path only after review; do not introduce a second combat system.

## Verification status

No browser/device runtime test or automated repository test suite has been run for this prototype. Test on desktop and mobile before merging.


## Opt-in live visual pilot

The live dungeon now has a narrowly scoped, opt-in Bat model pilot for existing Harpy enemies. Open Eternal Grind with `?enemyModels=1` to enable it. Normal play remains sprite-based; the sprite is hidden only after the model loads successfully and stays available as the failure fallback. The pilot does not change enemy combat or progression. It has not yet passed browser/mobile runtime testing and must remain opt-in until validated.
