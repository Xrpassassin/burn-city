# CinderWilds: Yuka pursuit steering for Glassroot hostiles

## What is integrated

CinderWilds already vendors upstream Yuka 0.7.8 under its MIT license. This change uses Yuka's `SeekBehavior` for the desired heading of designated hostile creatures in Glassroot Grove while the player is actively exploring.

- Existing idle/wander behavior continues to use Yuka's `WanderBehavior`.
- Hostile pursuit switches the same creature agent to `SeekBehavior` targeting the player's current position.
- When pursuit ends, the agent switches back to wandering.
- The existing BURN City `steer()` function remains responsible for obstacle avoidance, zone boundaries, collision resolution, and actual position changes.
- No new runtime package, CDN request, network protocol, save format, or server dependency is introduced.
- The behavior is limited to existing `ZONE` hostile spawns; ordinary wildlife retains its existing movement.

## Test

Run under Node 22+:

```sh
node client/js/wilds-yuka-ai.test.mjs
npm run test:wilds
```

This repository session could not execute the tests or browser/mobile checks. Treat this as an isolated integration candidate until those checks are run.

## Safety and next step

This is steering integration, not navigation-mesh pathfinding. Yuka proposes a pursuit direction; it does not grant collision bypass, combat authority, or permission to leave a zone. Test in Glassroot on desktop and mobile before merging. If pursuit oscillates near obstacles or at close range, revert the pursuit call and retain the existing direct steering behavior.
