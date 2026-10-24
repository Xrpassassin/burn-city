# Zombie tactics core — Hark integration review

Branch: `hark/zombie-tactics-review`

## Purpose

This branch introduces a dependency-free tactical decision helper and a narrow live integration in the existing server-authoritative Zombies update loop. The live behavior is restricted to non-ranked, non-daily free play; existing combat resolution and collision remain authoritative.

## New files

- `server/zombie-tactics-core.js`: deterministic squad-role assignment, noise hearing checks, pure behavior selection, and a bounded flanking-point hint.
- `server/zombie-tactics-core.test.js`: deterministic unit tests for the helper.

## Live integration added — review carefully

`server/game.js` imports the helper and now assigns deterministic tactical roles when zombies spawn. In free play only, server-emitted weapon-shot events become short-lived noise stimuli. The shared flow field includes recent noise positions as additional seeds, and zombies that cannot currently see a player may choose an `investigate` state for a sound inside its radius/TTL. When the sound source is line-of-sight reachable, the zombie steers toward that source using existing collision checks. Ranked and daily modes do not collect or use tactical noise. Existing damage, hit resolution, spawn pacing, window traversal, and network snapshot fields are not intentionally changed.

This is an initial integration, not a claim that the behavior is production-proven. Because the flow field is shared, its next step descends toward the nearest seeded player or sound target; investigation around obstacles may therefore fall back to the existing player-directed route. Add a per-target path solution only if tests show it is needed.

## Remaining Hark review checklist

1. Inspect the `server/game.js` live integration against the actual simulation loop; keep ranked and daily modes unchanged.
2. Add runtime-level regression coverage proving that free-play gunfire creates bounded stimuli, hidden zombies investigate only when noise is within radius/TTL, and visible targets take priority over sound.
3. Add coverage that ranked/daily matches do not use tactical noise, and verify existing weapon cadence, damage, window queues, door transitions, and target selection remain unchanged.
4. Evaluate whether the shared flow field is sufficient for investigating sounds around obstacles. Do not bypass `flow()`, `nextStep()`, `walk()`, `inside()`, or existing collision checks.
5. `flankingHint()` remains a tested helper and is not yet used to change movement. Wire it only with route validation and dedicated regression coverage.
6. Run `node server/zombie-tactics-core.test.js`, `node test/zombie-sim.js`, `npm run test:zombie-nav`, and `npm run test:graphics-labs`. Record actual outcomes; do not claim browser/mobile validation unless performed.
7. `npm run test:zombie-tactics` runs the helper tests, existing zombie simulation, and navigation regression. `.github/workflows/zombie-tactics.yml` runs that suite on relevant PR changes and pushes to this review branch.

## Helper contract

- `assignRole(memberId, squadId, memberIndex, squadSize)` returns a stable tactical role.
- `hearNoise(position, noise, nowMs)` returns a stimulus only if it is within radius and TTL.
- `chooseBehavior(input)` returns a pure state/reason/target decision. It does not apply damage or move an entity.
- `flankingHint(target, anchor, side, offset)` returns a bounded alternate approach hint; it does not perform pathfinding.

## Merge gate

Keep this PR in draft until Hark reviews the live integration, runtime-level tests cover the new behavior and guardrails, and all relevant checks pass. Merge only after review confirms no changes to authoritative combat or navigation invariants.
