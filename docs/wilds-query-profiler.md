# CinderWilds live terrain-query profiler (test-only)

With the forest loaded in a browser opened using `?wildstest` or `?debug=1`, call:

```js
window.__wilds.test.profileWorldQueries({ columns: 50, rows: 50 })
```

This samples a deterministic X/Z grid across the base CinderWilds bounds and times the existing playable-area (`ell`) and obstacle-grid (`blocked`) callbacks. It returns elapsed milliseconds, sample count, outside-area count, blocked count, callback errors, average time per sample, and throughput. Grid dimensions are capped to 5,000 samples. The forest must be loaded, and this hook is unavailable in normal play.

This is a diagnostic microbenchmark, not a production movement change. Browser load, device, thermal state, and other tabs affect timing; repeat runs and compare on the same device. It does not measure frame time, GPU work, network/server load, collision clearance, or player capacity. It profiles only the base CinderWilds; deep-area geometry is not included. The callback errors are counted and profiling continues, so any nonzero error count invalidates performance conclusions.
