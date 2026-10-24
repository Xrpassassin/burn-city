# RAVAGER rotary weapon and physical zombie feedback

This branch is stacked on `feat/cosmodrome-combat-polish-boss` and is intended for Cosmodrome Free Play review only.

## RAVAGER

- Adds `ravager` as a new appended weapon ID; existing IDs and slot indices remain unchanged.
- Purchasable from the Ashen Cosmodrome wall-buy for 3,500 points. It is not added to the classic Refinery wall-buys or mystery-box pool, so ranked/daily access and balance remain unchanged.
- Server-authoritative rotary firing: spin-up, fuel drain, continuous line-of-sight damage, tracer events, heat build-up, cooling, and a 2.1-second overheat lockout.
- Client telemetry displays heat, spin percentage, and lockout status. A rotating multi-barrel viewmodel, dedicated red-orange skin, and short-lived orange tracers establish weapon identity.
- Heat and spin are server-owned and included in the normal player snapshot; clients do not decide damage.

## Physical enemy feedback

- Hits apply a short server-side stagger that suppresses movement briefly.
- Brute, Juggernaut, and Ashen Warden types receive separate armor durability; armor break is replicated as an event and state bit, removing their visible chest plate.
- Burn tint persists for roughly two seconds after the burn flag clears, instead of dropping almost immediately.
- Death poses differ by enemy archetype (heavy enemies buckle; skitter/runner types pitch back), with the existing fade/char pass retained.
- Snapshot additions are appended after existing fields to preserve earlier indices.

## Validation status

- Added `server/rotary-rules.test.js` for spin-up, cooling, overheat lockout, and empty-fuel behavior.
- Added `test/zombie-ravager-sim.js` for server firing, tracer endpoints, armor break, stagger, and snapshot replication.
- Wired both tests into `npm run test:zombie-ravager` and `test:all`.
- Not yet runtime-validated in this authoring environment. The tests and full suite must run in CI; browser/mobile visual QA is still required. Do not merge or deploy until these checks pass.
