# CinderWilds replan orchestrator

`coordinateRouteReplan` composes three isolated helpers:

1. `assessRouteFreshness` checks whether the world revision changed and samples the route only when needed.
2. `getReplanDecision` applies retry cooldown and attempt limits to invalid routes.
3. `enqueueReplan` adds an eligible request to the bounded FIFO queue while deduplicating entity IDs.

The returned object contains the freshness result, retry decision, next queue, whether this request was queued, and a queue/decision reason. A route that needs a replan is not necessarily queued: cooldown, attempt limits, a duplicate request, or a full queue can defer/reject it.

## Integration boundary

This remains a pure coordination helper. It does not execute pathfinding, update route state, record attempts, drain the queue, create world revisions, or move creatures. The caller must persist updated attempt metadata only when a route search actually starts, drain the queue under a per-tick budget, and handle rejected/deferred requests appropriately.

Callers must supply revisions tied to authoritative obstacle data. Revalidating sampled X/Z points is not full-volume collision proof; sample-limit and query failures fail closed and are eligible for a replan request.
