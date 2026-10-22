# Eternal Grind Combat Lab

## Purpose
A standalone Three.js combat-feel prototype for reviewing enemy telegraphs, attack timing, defensive windows, and simple attack feedback before changing the live game.

## Open
With the BURN City server running, visit `/dungeon/combat-lab.html`.

## Included prototype behavior
- Four placeholder enemy archetypes: Cryptbound, Ashen Brute, Plague Ghoul, and Gravecaller.
- Distinct windup, active strike, and recovery timing for each archetype.
- Test buttons for attack, block, dodge, and manual enemy attack trigger.
- Basic health bars, hit feedback, strike telegraph, and recovery vulnerability.
- Responsive panel layout; uses the existing vendored Three.js module.

## Safety boundary
This page is an isolated sandbox. It does not change live `client/dungeon/index.html`, combat math, server state, inventory, player progression, saves, enemy spawns, or network messages. Enemy bodies and weapon shapes are procedural placeholders, not production assets or skeletal animations.

## Repository findings
The live dungeon entry point currently builds enemies as Three.js sprites loaded from `a/e/<enemy-name>.webp`; enemy state includes health, attack, speed, cooldown, stun/slow state, and status effects. The player uses a first-person camera and a procedural weapon-in-hand group, with an existing `player.swing` flag. There is no Three.js AnimationMixer in the inspected entry point. Therefore the next production step should be to prototype sprite/weapon animation and enemy attack telegraphs against the existing state machine before importing rigged 3D enemies or changing camera/gameplay.

## Review checklist
1. Open on desktop and mobile; inspect console and network.
2. Try every enemy, wait for the windup, and test attack/block/dodge.
3. Confirm the lab remains independent of the live game.
4. After review, propose a separate small PR for attack animation/telegraph improvements using existing enemy state and existing sprite assets; keep balance changes separate.
