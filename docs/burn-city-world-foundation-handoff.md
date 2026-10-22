# BURN City World Foundation — Hark Handoff

**Status:** Architecture and implementation plan only. This document does not introduce gameplay code or change runtime behavior.

**Purpose:** Establish a safe order for turning BURN City into a coherent persistent multiplayer world while preserving existing game modes, mobile performance, and parallel AI development.

## Read this first

- Follow the repository's existing `HANDOFF.md`; it remains the primary project/run/deploy guide.
- Work on one feature branch per task and submit a draft PR to `main`. Do not merge or deploy without the owner's approval.
- Do not overwrite another agent's branch or fold in unreviewed work. Inspect open PRs before editing shared files.
- Prefer small, reversible changes and the existing Node.js / browser JavaScript stack. Do not add dependencies just to solve a problem that native APIs or existing modules can handle.
- Never commit credentials, tokens, wallet seeds, private allowlists, production data, or contents from the Fly volume `/data`.
- Treat the proposed architecture below as direction, not permission to rewrite existing systems. First map current behavior and contracts; preserve compatibility unless a change is explicitly reviewed.

## Current technical baseline (verified from repository files)

- Runtime is Node.js `>=22.13`; `npm start` runs `server/server.js`.
- The server hosts the static client and HTTP APIs and uses WebSockets for existing game rooms.
- The server currently initializes shared room collections for the existing `tron` and `zombie` modes. The city, fishing, shop, economy, and Blacktide systems are separated into server modules.
- Persistent saves, leaderboards, and discovered-pool data are described in `HANDOFF.md` as residing on the Fly volume under `/data`, not in Git.
- The repo already has a broad Node-based test suite in `package.json`, including fishing, Wilds navigation/AI, Blacktide, graphics presets, arena and economy simulations.
- Deployment is automatic from `main` according to `HANDOFF.md`. A merge is therefore a live-deployment decision, not just a code-review action.

Useful references:
- `HANDOFF.md` — required operational and collaboration rules.
- `package.json` — current test scripts and runtime version.
- `server/server.js` — HTTP/WebSocket entry point and room selection.
- `server/game.js` and the other existing server modules — inspect the current contracts before proposing new ones.

## Parallel work currently awaiting review

The following PRs were visible during preparation of this document. Recheck their live status before relying on this list; do not assume any are merged.

- [#127 — Separate Cinderwilds entry from the return-to-city trigger](https://github.com/Xrpassassin/burn-city/pull/127) — isolated gate-boundary fix; browser validation still required.
- [#126 — Add fog-of-exploration maps to the Cinderwilds](https://github.com/Xrpassassin/burn-city/pull/126) — client-side map and local-device exploration persistence; not server-synchronized.
- [#125 — Fix third-person camera zoom and view snapping](https://github.com/Xrpassassin/burn-city/pull/125) — Explore camera and touch pinch behavior.
- [#124 — Expand lake and build a tiered, landscaped Waterfront Estates district](https://github.com/Xrpassassin/burn-city/pull/124) — environmental scene additions.
- [#123 — Enlarge Wilds sign and plan shared airport traffic](https://github.com/Xrpassassin/burn-city/pull/123) — includes design notes; shared traffic is not implemented by that planning work.
- [#122 — Add airport banner aircraft (draft)](https://github.com/Xrpassassin/burn-city/pull/122) — deterministic client-side flight paths, not authoritative synchronized flight state.

These PRs are separate proposals. Do not cherry-pick or merge them into a foundation branch without owner approval and a deliberate integration review.

## Architecture direction

### 1. Define the world vocabulary before building more regions

Create a small, documented contract for:
- **Zone identity:** stable IDs, display names, zone type, and version.
- **Transitions:** source zone, destination zone, valid entry/exit point, spawn transform, and transition failure behavior.
- **Safety rules:** starter protection, safe zones, PvP frontier rules, and explicit zone-specific exceptions.
- **Player presence:** connected, loading, active in zone, transitioning, and disconnected/reconnecting.
- **World events:** stable event ID, server start/end times, affected zones, phase, and public state.

Do not immediately force all existing experiences into one abstraction. First document how city Explore, Cinderwilds, fishing, arena modes, dungeon, and Blacktide currently enter, persist, and synchronize state. Migrate one low-risk seam at a time.

### 2. Separate authoritative state from presentation

The server should own any state that must agree for multiple players or affect rewards, combat, safety, or progression. The client can predict and render visuals, but should not be the source of truth for shared outcomes.

| State category | Intended authority | Notes |
|---|---|---|
| Player position in a shared zone | Server-validated session/zone state | Start with bounds, rate limits, stale-session handling and basic validation; avoid a large physics rewrite. |
| Aircraft, traffic and world props that must match for all players | Server event/state with client interpolation | A deterministic local animation is a useful visual prototype, not multiplayer authority. |
| Fishing outcomes, inventory, currency and rewards | Server | Validate actions and award results server-side; client animation is cosmetic. |
| Zone transitions and PvP protection | Server | Do not trust a client-provided zone name or safe-zone flag. |
| Event phases and global event schedule | Server | All clients receive the same event ID, phase, timing and zone scope. |
| Camera, local graphics quality and map display | Client | Device-specific settings should not be needlessly synchronized. |
| Fog-of-exploration | Decide deliberately | Current proposal is local-device persistence; account-wide or shared exploration requires an explicit data and privacy decision. |

### 3. Use an incremental multiplayer contract

Before introducing a new message protocol, inspect the existing WebSocket envelopes, authentication/session flow, reconnect behavior, room lifecycle and rate limits. Reuse compatible existing conventions when practical.

A future world-state message should have, at minimum:
- a message type and schema version;
- a stable zone ID and server sequence/timestamp;
- validated entity or event IDs;
- bounded payload size and update frequency;
- explicit handling for unknown types and stale updates.

Do not broadcast the entire world on every frame. Send compact changes/snapshots at controlled rates, interpolate cosmetic motion on clients, and avoid sending data a client does not need. Add metrics before tuning rates.

### 4. Make persistence and reconnect behavior explicit

Before adding persistent world state, document:
- which data is ephemeral, session-persistent, account-persistent, or global;
- the authoritative storage location and schema/version;
- migration and rollback behavior;
- what happens if a player reconnects during a transition or event;
- what happens if a server restarts mid-event.

Do not write new data to `/data` without a migration/rollback note. Never put secrets or production save contents into Git.

### 5. Prepare world events without building the alien invasion yet

A future event framework should support:
1. server-scheduled event creation;
2. a shared event ID and synchronized phase transitions;
3. zone-scoped effects and entity spawns;
4. client notifications and visual/audio presentation;
5. late-join synchronization;
6. clean completion, reward validation, cleanup and restart recovery.

The first test event should be harmless and temporary—for example, a weather/sky announcement or a short-lived landmark signal. Only after that contract survives reconnects and multiple clients should it support combat, map changes, or an alien invasion. Do not add an event framework that runs parallel to an existing system without a clear owner and integration plan.

## Recommended implementation sequence

### Phase 0 — Inventory and baseline (no runtime changes)
- Read `HANDOFF.md`, inspect open PRs and map the existing client/server message paths.
- Record which features are single-player/client-only versus server-backed.
- Run the narrow existing tests relevant to the touched modules; record failures before making changes.
- Identify the smallest integration point and the files Hark is actively changing before selecting a branch.

**Exit condition:** a short architecture map, a baseline test record, and a clear list of files/contracts that must not be disturbed.

### Phase 1 — World/zone contract (documentation plus tests)
- Define stable zone IDs and transition lifecycle semantics.
- Add tests around the contract without changing every existing zone at once.
- Make entry, return, failed load, and reconnect paths explicit.

**Exit condition:** transition tests cover valid travel, invalid destinations, duplicate requests, disconnect during transition, and safe-zone boundary cases.

### Phase 2 — One server-authoritative shared entity
- Choose a low-risk proof of concept, likely an aircraft/banner or ambient traffic object, after reviewing the current airport code and PR #122.
- Server publishes a compact timestamped state; clients interpolate it.
- Test two clients for matching entity identity and bounded position divergence, including late join and reconnect.
- Keep existing client-only presentation as a fallback until the authoritative version is proven.

**Exit condition:** two clients observe the same entity state from the server; reconnecting clients recover the current state without spawning duplicates.

### Phase 3 — Zone-scoped event prototype
- Implement a temporary, non-combat event only after the shared-state proof of concept.
- Include schedule, phase, zone scope, late-join snapshot and cleanup.
- Measure payload size, update rate and mobile frame impact.

**Exit condition:** all connected clients agree on the event phase; a late joiner receives current state; completion/restart leaves no stale event entities.

### Phase 4 — Progression and large-scale content
Only after the preceding phases are stable should the team connect broader systems such as shared exploration, player-owned housing, persistent regional activity, alien invasion, or cross-zone PvP.

## Definition of done for every PR

- [ ] One feature branch; no commits to `main` and no merge/deploy without approval.
- [ ] Existing contracts inspected; no accidental overlap with another active branch.
- [ ] Tests added or updated for new behavior.
- [ ] Relevant `node --check` and focused `npm` tests pass.
- [ ] Desktop and mobile smoke checks documented when the feature affects the client.
- [ ] Server-authoritative validation included for rewards, safety, and shared state.
- [ ] Performance, reconnect, late-join, and failure behavior considered where relevant.
- [ ] New dependencies justified and license/source recorded.
- [ ] Rollback and persistence implications documented.
- [ ] PR description clearly distinguishes implemented, tested, and untested behavior.

## Immediate next task for Hark

**Do not start by rewriting networking.** Finish the currently active task, then perform Phase 0 as a read-only audit. Return:
1. a diagram or concise map of existing client-to-server flows;
2. a list of files/modules that own sessions, room state, zone transitions, persistence, and broadcasts;
3. the exact existing message shapes suitable for reuse;
4. current test commands and any baseline failures;
5. one proposed, minimal shared-entity proof of concept with an isolated file list.

Review that audit before authorizing implementation. The goal is to create a stable seam for the next feature—not to destabilize the live game with a broad architecture rewrite.
