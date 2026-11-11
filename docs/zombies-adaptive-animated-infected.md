# Zombies: realistic infected replacement — preserve original Arena gameplay

## What changes

The original Zombies game is still BURN City's pre-existing **Arena** mode, with its existing third-person movement, real-time attacks, weapons, wave director, perks, boss mechanics, Ashen Cosmodrome helicopter transition and multiplayer controls. **Homefront is separate.** This implementation changes *only* the Arena enemy visual presentation and its asset dependencies.

The default near-player animated character roster now uses the verified creator-credited CC BY versions of the following **human-infected** assets, not the previous cartoon robot/skeleton assets:

- [Zombie (Rigged & Animated)](https://sketchfab.com/3d-models/zombie-rigged-animated-131688807ad444609ed9b2ed572dc4aa) by Aiden Studios — Aiden standard infected, original Idle/Walk1/Attack1.001.
- [Zombie Hazmat](https://sketchfab.com/3d-models/zombie-hazmat-49b3b4307f6a4d2386fdb02354158d04) by LxNazarov — contamination/armored specials, original Zombie_Idle/Zombie_Walk_Root/Zombie_Skill.
- [Thin Zombie (Awake Zombie)](https://opengameart.org/content/thin-zombie-awake-zombie-asset) by Rosswet Mobile — frantic/thin infected, original idle/walk/run/attack1_r/hurt/dead1 and related animations.

These GLBs are bundled with the client after a **SHA-256, embedded creator/source/license (where present), skinned mesh and named clip verification**. Their materials and textures are retained with only minor grading, rather than the old bright green/purple goblin-like colors. The prior Ash/Frost/Rust and Quaternius GLBs are preserved in the repository for provenance, but are not chosen by the original Zombies model pilot.

### Animation compatibility and gameplay boundaries

The existing client model pilot remaps each asset's real clip names to the Arena Idle / Walk / Run / Attack roles. Hazmat's baked hip X/Z walk displacement is held steady because original Zombies gameplay already moves enemies authoritatively; otherwise bodies would visibly glide. The Aiden and Hazmat files don't contain named hit/death clips; the pilot uses local procedural visual flinches and corpse toppling instead of silently dropping reactions. The thin infected has usable damage/death clips. These are **cosmetic only**. No damage, hitbox, enemy speed, wave spawn, score, or XRP accounting change is authorized by this work.

On capable desktop devices the near-player pilot currently renders up to **8 skinned animated infected within 28m**. Known capable mobiles use up to **3 within 20m**; modern 6-core Safari mobiles with private device-memory information use up to **2 within 16m**. Data saver, reduced motion, low graphics and less powerful mobiles continue using the lower-cost instanced horde fallback. Additional realistic distant impostors and more original multi-limbed boss modeling are separate art improvements, not already implemented by this change.

A user can inspect alternate behavior via `?zombieModels=1` (request detailed animated models) or `?zombieModels=0` (force procedural mode).

## Provenance and licensing

The exact CC BY files are made available by an independently attributed reference game, [Dernière Nuit à Perpignan](https://walking.morgannriu.fr/), with [detailed 3D author and adaptation credits](https://walking.morgannriu.fr/assets/models/CREDITS.md). They were downloaded from the creator's Sketchfab pages using the source project's authenticated Sketchfab workflow, then WebP-optimized before redistribution. The reproducible vendoring script validates them, pins hashes in `sketchfab-verified-asset-manifest.json`, and records their provenance. Full [BURN City model attribution](../client/arena/assets/zombies/ATTRIBUTION-SKETCHFAB.md) and a direct accessible credit link appear in the Arena menu.

Creative Commons Attribution reuse requires creator credit, original work link, license link and a clear indication of modifications. These characters remain third-party works.

## QA required for merge

- `node client/arena/zombie-sketchfab-cast.test.mjs` — asset SHA-256, author, clips, textures, skin and no rejected robot cast.
- `node client/arena/zombie-arena-appearance.test.mjs` — nine preserved enemy types, visual-only separation from Homefront.
- `node client/arena/zombie-model-policy.test.mjs` — low graphics, mobile, data saver and reduced motion.
- `node client/arena/zombie-model-pilot-integration.test.mjs` — source Arena reactions and fallback.
- Chromium and WebKit in real desktop/mobile WebGL scenes for the original procedural fallback, actual textured Aiden/hazmat/thin skinned meshes, and a hazmat close-up. Capture screenshots and inspect actual appearance; passing tests is insufficient if they still look cartoonish.
- Original combat and wave/cosmodrome/map regression suites.

No new financial, Homefront, weapon, enemy-AI or monetization changes. The final visual judgement is a separate merge gate.
