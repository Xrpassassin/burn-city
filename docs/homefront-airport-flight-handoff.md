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


## XRPL Graveyard exploration-first design
- Homefront perimeter incidents now use a fixed threat budget and no longer increment the legacy wave counter. The number of previous defenses does not make the next defense stronger or harder; guard morale, structures, and ammunition still influence the outcome.
- Expeditions now accept a destination identifier and use site-specific supply costs, salvage yields, medical returns, and survivor recruitment odds. Current destinations: City Outskirts, Residential Ruins, Market District, Overrun Hospital, Industrial Yard, Buried Subway, and Sealed Research Annex.
- District access is gated by completed expeditions, not round count. The owner UI uses a destination selector and describes perimeter incidents as optional. A regression test checks that defense outcomes are independent of the legacy counter and that district unlock gates work.
- This is the first server-side exploration foundation, not a completed open world. Next work: persist discovered districts explicitly, create physical city routes and points of interest, add loot containers/equipment, rescue encounters, and distinct boss arenas.


## Shared XRPL Graveyard expedition world
- Added `server/homefront-world.js` as the renderer-independent shared-world rules module. Players explicitly enter the Graveyard expedition from the Homefront map; while inside, they poll one server-persisted world snapshot. Refuge management does not automatically place a player in the city. Presence expires after 45 seconds without refresh. Map snapshots expose pseudonymous player markers, never raw XRPL account addresses.
- Solo players are assigned different low-risk perimeter entry points. Parties use short share codes, support up to four players, enter together, and move as a group under party-leader control. Party membership and active positions are held in the shared world save.
- The map shows scavenging landmarks, hospital/industrial sites, and two shared boss territories. Danger is determined by how far inward a player travels from the perimeter, not by completed rounds. Server movement is clamped to 12 world units per action.
- Scavenging now resolves at nearby world landmarks and awards the player's persistent refuge resources. Boss hunts require proximity to a red boss marker, consume the site's food/ammunition cost, damage shared boss HP on the server, and award a bonus salvage/medicine cache to the player who lands the final hit. Bosses respawn after five minutes. Other players see shared boss health on map refresh.
- New endpoints: `GET /api/homefront/world`, `POST /api/homefront/world/enter`, `/move`, `/scavenge`, `/boss-hunt`, `/party/create`, `/party/join`, and `/leave`. The browser polls the world every eight seconds. The shared map is a 2D tactical prototype; seamless 3D traversal, individual combat equipment, rescue NPCs, and full enemy AI remain future work.
- Open-source architecture references reviewed: [OpenRP](https://github.com/DevanMetz/openrp) (MIT; authoritative multiplayer city sandbox) and [Blockyard](https://github.com/Potrock/blockyard) (open-source authoritative browser multiplayer platform). This implementation uses compatible server-authoritative patterns rather than importing either project's unrelated game code or assets wholesale.
- Added `test/homefront-world-sim.js` for distinct spawns, shared presence, party movement, danger tiers, and stale presence; expanded the API simulation to cover shared-map scavenging and shared boss HP. Run `npm run test:homefront` and browser QA before merge.


## Homefront tycoon economy and difficulty
- Homefront refuges now start with a small Ember reserve and persist an `embers` balance plus levels for four server-authoritative upgrades: Scavenger Rig (+15% base salvage per level), Ember Press (+5 embers per expedition per level), Field Armory (+2 defense strength per level), and Field Medic Station (+1 medicine on medical trips per level).
- Successful expeditions pay embers based on location risk and selected difficulty. Story / Standard / Veteran / Nightmare use progressively higher supply costs, salvage multipliers, ember payouts, and boss toughness. Difficulty never advances a wave counter. Boss defeat adds a difficulty-scaled Ember bonus to the final hitter.
- The Ember Exchange sells fixed bundles of wood, scrap, food, medicine, and ammunition. Purchases and upgrades validate currency, caps, costs, and levels on the server; the UI is only a presentation layer.
- The design borrows genre-level ideas rather than proprietary assets/code: Dead Island-style scavenging and loot progression are present in the expedition loop, while weapon-mod crafting remains a planned next layer. A first Left 4 Dead-inspired Director now varies quiet searches, wandering infected, infected hordes, and special-infected ambushes by site risk and chosen difficulty; ambushes spend extra ammunition and can lower survivor morale. This is still a tactical map prototype, not real-time infected combat, and incapacitation/rescue, live special-infected AI, and true combat pacing/lulls remain future work.
- Tycoon progression is a persistent economic loop: expedition risk -> Ember income -> upgrades/materials -> stronger refuge and more capable expeditions. No pay-to-win or premium currency is introduced; Embers are earned in play.
- Open-source tycoon references reviewed: [Continuum Engine](https://github.com/carribus/continuum-engine) for incremental-game economy concepts, and [Bal Tycoon Online](https://github.com/xandru582/Bal-Tycoon-Online) (MIT) for server-authoritative multiplayer economy patterns. No unrelated game code or assets have been copied wholesale.


### Exploration economy hardening
- Difficulty now actually scales expedition supply costs (`ceil(base cost × tier cost multiplier`) and base salvage rewards; Scavenger Rig multiplies wood/scrap salvage. Story / Standard / Veteran / Nightmare remain separate from rounds.
- District access is based on reaching a physical landmark in the shared Graveyard, not on the number of expeditions already completed. Personal `exploration.discoveredZones` persists visited districts; the first visit to each district grants a one-time survey bonus of `risk × 3` scrap and `10 + risk × 5` Embers.
- Boss attacks use a separate server-authoritative `boss_attack` action. Each attempt charges the selected difficulty's food/ammo cost but does not grant ordinary expedition salvage, Embers, or survivor recruitment; boss completion is the source of the boss bonus. This closes a repeatable loot/recruit exploit from attacking a boss repeatedly.


### Shared supply caches
- Added three physical supply-cache landmarks (Exchange Market, St. Mercy Hospital, and Ironworks Yard). They appear as gold `C` markers on the shared Graveyard map.
- Opening a nearby cache runs a normal location/difficulty expedition, then adds a location- and difficulty-scaled cache bundle of scrap, wood, ammunition, medicine (higher-risk caches), and Embers.
- Cache availability is shared world state and persists across requests. A claimed cache enters a five-minute cooldown for every explorer; the server validates location, difficulty, cooldown, resource caps, and payout. The tactical map uses a shared cooldown state so the first explorer to claim it wins the cache.
- Added world/API regression coverage for cache markers, initial availability, bonus rewards, persisted cooldowns, and cross-player duplicate-claim prevention.
