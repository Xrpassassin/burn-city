# Homefront direct walking preview (opt-in)

Default behavior: **unchanged**. Do not enable this preview on the production server until the server integration tests and desktop/mobile multiplayer smoke tests have passed. No live deposits, XRPL transactions, or Estates settings are involved.

## Activation (staged testing only)
1. The deployment owner must intentionally set `HOMEFRONT_CONTINUOUS_MOVEMENT=1` on the Homefront server (the default when absent is disabled). Do not change this environment variable from a client or a public URL.
2. An authenticated tester opens Homefront with URL query `?movement=continuous`. The client only starts direct input after a world GET advertises `inputProtocol.enabled=true` and the server-supplied next sequence. Use `&movement=continuous` if the URL already has a query string.
3. Without both gates, the existing destination-based walking behavior is retained. Disabling the server flag makes the new endpoint return 501; the client then falls back to legacy controls.

## Semantics
- Camera-relative WASD/joystick input is transmitted at most every 125ms, with one request in flight. The server bounds elapsed time and distance, applies terrain/building/door collision, rejects replayed sequences and validates the authenticated account.
- The local avatar and camera use **visual-only** prediction, capped at 1.5 world units ahead of the last authoritative position. The server response acknowledges sequence and position; local prediction corrects to it. Server state is authoritative for combat, stamina, loot, party, inventory and hit detection.
- A release/neutral packet is sent once after the player stops moving; the server never continues movement without accepted input. Loss of focus can stop local control without server-side drift.
- Ordinary destination travel and ground click-to-move are suppressed during this preview to prevent alternating between movement protocols.
- The full Three.js world update is throttled independently of movement packets to avoid expensive mesh rebuilds per input.

## Acceptance and rollback
- Run the dedicated Homefront input-step CI checks, full homefront-core workflow and relevant browser syntax tests.
- Manually verify desktop and physical-mobile controls (analog diagonals, two-finger look, tabs/backgrounding, sprint/aim, collisions, doors, follower parties), with two authenticated accounts. Verify no drift, no wall traversal and no resource rewards based solely on prediction.
- Exercise packet stalls, denied inputs, account reconnects and feature flag removal; ensure no speculative player position grants gameplay actions.
- If any issue appears, remove `HOMEFRONT_CONTINUOUS_MOVEMENT` or set it to a value other than `1`. The original movement endpoint remains unchanged.

## Known limitations
- This is a preview rather than a fully reconciled input replay system: client prediction smooths toward acknowledgements but does not replay a queue of unacknowledged frame inputs. Corrections may be visible at very high latency or near obstacles.
- The world action still clones/writes the Homefront world; measure request volume, simulation CPU and shared-store contention before raising the 8Hz per-account input budget.
- The shared UI and older destinations remain the default until direct walking is validated end-to-end.
