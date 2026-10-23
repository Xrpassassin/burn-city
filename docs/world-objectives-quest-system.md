# BURN City World Objectives — isolated integration slice

## Goal
Provide a small, testable objective engine for daily world activities without changing the active city/arena runtime or any existing character/save format. This is a foundation for a later UI and event-adapter integration, not yet a player-visible feature.

## Included
- Deterministic daily objective rotation from a UTC date and optional numeric seed.
- Four objectives selected from exploration, fishing, zombie combat, social interaction, and zone discovery.
- Immutable progress updates from explicit gameplay events.
- Completion state and declarative reputation reward metadata. This core does not grant reputation, XP, items, coins, or other actual rewards.
- Distinct-zone tracking prevents repeatedly crossing the same zone boundary to farm a discovery objective.
- Versioned in-memory board model, summary helper, and Node assertion tests.
- The focused test is included in npm test.

## Deliberately not included
- No app.js, fishing, arena, Cinderwilds, dungeon, server, WebSocket, UI, service-worker, or runtime event changes.
- No writes to localStorage, sessionStorage, player records, or /data; no migration and no existing save-schema change.
- No client-trusted reward grants or claims of multiplayer synchronization.
- No third-party dependency; no Unity/Unreal quest framework copied into this Three.js/vanilla-JS runtime.

## Event contract
Supported events: discover, fish-catch, zombie-kill, interact, and visit-zone. An adapter must only emit events after the corresponding action has actually succeeded. For visit-zone, supply a stable zoneId; repeated visits to the same ID count once per board. Event progress is local/in-memory until a separate persistence/server-authority design is reviewed.

## Hark review checklist
1. Confirm the objective taxonomy maps cleanly to current fishing, zombie, city interaction and Cinderwilds events.
2. Confirm UTC daily rotation is the desired reset boundary; no timer or background reset is implemented.
3. Decide reward semantics and authority before wiring reward metadata to gameplay.
4. Review whether progress should be account-wide, character-specific, or per experience before choosing persistence.
5. Approve a follow-up integration plan before connecting UI or gameplay events.

## Validation
Run npm run test:world-objectives and npm test. Tests have not been run in this authoring session because a local repository checkout/runtime was unavailable. Browser, mobile, multiplayer, and save compatibility checks remain pending.
