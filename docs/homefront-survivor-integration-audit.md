# Homefront Survivor Integration Audit

**Snapshot date:** 2026-10-23  
**Status:** review artifact only; no branches merged, rebased, or deployed.

## Executive finding

Treat `feature/homefront-survivor-character-variants` as the current *candidate for cumulative review*, not as an approved integration branch. Compare results show it is five commits ahead of `feature/homefront-survivor-routines-movement` with no divergence between those two refs. Its comparison against `main` reports 191 commits ahead and 3 behind, and its cumulative diff includes survivor work alongside combat, environment, world, collision, browser, and test changes. It is therefore not safe to cherry-pick or merge by branch name alone, and it must not be treated as a survivor-only change set.

## Branch ancestry snapshot

The following compare checks were run against the current remote refs:

| Compare | Result | Meaning |
|---|---|---|
| `job-signage` vs `main` | 142 commits ahead, 3 behind | Cumulative branch, not isolated signage |
| `work-targets` vs `main` | 144 commits ahead, 3 behind | Adds to the earlier cumulative work |
| `routines-movement` vs `main` | 186 commits ahead, 3 behind | Broad cumulative implementation |
| `character-variants` vs `main` | 191 commits ahead, 3 behind | Latest cumulative candidate |
| `character-variants` vs `routines-movement` | 5 ahead, 0 behind | Clean ancestry relationship between these refs |

These counts are ref snapshots, not a CI result or proof of conflict-free integration. Re-run comparisons before acting because branch tips can move.

## Scope visible in the cumulative candidate

The diff against `main` includes, among other files:

- `server/homefront-core.js`, `server/homefront.js`, `server/homefront-world.js`
- `server/homefront-combat.js`, `server/homefront-director.js`, `server/homefront-environment.js`
- `client/arena/homefront.html`, `client/arena/homefront-graveyard-3d.js`
- `test/homefront-core-sim.js`, `test/homefront-guard-defense.test.js`, `test/homefront-mechanic-repair.test.js`
- combat, collision, environment, world, and 3D browser tests
- `.github/workflows/homefront-core-test.yml` and `package.json`

This overlap is a reason to coordinate with Hark before touching implementation files. In particular, do not replace the candidate branch's server core with `main)'s version or cherry-pick only its survivor commits without inspecting dependencies: combat/siege behavior and other Homefront changes share the same core and client files.

## Code observations from the candidate core

The fetched `server/homefront-core.js` candidate contains:
- a server-side role allowlist: `idle`, `guard`, `scavenger`, `farmer`, `medic`, `mechanic`;
- a workday action that calculates morale-weighted labor, food consumption, structure-dependent production, mechanic repairs, crop growth, and morale changes;
- guard contribution and prioritized perimeter targeting in siege resolution;
- a behavior synchronization call after assignment and authoritative actions.

The current `assign` action sets the role and synchronizes behavior. The inspected code does not establish that the proposed `assignedTargetId` contract is already implemented. Validate the target/routine/character fields against the candidate's complete normalized schema before extending it. Do not claim target-aware workstations are complete merely because the branch names mention work targets.

## Required integration sequence

1. **Freeze the candidate refs for review.** Record the exact head SHA of each survivor branch and Hark's active combat/siege branch. Do not move those refs.
2. **Review the five incremental commits** from `routines-movement` to `character-variants`, including file diffs and tests. Confirm whether each commit belongs to survivor variants or carries unrelated fixes.
3. **Resolve the three-commit `main) divergence** on a new integration branch, never by force-pushing the source branches. Inspect conflicts manually, especially shared core, client, package scripts, and workflow files.
4. **Run focused tests first:** existing Homefront core, survivor behavior/movement, guard defense, mechanic repair, combat, environment damage, world simulation, and 3D browser checks.
5. **Run the full repository test command** after focused tests pass. A passing focused test is not a substitute for the full suite.
6. **Perform a browser/mobile smoke test:** third-person movement, assignment UI, worker movement and idle fallback, structure destruction, guard response, mechanic repair, reload/save persistence, and two-account isolation.
7. **Keep merge/deploy gated** on Hark's review and explicit owner approval.

## Focused regression harness status

`test/homefront-survivor-economy-sim.js` is a separate proposed harness on the documentation branch. It currently covers deterministic workdays, facility-dependent output, no mutation after a rejected workday, assignment validation, resource/morale bounds, survivor save/load round-trip, and owner isolation. It has **not** been executed in this session, is not wired into `package.json` or CI, and is not evidence of passing behavior yet. Keep it separate until it is checked against the final reconciled core schema; then wire it into the focused Homefront test command and workflow in the integration branch.

## Release blockers

- [ ] Exact branch heads and commit list captured at review time
- [ ] Three-commit mainline divergence reconciled without force-push
- [ ] Candidate's five incremental commits reviewed
- [ ] Existing and new focused tests pass
- [ ] Full repository test suite passes
- [ ] Browser/mobile smoke test passes
- [ ] Save migration and two-account isolation verified
- [ ] Hark review completed
- [ ] Explicit approval obtained before merge or deploy
