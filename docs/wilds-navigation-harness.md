# CinderWilds navigation harness (isolated)

This is a test-only orchestration layer for the existing grid pathfinder and the waypoint follower prototype.

- Planner: `client/js/wilds-navigation-harness.mjs`
- Test: `client/js/wilds-navigation-harness.test.mjs`
- Run: `node client/js/wilds-navigation-harness.test.mjs`
- Depends on: `wilds-pathfinding-world.mjs` and `wilds-waypoint-follower.mjs`
- No new dependencies and no changes to live movement.

## Flow

1. `planNavigation` asks the world-grid pathfinder for a route.
2. Unreachable or over-budget routes are returned as explicit failures.
3. An optional `simplifyPath` callback can apply the separately reviewed smoother without coupling this harness to its implementation.
4. `advanceNavigation` computes one bounded X/Z movement step.
5. A caller-provided `canMoveTo(x, z, oldPosition)` gate can reject the step. On rejection, the returned position and waypoint index do not advance.

## Safety boundary

This module does not move a Three.js object, set terrain height, animate, turn, or replan automatically. The caller must use real collision and terrain rules, add a cooldown/budget for replanning, and apply accepted positions through existing movement systems. Keep it test-only until Hark validates it against the actual CinderWilds terrain and obstacle map. Passing these synthetic-grid tests does not prove real-world collision safety.
