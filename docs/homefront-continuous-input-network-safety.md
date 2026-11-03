# Homefront continuous walking: bounded network transport and fallback

Status: **opt-in preview only**. Production feature gate `HOMEFRONT_CONTINUOUS_MOVEMENT=1` is **not enabled** by this change; the 3D Graveyard client additionally requires `?movement=continuous`. Existing destination travel remains unchanged for normal players. Combat, inventory, XP, base access, rewards and multiplayer authority stay on the server.

## Problem

The Homefront controller already has a validated directional-input endpoint and bounded visual prediction, but the browser previously used unbounded `fetch()`. A stalled network request could leave the controller with `pending=true` indefinitely. Its avatar would quickly hit the prediction cap and stop, causing the exact frozen, unresponsive walking experience we want to eliminate. Additionally, when a delayed request failed, the retry timer used the *original send timestamp* instead of the current frame clock: a timeout could immediately resubmit even when the intended backoff had not elapsed.

## Changes

- New `client/arena/homefront-input-transport.mjs` is the sole direct movement HTTP transport. It uses AbortController and a default **1.8-second deadline** (configurable for test, 250–4000 ms). The request includes only the normalized player input packet and the existing user-provided authorization header; no private wallet data or signing material is exposed.
- URLs must be HTTPS, same-origin relative, or explicitly localhost/127.0.0.1 HTTP. Arbitrary insecure `?api=` targets are rejected rather than transmitting a bearer token.
- Explicit rejection of non-acknowledging or nonfinite server responses; precise `movement_network_timeout` error for timed-out requests. Server errors (e.g. `move_cooldown`) retain their existing semantics.
- The optional `createContinuousInput` controller now bases its backoff on the **latest rendered frame**, with capped exponential retries. Five consecutive network failures disable the preview for that page and return to legacy movement. Successful acknowledgements reset the failure streak. Prediction remains visually bounded and rolls back on failure.
- Tests cover a hung request, genuine AbortSignal, HTTP error, malformed acknowledgments, missing authentication, remote HTTP rejection, reordering/ack contract, delayed failure vs latest frame, bounded retries and failover. Existing movement and world authority tests remain active.

## Gameplay verification

1. Local opt-in: run a development server with `HOMEFRONT_CONTINUOUS_MOVEMENT=1` only in a disposable/sandbox environment, then open the Graveyard route with `?movement=continuous`. Do NOT toggle that production variable from this PR.
2. Test WASD/left virtual stick movement at 30/60/120 FPS, sprint/aim transitions, blocked interior doors and terrain, joystick release, tab blur, lost network, 2s stall and session reconnect.
3. Observe authoritative position reconciliation, client visual lead (max 1.5 units), retreat from temporary blocked moves, latency and CPU cost. Ensure other users' actors still come from snapshots and no loot/combat actions are client-authoritative.
4. Evaluate 2+ clients, one slow mobile connection and a touch device before any feature-flag rollout.

This is one safety and responsiveness improvement toward the requested open-world feel; it does **not** claim Homefront's overall movement has been visually tested or the production preview is ready to enable. Follow the existing continuous movement integration contract for additional rollout gates.

No third-party game code was imported. Skill Issue was reviewed as a curation and agent-workflow resource; dependency-free changes were implemented against the existing repo.
