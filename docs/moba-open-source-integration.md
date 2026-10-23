# BURN City MOBA: open-source integration shortlist

This is an integration decision record, not approval to add every listed package. Prefer small, auditable components that match the project's current vanilla-JavaScript/Three.js and Node architecture. Pin versions and preserve upstream license notices before vendoring or installing code.

## Candidates

| Component | License / role | Recommended use | Decision |
| --- | --- | --- | --- |
| Three.js | MIT; 3D rendering | Reuse the existing vendored renderer for camera prototypes; do not add a second renderer. | Reuse existing |
| EasyStar.js | MIT; asynchronous grid A* | Tile/grid movement for a tactical map or simplified minion lanes. | Consider only if the MOBA map is grid-based |
| three-pathfinding | MIT; Three.js navigation-mesh queries | Character navigation on authored 3D navmeshes; supports path queries and movement clamping. | Preferred candidate if the MOBA is a 3D walkable map |
| navcat | MIT; JavaScript navmesh generation/querying | Explore if runtime or build-time navmesh generation is needed and its API/size fits. | Evaluate after a small compatibility spike |

## Upstream references

- EasyStar.js: https://github.com/prettymuchbryce/easystarjs
- three-pathfinding: https://github.com/donmccurdy/three-pathfinding
- navcat: https://github.com/isaac-mason/navcat
- Three.js: https://github.com/mrdoob/three.js

License and feature summaries were reviewed from upstream repository documentation on 2026-10-22. Confirm the exact revision's LICENSE file, release status, package exports, browser compatibility, bundle size and vulnerability status before adoption.

## Integration guardrails

1. The match rules core remains renderer- and pathfinder-independent.
2. Navigation emits movement proposals; the authoritative simulation validates position, speed, collision and blocked regions.
3. Never let a pathfinding package decide combat, visibility, damage, victory or ranked results.
4. Keep the same movement constraints in top-down and third-person cameras; camera changes are presentation only.
5. Avoid runtime navmesh generation on every client. Prefer authored or build-generated assets with a versioned format.
6. Use grid A* for a grid map; use a navmesh for continuous 3D terrain. Do not maintain both without a measured need.
7. Preserve upstream LICENSE and notices for vendored code; pin package versions and review transitive dependencies.
8. Run unit tests and a browser smoke test on desktop and mobile before connecting navigation to bots or player movement.

## Suggested proof of compatibility

Before adding a dependency, make a small, isolated spike that loads one authored test map, finds a path around one obstacle, rejects an unreachable target, clamps movement to the permitted area, and runs the same checks with deterministic inputs. Record bundle impact and test results. The current bot policy has no pathfinding dependency and must stay that way until this spike is accepted.
