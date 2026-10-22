# Eternal Grind Current Progression Mechanics — Source Map

**Status:** source audit; no runtime changes. Paths/functions below are the current integration seams observed in `main` at audit time.

## Character model

**Source:** `client/dungeon/sys.js`

- `CLASSES`: four existing classes — Warrior, Rogue, Ranger, Mage — each with baseline combat stats and combat style.
- `classesOf(P)`: resolves the legacy `P.cls` field or the v2 `P.classes` array; validates against known classes and caps at three.
- `clsLabel(P)`: displays the current multiclass combination.
- `newChar(name, race, classes)`: creates a v2 character save with `lvl: 1`, `xp: 0`, gold, floor/depth, potions, equipment, general inventory, crafting materials, codex, gems and hotbar.
- `recalc(P, buffs)`: calculates base stats from the first class, adds 15% of each additional class's stats, applies race multipliers, level growth, equipment, and buffs. It updates `P.st`, `P.fx`, `P.procs`, and clamps current HP/MP.
- `knownSpells(P)` / `defaultGems(P)`: determine abilities from the current class combination and populate the initial spell gems.
- `SAVE_V = 2` and `migrate(P)`: migrate older saves to the current format and repair selected missing/invalid fields. For v1, migration maps the old class into a single-class array; a new specialization migration must preserve this compatibility.

## Existing XP and level advancement

**Source:** `client/dungeon/sys.js` and `client/dungeon/index.html`

- `xpNeed(P)` currently calculates the threshold as `round(60 × level^1.45 × (1 + 0.15 × (classCount - 1)))`.
- `kill(e)` awards gold, calls `gainXp(...)`, then resolves loot, potions, materials and possible bags.
- `gainXp(x)` adds the reward to `P.xp`; while XP meets the current `S.xpNeed(P)`, it subtracts the threshold, increments `P.lvl`, recalculates stats, restores HP/MP to the new maxima, and logs each level gained.
- The level-up loop is currently in the page entry script, not in a dedicated tested progression-core module.
- XP and combat outcomes are client-side in this dungeon implementation. This should not be described as server-authoritative or tamper-proof.

## Death and recovery behavior

**Source:** `hurt(d, e)`, `$('bRes').onclick`, and `save()` in `client/dungeon/index.html`

When HP reaches zero:

1. The run stops and the death screen opens.
2. The client calculates `lost = floor(P.gold / 2)` and deducts that amount from `P.gold`.
3. The player keeps level and equipped gear; the death text explicitly says this.
4. The updated save is written.
5. **Rise again** recalculates stats, restores HP/MP, and restarts on `max(1, P.depth - 1)`.

This is a real design conflict with the proposed policy “temporary recovery penalty, no permanent gear loss”: gear is already retained, but half of the carried gold is permanently removed from the saved character on death. The proposed recovery status would therefore be a replacement or redesign of the existing gold penalty, not an additive penalty. Decide the desired gold rule before implementing recovery.

## Save and import/export lifecycle

**Source:** `client/dungeon/index.html`

- Save key: `localStorage.egSave`.
- `save()` serializes the active character after removing transient derived fields `st`, `fx`, and `procs`; HP is clamped to at least 1 for persistence.
- `loadSave()` parses the current save and passes it through `S.migrate`. If migration changes the save, the old raw string is kept under `egSaveV1` once.
- `keepBak()` creates `egSaveBak` before the first overwrite in a session; unreadable raw data is parked under `egSaveBroken`.
- The main loop autosaves roughly every 10 seconds; several progression and inventory actions also save directly.
- Export downloads the raw `egSave` JSON. Import validates with `S.migrate`, asks before replacing a current save, and copies the current save to `egSaveBak`.
- This is device-local storage, not account-bound cloud persistence.

## Implementation implications

1. The proposed six-class set cannot simply replace the four current classes without an explicit migration and balance decision.
2. The current multiclass XP multiplier and 15% additional-class stat contribution are established live rules. A specialization model must define whether those rules stay, change, or become a separate character path.
3. The proposed attributes (Might, Vitality, Agility, Intellect, Spirit) do not currently map 1:1 to visible stored base attributes; the existing stat block is derived from class, race, level, gear and buffs.
4. Weapon proficiency must hook into the actual `attack()`, `castSpell()`, and equipment/combat rules only after deciding what counts as valid use. Avoid awarding it for client-fabricated events.
5. A temporary recovery status should replace the current permanent 50% carried-gold loss if that is the approved design; it should not silently stack on top of it.
6. To make progression authoritative for multiplayer, first design character identity, server validation, persistent storage, and migration. Moving only the XP formula into a server file would not make the current dungeon combat authoritative.

## Smallest low-risk code seam

A dedicated pure helper can extract the level/XP accumulation loop from `gainXp(x)` while preserving the current threshold formula and multi-level-up behavior. It should have tests for exact threshold boundaries, several levels gained in one award, fractional/invalid XP, and level-up ordering. Integration should be a separate PR so the pure rules can be reviewed before altering the live page.
