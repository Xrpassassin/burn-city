# Blacktide — BURN City pirate-region prototype

Blacktide is an isolated browser-native region prototype under `/blacktide/`. It uses the Three.js version already vendored by BURN City and does not modify the main city scene, existing server simulation, persistent player data, or deployment configuration.

## Current prototype

- 3D ocean with animated surface, distant islands, a player ship, and a follow camera.
- Sailing controls: W/Up to accelerate, S/Down to slow/reverse, A/D or Left/Right to steer.
- Space or touch button to fire a visual broadside.
- Mobile touch controls and a minimal vessel HUD.
- Return link to the existing BURN City page.
- No server-authoritative movement, persistence, damage, trading, quests, NPCs, or multiplayer yet.

## Route

The static server should serve this folder at `/blacktide/` through the existing `client` root. This prototype is intentionally not linked into the main city UI yet; it can be tested directly at `/blacktide/` without changing the live city navigation.

## Compatibility and integration rules

- Keep Blacktide in this directory as an isolated region.
- Reuse the existing vendored Three.js package; do not add a second game engine.
- Do not edit the shared city renderer or server protocol to make this prototype run.
- Before connecting to multiplayer, define a region identifier (for example `blacktide`), server-authoritative ship state, transition/save contract, and region-specific tests.
- Keep the prototype out of `main` until desktop/mobile smoke tests and review are complete.

## Open-source reference

The project uses **original prototype code** informed by the design space of open-source pirate games. It does not copy proprietary code or assets from Tempest: Pirate Action RPG.

Reference candidate: [Corsairs: Wind of Freedom](https://github.com/Elkhan-Isayev/corsairs), an independent Godot project released under the MIT license. Its Godot scripts are not directly compatible with this Three.js web client; port mechanics only where useful and preserve required attribution if any source code is later reused. Verify the upstream license and third-party asset licenses at the exact time of reuse.

## Next steps

1. Run `node --check client/blacktide/blacktide.js` (ES module syntax check).
2. Test `/blacktide/` on desktop and mobile Safari.
3. Fix any console/runtime errors and confirm the original city still loads unchanged.
4. Add island docking and region transition behavior.
5. Implement a server-authoritative ship state only after reviewing the existing multiplayer protocol.
6. Add combat, loot, trading, quests, crew, and persistent ship upgrades in separate modules.
