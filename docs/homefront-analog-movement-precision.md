# Homefront: preserve analog travel precision in direct walking

Status: **server-authoritative direct-input preview only**, still disabled in production unless explicitly configured through the existing `HOMEFRONT_CONTINUOUS_MOVEMENT=1` gate; Graveyard client also requires `?movement=continuous`.

## Why this matters

The pre-existing Homefront destination movement rounded each accepted move to a tenth of a world unit, appropriate for its coarse 900-ms path-based travel. The new 75–125ms direct-input protocol was sharing that same rounding. For example, a valid 20%-deflected joystick can request `0.2 × 8 units/sec × 0.1 seconds = 0.16 unit`. Rounding that to 0.1 or 0.2 *on every packet* distorts analog speed, causing perceptible stutter/step drift during ordinary exploration.

## Change

`server/homefront-world.js` now preserves full server-derived floating point coordinates for **only** the validated direct-input path. Legacy destination movement still rounds to 0.1 unit as before. No client-supplied position is accepted. The existing per-player monotonic sequence check, minimum input cadence, server-time capped displacement, velocity, terrain/interior collision, slide, stamina/aiming and party rules are unchanged. A stalled request still earns **zero movement credit**, with no replay loophole.

`test/homefront-analog-input-sim.js` invokes the real world state engine and validates repeated small analog movements, exactly bounded travel, sequence acknowledgements, cooldown, invalid vectors, stall behavior and persistability. The focused Homefront input workflow and complete Homefront suite include this regression.

## Not yet complete

Direct input remains an opt-in pilot, not production gameplay. Next steps: desktop and touch testing at different FPS, smooth/accurate camera and avatar facing, 2-player presence and server CPU/backpressure telemetry, collision near authored doors, then a gradual server rollout with quick rollback. These checks must precede enabling the feature by default. No new copied code from Skill Issue has been introduced.

Claude was asked independently to audit the public input and transport modules but its connected Free session is currently blocked by the displayed usage cap. No Claude code was used or claimed.
