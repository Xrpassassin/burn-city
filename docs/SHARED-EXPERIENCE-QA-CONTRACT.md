# Shared experience QA contract — draft v1

Applies to City, Estates, Fishing, Homefront, Zombies, Cinderwilds, Blacktide, Eternal Grind, MOBA and future Solana sibling worlds.

## Minimum experience lifecycle
- `boot`: game shell and canvas initialize, loading/error state visible.
- `ready`: input mappings, camera, assets and first interactive frame available.
- `active`: navigation and interaction functional, frame loop responsive.
- `paused`: menus and visibility transitions suspend unintended gameplay input.
- `recoverable-error`: meaningful recovery or safe return-to-city action.
- `dispose`: listeners, render resources, timers and game-scoped subscriptions cleaned up.

## Common QA assertions
| Area | Required evidence |
| --- | --- |
| Load | no fatal console errors; canvas nonzero; ready signal within budget |
| Movement | keyboard and mobile touch move player; camera does not trap pointer |
| Interaction | usable interaction prompt; disabled actions explain why |
| Navigation | entry and return work; no stale overlays after transitions |
| UI | 390x844 and 1440x900 captures; no clipped primary controls |
| Persistence | reload restores only authorized state |
| Authorization | untrusted wallet identity cannot grant property or asset rights |
| Performance | frame-time samples and memory/resource teardown measured |
| Failure | unavailable server/network gives recoverable UI |
| Accessibility | focus visibility, escape behavior, touch target sizes, reduced motion |

## Adapter contract (design only; not implemented)
An experience may expose a test-only, read-only bridge:
```js
window.__BURN_QA__ = Object.freeze({
  version: 1,
  status: () => ({ experience: 'city', phase: 'ready' }),
  metrics: () => ({ frameMsP95: null, activeListeners: null })
});
```
Never expose tokens, wallets, player identifiers, payment methods, signing capabilities, privileged mutations or arbitrary code execution through the bridge. Production builds must not expose this bridge by default. The bridge must not change gameplay behavior.

## Evidence and gates
- A scenario is not PASS until a real browser ran it and artifacts are retained.
- Required: commit SHA, target, browser binary digest/version, viewport, screenshot, console failures, steps, result.
- Screenshots are review artifacts, not proof of authorization or correctness.
- Failed tests block promotion; a mock browser only validates launcher orchestration.
- CI requires an explicitly isolated environment and approved browser binary; never use production credentials.

## Recommended implementation order
1. City boot and mobile movement.
2. Shared navigation, overlay teardown and return-to-city.
3. Estates island entry and authorization-denial path.
4. Fishing dock interaction and cast boundary.
5. Homefront workshop and third-person scene.
6. Expand adapters to each experience without modifying gameplay contracts.
