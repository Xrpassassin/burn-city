# Homefront airport travel and Zombie expedition staging

## Implemented in this branch
- The airport's existing Zombie Extermination kiosk now offers a second explicit destination: **Homefront**. Homefront remains a separate unranked settlement experience and uses its own saved state.
- The Homefront launcher returns the player to BURN City when the Homefront page was entered with `from=airport`.
- Selecting Zombie Survival opens `client/arena/flight-lobby.html`: a helicopter boarding scene, explicit Ready button, cancelable ten-second countdown, departure animation, and a choice between the Refinery and a random map.
- After departure, the client shows a landing cinematic and enters the existing Zombies arena with `from=airport` and `arrival=helicopter` context. The server isolates arrival rooms from normal free-play rooms and spawns players at the map's authored helicopter pad when that map defines one; generated maps without a pad fall back to their normal spawn area. Arrival players get a five-second safety window.

## Remaining validation
- The flight lobby is server-authoritative: players choosing the same map share a queue, see a ready roster, and depart on one countdown. A late join resets the countdown until all connected passengers are ready. Party size is capped at eight; disconnected passengers are removed. Browser QA is still required.
- The helicopter graphic in the staging screen is a lightweight animated scene element, not a new 3D vehicle asset. The existing in-game helicopter extraction remains untouched.
- Keep this as a draft and do not merge/deploy until desktop/mobile browser QA, the registry test, and multiplayer arrival tests pass.

## Validation
Run `npm run test:experience-registry`, `node --check client/js/app.js`, `node --check client/js/airport.js`, and test the city airport kiosk on desktop and mobile. Verify that Homefront and Zombies can each be selected, cancel returns to the airport, and the travel card cannot start duplicate transitions.


## Homefront visit privacy foundation
- Every newly created refuge defaults to `visibility: "private"`. Existing saves with a missing or unknown visibility value are normalized to private.
- Owners can switch between **Private** and **Open for visits**. The setting is persisted through the server-authoritative Homefront action API.
- `GET /api/homefront/visit?owner=<account>` returns a limited, read-only snapshot only when that owner's saved refuge is explicitly public. Private, missing, or invalid saves return a not-found response.
- Visitor snapshots omit the owner field and shorten the settlement log. Visitors cannot mutate the save because all changes still require the authenticated owner action endpoint; the UI also hides construction, survivor management, expedition, repair, workday, and defense controls.
- Public access is currently by owner/account identifier using a shareable visit URL. A discoverable in-game directory, friend-only permissions, visitor presence/guestbook, and explicit guest interaction rules remain future work.
- Tests cover private-by-default behavior, invalid visibility fail-closed behavior, public read-only visits, and immediate revocation when an owner returns to private.


## QA status
- Added regression coverage in `test/homefront-core-sim.js` and `test/homefront-api-sim.js` for private-by-default saves, visibility validation, public read-only visitor access, and revocation.
- GitHub Actions passed the Homefront settlement core checks, Homefront airport flight checks, and Blacktide focused tests on commit `25bd2d6504ebcdd8c59222bd8b9ddcf49772e24f`. Later flight-lobby hardening changes add server-clock countdown display and regression tests for full-party routing/readiness withdrawal; those latest changes still need their own CI run.


## Flight-lobby hardening
- Client countdown display now estimates server-clock offset from each authoritative flight-state message, avoiding reliance on synchronized device clocks.
- The server can now keep multiple parties on the same destination map when one party reaches the eight-player cap; creating a new party no longer overwrites the existing room's lookup entry.
- Regression simulation covers party-cap routing and readiness withdrawal canceling the shared countdown.

## Survivor morale and labor
- Work-shift output is now weighted by each worker's morale: 80–100 morale contributes 1.25 labor, 40–79 contributes 1.0, 20–39 contributes 0.75, and 0–19 contributes 0.5.
- Farmer, scavenger, mechanic, and medic output use the same morale weighting; integer resource gains are rounded down. The server remains authoritative for all output.
- A regression test compares otherwise equivalent high- and low-morale farmers to verify morale has a measurable production effect.

- Intact storage sheds now improve scavenger scrap output during work shifts; damaged or destroyed sheds provide no bonus. Regression coverage compares a plain shift, an intact shed, and a destroyed shed.

- Guard morale now contributes to defensive strength during breach resolution. High-morale guards provide 1.25 guard-strength units, steady guards 1.0, low-morale guards 0.75, and critically demoralized guards 0.5. Ammunition consumption still depends on guard headcount, while combat effectiveness depends on morale. A simulation test checks that high-morale guards preserve more refuge integrity than demoralized guards in the same first breach.


## Survivor morale recovery
- Owners can spend four food on a campfire rally to raise each survivor below 100 morale by up to 15 points. Morale never exceeds 100, and a rally is rejected if there are no survivors, everyone is already at maximum morale, or food is insufficient.
- Rallying is a server-authoritative Homefront action, recorded in the settlement log and saved with the base revision. The owner UI disables the action when its prerequisites are not met; visitor mode remains read-only.
- Regression coverage verifies food cost, morale clamping, no-survivor and insufficient-food failures, and no-op prevention when morale is already full.


## Zombie breach progression
- Homefront breach composition is deterministic by wave. Walkers form the baseline; runners join from wave 3, armored brutes from wave 5, screamers from wave 7, and bloaters from wave 9. Every tenth breach includes a juggernaut boss.
- Special enemy composition adds deterministic threat pressure to the existing server-authoritative defense calculation. Guard morale, active structures, and available ammunition continue to affect defense, while breach damage persists until repaired.
- The owner UI forecasts the next breach's known enemy types before the player commits to defending, supporting decisions about repairs, work shifts, survivor assignments, and supply use.
- `waveProfile()` is renderer-independent and covered by simulation tests, so balance and wave composition can be iterated without coupling rules to the 3D UI.
- Open-source research reference: the MIT-licensed Last Stand project demonstrates deterministic waves and efficient flow-field pathfinding. BURN City is not importing that project's game wholesale; the relevant architectural principle is to keep simulation rules deterministic and testable. Any future direct code or asset reuse must preserve license notices and be reviewed for fit with BURN City's server-authoritative multiplayer design.


## XRPL Graveyard exploration direction
- Homefront is being steered away from escalating round-based horde survival toward an exploration-driven survival sandbox. Perimeter defense incidents have a fixed threat budget and no longer increment or scale with the legacy wave counter.
- Expeditions accept a destination identifier and use site-specific supply costs, salvage yields, medical rewards, and survivor recruitment probabilities. Initial destinations include the City Outskirts, Residential Ruins, Market District, Overrun Hospital, Industrial Yard, Buried Subway, and Sealed Research Annex.
- Higher-risk locations are gated behind completed expeditions, not elapsed time or round count. Subway and research locations are presented as boss-area destinations; future work should make their unique boss encounters and physical city navigation real, rather than treating them as a text-only expedition result.
- The owner UI now describes perimeter incidents as optional and location-based, shows perimeter incident count instead of a rising wave count, and includes a destination selector for expeditions.
- Future exploration milestones: persistent district discovery on the save, physical city traversal, loot containers with equipment and weapon condition, rescue/companion events, location-specific enemy archetypes, and explicit boss-area entry/exit rules.
