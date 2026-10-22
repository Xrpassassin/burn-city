# BURN City Open-Source Integration Audit

Status: research and integration plan only. No third-party gameplay source has been copied into BURN City by this audit.

## Goals

Find reusable, legally compatible building blocks that improve BURN City without replacing its existing architecture or destabilizing the city, Eternal Grind, CinderWilds, or Blacktide. Prefer small, isolated integrations over wholesale framework migrations.

## Existing architecture clues (verify against current checkout before implementation)

- The server starts with Node.js via `node server/server.js`; Docker installs production dependencies with `npm ci --omit=dev`.
- The client includes vendored Three.js r160 and is designed to run without a frontend build step.
- `client/js/wilds-rules.js` contains pure game rules and local-only browser saves (currently not authoritative or tradeable).
- City visuals already use `THREE.InstancedMesh` in `client/js/streetprops.js` and `client/js/citylife.js`.
- Blacktide is a separate Three.js region; keep its module isolated and preserve existing entry points.
- Deployment is sensitive to dependency changes: modifying `package.json`/lockfile requires a Docker image rebuild/deploy, not merely a machine restart.

These observations came from the repository's indexed source and handoff notes; verify current `main` before touching implementation files.

## Candidate shortlist

### 1. Three.js Pathfinding — first small technical spike

- Repository: https://github.com/donmccurdy/three-pathfinding
- License: MIT (confirmed in repository README/package metadata).
- Purpose: navigation-mesh path queries, multiple navmesh zones, and movement-vector clamping.
- BURN City fit: NPC walking and pursuit in CinderWilds, dungeons, settlements, and future Blacktide ports.
- Risks: requires authored/baked navmeshes; it is not a complete NPC AI system. Confirm compatibility with the project's vendored Three.js r160 and current browser module setup.
- Proposed trial: create a tiny isolated demo or test harness; do not alter live movement until path queries and mobile performance are validated.
- Source: https://github.com/donmccurdy/three-pathfinding/blob/master/README.md

### 2. Colyseus — multiplayer architecture evaluation

- Repository: https://github.com/colyseus/colyseus
- License: MIT (confirmed in repository README and LICENSE).
- Purpose: Node.js authoritative rooms, state synchronization, room matchmaking, and reconnect support.
- BURN City fit: server-validated movement/combat, zone sessions, pirate ship encounters, and synchronized world actors.
- Risks: this is an architectural choice, not a drop-in library. Current server routes, WebSocket use, persistence, authentication, and Fly.io process model must be mapped first. Do not run two competing authorities for the same state.
- Proposed trial: document existing real-time protocols and implement a disposable proof-of-concept room on a branch before any production migration.
- Source: https://github.com/colyseus/colyseus

### 3. The 5th Continent / Orion 3D Games — RPG design reference only for now

- Repository found: https://github.com/vrambaud/orion3Dgames-t5c
- Potentially relevant systems described by the project: RPG progression, inventory/equipment, enemies, loot, quests, vendors, abilities, persistence, and map transitions.
- License: NOT VERIFIED in this audit. Do not copy code or assets until the repository's applicable license and each dependency/asset license are confirmed. Repository existence or public visibility alone is not permission to reuse.
- Technical concern: it appears to use a different stack/version; importing the full game is not recommended.
- Proposed use: study architecture and feature boundaries, then implement compatible small modules in BURN City if useful.

### 4. Official Three.js InstancedMesh — use what we already have

- Documentation: https://threejs.org/docs/pages/InstancedMesh.html
- Existing project files already use InstancedMesh for repeated props and city-life objects.
- Recommendation: do not add a dependency. Audit forest and region modules for repeated trees, foliage, rocks, debris, and other repeated geometry. Measure draw calls and frame time before/after. Respect mobile quality tiers and frustum culling.

## Priority order

1. **Baseline and stability:** inspect current tests, module loading, mobile controls, memory, and frame time in the existing regions.
2. **Pathfinding spike:** evaluate three-pathfinding with a small NPC route on a separate branch.
3. **Shared RPG rules:** map current Wilds rules and saves; define reusable data contracts for XP, inventory, loot, quests, and enemy states without breaking old saves.
4. **Multiplayer audit:** map the existing WebSocket/server-authoritative model before deciding whether Colyseus fills a real gap.
5. **Asset/license audit:** inventory imported models, textures, sounds, fonts, and code. Record license, source URL, attribution, and redistribution conditions.

## Required checks before merging any reused code

- Pin the exact upstream version/commit and record source URL.
- Read the root license plus relevant subdirectory, asset, and dependency licenses.
- Preserve copyright notices and license text as required.
- Review package health, dependencies, security advisories, and browser/Node compatibility.
- Avoid importing proprietary game code, leaked code, ripped assets, or projects whose reuse rights are unclear.
- Add isolated tests and ensure existing money/security/game-rule suites still pass.
- Verify desktop and mobile behavior, then confirm deployment health and live route.
- Never put API keys, private tokens, or server secrets into the browser bundle or this document.

## Decision

First implementation candidate: **a contained Three.js pathfinding proof-of-concept**, after checking the current CinderWilds/Blacktide code and confirming that a navmesh is feasible. Keep Colyseus at the evaluation stage until the existing multiplayer architecture has been mapped. Do not copy The 5th Continent code until its license is verified.
