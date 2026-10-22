# Cinderwilds + Eternal Grind: Architecture and Open-Source Integration Plan

**Status:** Planning/documentation PR. No runtime code or dependencies are changed here.
**Goal:** Expand both experiences without replacing their existing foundations or destabilizing the live game.

## Guardrails

- Follow the repository's root `HANDOFF.md`. One feature branch per task; draft PRs only; no merge or deployment without owner approval.
- Inspect Hark's active work and all relevant open PRs before touching overlapping files.
- Preserve current vanilla/browser JavaScript and Three.js architecture. No framework migration.
- Do not add a package until a focused prototype demonstrates a concrete improvement and its license, maintenance, bundle cost, and mobile performance are reviewed.
- Keep new world data deterministic where possible. The same seed and content version should generate the same layout/spawn set.
- Keep authoritative rewards, combat results, inventory, safety rules, and any future shared-world events on the server if/when those features become multiplayer. Client-only progression must remain clearly labeled as local until migrated.
- Every lazy-loaded world must have a reliable teardown path: remove scene objects/colliders, dispose GPU resources and audio, cancel pending work, and avoid duplicate listeners or stale state.

## Current architecture observed in the repository

### Cinderwilds

- `client/js/wilds-gate.js` is the small always-loaded entrance/transition layer. It owns city hooks and lazily loads the forest.
- `client/js/wilds.js` owns the main forest gameplay: creature encounters, companion, quests, HUD, audio, graphics/atmosphere presets and world geometry.
- `client/js/wilds-deep.js` builds Glassroot Grove as a separate realm and reuses the main forest gameplay via a zone API.
- `client/js/wilds-deep-data.js` owns deep-zone content data.
- Navigation is already decomposed into world pathfinding, route validation, smoothing, waypoint following, route invalidation, replanning, worker and simulation/test modules.
- `client/js/wilds-yuka-ai.mjs` already adapts Yuka for creature wandering. Do not add a second AI framework without evidence.
- `client/js/wilds-map.js` and its associated docs describe a client-side exploration map with local-device progress. It is not a server-synchronized account map.
- The current approach includes lazy loading, seeded procedural placement, instancing/chunking, graphics presets, and explicit test hooks. Improve these seams rather than replacing them.

### Eternal Grind

- `client/dungeon/index.html` is the main first-person RPG experience and imports the locally hosted Three.js module from `client/vendor/three/`.
- `client/dungeon/data.js` contains a large data-driven roster of enemies and gear definitions.
- The game already has a character/save flow, import/export, equipment slots, progression systems, mobile controls and separate progression/migration tests.
- `npm run test:eternal-grind` runs progression-core and character-save/migration tests.
- Do not assume that Eternal Grind shares the Cinderwilds save format, world simulation or network contract. Design explicit adapters if future cross-mode progression is approved.

### Existing test entry points

- `npm run test:wilds` — navigation, Yuka adapter, ambient spawns and navmesh adapter.
- `npm run test:wilds-route-validation` — route validation and navigation simulation.
- `npm run test:wilds-navigation-benchmark` is represented in package scripts by `node client/js/wilds-navigation-benchmark.test.mjs`; use the repository's actual scripts as written and record benchmark output rather than assuming performance.
- `npm run test:eternal-grind` — progression and save/migration coverage.
- `npm test` — broad test chain; run it when feasible, and separately run focused suites for the touched systems.

## Shared architecture principles

### 1. Share contracts, not entire game implementations

Both worlds can use compatible definitions for:
- stable zone/content IDs and schema versions;
- entity IDs and data-driven creature/enemy definitions;
- interaction prompts and action results;
- event/quest objective vocabulary;
- item/reward definitions where deliberate cross-mode use is desired;
- save migration/version metadata;
- diagnostics and test fixtures.

Do not force both games into a single entity-component system, combat loop, renderer, save schema or network protocol. Cinderwilds is an exploratory real-time world with creature encounters; Eternal Grind is a first-person dungeon RPG with its own movement, combat and character progression.

### 2. Treat content as versioned data

A zone/level definition should eventually describe:
- `id`, `version`, display name and biome/theme;
- deterministic seed policy;
- boundaries, spawn anchors, exits and safe/hostile regions;
- landmarks, encounter tables, resource nodes and quest hooks;
- quality-tier limits for geometry, effects, active AI and draw distance;
- compatibility/migration behavior if content IDs or save-referenced entities change.

Keep data separate from rendering and behavior code. Validate definitions at load time, fail closed for malformed destinations, and make unknown optional fields harmless.

### 3. Standardize lifecycle and observability

For each zone or dungeon floor, document explicit states: `unloaded -> loading -> active -> leaving -> disposed`, with failure/retry paths. Async generation must be cancellable or ignored if its owner has already left. Repeated enter/exit cycles must not accumulate colliders, event handlers, audio nodes, meshes or timers.

Add debug counters for active entities, colliders, draw calls/triangles when available, route requests, active AI agents, load time and teardown time. Use measured mobile budgets rather than arbitrary global increases.

## Cinderwilds roadmap

### CW-1: Zone contract and transition hardening

- Formalize Fernway Verge and Glassroot Grove as data-described zones without rewriting their existing geometry.
- Specify entry/exit spawn transforms, return trigger bounds, travel-lock behavior, failure state and reconnect/teleport edge cases.
- Add repeatable tests for load/unload/load, entering at the gate without immediately exiting, crossing the Glassroot threshold, and leaving during asynchronous loading.
- Keep zone transitions and map discovery distinct: opening the map must not change gameplay position or accidentally fire a gate.

**Acceptance:** repeated transitions leave no duplicate colliders/listeners/audio; all boundaries and return prompts behave predictably in automated tests and manual desktop/mobile smoke checks.

### CW-2: Navigation and creature AI

- Extend the existing Yuka adapter and custom route pipeline rather than introducing another agent system.
- Separate behavior intent (wander, forage, flee, investigate, defend, pursue) from route execution and visual animation.
- Use distance-based AI tiers: full perception/pathfinding nearby, simplified steering at medium range, dormant/seeded respawn far away.
- Stagger AI and route-replanning work across frames; cap concurrent path requests and keep existing worker/replan queues observable.
- Add deterministic scenario tests: obstacle avoidance, unreachable destinations, route invalidation, player pursuit, flee radius, creature crowding and zone teardown.
- Preserve creature-specific ecology. Rillfin should favor water, small creatures should avoid stronger predators, and hostile species should have readable aggro boundaries rather than universal chase behavior.

**Acceptance:** no unbounded replan queue; no creature escapes zone bounds; navigation tests and load tests pass; mobile frame-time impact is measured.

### CW-3: World streaming and exploration

- Retain lazy loading; only create geometry, audio and high-cost agents near the active zone.
- Treat 80 m chunks / current culling values as tunable starting points, not immutable constants.
- Make landmarks and trail data the source of truth for the map. Keep the map schematic until grounded to actual zone coordinates and landmark definitions.
- Decide separately whether exploration is local-only, account-persistent or multiplayer-shared. Do not imply localStorage progress syncs across devices.
- Prototype terrain-generation libraries in a disposable branch or benchmark page; do not replace current handcrafted paths, creeks or colliders until seams and mobile costs are proven.

**Acceptance:** returning to a zone restores the intended local state without duplicate resources; map markers match real world landmarks; low/medium/high graphics tiers stay within agreed budgets.

## Eternal Grind roadmap

### EG-1: Character and content data contracts

- Document the current character schema, progression calculation, item/equipment IDs and migration flow before adding fields.
- Keep enemy definitions, loot tables, abilities, floors, room tags and encounter composition in validated data modules where possible.
- Add stable IDs and schema versions; do not rely on display names or array positions as permanent identifiers.
- Preserve import/export compatibility and migration previews. Add tests before changing save structures.
- Define an explicit future integration boundary for any BURN City-wide account/progression, rather than silently coupling localStorage saves to server sessions.

**Acceptance:** old save fixtures migrate deterministically; invalid or oversized imports fail safely; character and item IDs remain stable.

### EG-2: Dungeon floor generation prototype

- Start with a seeded, offline layout generator that emits a simple graph/grid representation, not Three.js meshes.
- Validate room connectivity, start-to-exit reachability, minimum combat space, no blocked spawn points, and placement rules for doors/traps/loot.
- Convert the validated layout into existing floor geometry through an adapter. Keep handcrafted floors available as authored set pieces.
- Use fixed seeds for regression tests and allow curated seeds for boss floors and story moments.
- Do not change live character saves or progression as part of the first generation experiment.

**Acceptance:** same seed + generator version yields the same topology; every generated floor has a valid route to its exit; generation has bounded time/memory and a clear fallback floor.

### EG-3: Enemy behavior and encounter pacing

- First extract and test the existing enemy update/combat rules before adopting a behavior-tree library.
- Introduce readable archetype behaviors (stalker, ranged, guard, pack hunter, support caster, boss phase controller) as small composable policies.
- Separate decision-making from damage calculation, cooldowns, hit detection and animation.
- Use behavior trees only if the prototype improves authoring/debugging over the existing state logic. Do not run one tree per inactive/distant enemy unnecessarily.
- Build encounters around telegraphed attacks, counterplay, room geometry and mobile-readable effects; avoid adding particle effects without a quality-tier cap.

**Acceptance:** combat simulations cover aggro, leash, target switching, cooldowns, crowding, death/drop behavior and boss phase transitions; no behavior can award duplicate loot or bypass save validation.

## Open-source candidates and decision status

### Yuka — reuse the integration already present

- Source: https://github.com/Mugen87/yuka
- License reported by project: MIT.
- Current repo evidence: `client/js/wilds-yuka-ai.mjs` and `test:wilds-yuka` already exist.
- Decision: **extend existing adapter first**. Before using it in Eternal Grind, inspect its bundled/import strategy and license notice; avoid loading a second copy if the existing browser vendor/import arrangement can be reused safely.
- Best use: steering, perception and navigation support for Cinderwilds creatures. It is not a replacement for server-authoritative combat or a complete game AI design.

### THREE.Terrain — evaluate, do not replace existing terrain yet

- Source: https://github.com/IceCreamYou/THREE.Terrain
- License reported by project: MIT.
- Best use: isolated experiments for elevation/heightmaps, terrain scattering and procedural terrain functions.
- Risks: Cinderwilds already has custom ground, trails, water, collider sampling and instanced vegetation; adding a generated heightfield can desynchronize walking ground, colliders, creek meshes and map geometry. Test those integration seams and phone GPU/memory use first.

### Dungeon Forge — prototype the algorithm boundary

- Source: https://github.com/Hatsume0202/dungeon-forge
- Project describes itself as a TypeScript procedural dungeon generator using BSP, cellular automata, drunkard's walk and room placement; repository reports MIT licensing.
- Best use: compare output quality and connectivity against a tiny in-house seeded generator in a throwaway prototype.
- Risks: maturity and compatibility need review; it is a 2D layout generator, not a 3D dungeon engine, combat system or room-art library. Do not add it as a production dependency until outputs are validated and package/version/license details are confirmed.

### Behavior3JS — conditional candidate for Eternal Grind

- Source: https://github.com/behavior3/behavior3js
- License reported by project: MIT.
- Best use: authoring and debugging structured behavior trees if the current enemy logic becomes difficult to extend.
- Risks: adds a second AI abstraction while Cinderwilds already uses Yuka and custom navigation. First measure whether Eternal Grind actually needs a behavior tree; do not couple the two AI stacks just for consistency.

### Asset libraries

For future art/audio, prefer CC0 or clearly permissive assets with recorded attribution/license and source. Keep asset licenses in a project manifest; do not assume that an open-source code license also covers art, music, textures, model files or demo content.

## Recommended order of work

1. **Read-only audit:** inspect Hark's active changes, open PRs, existing save schemas, transition hooks and enemy loops.
2. **Cinderwilds lifecycle tests:** strengthen transition and disposal tests before new zone content.
3. **Eternal Grind schema safety:** add tests and documentation around existing character/content IDs; no save rewrite.
4. **Seeded dungeon-generation spike:** isolated generator output plus reachability tests, with no production dependency at first.
5. **AI comparison spike:** compare existing state logic, Yuka adapter reuse and Behavior3JS only against a concrete behavior scenario.
6. **Integrate one proven improvement at a time** behind an adapter, feature flag or reversible PR.

## Definition of done

- Focused tests and relevant broad tests pass, or pre-existing failures are documented.
- Desktop and mobile smoke checks are recorded for rendering/input changes.
- Load/unload/reload, stale async work, reconnect/late-join (where applicable), and cleanup are tested.
- Performance is measured on representative low-tier devices.
- Dependencies and assets have license/source notes.
- Save/persistence impact and rollback are documented.
- Implemented behavior is clearly distinguished from plans and untested assumptions.
