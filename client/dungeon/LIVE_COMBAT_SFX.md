# Eternal Grind live combat sound effects

This change adds lightweight procedural sound effects to the existing first-person Eternal Grind client. It is an incremental audio layer, not a new audio engine and not a replacement for the current music track.

## Included cues

- Weapon swing / ranged attack launch
- Melee and spell impacts, with a stronger critical-hit cue
- Hostile projectile launch
- Player damage
- Player death
- Healing spells and healing potions

Sounds are synthesized with the browser Web Audio API. No external audio files, new dependencies, or downloaded assets are added. The effect layer is deliberately small and uses short-lived oscillators/noise sources rather than a continuously running audio loop.

## Controls and browser behavior

- Sound effects are enabled by default and can be toggled from the pause menu.
- The preference is stored in `localStorage` under `egSfxMute`; it is separate from the existing music mute preference.
- Audio context creation/resume is triggered by a player gesture, and playback gracefully becomes a no-op where Web Audio is unavailable or blocked.
- Sound generation does not alter combat values, cooldowns, loot, enemy AI, save data, or server protocol.

## Scope and next steps

The cues are intentionally placeholders; they improve feedback while proper licensed sound assets are evaluated. This patch does not import enemy models. Before adding models, choose exact CC0/compatible archives, preserve their license/readme with the assets, confirm a loader is already available in the vendored Three.js build, and keep sprite fallback for low-end/mobile devices.

## Manual verification checklist

- Open Eternal Grind on desktop and mobile Safari/Chrome.
- Enter the dungeon, make a melee attack, cast a spell, take damage, use a healing potion, and die.
- Confirm each event produces a short cue without repeated loops or excessive volume.
- Open the pause menu, toggle sound effects off and on, and verify the preference survives a reload.
- Verify music mute and sound-effects mute remain independent.
- Run the repository test suite before merge; browser/device checks remain necessary because automated Node tests do not exercise Web Audio playback.
