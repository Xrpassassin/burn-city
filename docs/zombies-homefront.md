# BURN City Zombies: Homefront — Survivor Settlement

## Product boundary

Homefront is a separate, unranked Zombies experience. It must not award Ranked score, affect ranked matchmaking, or change the existing Refinery → Ashen Cosmodrome Free Play route. It has its own menu entry and a dedicated settlement screen.

## Implemented vertical slice

- `client/arena/homefront.html`: responsive Homefront management screen with an interactive Three.js 3D refuge yard. Players choose a structure and tap an open spot to place it; placement coordinates and collision/bounds checks are enforced server-side.
- `server/homefront.js`: authenticated `GET /api/homefront` and `POST /api/homefront/action` endpoints. The wallet/account identity comes from BURN City's verified bearer token, never a client-supplied owner ID.
- `server/homefront-core.js`: renderer-independent rules for initial resources, structure construction and repair, expeditions, survivor recruitment and role assignment, work shifts, breach resolution, state normalization, and ownership checks.
- `server/store.js` persists each account's base in `homefront.json` on the configured persistent data volume, using the existing atomic JSON-store write pattern. No offline base destruction is enabled.
- The 3D yard uses the project's existing Three.js build plus bundled CC0 models: Quaternius's animated survivor, and Kenney fence, gate, and campfire-stone models. Source URLs and license provenance are stored in `client/arena/assets/homefront/README.md`. No runtime CDN or new package dependency is added.
- `test/homefront-core-sim.js` checks progression rules, resource costs, survivor assignment, breach/repair behavior, ownership isolation, placement bounds, and collision guards. `test/homefront-assets.test.mjs` validates the bundled GLB files.

## Gameplay loop

1. Each authenticated player owns one persistent refuge.
2. Gather wood, scrap, food, medicine, and ammunition through expeditions.
3. Construct walls, gates, watchtowers, gardens, workshops, infirmaries, and storage.
4. Recruit survivors on expeditions; assign them to guard, scavenger, farmer, medic, mechanic, or idle jobs.
5. Run a work shift to consume food and convert assigned labor into supplies.
6. Trigger a server-resolved breach. Structures, guards, and ammunition contribute defense; the base and structures can take damage and require repair.
7. Progress is saved server-side so it follows the account across devices.

## Remaining work before calling it a complete game mode

- The current expedition and breach controls resolve through the settlement rules; they are not yet connected to a walkable scavenging map or real-time zombie combat in the 3D yard.
- Add an explorable world, resource nodes and loot interactions, survivor rescue encounters, animated zombie attackers, and actual tower/guard combat.
- Add better placement preview, rotation, footprints, build menus, and touch-friendly camera controls.
- Add integration tests for authenticated HTTP save/load, cross-account isolation, malformed save recovery, duplicate/replayed actions, and concurrent sessions.
- Review model scale/orientation, visual fidelity, and mobile frame time in a real browser before general release.

## Open-source integration policy

- Keep BURN City's existing vanilla JavaScript / Three.js and Node stack; do not import a second game engine.
- Use the locally bundled CC0 assets with retained source/license provenance. Quaternius's Zombie Apocalypse Kit is CC0 1.0; Kenney's Nature Kit is CC0 1.0, as recorded in the upstream [credits manifest](https://github.com/mars-tw/storm-apocalypse/blob/main/CREDITS.md).
- The MIT-licensed [Three.js survival prototype](https://github.com/dwade30/threejs-survival-game) is a small reference for resource-gathering/crafting patterns, but it is not adopted wholesale.
- The [Island Survival](https://github.com/alexandrosang21/island-survival) repository demonstrates a broader survival/build/raid loop; review its exact license and implementation before copying code. Do not copy art or code without verified compatible licensing.
- Prefer local CC0 props and PBR surfaces from [ambientCG](https://ambientcg.com/); retain provenance and do not load external asset CDNs at runtime.

## Security and persistence requirements before public release

- Bind the base to a server-verified account/session, not a display name or client-supplied owner string.
- Persist through BURN City's server-side data volume with atomic writes or the existing database; serialize writes per owner to avoid lost updates.
- Apply per-action cooldowns and rate limits; cap structures, survivors, resources, and log entries.
- Decide inactivity behavior explicitly: no offline base destruction or survivor death until players have been warned and that policy is implemented.
- Test cross-account isolation, malformed save recovery, duplicate/replayed actions, concurrent sessions, save/load across restart, and ranked-mode separation.
- Do not merge/deploy until the integrated mode has been reviewed by Hark and the player-facing flow has passed browser/mobile testing.
