# External open-source integration gate

Status: proposal / audit policy only. No third-party code installed, no deployment performed.

## Mandatory process
1. Inventory existing implementation and open PRs; establish baseline tests and CI.
2. Record upstream URL, pinned commit/version, license text, asset provenance, and attribution obligations. Reject unknown or incompatible licensing.
3. Review installation scripts, transitive dependencies, security advisories, network access, credentials, wallet interactions, and untrusted input. Deep-audit privileged or server-side components.
4. Assess Three.js/Node compatibility, collision and animation ownership, server-authoritative gameplay, mobile controls, cleanup, performance, and bundle size.
5. Prototype in isolated adapter with no global input handlers or production behavior changes.
6. Run targeted and full test suites, manual mobile/desktop playtests, and deployment smoke checks before merging.
7. Merge only after green CI and review. Production deployment requires a separate verified release decision.

## Preliminary candidates — NOT approved
- https://github.com/hh-hang/three-player-controller — extensive controller with mobile, physics, vehicles and camera ownership. High integration/conflict risk; deep audit required. Do not install yet.
- https://github.com/ssethsara/react-three-npc — React Three Fiber integration may not fit existing vanilla Three.js usage; verify licensing and dependencies.
- https://github.com/colyseus/colyseus — server-authoritative networking architecture; high-risk migration; separate design review required.

## Baseline observations (2026-10-26)
- main includes client/js/walking-input.mjs with a renderer-independent walkingIntent and locomotionState contract.
- Open PRs #285, #283, #280 overlap shared touch movement; #286 changes Homefront movement.
- Existing package.json defines extensive tests for game modes, estates, and avatar systems.
- Preserve current movement and server authority. Favor small adapters and feature flags over replacement.

## Approval record template
Candidate | upstream commit | SPDX license and asset terms | dependency audit | security review | compatibility | baseline tests | focused tests | mobile QA | rollback | decision

No code should be merged merely because a repository search result advertises MIT licensing.
