# Eternal Grind — Enemy Behavior Lab

## Purpose
An isolated local simulation for evaluating enemy attack readability and counterplay. It is a design/prototyping aid, not a replacement for production combat.

## Open
Serve the repository with the normal development server and open `/client/dungeon/enemy-behavior-lab.html`. The page imports the vendored Three.js module via the existing relative path.

## Behaviors represented
- **Cryptbound:** measured melee attack, moderate wind-up, standard damage.
- **Ashen Brute:** slow approach, longer telegraph, heavier damage, extended recovery.
- **Plague Ghoul:** faster approach, short wind-up, lower damage, frequent pressure.
- **Gravecaller:** longer-range attack and distinct arcane visual marker.
- Shared sequence: approach → wind-up → active strike → recovery → re-engage.
- Player evade input, attack input, health feedback, reset/pause, and five illustrative threat tiers.

## Important limitations
All damage, timing, distances, and models in this lab are placeholder values for feel testing. Threat tiers only scale this prototype's incoming damage. The lab does not import or alter the live dungeon combat loop, server authority, enemy AI, player stats, progression, loot, or save data. Dodge currently repositions the placeholder player laterally; it is not the production dodge system.

## Hark validation checklist
1. Load through the app's normal server and inspect console errors.
2. Test all four archetypes, pause/reset, enemy defeat, player defeat, and repeated encounters.
3. Check attack timing and whether hit resolution happens exactly once per active strike.
4. Verify phone-sized layouts and tap targets; observe performance on a low-end device.
5. Treat all values as tuning placeholders. Compare against the production combat state machine before any integration.
6. If approved, implement production changes separately, preserving server-authoritative combat and current formulas unless explicitly balanced.

## Acceptance criteria
- Local state transitions run without uncaught errors.
- Each attack resolves once, followed by a clear recovery window.
- Player can evade before strike resolution and counterattack in range.
- No production entry point or server/save/progression code is changed.
