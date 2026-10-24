# Homefront Survivor Simulation Contract

## Purpose

Define the next settlement-simulation layer for Homefront without duplicating or destabilizing the existing combat, construction, and workday systems. This document is a design and acceptance contract, not a claim that the described behavior is already implemented.

## Current foundation and boundaries

The current settlement core already supports a persistent survivor roster, role assignment (idle, guard, scavenger, farmer, medic, mechanic), morale, workday resource output, and defense calculations. Other survivor-focused branches may be in progress; review their status and ancestry before implementing overlapping behavior.

The simulation must preserve these rules:

- Server state is authoritative. The client may display predictions but cannot award output, change survivor skills, or decide defense results.
- Keep Homefront progression separate from Ranked and the main BURN City economy.
- Preserve legacy saves. New fields need bounded defaults and deterministic migration; loading a save must never reroll an existing survivor.
- Do not introduce offline starvation, survivor death, or base destruction. Offline progression requires an explicit product decision and player warning first.
- Keep simulation bounded for mobile and multi-account server workloads. Do not create one timer per survivor or unbounded background loops.



### Branch reconciliation finding (checked 2026-10-23)

The four survivor branches are not independent feature branches. GitHub compare results show a likely linear sequence:

1. `feature/homefront-survivor-job-signage`
2. `feature/homefront-survivor-work-targets` (2 commits ahead of job-signage)
3. `feature/homefront-survivor-routines-movement` (42 commits ahead of work-targets)
4. `feature/homefront-survivor-character-variants` (5 commits ahead of routines-movement)

Each branch also diverges from current `main` by three commits, so do not open or merge all four as independent PRs. Review the latest branch's complete diff and its five commits beyond routines/movement, resolve the three-commit mainline divergence, and validate the cumulative survivor work as one integration candidate. These are compare results, not a guarantee that the latest branch is conflict-free or CI-green. Recheck branch tips before acting because they can change.

## Recommended survivor record

Extend the existing normalized survivor record only after checking the current survivor-skills, character-variant, work-target, and routine branches.

Required concepts:

- id, name, and role: existing identity and job assignment.
- morale: existing 0–100 bounded value.
- skills: deterministic, persistent 1–10 values for combat, scavenging, farming, medical, engineering, and endurance where the skill layer is integrated.
- condition: a small bounded state such as healthy, tired, injured, or recovering; no free-form client-supplied status.
- assignedTargetId: optional stable ID of a compatible workstation/structure. A missing or destroyed target falls back to role-level behavior rather than breaking the workday.
- lastWorkedDay or equivalent simulation marker: optional, server-maintained and migration-safe. Do not use wall-clock time to secretly punish offline players.

Avoid adding hunger/thirst meters per survivor until the UI can explain them and the player can reliably supply/produce the needed resources. The first pass should make the settlement economy legible, not create a maintenance chore for every NPC.

## Work assignment contract

1. Each survivor has at most one active role and one optional target.
2. Validate role/target compatibility on the server. A farmer may target a garden/farm plot; a mechanic may target a workshop, infirmary, generator, or repair task only where the feature exists. Guards should use the current defense model, not double-count as a second free production job.
3. Reassignment is an atomic action: validate survivor ownership, role, target, and capacity before changing anything.
4. If a target is destroyed, removed, full, or invalid after load, clear or safely normalize the target and retain the survivor's role if that role still has a meaningful fallback.
5. UI must show the assignment, target, expected effect, and why an assignment is unavailable. Visitors remain read-only.
6. Do not silently consume scarce resources merely because a survivor is assigned. Resource inputs and outputs must be explicit and logged.

## Deterministic workday resolution

Keep workday resolution a pure, bounded server-side calculation over a validated base snapshot:

- Calculate each role's contribution once per workday; no per-frame production.
- Use persistent skills only after the skills migration is integrated. Skill-based output must be deterministic for a given saved survivor and workday, not rerolled per request.
- Include intact, compatible structures and relevant upgrades in production calculations. Damaged or destroyed facilities must not grant full output.
- Resolve resource consumption before granting outputs, with explicit rules for insufficient food, medicine, ammunition, seeds, water, and repair materials.
- Apply morale effects after the day's outcomes are known. Clamp morale to 0–100 and avoid double-applying penalties on retried requests.
- Cap all resources and production values. Prevent negative inventory, integer overflow, and duplicate workday rewards.
- Return a concise result summary with resource deltas, unmet needs, facility failures, and morale changes; append a bounded settlement log entry.

A request retry or replay must not advance the day twice. Use the existing authenticated action, persistence, and revision conventions; if a durable idempotency key is not available, document that limitation and add a targeted replay test before relying on client retries.

## Health, fatigue, and recovery — later phase

Only add condition effects after the basic job/target and workday contract is stable:

- Injury or fatigue should come from explicit gameplay events or bounded workday rules, never random punishment on page load.
- A medic and infirmary may improve recovery, but their effect must be computed once and tested against medicine availability.
- Condition penalties should be understandable in the roster and settlement report.
- Recovery should not create an offline death spiral. No survivor permanently dies in this phase.
- Keep combat damage to guards separate from player health and refuge integrity.

## Save migration and security

- Normalize new fields in the existing base validator with conservative defaults.
- Reject malformed target IDs, unsupported roles, out-of-range skills/condition values, and foreign-owner actions.
- Derive owner identity from the verified session on the server, never from a request body.
- Keep visitor endpoints read-only and do not expose private refuge state.
- Preserve atomic/serialized writes and the existing maximum survivor count.
- Test legacy saves with missing fields, malformed fields, duplicate survivor IDs, stale target IDs, and maximum roster size.

## Acceptance tests

Add deterministic regression tests for:

1. Legacy survivor records normalize without losing name, role, morale, or stable skills.
2. Assignment rejects unknown/foreign survivors, invalid roles, incompatible targets, and exceeded role/target capacity without partially mutating state.
3. A destroyed workstation stops contributing output and stale assignments normalize safely.
4. Identical validated state and workday inputs produce identical resource deltas.
5. Low morale and skill differences have bounded, documented effects.
6. Insufficient inputs never create negative resources; no output is granted for work that requires unavailable inputs.
7. Replayed workday/action requests cannot duplicate production or morale changes.
8. A save/load round trip preserves assignments, targets, skills, condition, resources, and revision.
9. Two accounts cannot read or mutate one another's private refuge.
10. Existing settlement, combat, airport/experience-registry, inventory, survival, and visitor-mode tests remain green.

## Standalone regression harness

A focused Node.js regression script now exists at `test/homefront-survivor-economy-sim.js`. It exercises deterministic workday outcomes, intact-versus-destroyed production facilities, failed-shift immutability, assignment validation, and bounded resource/morale values across repeated shifts. Run it with `node test/homefront-survivor-economy-sim.js` from the repository root after checking out this branch. It is intentionally not yet wired into `package.json` or CI because the active survivor branches modify the same package and core files; Hark should wire it into `test:homefront` after branch reconciliation. This script has not been executed in this session, so it must not be treated as a passing CI result.

## Implementation order

1. Review and reconcile the current survivor-skill, work-target, routines/movement, and character-variant branches before editing overlapping code.
2. Finalize survivor normalization and migration only once the intended schema is agreed.
3. Add target-aware assignment validation and focused unit tests.
4. Make workday resolution deterministic, resource-aware, and replay-safe.
5. Expose assignment outcomes and resource deltas in the roster/workday UI.
6. Add condition/recovery only after the preceding tests pass.
7. Run the full Homefront suite and two-account API checks. Perform desktop and mobile browser QA separately; source assertions alone are not gameplay validation.

## Release gate

This contract does not authorize merging or deployment. Keep implementation work in a reviewable branch/PR, avoid overlapping Hark's active integration files, and do not mark the system playable until automated tests, two-account isolation, persistence/replay checks, and browser/mobile playthroughs have been reported separately.
