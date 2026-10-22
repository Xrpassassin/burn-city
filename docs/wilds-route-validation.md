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
