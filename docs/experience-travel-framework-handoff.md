# BURN City cross-experience travel framework — Hark handoff

## Immediate map cleanup
The decorative Light Cycles and Zombie Survival portal rings have been removed from the city scene. They looked like physical map entrances, but they were not the intended airport-to-Zombies and Aegis-Pyramid-to-Light-Cycles journey. Existing game modes remain accessible through the current Play / Movement & Games hub; this change does not remove the arena routes or change the arena runtime.

## Framework added
- `client/js/experience-registry.mjs`: dependency-free registry with stable destination IDs, user-facing labels/descriptions, explicit `planned` vs `available` status, a launch-adapter contract, return destination metadata, a single-transition guard, and failure-safe cleanup.
- `client/js/experience-registry.test.mjs`: tests unknown/unavailable destinations, duplicate and invalid IDs, required launch adapters, concurrent entry rejection, successful entry, and failed-launch cleanup.
- `npm run test:experience-registry`: focused test command; also included in `npm test`.

The registry intentionally does not invent URLs, teleport players, or mark an unfinished experience available. Hark should wire real entrances through adapters only after auditing the current city/experience lifecycle.

## Intended destinations
1. **Airport → Zombies** — a signed expedition gate/boarding interaction, explicit confirmation, transition to the actual Zombies experience, and a safe return/extraction path. Ambient planes are not transport unless a player explicitly boards.
2. **Aegis Pyramid plaza → Light Cycles** — a dedicated neon-grid launch area and explicit entry interaction. Keep the mode's own physics, match lifecycle, and return path separate from the city renderer.
3. Use stable IDs such as `zombies` and `light-cycles`; preserve source/return location in transition context. Keep each experience's save/progression isolated unless a separate contract explicitly allows sharing.

## Hark integration contract
- Audit `HANDOFF.md`, current `main`, and all open PRs before wiring anything. This branch is isolated; do not cherry-pick blindly or merge it while Hark is working.
- Register a destination as `planned` until the real entry, load/join, error state, and return route all work.
- An `available` registration must provide a `launch(context)` adapter. The adapter receives `destinationId` and `returnTo`; it must be idempotent, cancellable where feasible, and clean up listeners/audio/renderers on exit.
- The registry rejects overlapping transitions and returns a structured failure instead of leaving the player stuck in a loading state.
- Keep city portals out until they lead somewhere. If a future destination is not ready, use a clearly labeled noninteractive landmark/sign or omit the entrance; never a fake portal.
- Do not load the whole Zombies world inside the city scene. Use a separate experience/page/runtime and a safe return mechanism.
- No dependencies, server changes, persistence changes, or deployment changes in this branch.

## Validation
Run `npm run test:experience-registry`, `node --check client/js/app.js`, then browser smoke tests on desktop and mobile. Confirm no rings/labels remain on the city map, and that existing Play hub routes still open Light Cycles/Zombies. Browser smoke tests have not been performed by this handoff author.
