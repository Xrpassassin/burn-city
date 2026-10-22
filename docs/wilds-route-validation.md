# CinderWilds world-space route validation

This isolated helper checks a proposed X/Z route at bounded intervals. It is renderer-free and has no import from the live game. The caller supplies `isBlocked(x, z)` and optionally `isOutsidePlayableArea(x, z)`; those callbacks must consult authoritative current world/collision data.

## Run

```sh
node client/js/wilds-route-validation.test.mjs
```

## Results

- `{ valid: true, reason: 'clear-at-sampled-points', segmentCount, samplesChecked }` means only that every sampled point passed the supplied callbacks.
- Failures identify `blocked`, `outside-playable-area`, `sample-limit`, or `world-query-error`; the result includes the first failing segment and sample when available.
- Invalid configuration returns `null`.
- `sampleSpacing` controls sampling density; `maxSamples` caps work. Reaching the cap fails closed rather than approving a partially checked route.

## Integration guardrails

This PR does not wire callbacks into `wilds.js` or change creature movement. A later integration must bind to the actual CinderWilds obstacle grid/collision checks and playable-ground mask, define actor clearance (not just point clearance), and account for vertical terrain, water, narrow gaps, and moving obstacles. A route reported valid is not a collision-free guarantee between samples. The existing synthetic simulation is still a harness, not proof of live-world navigation.


## Test-only CinderWilds preview integration

The stacked follow-up wires this validator into the existing `?wildstest`/`?debug=1` path preview in `client/js/wilds.js`. It checks the proposed route against the existing `ell(wx, wz)` playable-area boundary and the current `blocked(wx, wz, 0.8)` obstacle-grid query before drawing the gold debug line. A route that fails validation is not drawn and the test panel receives a validation reason.

This uses current forest obstacle data, but it is still an approximation: the obstacle grid represents registered colliders, the boundary is an ellipse-based mask, and point samples do not prove full swept-volume clearance. This hook is test-only; it does not steer creatures or alter normal gameplay. Deep-area navigation remains unsupported by this preview.
