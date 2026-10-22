# Eternal Grind Enemy Attack Telegraphs

## Purpose
Make existing sprite-based enemies easier to read before their attacks land, without replacing the current dungeon combat loop or changing damage values.

## Changes
- Melee enemies visibly wind up for 0.42 seconds before striking; guardians wind up for 0.68 seconds.
- Ranged enemies visibly wind up for 0.62 seconds before launching the existing projectile; guardians use 0.82 seconds.
- During a windup, enemy sprites pulse and tint orange for melee or violet for ranged attacks.
- Stuns cancel an in-progress windup.
- If line of sight or the relevant range is lost before impact, the pending attack does not land.
- Existing cooldown ranges, attack values, projectile speed, and damage formulas are preserved.

## Scope and limitations
This is a small live-dungeon combat-feel change in `client/dungeon/index.html`. It uses the existing sprite renderer and combat state; no dependencies, models, animation system, save format, inventory, progression, or server protocol are added or changed. The cues are sprite tint/scale feedback, not skeletal animation. This does not add block, dodge, stamina costs, or new enemy abilities.

## Manual validation required
1. Enter Eternal Grind and approach a melee enemy; confirm the orange pulse precedes damage.
2. Test a guardian and confirm its windup is longer and more pronounced.
3. Approach a ranged enemy; confirm the violet pulse precedes the projectile.
4. Move out of range or break line of sight during windup; confirm the pending attack misses.
5. Stun an enemy during windup; confirm the windup cancels.
6. Check mobile and desktop frame time, sprite readability, and console/network errors.
7. Run the existing project test suite and report pre-existing failures separately.

No browser/device test or automated suite is claimed as run by this change. Keep this PR separate until the manual checks are complete.