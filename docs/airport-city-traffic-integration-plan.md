# BURN City Airport-to-City Traffic Integration Plan

Status: design proposal only. Do not merge or wire into live traffic until the current Hark integration is complete and the route geometry is verified.

## Goals
- Make the airport feel connected to the same city, rather than a detached scene.
- Connect the airport access road to the existing road network using a continuous, drivable junction.
- Make visible traffic coherent for all players in the same city region.
- Keep vehicle simulation lightweight on mobile and avoid per-frame network broadcasts.

## Geometry plan
1. Audit the current city road graph and airport access-road endpoints before moving any structures.
2. Add a signed, curb-safe connector from the terminal approach at the airport's north side to the nearest existing city arterial.
3. Use explicit road centerline segments and junction metadata rather than visually overlapping road meshes.
4. Add lane direction, stop/yield priority, speed limits, and collision-safe turning radii.
5. Keep sidewalks, crosswalks, curbs, and pedestrian paths continuous at the junction.
6. Verify airport/terminal/road colliders and the world bounds so the new connector cannot trap players or NPCs.

## Shared traffic architecture
- Server owns a deterministic traffic seed, route definitions, vehicle IDs, and authoritative simulation tick.
- Clients receive compact snapshots/deltas at a modest rate, interpolate positions locally, and extrapolate only briefly between updates.
- Vehicles use stable IDs and route progress so every player sees the same traffic, not independently randomized cars.
- Server sends spawn/despawn and route-change events; clients do not independently decide traffic lifecycle.
- Use a bounded active-vehicle budget by quality tier and distance/visibility-based client rendering, while preserving the same authoritative traffic state.
- Keep collision and gameplay-relevant interactions server-authoritative; cosmetic traffic can use simplified collision or be non-colliding.
- Reconnects receive a current snapshot; stale/out-of-order updates are rejected by sequence/tick number.

## Acceptance checks
- Airport access road joins an existing road with no gaps, abrupt overlaps, or blocked sidewalks.
- A player can walk/drive the connector without hitting invisible colliders or leaving the playable bounds.
- Two clients in the same region observe matching vehicle IDs, routes, and lane directions.
- Joining late and reconnecting produces the same current traffic scene.
- Mobile frame time and network payload size stay within the project's measured budgets.
- Tests cover route continuity, lane direction, stable IDs, snapshot ordering, and reconnect snapshots.

## Scope guard
This is intentionally not a live traffic rewrite. The current airport traffic in `client/js/airport.js` is locally simulated and randomized; moving it to shared traffic requires a small server API and a careful audit of the existing city-road coordinate system. Do not alter Hark's in-flight branch or merge any related work until Hark finishes.
