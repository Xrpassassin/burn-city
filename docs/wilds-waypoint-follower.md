# CinderWilds waypoint follower core

This is a pure, isolated movement-step helper for the future navigation integration. It does **not** move live creatures or players.

- Module: `client/js/wilds-waypoint-follower.mjs`
- Tests: `client/js/wilds-waypoint-follower.test.mjs`
- Coordinate plane: world X/Z only
- Input: current position, waypoint array, current waypoint index, and a maximum movement distance for this update
- Output: next X/Z position, next waypoint index, completion flag, distance moved, and distance to the next waypoint
- Safety: rejects malformed inputs, caps displacement to `maxStep`, prevents overshoot, and limits how many already-reached waypoints can be consumed in one call

Run the focused test under Node 22:

```sh
node client/js/wilds-waypoint-follower.test.mjs
```

## Integration guardrails

This helper deliberately does not set Y/terrain height, check collision, turn an entity, animate a creature, or request replacement paths. The future caller must:
1. obtain a route from the pathfinder;
2. use a speed-derived `maxStep` (for example, speed × a capped frame delta);
3. validate the proposed step against the actual world/collision rules before applying it;
4. update terrain height and orientation through existing game systems;
5. replan when blocked, with a cooldown and bounded search budget;
6. keep the behavior test-only until terrain tests and mobile profiling pass.

Do not wire this into production NPCs as part of this change. The goal is to isolate and test route following before it touches existing creature steering.
