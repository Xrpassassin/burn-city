# CinderWilds: three-pathfinding integration spike

## Why this candidate

[three-pathfinding](https://github.com/donmccurdy/three-pathfinding) is an MIT-licensed navmesh pathfinding toolkit for Three.js. It can find routes over polygon navigation meshes, unlike the current bounded four-way grid search. It does not generate a navmesh for us: walkable geometry must be baked/exported and supplied as zone data.

## What this change adds

- `client/js/wilds-navmesh-adapter.mjs` adapts an already initialized `Pathfinding` instance into a small, bounded, plain-data route result.
- `client/js/wilds-navmesh-adapter.test.mjs` tests validation, group mismatch, no-route, waypoint caps, and caught library errors with a fake implementation.
- The adapter deliberately does not import the dependency, load geometry, create a zone, or connect to creature movement. That keeps this spike runnable in Node and avoids adding a browser dependency before compatibility is checked.

## Required next validation before any runtime integration

1. Inspect the exact Three.js version in `client/vendor/three` and compare it with the current `three-pathfinding` release/API.
2. Pin and review the library's MIT license and transitive/runtime requirements. Do not use an unpinned CDN import.
3. Generate a small CinderWilds test navmesh from the actual walkable terrain, with trees/rocks/water and zone boundaries excluded or represented correctly.
4. In a separate test page, load that mesh and verify routes across slopes, around obstacles, and to unreachable points. Compare against the existing test-only grid preview.
5. Profile navmesh build time, memory, route latency, and repeated queries on desktop and mobile. Keep the current route preview and AI fallback until results are validated.

## Safety boundary

This is adapter/test tooling only. It changes no production movement, collision, combat, networking, dependencies, or deployment behavior. A successful adapter unit test proves only the adapter contract, not navmesh quality or in-game pathfinding correctness.

## Hark handoff

Run under Node 22+:

```sh
node client/js/wilds-navmesh-adapter.test.mjs
npm test
```

Report this spike's result separately from existing test failures. Do not merge a live navigation integration until the real Three.js version, generated navmesh, and browser/mobile behavior have been validated.
