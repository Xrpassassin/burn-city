# Estates Island — on-demand instance foundation

## Decision
Estates is a physical island/entrance in the BURN City overworld, but its detailed environment is a separate runtime instance loaded only after the player explicitly confirms entry. The default target is a **shared social instance**, not a fresh private copy for every visitor. Player-owned lots remain individually owned and persisted inside that shared world.

## Lifecycle
1. The city renderer shows the island landmark and bridge/entrance. A proximity trigger offers an interaction prompt; proximity alone never teleports or loads the destination.
2. The player confirms. The server validates the authenticated player, destination, access rules, and current world/session state.
3. The destination adapter acquires a lease for a stable instance key (initially `estates-island`). Concurrent arrivals for the same key await one creation and join the same instance.
4. The scene loads the island, lake, roads, bridges, dock, lots, and saved property layouts. The instance key is a runtime identity, not an ownership identifier.
5. On exit/disconnect, release the player's lease. When the last lease leaves, start an idle grace period. A new arrival cancels that timer and reuses the live instance.
6. After the idle grace period, dispose the runtime instance. Save persistent world/property changes before disposal; do not store durable data only in scene memory.
7. If creation or transition fails, leave the player at the city entrance and allow a retry. A failed transition must not duplicate inventory, property ownership, or rewards.

## Code seam in this PR
- `client/js/experience-instance-pool.mjs` provides a dependency-injected shared-instance lifecycle primitive: single-flight creation per key, lease tracking, idle reuse, safe disposal, and state callbacks.
- `client/js/experience-instance-pool.test.mjs` covers concurrent arrivals, shared identity, idempotent release, idle timer cancellation, disposal, independent shard keys, and creation retry after failure.
- This module does not create the 3D scene, authenticate players, save property state, or deploy a server. Hark should connect the lifecycle primitive to the actual destination adapter only after the server-side identity and access checks are in place.

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
