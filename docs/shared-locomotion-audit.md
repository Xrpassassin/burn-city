# Shared locomotion: architecture audit (2026-10-26)

## Existing contracts
- `client/js/walking-input.mjs` exports `walkingIntent(keys,touch,run)` and `locomotionState(intent,grounded)`. Pure and renderer-independent.
- `client/js/player-motion.mjs` is shared by the city and Homefront for motion/jetpack behavior. Tests assert existing physics constants and integration wiring.
- Homefront Graveyard and BlackTide have in-flight direct-control/touch changes (#286, #285, #283, #280). Do not replace these until reconciled.

## Decision
**Hold** external `three-player-controller` adoption. Its input, camera, physics, collision, and animation ownership could conflict with already-shared systems. No npm dependency should be added without inspecting upstream source and license/asset terms.

## Proposed adapter boundaries
`InputSource -> walkingIntent -> ExperienceMovementAdapter -> existing player-motion / experience physics -> authoritative server validation -> AnimationPresenter`

- InputSource owns key/touch/controller lifecycle and cleanup; one active owner per experience.
- ExperienceMovementAdapter converts intent to local experience coordinates and respects existing speeds/collision.
- AnimationPresenter maps existing idle/walk/run/jump states to collection-specific rigs, without changing physics.
- Server validates movement and entitlements; client animations and controller libraries never authorize positions, purchases, or wallet actions.
- Camera, vehicle and jetpack controllers remain experience-specific until independent audits prove safe reuse.

## Tests required before implementation
1. Keyboard + touch simultaneous input, diagonal normalization, key release, pointer cancel, visibility loss.
2. Cross-experience entry/exit cleanup and no duplicate input handlers.
3. Existing city/Homefront physics and BlackTide navigation regressions.
4. Mobile browser joystick/gesture conflicts, framerate and memory measurements.
5. Multiplayer movement-envelope and server authority tests.

## Next action
Reconcile movement PRs, inspect exact upstream pinned source and dependency tree, then create an isolated feature-flagged adapter with focused tests. This file is an audit/design record, **not** an implementation or certification.
