# Zombie Map 02 — The Ashen Cosmodrome
## Music-led design brief and implementation plan
**Status:** Design proposal only. No gameplay or map code changed by this document.
**Target:** BURN City Zombies, fixed handcrafted layout; the Moon is the planned next map.
**Working title:** The Ashen Cosmodrome (renameable).

## 1. Design intent

Build an original, replayable round-based zombie-survival map that takes broad inspiration from the *feeling* of Black Ops Zombies' Ascension: a remote space-launch installation, Soviet-era industrial architecture, research facilities, launch gantries, outdoor danger, unlockable routes, and the feeling that a failed mission left the whole site contaminated.

Do not copy Ascension's exact layout, named locations, assets, dialogue, signature set pieces, or proprietary audio. BURN City should have its own visual language, fire-themed weapons/perks, lore, and music identity.

The map is **fixed and authored**, not procedurally generated. Every player sees the same room connections, doors, landmarks, objective locations, and Easter-egg clues. Zombies may still use the existing movement/AI and wave logic; a fixed map does not mean every zombie must stand still.

### Player promise

- Start in a relatively defensible service area with limited equipment.
- Spend points to open connected sectors and choose routes.
- Learn the map through repeat runs, shortcuts, wall weapons, perks, and environmental clues.
- Survive escalating rounds while piecing together why a launch facility was abandoned.
- Finish with a clear narrative lead toward the Moon map, without requiring the Moon map to exist yet.

## 2. Existing systems to preserve and reuse

Repository handoff and current code indicate that the Zombies mode already has:
- A hand-built classic map, **The BURN Refinery**, with server-authoritative doors, zones, points, weapons, perks, downed/revive, and navigation in `server/cod.js`.
- Client-side world rendering in `client/arena/cod.js`.
- A server navigation simulation/test harness in `test/zombie-nav-sim.js` and `npm run test:zombie-nav`.
- A match intro track, **Burn City Lives**, followed by a shuffled playlist in `client/arena/music.js` / `client/music/playlist.json`.
- Mobile touch controls, landscape handling, audio controls, and existing test hooks.

Implementation principle: **add a second map as a new, explicit map definition and renderer path**. Do not overwrite The BURN Refinery, silently change ranked/daily layouts, or rewrite core zombie systems. Keep map selection and matchmaking behavior backward-compatible until separately reviewed.

Before coding, inspect how map choice, room state, map snapshots, server collision/navigation, client geometry, and door bits are represented in the current branch. The design below is not permission to assume a new schema.

## 3. Map layout: a readable, connected loop

Use a compact initial footprint sized to the current grid/renderer, then expand only after performance and navigation tests. Build a connected loop with at least two route choices after the first unlock. Avoid a single long corridor that forces every wave through one choke point.

### Zone A — Service Yard (spawn)
- Broken perimeter fence, maintenance trucks, searchlights, emergency siren poles.
- One primary exit to the service corridor and one visible-but-locked route toward the barracks.
- Safe enough to learn controls, but not a permanent safe zone.
- Starting wall weapon and first environmental clue.

### Zone B — Barracks & Motor Pool
- Dormitory bunks, lockers, equipment cages, transport vehicles, sandbag barricades.
- A wide central lane plus narrower side route; make each route readable on a phone screen.
- First meaningful point-spend decision: open the research wing or push toward launch control.
- Optional ammo/weapon purchase placed where the player must accept some exposure.

### Zone C — Containment Laboratory
- Observation windows, specimen rooms, power conduits, sealed test chambers, warning lamps.
- Tight, risky interiors that contrast with the outdoor yard.
- A power restoration interaction can open a shortcut or enable a machine, but it should not be required to understand basic survival.
- Environmental storytelling implies that the infection was connected to a launch payload or recovered material. Keep the exact explanation unresolved for the Moon map.

### Zone D — Launch Control
- Elevated windows looking over the launch pad; consoles, map boards, failed countdown display, mission tapes.
- A defensible room with more than one approach so it cannot become an effortless camping exploit.
- Main narrative hub: players find the first explicit clue that the facility was preparing a lunar mission.
- Candidate location for the existing Night Shift quest interaction, subject to checking how quests are map-bound today.

### Zone E — Fuel & Turbine Hall
- Pipes, tanks, vent stacks, industrial hazards and an alternate route around the facility.
- Strong silhouettes and distinct lighting to make navigation intuitive.
- Hazards should telegraph their danger and never kill players without a readable warning.
- Candidate location for a high-cost weapon upgrade or a map-specific machine; reuse the current server-validated interaction pattern.

### Zone F — Launch Gantry
- A multi-level structure around a grounded rocket or launch vehicle; catwalks, stairs/ramps, support columns and exposed crossings.
- Upper/lower floor navigation must be explicit. Do not add a second floor unless the existing server grid and client renderer can both represent it reliably.
- Make the rocket visible from several zones as the map's landmark.
- No direct copy of Ascension's launch sequence or signature mechanics.

### Zone G — Launch Pad / Telemetry Annex (late unlock)
- Wide but exposed outdoor arena around the launch tower, with cover islands and multiple escape paths.
- Contains the strongest narrative reveal and a sealed telemetry room.
- The final clue references an unexplained lunar signal, a mission designation, or a coordinate. Do not reveal the Moon map's full story in this first map.
- An extraction/ending interaction is optional for the first release; survival rounds should work even if the quest is unfinished.

### Connection plan

Service Yard → Service Corridor → Barracks/Motor Pool → Launch Control.
From the Barracks, players choose between Containment Lab and Fuel/Turbine Hall. Those routes reconnect at the Gantry. The Launch Pad is the late-game branch and narrative payoff.

All door costs, cell ranges, spawn coordinates, wall weapons, perk positions, and collision boundaries must be authored together in one map definition or a tightly paired server/client representation. Avoid independently hand-tuning client geometry and server walkability without a parity test.

## 4. Round and encounter pacing

- **Early rounds:** small groups, learn the spawn yard, open the first door, introduce a readable loop.
- **Mid rounds:** split routes become available; player choices affect access to perks, weapons, and safer rotations.
- **Late rounds:** higher pressure and varied approach angles; open spaces demand movement while interior routes create short, risky escapes.
- **Special enemies:** add only after baseline zombie pathing works in every room and on every floor. Give each special enemy a distinct silhouette, telegraph, and counterplay.
- **Respawns:** use the existing rules and test them in multiplayer; no map-specific respawn loopholes.
- **Co-op:** preserve revive routes and avoid narrow doorways that permanently trap a downed teammate behind a horde.

Do not tune difficulty only by adding health. Prefer route pressure, spawn timing, sightlines, and enemy mix while preserving clear feedback.

## 5. Music-led identity and current catalog audit

### Verified game-side music inventory

The current repository playlist is:
- **Burn City Lives** — match intro, once per match.
- **TFDNFD**
- **FUEL FOR THE FLAME**
- **Burn Me Awake**
- **Apocalyptic Hope**
- **LedgerLight**
- **Until it converges**

The latter six are loaded from `client/music/playlist.json` as `t1.mp3` through `t6.mp3`; titles are verified from the repository. This audit has not listened to every local audio file, analyzed stems, or verified exact lyric-to-scene matches. Treat the proposed cue placements below as editorial hypotheses until an audio listen-through is completed.

### Public creator-profile check

The supplied Audius profile is [@Shinigami11769](https://audius.co/Shinigami11769). Its public page currently exposes a catalog count of 63 tracks and 25 followers. Publicly indexed track pages include **ApocalypticHope** (295 plays in the indexed snapshot; gritty/experimental) and **LedgerLight** (309 plays; described as cinematic, spoken-word, and prophetic). These are point-in-time public counts, not unique listeners, retention, or proof of audience preference. The browser-readable profile did not expose a complete, reliable track list or a full comments/reposts/favorites dataset in this audit.

Therefore:
1. Use the **in-game playlist titles and locally owned audio files** as the first soundtrack source of truth.
2. Use the Audius profile as a discovery and audience-research source, not as a reason to stream music into the game automatically.
3. Do not infer lyrics or musical structure from a title alone.
4. Do not ship external streaming or embeds until track URLs, provider requirements, and the relevant in-game playback rights are verified.
5. A proper second pass should listen to the seven in-game tracks and map their energy/lyrics to cue roles; then review public plays, reposts, favorites, and comments where accessible. Treat engagement as one signal among several, not a direct proxy for fun.

### Initial cue sheet (provisional)

| Moment | Candidate | Intent |
|---|---|---|
| Match opening / map title | Burn City Lives | Establish BURN City identity; retain existing intro behavior unless a tested map-specific intro is approved. |
| Early exploration / clue discovery | LedgerLight | Use only if listening confirms the quieter, prophetic description fits the scene; otherwise keep it in the shuffled playlist. |
| First major unlock / machine activation | FUEL FOR THE FLAME | A title-level thematic fit for ignition and rising stakes; verify audio before assigning. |
| Escalating rounds | TFDNFD or Burn Me Awake | Candidate intensity tracks; choose only after listening for pacing and length. |
| Story reveal / lunar signal | Apocalyptic Hope or Until it converges | Candidate for prophecy, revelation, or unresolved mystery; lyric and audio fit still needs confirmation. |

Do not add hard-coded song changes until the music controller supports clean, non-disruptive cues and the audio has been reviewed. First release can simply retain the current shuffled playlist and use sound design for area transitions.

## 6. Visual and audio direction

- **Palette:** dirty concrete, oxidized steel, warning amber, cold moonlight, emergency red, sparse BURN-orange firelight.
- **Silhouette:** the rocket and gantry should be visible from several routes and work as navigation landmarks.
- **Environmental audio:** electrical hum, distant metal impacts, wind over the launch pad, PA fragments, warning klaxons, zombie vocalizations. Avoid constant sirens that mask gameplay audio.
- **Music transitions:** if added later, use short crossfades at authored story beats; don't restart a track every time a player crosses a doorway.
- **Readable horror:** use light, sound, and environmental clues over visual clutter. Ensure controls, enemy silhouettes, and interaction prompts remain readable on mobile.

## 7. Moon-map foreshadowing

The first map should leave one coherent question unanswered:
- A lunar mission has been scrubbed from the visible control-room records.
- A telemetry console receives a repeating signal from a site that should be silent.
- A mission identifier or coordinates recur in two separated locations.
- The final clue suggests the outbreak may not have originated at this facility.

Use one primary clue and two optional supporting clues. Avoid a pile of unrelated Easter eggs. The Moon map can pay off the signal and reveal what the launch facility was hiding.

## 8. Implementation phases and acceptance criteria

### Phase 0 — inspect and specify
- Read current server/client map selection, map snapshot format, door-bit limits, collision grid, renderer, spawn logic, quest binding, and weapon/perk placement.
- Confirm whether the current map system can select a second fixed map without changing ranked/daily behavior.
- Decide the smallest safe map footprint and identify any representation limits.

**Gate:** a documented server/client data shape and list of touched files before gameplay code is changed.

### Phase 1 — graybox map
- Add a new map definition behind an explicit selection flag or separate unranked mode.
- Implement room cells, walls, doors, spawn points, collision, and navigation before decorative assets.
- Reuse the existing zombie wave/weapon/points systems.

**Acceptance:** every room is reachable when its doors are open; every closed door blocks both server movement and client navigation; zombies can reach valid player locations; no zombie or player can get stuck at ramps/corners; current BURN Refinery remains unchanged.

### Phase 2 — gameplay loop
- Add point costs, wall buys, perks, and a single simple power interaction.
- Verify solo and multiplayer, downed/revive, reconnect behavior, and round progression.
- Add special enemies only after navigation is stable.

**Acceptance:** no duplicate purchases/rewards on retries; server remains authoritative; old map tests pass.

### Phase 3 — art, sound, and story
- Replace graybox geometry with a small set of distinctive reusable industrial modules.
- Add lighting, particles, environmental audio, mission records, and lunar foreshadowing.
- Run the soundtrack listening pass before adding map-specific music logic.

**Acceptance:** readable landmarks on desktop and mobile; no major frame-time regression; music and SFX controls still work.

### Phase 4 — QA and release
- Add `test/zombie-cosmodrome-sim.js` or an equivalent map-specific harness only after checking existing test conventions.
- Test route reachability, next-step distance reduction, door-state changes, spawn placement, and collision for 1/2/4/8 players.
- Run `npm test`, `npm run test:all`, syntax checks, then smoke-test PC and iPhone portrait/landscape.
- Keep the map out of ranked/daily until it has separate balancing and an explicit approval.

**Release gate:** do not merge or deploy until both server and client agree on the layout and the existing Refinery, forest, fishing, and dungeon modes pass regression checks.

## 9. First implementation task

Start with **Phase 0 + Phase 1 graybox**, not a full art pass:
1. Inspect the live map selection and snapshot contracts in the current branch.
2. Write a map-specific layout/data definition that fits those contracts.
3. Add a route-reachability test for the authored rooms and door states.
4. Add the map as an opt-in unranked selection only after tests pass.
5. Ask Hark to review the map-selection UI separately; keep code changes scoped and avoid merging unrelated UI work.

This is a fixed, authored map now. Procedural variation, randomized room layouts, and per-run random objective placement are explicitly deferred.
