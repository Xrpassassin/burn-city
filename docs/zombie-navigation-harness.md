# Zombie navigation regression harness

Run with Node 22+:

```sh
node test/zombie-nav-sim.js
npm run test:zombie-nav
```

This harness exercises the existing authoritative navigation functions exported by `server/cod.js` on the classic BURN Refinery map. It checks that:

- The real flow-field builder reaches a meaningful set of walkable cells.
- A far reachable cell produces a valid next waypoint.
- The waypoint reduces the flow-field distance toward one or more player targets.
- The waypoint centre passes the existing zombie body collision check.

It prints elapsed time for flow-field generation with 1, 2, 4, and 8 player targets. The timing is a local diagnostic only; it has no flaky time threshold and is not a multiplayer capacity estimate.

The test opens all classic zones for reachability coverage. It does not simulate live doors, window climbing, combat, network traffic, procedural-map diversity, animation, or a full zombie horde. It does not modify live AI or movement. Run the existing `test/zombie-sim.js` as well for the wider zombie rules regression suite.
