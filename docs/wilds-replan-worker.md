# CinderWilds bounded replan worker

`processReplanBatch(queue, { maxRequests, planRoute })` drains at most the configured FIFO batch and calls the supplied planner sequentially. It returns one outcome per attempted request plus the untouched remainder.

## Outcomes

- `completed`: planner returned a non-null result. This does not mean the result has been applied or independently validated.
- `no-route-result`: planner returned `null` or `undefined`.
- `planner-error`: the planner threw; the error is recorded for caller handling.

A zero request budget performs no planner calls. Invalid queue input, budget, or missing planner returns `null`.

## Safety and integration

- The worker does not move creatures, mutate the queue, change route state, or retry failed requests automatically.
- Each planner call is awaited before the next begins, preserving FIFO execution and preventing this worker from launching an unbounded burst of concurrent searches.
- The caller must validate planner results against authoritative world data before use, update attempt metadata only when a search starts, and decide whether failed requests should be re-enqueued.
- The budget bounds request count, not planner duration or per-search CPU cost. Add timing/instrumentation and an overall tick-time budget before production use.
- This is not wired into live gameplay.
