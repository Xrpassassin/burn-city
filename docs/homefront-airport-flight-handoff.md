# Homefront airport travel and Zombie expedition staging

## Implemented in this branch
- The airport's existing Zombie Extermination kiosk now offers a second explicit destination: **Homefront**. Homefront remains a separate unranked settlement experience and uses its own saved state.
- The Homefront launcher returns the player to BURN City when the Homefront page was entered with `from=airport`.
- Selecting Zombie Survival opens `client/arena/flight-lobby.html`: a helicopter boarding scene, explicit Ready button, cancelable ten-second countdown, departure animation, and a choice between the Refinery and a random map.
- After departure, the client navigates into the existing Zombies arena with `from=airport` and `arrival=helicopter` query context.

## Important remaining integration
- The countdown in this first pass is **client-local**, not a server-authoritative party lobby. Two players can currently have separate countdowns. Before public release, add a server-owned flight room with participant roster, ready state, minimum/maximum party size, shared countdown, disconnect handling, and one synchronized departure event.
- The arena currently owns map selection and spawn placement. The `arrival=helicopter` context is supplied for the next pass; server-authoritative spawn placement at the selected map's helicopter landing pad and a landing-to-gameplay handoff still need to be wired and tested. Do not describe the current branch as completing those two behaviors yet.
- The helicopter graphic in the staging screen is a lightweight animated scene element, not a new 3D vehicle asset. The existing in-game helicopter extraction remains untouched.
- Keep this as a draft and do not merge/deploy until desktop/mobile browser QA, the registry test, and multiplayer arrival tests pass.

## Validation
Run `npm run test:experience-registry`, `node --check client/js/app.js`, `node --check client/js/airport.js`, and test the city airport kiosk on desktop and mobile. Verify that Homefront and Zombies can each be selected, cancel returns to the airport, and the travel card cannot start duplicate transitions.
