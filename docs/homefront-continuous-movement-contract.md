# Homefront continuous movement: authoritative integration contract

Status: design gate; no live movement rules changed by this document.

## Verified current implementation
- `client/arena/homefront-graveyard-3d.js` converts WASD/joystick into destinations up to 10 units away, at most once every 950 ms while no move request is in flight.
- `server/homefront-world.js` rejects moves made within 900 ms of the previous accepted move; accepts destination-based movement with a 12-unit normal / 18-unit sprint cap, weapon-specific aiming penalties, collision/pathfinding, survival cost, and party follower advancement.
- Therefore lowering only the client interval is not a safe continuous-movement fix.

## Proposed opt-in protocol (do not replace legacy movement in-place)
1. Add an explicit `/api/homefront/world/move-input` action alongside the existing destination endpoint. The server derives the authenticated account from the session, not the payload.
2. Payload: monotonic `sequence`, normalized `x/z` input components, `sprint` boolean, and optional camera heading. Reject nonfinite numbers, out-of-range vectors, replayed sequences, and invalid modes. Client timestamps never authorize travel.
3. Server stores a per-player last accepted input sequence and authoritative server time. Calculate displacement from *server elapsed time*, clamped to a short maximum tick; enforce speed, stamina, aiming, terrain, collision, interior barriers, and party leadership on every accepted step. No speed credit may accumulate during idle periods, network stalls, reconnects, or rejected actions.
4. Use a bounded input cadence (initial target 8-12 Hz) with a single in-flight request and coalescing, not one request per rendered frame. Return acknowledged sequence and authoritative position/velocity/mode. Preserve existing destination travel for legacy clients until feature-flagged rollout passes tests.
5. Client predicts only the local avatar/camera for responsiveness, maintains a bounded pending-input queue, and reconciles against acknowledged authoritative positions. Other players and loot always use server snapshots. Never predict loot, hits, inventory, rewards, or base access.
6. When input stops, browser loses focus, joystick cancels, the scene hides, or the connection drops, locally stop immediately and send a neutral input if connected. Server input expiration must independently stop motion.
7. Keep collision and pathfinding distinct: short input steps must not invoke long-distance destination pathfinding that steers the player without consent. Reject or slide against blocked surfaces; test doors, terrain, interiors, and destructible obstacles.
8. Rate-limit and instrument input endpoint per account; log rejections, reconciliation distances, latency, and CPU cost without leaking private wallet data.

## Required regression gates
- Sustained forward/diagonal walking across 30/60/120 FPS; analog speed and dead zone; camera rotation; run/aim transitions.
- Packet duplication, reordering, replay, 500ms-5s stalls, disconnected clients, tab blur, rapid key release; no teleport or stored movement credit.
- Wall/corner/door/interior traversal, terrain bounds, destroyed obstacles, party leadership/followers, stamina drain, weapon recovery.
- Two-account isolation and forged payloads; legacy destination endpoint unchanged; reload/persistence and mobile multitouch.
- Compare gameplay feel against existing Zombies walking on desktop and physical mobile; collect movement error and server load metrics.

## Rollout
A. Implement isolated pure movement-step validation and deterministic server tests.
B. Add authenticated input endpoint behind an off-by-default feature flag.
C. Add client prediction/reconciliation behind the same negotiated capability.
D. Run focused and full Homefront suites, browser/mobile QA, and a two-account smoke test.
E. Obtain review before merge or deployment; never enable the flag automatically.
