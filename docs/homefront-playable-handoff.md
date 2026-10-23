# Homefront Playable Handoff for Hark

## Goal

Make Homefront a playable, optional, unranked Zombies survival experience without destabilizing the main BURN City world. This branch is framework work; Hark owns integration review, browser QA, and the release decision.

## Isolation contract

- Homefront is a separate game mode with its own refuge and Graveyard state. Current persistence keys are `homefront.json` and `homefront-world.json`.
- Homefront progression (resources, Embers, weapons, survivor roles/morale, refuge structures) must not mutate the main BURN City character, ranked ladder, or economy.
- The current implementation still routes through the BURN City Node server and shares its authentication mechanism. Separate files and routes are logical isolation, **not yet proof of a separately deployed server process**.
- Before describing Homefront as a separately deployed instance, deploy it as its own service/runtime with a dedicated persistent volume and explicit auth/session handoff. Keep the BURN City launcher as the entry point; do not silently share writable save files or main-world economy state.
- Keep this PR draft, unmerged, and undeployed until Hark approves the implementation and the validation below passes.

## Current end-to-end foundation

1. Airport Zombies kiosk offers Homefront as a separate option.
2. Homefront owns a persistent, private-by-default refuge.
3. Refuge has settlement structures, survivor roles/work, resources, repairs, morale, weapon bench, upgrades, and Embers.
4. The player explicitly enters the shared XRPL Graveyard; base management does not automatically join the expedition.
5. The Graveyard supports persistent player positions, pseudonymous shared presence, perimeter spawns, location risk, POIs, parties of up to four, shared caches/rescues, and shared boss HP.
6. The player can search for an infected encounter and attack through authenticated, server-authoritative endpoints. Attacks validate range, cooldown, ammo, weapon power, rewards, and retaliation.
7. Infected pursuit now advances on authoritative movement and world refresh. It is bounded and discrete; it is not yet continuous real-time replication or collision-aware pathfinding.
8. Field survival now tracks health, hunger, thirst, stamina, and infection pressure. Needs decay only while active in the Graveyard; movement spends stamina; eating, drinking, bandaging, and catching breath are server-authoritative actions. Clean water is a refuge resource and has a legacy-save migration.

## Required playability work

### P0 — smoke-test and close integration gaps
- Run `npm run test:homefront` and the airport/registry checks below against the exact PR head; survival unit and API integration coverage has been added but is not yet verified by a fresh CI run.
- Verify refuge create/load/save, construction, survivor assignment/work, weapon crafting/equipping, and progression survive reloads.
- Verify enter/leave Graveyard, click-to-move, solo spawn distribution, party create/join/leader movement, rescue/cache cooldowns, boss damage, and combat ammo/rewards.
- Verify invalid/expired encounters, insufficient ammo, cooldown, range failure, survival actions without supplies, and unauthenticated calls return clean client errors rather than server errors.
- Test the 3D scene and its 2D/fallback behavior on desktop and mobile Safari; confirm touch input works and UI controls do not overlap the viewport.
- Fix visual snapping or confusing movement/combat feedback before calling the loop playable.

### P1 — complete the combat loop
- Add an explicit player health/injury state with server-authoritative damage, recovery, death/retreat, and respawn rules. Do not overload refuge integrity as player health.
- Add continuous or appropriately scheduled AI ticks, visible pursuit/attack telegraphing, cooldowns, hit reactions, and a readable disengage/escape path.
- Add collision-aware navigation around buildings and POIs; do not let visual-only ambient zombies count as combat targets.
- Animate server-owned infected positions smoothly on clients, reconcile snapshots, and keep the server authoritative.
- Add an explicit loot/interaction result panel and weapon/ammo feedback. Avoid granting rewards from client-side markers.
- Add multiplayer combat policy: confirm whether each player's encounter is private or party-shared; then test ownership, party assistance, and exploit boundaries.

### P2 — instance separation and release readiness
- Deploy Homefront as a separate runtime/service with its own persistent volume and configuration; document the exact URL/environment variables and rollback path.
- Preserve shared account sign-in through a narrow, verified token/session handoff. Never trust a client-supplied account ID.
- Ensure Homefront APIs cannot write to main BURN City saves, inventory, ranked stats, or economy.
- Add health checks, structured logs, save backup/restore checks, and a migration/versioning plan for Homefront save data.
- Run full CI, API integration simulations, desktop/mobile QA, and a multiplayer test with at least two accounts before making the PR ready for review.

## Validation commands

```sh
npm run test:homefront
npm run test:experience-registry
npm run test:flight-lobby
node --check server/homefront.js
node --check server/homefront-world.js
node --check server/homefront-combat.js
node --check client/arena/homefront-graveyard-3d.js
```

The commands are a checklist for Hark to run in the repository environment; do not report them as passed until their actual output is available.

## Latest framework addition

- `server/homefront-combat.js`: bounded deterministic pursuit step; AI timestamp is persisted with each encounter.
- `server/homefront-world.js`: pursuit advances on player movement and active world refreshes.
- `server/homefront-combat.test.js` and `test/homefront-world-sim.js`: pursuit unit and world integration coverage.
- `docs/homefront-airport-flight-handoff.md`: technical notes and limitations.

## Acceptance criteria

Homefront is ready for Hark's playable review when the full Homefront test script passes, two-account multiplayer smoke tests pass, no main-world save/economy changes occur, the 3D/mobile interaction loop is usable, and the runtime-isolation status is described accurately. Do not merge or deploy from this handoff.

## Survival, UI, and open-world roadmap
- Implemented initial field-vitals rules and HUD in `server/homefront-survival.js`, `server/homefront-survival.test.js`, `server/homefront-world.js`, `server/homefront.js`, and `client/arena/homefront.html`.
- The detailed design contract for inventory, cosmetic skins, diegetic interactions, authored districts, atmosphere, and dynamic events is `docs/homefront-survival-cosmetics-open-world.md`.
- A real survivor avatar/loadout renderer, applying equipped skins to 3D models, authored interiors, collision-aware navigation, and dynamic weather/events are still roadmap work, not completed features.
