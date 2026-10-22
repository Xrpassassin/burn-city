# CinderWilds replan pipeline simulation

`simulateReplanPipeline` composes the bounded replan worker, sampled world-route validation, and retry-policy decisions in a deterministic, renderer-free harness.

## Planner contract

The supplied `planRoute(request)` returns a route result with `path: [{ x, z }, ...]` and optionally a nonnegative `costUnits`. The harness validates paths using caller-provided `isBlocked` and `isOutsidePlayableArea` callbacks. Validation fails closed on invalid route input, blocked/out-of-area samples, sample-budget exhaustion, or world-query errors.

## Metrics and retry state

Metrics include batch request count, validated/invalid route counts, planner errors, validation samples, and estimated cost units. Cost units are deterministic estimates supplied by the planner (or `estimateCostUnits`); they are explicitly not wall-clock performance measurements. Use separate profiling before setting a production CPU budget.

Each failed outcome includes a retry-policy decision and proposed `nextRetryState`. The harness does not persist that state, enqueue retries, or mutate entity state; the caller decides whether and when to apply it. A successful route resets the proposed attempt count.

## Limits

- This is a test harness, not live-game integration.
- Route validation samples points; it does not prove full collision-volume clearance, account for agent radius, terrain height, water depth, moving obstacles, or server authority by itself.
- The queue input is preserved and unprocessed requests are returned as `remaining`.
- Batch size bounds the number of planner calls, not individual planner duration.
- Do not apply a returned route until it has passed the authoritative movement/collision checks appropriate to the live game.
