# Zombies: animated infected by default on capable devices

## Change
Until now, the four bundled animated GLBs (three human-infected R8 variants and one cartoony Quaternius test asset) appeared only under `?zombieModels=1`. The primary free-play Zombies renderer otherwise used procedural instanced zombie geometry. This first-pass polish enables **close-range animated GLBs automatically** on suitable desktop systems, optionally on high-end mobile, while preserving the inexpensive instanced horde everywhere else. No gameplay state, enemy counts, damage, net snapshots, ranked score, economy or map logic is changed.

`zombieModelPolicy()` is a pure, unit-tested device/accessibility selection function. It chooses a visible cap of eight detailed close-up models within 28 m for capable desktop devices, three within 20 m for known capable mobile, and otherwise the original procedural renderer. If a device reports no mobile memory/hardware information, mobile defaults to the inexpensive mode. Low graphics, reduced-motion preference and data saver disable automatic detailed models.

The two explicit user controls remain:

- `?zombieModels=0`: force procedural-only models.
- `?zombieModels=1`: request the animated pilot even on a lower-end device, with a smaller model cap if low graphics is enabled. This is an opt-in exception to the automatic performance policy.

Failed imports or invalid GLBs still fall back to existing procedural zombies without changing server mechanics. Models are loaded only for close-up enemies; distant horde members remain instanced.

## Combat feedback
The already server-authoritative `zdie` event now uses the bundled GLB's actual `Death` clip for currently modeled zombies and skips the simultaneous duplicate procedural corpse. Enemies not represented by a GLB continue using the existing procedural death fall/fade. The authoritative `zarmor` event requests `HitReact` while preserving the usual armor-break flash. Ordinary damage hitmarkers are unchanged; hit signals do not become client-authoritative damage events.

## Testing and limitations

- `node client/arena/zombie-model-policy.test.mjs`
- `node client/arena/zombie-model-pilot-integration.test.mjs`
- `npm run -s test:graphics-labs`
- `node --input-type=module --check < client/arena/fx.js`

There is no new external asset download or game monetization. The model assets and licenses are described in `client/arena/assets/zombies/README.md` and `client/arena/ZOMBIE_GRAPHICS_SOURCES.md`.

This is a **visibility/performance-first step**, not a complete gameplay overhaul. Still needed: browser-level visual smoke tests on desktop and iOS/Android, measured mobile frame times, AI wave variety, encounter telegraphs, cover/pathfinding and weapon feedback. Do not claim those are finished through this change.
\n## Original Zombies visual correction (2026-11-11)\n\nThe original Arena Zombies gameplay, maps and movement were never meant to inherit Homefront's presentation. The three existing human-infected Ash/Frost/Rust GLBs are now the default close-range animated roster; the Quaternius CC0 model remains retained only for a possible separate art review, not default spawned Zombies. Remaining procedural mobs have softened anatomical silhouettes, natural decayed color palettes, correctly positioned small eyes and no cartoonish generic spikes. The original InstancedMesh batching, server enemy identity, death clips, stagger/hit reactions, map advancement, weapons, and physics stay untouched.\n\nOn modern iOS Safari with six or more reported cores but no deviceMemory API, at most **two** animated human zombies appear within 16 metres rather than forcing all models to low-poly. Four-core/older mobiles, reduced-motion and data saver retain inexpensive fallback.\n\nDedicated Chromium/WebKit browser screenshots and budget checks are required before public merge; this is a fidelity correction, not a photorealistic asset replacement.\n