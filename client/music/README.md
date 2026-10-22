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

1. First verify the official BURN/Codex:BURN artist and release URLs on Audius, Apple Music, Spotify, and any other service where the catalog is actually published. Do not infer artist identity from search results alone.
2. Implement a provider adapter/UI that opens or embeds only the provider's documented player and uses the verified artist/track URL. The city should remain playable when a provider is blocked, unavailable, offline, or not logged in.
3. Keep radio opt-in and respect browser autoplay restrictions, user mute state, mobile audio unlock, and safe-area UI placement.
4. When entering CinderWilds, Glassroot Grove, zombie territory, or Eternal Grind, suspend city radio before zone music begins. When returning to the city, resume only if the player had opted in and the zone did not override their choice.
5. Do not use unofficial stream extraction, scrape protected media, proxy streams, or download tracks from streaming services.
6. Platform availability does not itself grant in-game synchronization/public-performance rights. Verify provider terms and rights for the specific use before shipping embedded playback.
7. Remove or defer local city-only music only after a tested replacement is live and a reference audit proves the file is not used by arena, forest, dungeon, or another mode.

## Next implementation gate

The current repository audit found **no existing city-only soundtrack asset/controller to remove**. The next safe coding step is to verify the official artist/catalog URLs and then add a city-only radio UI/adapter behind a feature flag. Until that is done, keep every existing audio file and zone transition unchanged.
