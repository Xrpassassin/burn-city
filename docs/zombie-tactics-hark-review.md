# Zombie tactics core — Hark integration review

Branch: `hark/zombie-tactics-review`

## Purpose

This branch introduces a small, dependency-free CommonJS decision helper for the existing server-authoritative Zombies mode. It is intentionally separate from the live simulation so Hark can review the contracts and wire it into the correct tick/update locations without a blind rewrite of `server/cod.js`.

## New files

- `server/zombie-tactics-core.js`: deterministic squad-role assignment, noise hearing checks, pure behavior selection, and a bounded flanking-point hint.
- `server/zombie-tactics-core.test.js`: deterministic unit tests for the helper.

## Important: this is not live-wired yet

The helper is not imported by `server/cod.js` in this draft. It does not change runtime behavior until Hark integrates it. This is deliberate: the current server module is large and owns weapon rules, map binding, flow fields, window climbing, collision, and authoritative damage. Integration must be made at the actual zombie update loop, preserving all of those contracts.

## Hark's integration checklist

1. Locate the authoritative zombie update/tick loop and the current zombie object schema in `server/cod.js`.
2. Import `chooseBehavior`, `assignRole`, and (only if useful) `flankingHint` from this module.
3. Adapt existing fields through a narrow adapter. Do not change network snapshots or persistent zombie IDs just to match helper input names.
4. Feed in server-observed target visibility/LOS, recent sound events, and bounded last-known-target memory. A noise event must never be treated as visual detection.
5. Keep `flow()`, `nextStep()`, `walk()`, `inside()`, door/window rules, and existing collision checks authoritative. A flanking hint is a desired point, not a valid path; route it through existing navigation and reject unreachable/blocked points.
6. Preserve weapon damage, firing cadence, hit volumes, enemy IDs, spawn limits, round pacing and all client/server protocol fields.
7. Add regression tests against the real update loop for lost LOS, wall obstruction, sound TTL/radius, squad role distribution, blocked flank points, window queues, door transitions, and multiplayer target changes.
8. Run `node server/zombie-tactics-core.test.js`, `node test/zombie-sim.js`, `npm run test:zombie-nav`, and `npm run test:graphics-labs`. Record actual outcomes; do not claim browser/mobile validation unless performed.
9. Add a package script only if appropriate, and keep this feature behind a server-side flag until the live integration passes tests.

## Helper contract

- `assignRole(memberId, squadId, memberIndex, squadSize)` returns a stable tactical role.
- `hearNoise(position, noise, nowMs)` returns a stimulus only if it is within radius and TTL.
- `chooseBehavior(input)` returns a pure state/reason/target decision. It does not apply damage or move an entity.
- `flankingHint(target, anchor, side, offset)` returns a bounded alternate approach hint; it does not perform pathfinding.

## Merge gate

Keep this PR in draft until Hark completes live integration, adds server-level regression tests, and reports test results. Merge only after review confirms no changes to authoritative combat or navigation invariants.
