# Estates island entry/exit adapter — Hark handoff

## What this adds
- A dependency-injected adapter for the city entrance prompt, authenticated entry, shared-instance lease, scene transition, exit, and disconnect cleanup.
- Proximity is prompt-only. The player must explicitly confirm before authentication/authorization, instance acquisition, or scene transition.
- Entry authorization happens before `instancePool.acquire`; do not trust a client-supplied player ID. `authenticatePlayer` must resolve the current trusted session, and `authorizeEntry` must check server-backed destination access.
- If scene loading fails after acquiring a lease, the adapter releases the lease and leaves the prompt available for a deliberate retry.
- Exit releases the lease and requests return to the city entrance anchor. Disconnect also releases the lease without trying to navigate a dead client.
- Callbacks are deliberately injected: this module does not pretend that a renderer, authenticated multiplayer server, city collision trigger, or server-side authorization endpoint already exists.

## Integration sequence
1. Place an Estates island landmark and entrance trigger in the BURN City scene.
2. On proximity, call `adapter.showPrompt({ returnTo: 'estates-island-entrance' })`; show an explicit **Enter Estates Island** confirmation and a Cancel action.
3. Only the confirm button should call the registry's `enter('estates-island', context)` or `adapter.confirmEntry(context)`. Never auto-enter from proximity.
4. Supply a trusted session resolver and server-backed authorization function. Keep the authenticated principal ID server-derived.
5. Implement `transitionToInstance` against the current renderer/router; it receives the shared instance lease's instance and the return anchor.
6. On exit, call `adapter.exit()`. On socket/session disconnect, call `adapter.disconnect()`.
7. Persist property ownership and building layouts separately from the transient shared scene. Instance unload must not erase saved property data.

## Test
Run `npm run test:estates-entry-adapter` and `npm run test:experience-registry`. These test lifecycle contracts with injected fakes; they are not browser, renderer, authorization-service, or multiplayer integration tests.
