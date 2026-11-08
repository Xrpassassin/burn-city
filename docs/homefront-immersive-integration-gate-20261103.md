# Homefront immersive third-person integration gate (2026-11-03)

## Goal
Ship a continuous, third-person survival exploration loop without replacing the current Three.js engine or disturbing Zombies, ranked modes, Estates, or live economy.

## Evidence reviewed
- `docs/homefront-direct-walking-preview.md`: server flag `HOMEFRONT_CONTINUOUS_MOVEMENT=1` and tester query `?movement=continuous` are both required; authoritative 8 Hz input budget, limited visual prediction, fallback to legacy destination walking.
- `docs/homefront-terrain-contract.md`: browser/server seeded terrain parity; collision-aware bounded A* fallback; world-coordinate elevation; unfinished full landmark collision and terrain-conforming roads.
- `docs/homefront-open-source-survival-adaptation.md`: existing 64-unit chunk planner, carried inventory, server-validated loot nodes, bounded world at ±100.
- `HANDOFF.md`: merging to main can auto-deploy; package changes require a rebuilt Docker image.

## Decision
**Do not install recast-navigation-js, three-pathfinding, or a second character controller yet.** First benchmark and test existing movement, collision, and pursuit. Introduce a new navmesh library only if a reproducible failing scene demonstrates that bounded A* cannot meet navigation quality/performance targets.

## First vertical slice acceptance
1. Enter Homefront, exit refuge and walk with WASD/joystick; camera orbits freely without click-to-move.
2. Traverse a road and enter/leave one authored building with no wall clipping, terrain floating, or blocked doorway.
3. Search one existing server-authoritative loot node; out-of-range and duplicate claims are rejected.
4. Attract one infected, break line of sight, and observe a collision-safe detour without wall clipping.
5. Return to refuge with correct carried inventory and persistent save.
6. Repeat with two authenticated accounts and on physical mobile. Reconnect mid-travel and verify no movement drift or unauthorized reward.
7. Disable the server feature flag and verify legacy movement fallback without corrupting state.

## Engineering sequence
- Identify live Homefront entrypoint, active renderer, current movement protocol, and any competing overlay/controller before modifying source.
- Reconcile branches affecting direct movement and terrain; verify what is actually merged on main.
- Add focused tests for input sequence replay, server step bounds, obstacle and doorway collision, and disconnected clients.
- Add a minimal deterministic browser smoke scenario, then mobile camera/touch QA.
- Instrument input latency, world-write contention, frame time, and AI path budget; avoid raising the 8 Hz limit without measurements.
- Gate the complete third-person path behind the existing server flag until tests and manual checks pass.

## External candidate review (research only)
- `isaac-mason/recast-navigation-js`: potential navmesh/crowd solution if dynamic obstacles defeat existing A*; verify runtime, WASM cost, exact license and version.
- `donmccurdy/three-pathfinding`: potential smaller static-navmesh option; requires navmesh authoring.
- `gkjohnson/three-mesh-bvh`: possible collision/raycast accelerator if profiling warrants it.
- `hh-hang/three-player-controller`: reference for camera/controller behavior only, not a drop-in replacement.

## Safety and release
No new dependencies, secrets, payment changes, economy modifications, or production flag changes in this audit. Keep branch unmerged pending code reconciliation, CI, desktop/mobile gameplay verification and review. Preserve source attribution if code is ever incorporated.
