# Eternal Grind — Forest Encounter Lab

## Purpose
A standalone, disposable visual prototype for tuning the *feel* of the forest encounter space before any production systems are changed.

## Open
Serve the repository through its normal development server, then open `/client/dungeon/forest-encounter-lab.html`. The page imports the repository's vendored Three.js module from `client/vendor/three/build/three.module.min.js`; it is not intended to be opened directly as a `file://` URL.

## Included
- Procedurally placed forest canopy, ground, rocks, mushrooms, and simple enemy stand-ins.
- Four role colors: Cryptbound melee, Ashen Brute heavy, Plague Ghoul skirmisher, Gravecaller ranged.
- Visual tuning for encounter density, regional threat, mist, time of day, and canopy wind.
- Drag-to-orbit, wheel-to-zoom, reset view, regenerate layout, and pause/resume wind.
- Responsive controls and capped renderer pixel ratio for a more mobile-friendly baseline.

## Explicit limits
This is **not** a production zone, spawn director, combat implementation, multiplayer feature, or persistence change. Enemy meshes are procedural placeholders, and the threat slider currently changes the illustrative roster mix only during regeneration; it does not set real enemy levels or stats. No server protocol, player progression, saves, inventory, or live gameplay code is modified.

## Suggested Hark review checklist
1. Open the lab from the actual served app and check the relative Three.js import.
2. Test iPhone/Android touch orbit, zoom, sliders, and panel scrolling.
3. Check GPU load, draw-call count, and frame pacing on a low-end device.
4. Verify the scene remains legible at night, dusk, and bright-day settings.
5. Decide whether the encounter density / threat controls should become a design reference for the real forest zone.
6. Only after approval, plan production integration as a separate change using the existing zone, enemy, and server-authoritative combat systems.

## Acceptance criteria
- Loads without console errors through the normal app server.
- Controls work with mouse and touch.
- Regeneration remains deterministic enough to compare layouts (seed advances by a fixed increment).
- No imports, routes, or runtime hooks are added to the live dungeon entry point.
