# BURN City Zombies: Homefront — Survivor Settlement

## Product boundary

Homefront is a separate, unranked Zombies experience. It must not award Ranked score, affect ranked matchmaking, or change the existing Refinery → Ashen Cosmodrome Free Play route. Keep it behind its own menu entry and server mode.

## Gameplay loop

1. Each authenticated player owns one persistent refuge.
2. Gather wood, scrap, food, medicine, and ammunition through expeditions.
3. Construct walls, gates, watchtowers, gardens, workshops, infirmaries, and storage.
4. Recruit survivors on expeditions; assign them to guard, scavenger, farmer, medic, mechanic, or idle jobs.
5. Run a work shift to consume food and convert assigned labor into supplies.
6. Trigger a server-resolved breach. Structures, guards, and ammunition contribute defense; the base and structures can take damage and require repair.
7. Progress is saved server-side so it follows the account across devices.

## First implementation slice

`server/homefront-core.js` is a renderer-independent, deterministic rules module. It defines the initial state, action validation, resource costs, building caps, expeditions, survivor recruitment and assignments, worker production, breach resolution, repairs, ownership checks, and save-state normalization. `test/homefront-core-sim.js` exercises those invariants without a browser or new package dependency.

This is the gameplay rules foundation, not yet the complete player-facing mode. The next integration phase must connect an authenticated account identity to server-side persistence and a dedicated UI, then add visual placement and survivor actors. Never use a client-provided owner ID, loot roll, defense result, resource delta, or survivor reward as authority.

## Open-source integration policy

- Keep BURN City's existing vanilla JavaScript / Three.js and Node stack; do not import a second game engine.
- Reuse the project's existing vendored Three.js and current CC0/MIT zombie-model intake process for settlement props and survivor models, with source/license files beside each asset.
- The MIT-licensed [Three.js survival prototype](https://github.com/dwade30/threejs-survival-game) is a small reference for resource-gathering/crafting patterns, but it is not adopted wholesale.
- The [Island Survival](https://github.com/alexandrosang21/island-survival) repository demonstrates a broader survival/build/raid loop; review its exact license and implementation before copying code. Do not copy art or code without verified compatible licensing.
- Prefer CC0 props from [Quaternius](https://quaternius.com/) and PBR surfaces from [ambientCG](https://ambientcg.com/); retain attribution/provenance and do not load external asset CDNs at runtime.

## Security and persistence requirements before public release

- Bind the base to a server-verified account/session, not a display name or client-supplied owner string.
- Persist through BURN City's server-side data volume with atomic writes or the existing database; serialize writes per owner to avoid lost updates.
- Apply per-action cooldowns and rate limits; cap structures, survivors, resources, and log entries.
- Decide inactivity behavior explicitly: no offline base destruction or survivor death until players have been warned and that policy is implemented.
- Test cross-account isolation, malformed save recovery, duplicate/replayed actions, concurrent sessions, save/load across restart, and ranked-mode separation.
- Do not merge/deploy until the mode has an integrated UI, authentication, save/load, gameplay tests, and a review pass.
