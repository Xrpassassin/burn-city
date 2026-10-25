# Estates Island — on-demand instance foundation

## Decision
Estates is a physical island/entrance in the BURN City overworld, but its detailed environment is a separate runtime instance loaded only after the player explicitly confirms entry. The default target is a **shared social instance**, not a fresh private copy for every visitor. Player-owned lots remain individually owned and persisted inside that shared world.

## Exterior presentation and entry boundary

The live city view should show a compact scenic island silhouette with a visible water ring and a few recognizable rooflines. The detailed neighborhood—full roads, all lot anchors, landmarks, vegetation, and building blockouts—is revealed only after the player explicitly selects **Enter Estates Island**. The bridge and gate remain visible from the city side, and canceling or walking away must not enter the community.

The current client integration implements this as a presentation boundary: a lightweight exterior preview is shown before entry and the detailed community is revealed after confirmation. The server now manages shared logical instance leases and relays lease-authorized peer presence. The full island renderer is still a local client scene, not a server-hosted simulation. Authenticated return anchors now persist in SQLite and are restored only when the local navigation geometry marks the saved point walkable; property/build saves remain future work.

## Lifecycle
1. The city renderer shows the island landmark and bridge/entrance. A proximity trigger offers an interaction prompt; proximity alone never teleports or loads the destination.
2. The player confirms. The server issues a short-lived lease for this public destination; private lot and build actions still require their own authenticated server-side rights checks.
3. The destination adapter acquires a lease for a stable instance key (initially `estates-island`). Concurrent arrivals for the same key await one creation and join the same instance.
4. The scene loads the island, lake, roads, bridges, dock, lots, and saved property layouts. The instance key is a runtime identity, not an ownership identifier.
5. On exit/disconnect, release the player's lease. When the last lease leaves, start an idle grace period. A new arrival cancels that timer and reuses the live instance.
6. After the idle grace period, dispose the runtime instance. Save persistent world/property changes before disposal; do not store durable data only in scene memory.
7. If creation or transition fails, leave the player at the city entrance and allow a retry. A failed transition must not duplicate inventory, property ownership, or rewards.

## Code seam in this PR
- `client/js/experience-instance-pool.mjs` provides a dependency-injected shared-instance lifecycle primitive: single-flight creation per key, lease tracking, idle reuse, safe disposal, and state callbacks.
- `client/js/experience-instance-pool.test.mjs` covers concurrent arrivals, shared identity, idempotent release, idle timer cancellation, disposal, independent shard keys, and creation retry after failure.
- This module does not create the 3D scene, authenticate players, save property state, or deploy a server. Hark should connect the lifecycle primitive to the actual destination adapter only after the server-side identity and access checks are in place.

## Live gate-to-server lease integration

The live city entrance now calls the server's public instance admission endpoints only after the player confirms entry:
- `POST /api/estates/instance/enter` accepts a per-tab opaque client session identifier and returns a server-generated lease token, an ephemeral shared logical instance ID, and an active lease count.
- `POST /api/estates/instance/heartbeat` renews an active lease; the browser sends it every 25 seconds and the server expires stale leases after 90 seconds without a heartbeat.
- `POST /api/estates/instance/leave` releases that lease. Repeated entry for the same session is idempotent; repeated release is safe. The client rotates its session key after exit to avoid a rapid re-entry/release race.
- The server keeps one `estates-island` logical instance generation while leases exist, reuses it during the idle grace period, then retires that generation after the last lease leaves.
- If admission fails, the player remains in BURN City and can retry. A late admission response is released if the live host is disposed before entry completes.

**Important boundary:** this implements server-side shared admission and lease lifecycle, not yet networked player presence/movement, server-authoritative collision/game simulation, or persistent property layout saves. The browser currently renders its local copy of the same deterministic island scene. The returned `activeVisitors` count is lease telemetry, not proof that other avatars are visible in the scene. Property ownership and build actions must continue to use their separate authenticated server checks.

## Shared peer presence relay

- `server/estates-presence.js` accepts WebSocket connections only when their short-lived lease token is still valid. Duplicate sockets for the same lease replace the previous connection.
- The server assigns peer IDs, returns a current peer snapshot, and broadcasts join, bounded position/heading updates, and leave events only to sockets in the same instance generation. Updates are rate-limited and movement deltas that exceed a generous speed envelope are ignored to reduce teleport/spoofing; this is not full collision or server-authoritative simulation.
- Position snapshots are rate-limited and clamped to the island's local coordinate envelope. The client interpolates remote capsule-style avatars toward received snapshots and closes presence when leaving or disposing the host.
- Client snapshots are presentation data only. They do not authorize property access, enforce world collision geometry, or drive authoritative gameplay. Lease expiry invalidates subsequent socket messages; client heartbeat continues separately.

## Durable return-anchor API

- `server/estates-return-anchor.js` stores one last-safe Estates Island position per authenticated XRPL account in the existing SQLite database on the persistent data volume.
- `GET /api/estates/anchor` reads the signed-in account's anchor; `POST /api/estates/anchor` saves bounded numeric `x/y/z/heading` coordinates. The account is taken from the bearer token, never from the request body.
- The store rejects malformed accounts, non-finite coordinates, and values outside a broad island-local envelope. It grants no property rights and cannot write building layouts.
- The live island client reads the anchor on re-entry and autosaves the last safe point every 15 seconds, plus on exit, for signed-in players. Unsigned players continue with the standard spawn and no durable account anchor.
- Before restoration, the client validates the stored point against the island navigation/collision surface. Server bounds are only a coarse input guard, not proof of walkability or authoritative movement validation.

## Persistent property-layout API

- `server/estates-layout-store.js` stores building placements in the same persistent SQLite database. Layout reads require an authenticated account with property access; writes and removals require the server-side `build` permission (owner-only under the current access policy).
- `GET /api/estates/layout?propertyId=...` loads a property's saved placements. `POST /api/estates/layout/place` validates and stores one placement. `POST /api/estates/layout/remove` removes a saved placement.
- The server derives lot positions, dimensions, and the existing house footprint from its catalog/scene slot contract; the browser cannot supply trusted lot bounds or existing placements. Placement validation snaps to the build grid, enforces quarter-turn rotations, rejects lot-boundary violations, and blocks overlap with the base building or saved placements.
- The store is durable across instance disposal/recreation and server restarts. This is the persistence/API foundation, not a finished construction UI: the live island client does not yet render saved placements or expose workshop placement controls. Resource costs are returned as metadata by the placement rules but are not charged/deducted by this slice. Property sales remain disabled, so private build writes remain unavailable until a property is actually owned.

## Remaining work

1. Server-authoritative movement/collision validation and robust reconnection/reconciliation.
2. Wire saved placements into the island renderer and workshop/build mode; reconcile build costs with an authoritative inventory/economy.
3. Integration of authenticated account identity and invite/owner checks for every private-property mutation.
4. Visual QA on desktop/mobile, including saved-anchor restore, two-client presence, reconnect, exit, and lease-expiry scenarios.

## Boundaries and security
- Never trust a client-supplied `playerId` as authentication. Pass the server-verified account/session identity to the lifecycle adapter.
- The client may request a transition, but the server decides whether it is allowed and which instance/shard it joins.
- Do not transfer or reset inventory as a side effect of loading the island. Keep the transition idempotent and give it a request/transition ID at the integration layer.
- Persist ownership, building placements, upgrades, decorations, and other durable state in the existing authoritative store. The instance pool is transient runtime state only.
- A future private-home interior can use a separate instance key per interior, without changing the public island model. Scale to multiple public shards only when capacity/load measurements justify it.
- Do not imply this pool is a production multiplayer server by itself; it is the lifecycle seam for an authoritative runtime adapter.

## Hark acceptance checklist
- [ ] City proximity shows an entry prompt but never auto-teleports.
- [ ] Canceling the prompt does not load Estates.
- [ ] Two authenticated players entering the same shard join one instance.
- [ ] Double taps and simultaneous entry requests do not create duplicate instances or leases.
- [ ] Return to City restores a safe spawn near the exact entrance and releases the lease once.
- [ ] Failed loading preserves the city session and supports retry.
- [ ] Property/building data survives instance disposal and recreation.
- [ ] Idle instance unloads only after the final lease is released and the grace period expires.
- [ ] Desktop and mobile browser smoke tests pass; no deployment is performed by this PR.

## Validation
Run `npm run test:experience-instance-pool` and `npm run test:experience-registry`. This PR's source-level tests are automated tests, not proof of a live multiplayer deployment. Browser, persistence integration, and load tests remain required.
