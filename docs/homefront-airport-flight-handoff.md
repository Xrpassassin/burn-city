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
