# CinderWilds deterministic navigation load harness

Run with:

```sh
node client/js/wilds-navigation-load-test.test.mjs
```

`runNavigationLoadTest` simulates a configurable number of logical ticks, a fixed number of incoming replan requests per tick, a bounded FIFO queue, and a per-tick worker budget. The supplied planner is invoked only through the existing isolated simulation pipeline; returned routes are validated using caller-provided obstacle and playable-area callbacks.

## Reported metrics

- Offered, accepted, duplicate-rejected, and capacity-rejected requests.
- Processed requests, validated and invalid routes, and planner errors.
- Queue peak, remaining queue depth, and oldest observed queue age in logical ticks.
- Number of route-validation samples.
- Deterministic estimated cost units (not elapsed time or CPU utilization).

## Interpretation

If arrivals exceed processing capacity for sustained periods, the bounded queue eventually fills and new requests are rejected rather than allowing unbounded memory growth. Increase ticks and arrivals to explore that behavior, or vary worker budget and queue capacity to compare scenarios.

This harness is deterministic only when supplied callbacks are deterministic. It does not model networking, actual entity AI, parallelism, rendering, frame time, garbage collection, terrain height, agent radius, or full collision volumes. The request budget limits count, not the duration of one planning call. Use runtime profiling and server-side load tests before choosing production budgets.

No live creature movement or production networking is changed by this harness.
