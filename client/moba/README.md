# BURN City MOBA rules core

A renderer-free deterministic rules foundation for the planned MOBA experience.

## Scope
- Pure serializable match state and server-owned entity state.
- Configurable 1–5 slots per team (default 5v5).
- Movement bounds and per-tick movement limits.
- Basic attack and a starter targeted ability with range/cooldown checks.
- Tower-protected core, death/respawn, match-win state and controller labels for future AI backfill.
- No Three.js, browser globals, network, database, wallet or production experience-registry wiring.

## Run the focused test
From the repository root with Node 22+:

```sh
node client/moba/rules-core.test.mjs
```

This test is not added to the root `npm test` script in this first isolated PR, to avoid overlapping the existing package/test changes in other open work. Wire it in after Hark reviews the integration boundary.

## Open-source integration approach
This first pass does not copy third-party game code. It adopts a small dependency-free module boundary so future integration can selectively reuse MIT-licensed Three.js rendering and permissively licensed navigation/AI utilities after license and compatibility review. Keep the canonical match simulation independent from rendering and camera code.

## Important limitations
This is a starter rules core, not a playable MOBA yet. It has no minions, pathfinding, fog of war, collision, ability catalog, server process, authentication, matchmaking, bot decision engine, camera UI, ranked rating, persistence or XRP settlement. Do not expose it to public clients as authoritative until server validation, input-rate limits and protocol/auth integration are implemented and tested.
