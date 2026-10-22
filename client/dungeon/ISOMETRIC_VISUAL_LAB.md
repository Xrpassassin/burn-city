# Eternal Grind — Isometric Visual Lab

## Purpose
A standalone, non-production Three.js prototype for evaluating the selected direction: dark-fantasy realism, an angled/isometric camera, whole-character skin presets, and modular equipment options.

## Open
From a running local BURN City server, visit `/dungeon/visual-lab.html`. The page imports the repository's existing vendored Three.js build via the relative import map. It does not add dependencies.

## What it tests
- Fixed angled/orthographic camera with pointer-drag orbit and wheel zoom.
- Dark environment, fog, stone ruins, warm key light and cool rim light.
- Procedural placeholder character with selectable whole-character palettes.
- Independently selectable armor and weapon prototypes.
- Toggleable helmet, cloak and shield for equipment visibility checks.
- Responsive panel sizing for narrow/mobile screens.

## Deliberate limits
- Does not modify `client/dungeon/index.html`, `sys.js`, saves, inventory, combat, hitboxes, NPCs, or server protocols.
- Uses primitive placeholder geometry, not production character assets.
- No live game state, asset downloads, multiplayer replication, or persistent settings.
- It is a visual/interaction spike, not a claim that an isometric camera can be dropped into the current first-person controller without gameplay changes.

## Next step after review
Ask Hark to open the lab on desktop and mobile, check console/network errors, and report whether the camera, silhouettes, armor readability, and controls feel right. Only then choose one licensed character asset and test it in an isolated GLTF preview. Production integration should be a separate PR after a compatibility audit of movement, aiming, collisions, animations, and mobile input.
