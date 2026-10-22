# Eternal Grind: Open Asset and Enemy Roster Plan

## Goals
Improve combat readability and atmosphere while preserving the current dungeon loop, Three.js version, enemy data shape, save format, mobile controls, and performance budget. This is an implementation plan, not a claim that third-party assets have already been downloaded or integrated.

## License-safe first choices

Check the individual download's included license/readme and retain it with the asset before shipping. The source pages below currently identify the packs as CC0 or public-domain-style CC0; re-check the exact pack version on import.

### 3D enemies and animation
1. **Quaternius — Ultimate Monsters**: 50 animated monsters, FBX/OBJ/Blend and glTF formats; pack page lists CC0 and commercial use. Good first source for enemy silhouettes and animation candidates.
   - https://quaternius.com/packs/ultimatemonsters.html
2. **Quaternius — Zombie Apocalypse Kit**: includes four enemy types plus animated characters and dogs; FBX/OBJ/Blend/glTF; pack page lists CC0.
   - https://quaternius.com/packs/zombieapocalypsekit.html
3. **Quaternius — RPG Character Pack**: rigged, textured fantasy characters with included animation; useful as a humanoid rig/retarget reference, not a ready-made undead roster.
   - https://quaternius.com/packs/rpgcharacters.html

### Sound effects and ambience
1. **Kenney — RPG Audio**: footstep, weapon, and foley clips; CC0 pack listing.
   - https://kenney.nl/assets/rpg-audio
2. **Kenney — Impact Sounds**: broad impact/foley collection; CC0.
   - https://kenney.nl/assets/impact-sounds
3. **OpenGameArt — Loopable Dungeon Ambience**: cave/dungeon wind and water ambience; marked CC0 on the asset page.
   - https://opengameart.org/content/loopable-dungeon-ambience
4. **OpenGameArt — Magic Spell SFX**: spell-casting sound effects; marked CC0.
   - https://opengameart.org/content/magic-spell-sfx

CC0 does not mean every file in a preview or bundle is automatically covered. Keep a small asset ledger with filename, creator, source URL, license evidence, import date, edits, and any attribution requested. Do not use ripped assets from commercial games.

## Enemy roster expansion

Use behavior differences before simply scaling health and damage.

| Archetype | Role | Signature behavior | Readable counterplay |
|---|---|---|---|
| Cryptbound | Baseline melee | Short windup, single strike | Step away or interrupt |
| Ashen Brute | Heavy bruiser | Long windup, cleave or slam | Leave marked range; punish recovery |
| Plague Ghoul | Skirmisher | Quick lunge, short retreat | Bait lunge, punish landing |
| Gravecaller | Ranged controller | Curse projectile or ground hazard | Break line of sight, close distance |
| Bone Archer | Ranged physical | Aimed shot with clear tell | Strafe or use cover |
| Crypt Stalker | Ambusher | Brief concealment, flank approach | Watch audio/visual cue, stay grouped |
| Grave Warden | Elite tank | Guard stance, frontal resistance | Flank or stagger |
| Guardian | Boss | Two or three distinct attack phases | Learn tells; use recovery windows |

Start with three distinct enemy models: a humanoid skeleton/warrior, a bulky monster, and a caster or ranged creature. Reuse rigs and animation clips where appropriate, but give each a unique silhouette, material treatment, and signature attack. Keep the existing combat stats and model identity separate so visual swaps do not silently alter balance.

## Integration sequence

1. Download one candidate pack and inspect the exact archive license and included formats.
2. Convert/select GLB or glTF models where possible; avoid adding a new runtime dependency if the vendored Three.js GLTFLoader can be used.
3. Build an isolated model viewer to verify scale, orientation, materials, skeleton, and available clips before the live dungeon references the model.
4. Add a small model manifest mapping existing enemy IDs to model paths, fallback sprites, scale, and animation names.
5. Load models lazily or by zone; cap active animated meshes, reuse materials, dispose replaced resources, and keep sprite fallback for unsupported devices.
6. Use existing combat state as the source of truth for animation triggers. Attack animations must not independently decide hit timing, damage, drops, or server outcomes.
7. Integrate one archetype at a time, then test desktop, mobile, loading failures, memory use, and frame rate.

## Audio integration sequence

1. Use `audio-lab.html` to choose timing and tone; its synthesized sounds are placeholders, not final assets.
2. Add selected CC0 audio to a dedicated asset folder with an asset ledger and license/readme.
3. Create a small audio helper with lazy initialization (browser autoplay restrictions), master/SFX/ambience buses, per-sound cooldowns, and mobile-safe volume defaults.
4. Trigger sounds from existing gameplay events: swing start, confirmed hit, enemy windup, projectile launch, damage, death, portal, loot, and UI.
5. Prevent sound spam and overlapping loops; respect pause, tab visibility, volume settings, and reduced-motion/accessibility preferences where applicable.
6. Do not let client audio events affect combat outcomes.

## Performance and quality gates
- Keep a sprite fallback if a GLB fails to load or a device is under a conservative performance budget.
- Avoid loading an entire asset pack at runtime; only commit the selected optimized files.
- Check triangle counts, texture dimensions, draw calls, animation count, and memory on a representative phone.
- Check console errors and all existing tests before merge.
- Treat this plan and the audio lab as exploratory until the asset imports and live-game integration are reviewed and tested.
