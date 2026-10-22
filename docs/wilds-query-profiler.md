# CinderWilds world-query profiling helper

Run `node client/js/wilds-query-profiler.test.mjs` and `npm test`.

`profileWorldQueries` accepts a bounded list of X/Z points and caller-supplied playable-area and obstacle callbacks. It reports elapsed milliseconds, sample count, outside-area count, blocked count, callback errors, average time per point, and throughput. The helper is isolated and is not wired into the live forest yet.

Hark should connect it to the existing test-only CinderWilds preview callbacks only after reviewing and testing the browser runtime. This helper does not measure frame time, GPU work, networking, or player capacity. Repeat timings on the same device; nonzero callback errors invalidate performance conclusions.
