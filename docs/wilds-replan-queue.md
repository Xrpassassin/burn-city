# CinderWilds bounded replan queue

This is an isolated deterministic utility for future navigation callers. It prevents duplicate pending requests for the same entity, caps total queued requests, and caps the number removed for processing in one tick.

## API

- `enqueueReplan(queue, request, { maxQueueLength })` returns a new queue plus `accepted` and a reason. Existing queued requests are never mutated. Duplicate entity IDs are rejected rather than reordered or silently overwritten.
- `drainReplanQueue(queue, { maxRequests })` returns a FIFO batch and a remaining queue. A zero budget drains nothing.
- A request requires a non-empty `entityId`, non-empty `reason`, and finite `requestedAtMs`.

## Guardrails

- No timers, promises, global state, entity objects, pathfinding, or movement.
- Defaults are 128 pending requests and 8 requests per drain.
- Callers must decide when requests are eligible, apply cooldown/retry policy, execute route searches, and re-enqueue failures.
- Queue limits bound request count, not the cost of each route search. Measure route-planning cost separately before production integration.
- This utility is not wired into live NPC movement and does not by itself make navigation terrain-aware.
