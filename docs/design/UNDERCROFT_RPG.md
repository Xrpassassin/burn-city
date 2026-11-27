# Undercroft RPG: "The Ruin of Vael Ithren" (first playable slice)

An original third-person action RPG inspired by classic open-world fantasy RPGs: pale elder ruins, glowing lumen crystals, torchlit stone, skill-use leveling, and a parchment-and-gilt UI. It runs on phone and desktop and is entered from the Ember Crossroads (the Undercroft hub, PR #707).

All names, art direction and systems are our own. It uses no Bethesda or Artix names, assets or logos. Assets are CC0 or CC BY and are credited in `client/city-credits.html` and `client/undercroft/assets/ATTRIBUTION.md`.

## Core loop (the slice)

1. **Take a quest in the hub.**
   - Warden Ossia (Ledger Hall) offers **The Dimmed Lumen**: recover the Heartstone from the Hollow King.
   - Cinder-Scribe Varro (Ossuary Chapel) offers **The Bone Tithe**: put 8 risen dead back to rest.
   - The Ledger board lists both contracts and their state.
2. **Descend.** The Ember Stair in the chapel opens `undercroft/?from=crossroads`. The first time you enter, character creation runs: name, race, class, and starsign.
3. **Explore the ruin of Vael Ithren.** It is one handcrafted, tile-based dungeon:
   - entry stair (tutorial hints);
   - pillared hall (skeleton warriors, a loot chest);
   - side vault (a locked chest and the lockpick minigame);
   - spike-trap gallery (timed floor spikes);
   - Lumen Sanctum: a pedestal puzzle where each pedestal toggles its neighbours. Light all three to open the sealed gate;
   - wraith antechamber (casters plus a gilded chest);
   - the Hollow King's throne hall (boss).
4. **Fight.**
   - Light and heavy attacks, block (a perfect block staggers), dodge roll with i-frames.
   - Two spells: Firebolt and Heal, adapted from Eternal Grind's Ember Bolt and Mend.
   - Health, Magicka and Stamina bars.
   - Hit feedback: damage numbers, hit marker, knockback, hit-stop, camera shake, and hit flash.
5. **Defeat the boss.** The Hollow King has two phases: axe combos and a spin; then at 50% he summons minions and uses a gravefire ring. Then take the Heartstone and climb out.
6. **Turn in** at the hub NPC for XP, gold and a unique item. Level-ups are shown on a full-screen level-up card where you pick a boon.

## Systems

| System | Slice implementation |
|---|---|
| Character creation | 8 races, adapted from Eternal Grind `RACES` (stat multipliers) plus our own skill bonuses, tint and scale. 6 preset classes (Sentinel, Arcanist, Cutpurse, Spellblade, Warmage, Duskblade) plus a custom class (pick 3 major skills). 6 starsigns. Choices set starting stats, skills, gear and model. |
| Skills | Blade, Block, Armor, Destruction, Restoration, Acrobatics, Security. They rise with use (hitting with a blade raises Blade, blocking raises Block, and so on). Major skills rise 1.5× faster. Each skill-up grants a little XP. |
| Levels | XP from kills, quests and skill-ups. The threshold uses Eternal Grind's `xpThreshold` through an adapter. On level-up, choose +10 Health, +10 Magicka or +10 Stamina. |
| Items | Weapons (blade, dagger, axe, staff), body armor, health and magicka potions, lockpicks, and the Heartstone quest item. Rarity colours come from Eternal Grind `RAR`. Equip weapon and armor. |
| Loot | Deterministic chest tables per chest id. Chests open once per save. |
| Lockpicking | 3 tumblers. A sweeping pick: set each pin while it is inside the sweet zone. Higher Security gives a wider zone. A failed pin breaks a lockpick. |
| Quests | A small state machine: `none → active → (progress) → ready → done`. It is shared by the hub and the game through `client/undercroft/rpg-core.mjs`. |
| Save | **Separate local-device save** under `localStorage['bcUndercroftRPG']`, versioned and validated. The Eternal Grind save (`egSave`) is never written or migrated. Nothing in this game touches XRP, payments, payouts or real-money rewards. |
| Enemies | Skeleton warrior (melee, telegraphed swings, shield guard). Wraith caster (floats, keeps range, frost wisp, blinks away). Skeleton minion (boss adds). The Hollow King (boss). Flow-field pathing on the tile grid. |
| Controls | Desktop: WASD move, mouse look (click to capture), LMB attack (hold for heavy), RMB block, Space dodge, Shift sprint, 1 Firebolt, 2 Heal, E use, I/Tab menu, H potion. Phone: left joystick, drag to look, Attack (hold for heavy), Block, Dodge, Firebolt, Heal, Use; and a menu button. |
| Presentation | ACES tone mapping and bloom; a pooled set of point lights reassigned to the nearest torches and crystals; fog shafts under the crystals; dust; blob shadows (and a soft shadow spot on high); PBR Poly Haven stone (diffuse, normal and ARM); a compass bar; a parchment and gilt HUD. |
| Performance | Separate lazy page. Graphics tiers (low/medium/high via `?tier=` or auto). Low: no bloom or shadows, 512 textures, 3 lights, fewer particles. Everything is disposed on exit. |

## Reuse of Eternal Grind (adapters, read-only)

- `client/dungeon/sys.js` `RACES` and `RAR`: race names and stat multipliers, and rarity colours.
- `client/dungeon/progression-core.mjs` `xpThreshold`: the level curve.
- `client/dungeon/data.js` `SPELLS.ember_bolt` and `SPELLS.mend`: spell names, costs and descriptions, adapted into Firebolt and Heal.
- No Eternal Grind module is modified, and its save format is untouched.

## Roadmap (later phases)

1. **More dungeons:** a flooded lumen cistern, a bandit-held barrow, and a vampire-crypt-style ossuary. Each has its own puzzle type: rotating rings, pressure plates, mirror beams.
2. **Overworld cavern:** an open "underland" cavern between the dungeons, with day/night lumen cycles, wildlife, camps, fast-travel shrines, and horses or striders.
3. **Guilds:** Fighters, Mages and Thieves-style guilds with our own names, quest lines and ranks, housed in hub side halls.
4. **AQ3D-style social layer:** parties (2–4) with shared instances via the existing room server, group bosses, and **cosmetic-only** boss drops (helms, capes, weapon skins) shown in the hub. No real-money rewards.
5. **Deeper RPG:** attributes and majors as in the classics, enchanting and potion-making, a spell-maker, stealth and sneak attacks, a lockpicking skill tree, and dialogue persuasion.
6. **Server-backed saves (opt-in):** keep the local-device save as the default. Cloud sync would be an explicit, separate feature and would never affect Eternal Grind data.
