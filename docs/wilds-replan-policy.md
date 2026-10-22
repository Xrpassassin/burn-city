# CinderWilds bounded replanning policy

Pure decision helper for a future navigation caller. It does not start timers, call the pathfinder, or mutate NPC/player state.

- Module: `client/js/wilds-replan-policy.mjs`
- Test: `client/js/wilds-replan-policy.test.mjs`
- Run: `node client/js/wilds-replan-policy.test.mjs`

The caller provides a clock value (`nowMs`) and its current attempt metadata. The helper reports whether a route should be requested, why it decided, and how long remains in the cooldown. A bounded retry count prevents repeated route requests every frame; a retry window can reset the counter after sufficient time.

## Integration guardrails

- Call only on explicit route failure or a blocked movement result, not on every render/update.
- The caller owns the actual cooldown scheduling and attempt counter persistence.
- Keep pathfinding work budgeted and avoid parallel replans for the same entity.
- Reset attempts only when a new route is successfully established or the configured retry window expires.
- Do not interpret this policy as proof that a proposed movement step is collision-safe.
- Keep this helper test-only until Hark validates it with real CinderWilds terrain and profiling.
