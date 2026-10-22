# CinderWilds navigation runtime benchmark

Run the automated report with:

```sh
node client/js/run-wilds-navigation-benchmark.mjs
```

Run the regression test with:

```sh
node client/js/wilds-navigation-benchmark.test.mjs
```

The benchmark warms up each scenario, runs multiple measured iterations, and reports minimum, mean, median (p50), p95, and maximum elapsed milliseconds; processed requests per second; validation samples; scenario configuration; and Node runtime/platform metadata.

Default scenarios are light, medium, and heavy synthetic workloads with different request arrival rates and route lengths. Results are specific to the machine, Node version, process load, and configuration. Repeat runs before comparing changes.

## What these numbers mean

This measures wall-clock time for the renderer-free synthetic JavaScript harness and route validator in the current Node process. It does **not** measure the full BURN City game, browser frame time, actual terrain queries, authoritative multiplayer server load, network latency, real creature behavior, or concurrent-player capacity. The synthetic planner constructs simple routes and must not be mistaken for production pathfinding.

Use the results to catch obvious regressions and compare harness changes on the same machine. For production budgets, profile real server code and real world-query callbacks under representative workloads, and report p50/p95 alongside CPU/memory and queue pressure.
