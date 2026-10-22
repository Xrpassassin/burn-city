# BURN City cross-experience travel framework — Hark handoff

## Current state: both travel journeys are wired
The decorative Light Cycles and Zombie Survival portal rings have been removed from the city scene. The destinations now have physical, labeled entry points connected to the existing arena modes, with a Return to City control that restores the player near the point of departure.

## Framework and live adapters
- `client/js/experience-registry.mjs`: dependency-free registry with stable destination IDs, explicit `planned` vs `available` status, launch adapters, return destination metadata, a single-transition guard, and failure-safe cleanup.
- `client/js/experience-registry.test.mjs`: tests unknown/unavailable destinations, duplicate and invalid IDs, required launch adapters, concurrent entry rejection, successful entry, failed-launch cleanup, and adapter-enabled destination defaults.
- `npm run test:experience-registry`: focused test command; also included in `npm test`.
- `client/sw.js`: bumped the shell version and precaches the registry module so the app shell can resolve its new dependency offline.

## Wired journeys
1. **Airport → Zombies** — a visible Zombie Extermination expedition kiosk near the terminal opens a confirmation panel. Boarding launches the existing arena with `mode=zombie` and records the airport as the return destination. Ambient planes remain separate from player transport.
2. **Aegis Pyramid plaza → Light Cycles** — a neon-grid launch pad and sign beside the Pyramid opens a confirmation panel, then launches the existing arena with `mode=tron`. The arena shows a Return to City control and returns the player to the Pyramid plaza.
3. Both launch adapters are marked `available` because the real destinations and return route are wired. Each experience retains its own runtime and progression; this does not load Zombies or Light Cycles into the city renderer.

## Hark integration contract
- Review current `main` and all open PRs before integration. This branch is isolated; do not cherry-pick blindly or merge it while Hark is working.
- Keep the airport and Pyramid entry points as explicit interactions, not auto-triggered teleports.
- The registry rejects overlapping transitions and returns a structured failure if a launch adapter throws.
- Keep each experience's save/progression isolated unless a separate contract explicitly allows sharing.
- No dependencies, server changes, or save-schema changes were introduced in this branch. No merge/deployment is requested.

## Validation
Run `npm run test:experience-registry`, `node --check client/js/app.js`, `node --check client/js/airport.js`, and `node --check client/js/aegis-pyramid.js`, then browser smoke tests on desktop and mobile. Confirm both physical entry points render and are clickable, both modes auto-start, Return to City restores the correct location, and repeated transitions do not duplicate scene objects. These runtime/browser checks have not yet been performed.
