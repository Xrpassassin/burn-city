# BURN City audio inventory and BURN Radio integration plan

## Safety requirement

**Do not remove or replace area-specific music.** Forest and zombie/dungeon soundtracks are part of the game identity and remain local assets until an explicitly tested replacement exists for that exact zone.

## Verified current audio ownership (main branch audit, 2026-10-22)

- `client/js/wilds-audio.js` owns CinderWilds/Glassroot forest music and ambience:
  - `client/music/wilds/whispers-of-the-wilderness.mp3` — exploration
  - `client/music/wilds/beneath-the-hollow.mp3` — encounter/battle
  - The forest module owns crossfades and ambience. It is lazily loaded when the player enters the forest.
- `client/dungeon/index.html` starts `client/dungeon/music/the-grind-never-ends.mp3` for Eternal Grind.
- `client/arena/music.js` is the arena/zombie-match music controller. It starts `client/music/burn-city-lives.mp3`, then shuffles `client/music/playlist.json` (`t1.mp3` through `t6.mp3`). **This is not the main city soundtrack.**
- The root city entry point is `client/index.html` and its application module is `client/js/app.js`. This audit did not identify an existing main-city soundtrack controller in those entry points. Do not claim or implement a replacement by deleting arena tracks.

## Proposed BURN Radio scope

BURN Radio should be an **optional city-only** listening feature, separate from zone music.

1. User-provided Audius artist profile for BURN Radio discovery: https://audius.co/shinigami11769 (displayed handle: @Shinigami11769). Treat this as the primary catalog source supplied by the project owner. Verify individual track URLs and playback eligibility before adding them to the in-game player. Other platforms (Apple Music, Spotify, etc.) must be added only after the official catalog/profile is confirmed there.
2. Implement a provider adapter/UI that opens or embeds only the provider's documented player and uses the verified artist/track URL. The city should remain playable when a provider is blocked, unavailable, offline, or not logged in.
3. Keep radio opt-in and respect browser autoplay restrictions, user mute state, mobile audio unlock, and safe-area UI placement.
4. When entering CinderWilds, Glassroot Grove, zombie territory, or Eternal Grind, suspend city radio before zone music begins. When returning to the city, resume only if the player had opted in and the zone did not override their choice.
5. Do not use unofficial stream extraction, scrape protected media, proxy streams, or download tracks from streaming services.
6. Platform availability does not itself grant in-game synchronization/public-performance rights. Verify provider terms and rights for the specific use before shipping embedded playback.
7. Remove or defer local city-only music only after a tested replacement is live and a reference audit proves the file is not used by arena, forest, dungeon, or another mode.

## Next implementation gate

The current repository audit found **no existing city-only soundtrack asset/controller to remove**. The project owner has now supplied the Audius profile URL above. The next implementation step is an opt-in city-only player using Audius' documented SDK/API or official embed player, with the supplied profile as the source. Audius documents public catalog search/stream access and recommends an API key for higher limits; obtain/configure the project's public API key if required rather than hard-coding a secret. Do not stream through unofficial endpoints. Keep all existing local forest, zombie/arena, and dungeon music and zone transitions unchanged.
