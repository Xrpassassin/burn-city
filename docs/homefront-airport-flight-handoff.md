# Homefront airport travel and Zombie expedition staging

## Implemented in this branch
- The airport's existing Zombie Extermination kiosk now offers a second explicit destination: **Homefront**. Homefront remains a separate unranked settlement experience and uses its own saved state.
- The Homefront launcher returns the player to BURN City when the Homefront page was entered with `from=airport`.
- Selecting Zombie Survival opens `client/arena/flight-lobby.html`: a helicopter boarding scene, explicit Ready button, cancelable ten-second countdown, departure animation, and a choice between the Refinery and a random map.
- After departure, the client shows a landing cinematic and enters the existing Zombies arena with `from=airport` and `arrival=helicopter` context. The server isolates arrival rooms from normal free-play rooms and spawns players at the map's authored helicopter pad when that map defines one; generated maps without a pad fall back to their normal spawn area. Arrival players get a five-second safety window.

## Important remaining integration
- The flight lobby is server-authoritative: players choosing the same map share a queue, see a ready roster, and depart on one countdown. A late join resets the countdown until all connected passengers are ready. Party size is capped at eight; disconnected passengers are removed. Browser QA is still required.
- The countdown in this first pass is **client-local**, not a server-authoritative party lobby. Two players can currently have separate countdowns. Before public release, add a server-owned flight room with participant roster, ready state, minimum/maximum party size, shared countdown, disconnect handling, and one synchronized departure event.
- The helicopter graphic in the staging screen is a lightweight animated scene element, not a new 3D vehicle asset. The existing in-game helicopter extraction remains untouched.
- Keep this as a draft and do not merge/deploy until desktop/mobile browser QA, the registry test, and multiplayer arrival tests pass.

## Validation
Run `npm run test:experience-registry`, `node --check client/js/app.js`, `node --check client/js/airport.js`, and test the city airport kiosk on desktop and mobile. Verify that Homefront and Zombies can each be selected, cancel returns to the airport, and the travel card cannot start duplicate transitions.
