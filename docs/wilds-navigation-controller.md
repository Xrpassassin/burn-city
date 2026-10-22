# CinderWilds navigation controller

This test-only controller coordinates the isolated route planner, waypoint follower, and bounded replanning policy.

- Module: `client/js/wilds-navigation-controller.mjs`
- Test: `client/js/wilds-navigation-controller.test.mjs`
- Run: `node client/js/wilds-navigation-controller.test.mjs`

It reports proposed position, updated waypoint index, whether a movement gate rejected the step, and whether the caller should request a route. The caller supplies `nowMs`, cooldown/retry metadata, and `canMoveTo`.

## Guardrails

- The controller does not run a route search itself; `replan.shouldReplan` is a decision for the caller to act on.
- The caller must increment attempt metadata only when it actually starts a route request, and record the attempt time.
- Accepted positions still must be applied through existing movement, terrain-height, collision, and animation systems.
- The helpers use X/Z coordinates only and do not prove 3D collision safety.
- Do not connect this controller to live NPCs until Hark validates it against actual CinderWilds terrain, browser runtime, and performance budgets.
