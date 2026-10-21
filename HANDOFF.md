# HANDOFF — Burn City + Eternal Grind

Read this first. Any AI or human working on this repo follows these rules.

## What this is
- **Burn City**: XRPL token "burn" city explorer + multiplayer arena (Zombies, ranked, daily, Tron, fishing).
- **Eternal Grind**: first-person dungeon RPG at `/dungeon/`. Keep this name.
- Live: https://burn-city-game.fly.dev/  (arena `/arena/`, dungeon `/dungeon/`)
- Fly app `burn-city-game`, machine `8d2909be270068`, region `lax`, volume `bcg_data` mounted at `/data`.

## Layout
```
client/            static site served by the Node server
  index.html       City explorer (js/, ui.css, style.css, sw.js service worker)
  arena/           Zombies / multiplayer arena (net.js, fx.js, sfx.js, cod.js)
  dungeon/         Eternal Grind (index.html, data.js, a/ assets)
  data.js          base token/pool data (server/eco.js rebuilds live ECO, served at /data.js)
server/
  server.js        HTTP + WebSocket entry (serves ../client)
  game.js          arena simulation (zombies, downed/revive, reconnect resume keys)
  city.js eco.js fish.js ranked.js payments.js shop.js ... feature modules
package.json       `npm start` -> node server/server.js
Dockerfile, fly.toml
```
Persistent data (saves, leaderboards, discovered pools) lives on the Fly volume `/data`, NOT in git.

## Run & test locally
```bash
npm ci
node --check server/server.js && node --check server/game.js
PORT=8080 DATA_DIR=./.data DRY_RUN=true npm start
# open http://localhost:8080/ , /arena/ , /dungeon/
```
Before any deploy: syntax checks pass, then smoke test on PC and mobile:
City explore, Zombies match (downed/revive, reconnect), fishing (F / Space / Esc), dungeon character creation + one fight. No console errors.
Server suites (`npm test`, `npm run test:all`, also run by `deploy.yml`): use polling, not fixed sleeps (wait until the condition holds, ~5 s cap; drive game rules with simulated `room.step(dt)` ticks), and pin any randomness a check doesn't test (e.g. `p.inv` so a surge can't end the match).

## Deploy
GitHub `main` is the single source of truth, and **deploys are automatic: merge to `main` and it is live within ~3 minutes.**
- The Fly machine's start command is `sh /data/boot.sh` (a copy of `scripts/boot.sh`). It pulls `main`,
  syntax-checks `server/server.js` + `server/game.js`, runs it from `/data/gh/cur`, then checks GitHub every
  3 minutes and restarts onto any new `main` commit. Currently deployed commit: `/data/gh/SHA`.
- A restart drops live matches, so merge when few players are on.
- If GitHub is down or the new code fails checks, the last good copy keeps running.
  If the new server crashes within 30 s of starting, the previous copy (`/data/gh/prev`) is started instead.
- Changing `scripts/boot.sh` itself only takes effect after copying it to `/data/boot.sh` on the volume and restarting.
- npm dependencies come from the image's `/app/node_modules`. If you change dependencies in `package.json`,
  also run `fly deploy` (rebuilds the image from the Dockerfile; its CMD still uses `/data/boot.sh`).
- `.github/workflows/deploy.yml` runs syntax checks on every push (and an immediate restart if the
  optional repo secret `FLY_API_TOKEN` is set).
- Manual restart: `fly machine restart 8d2909be270068 -a burn-city-game`

## Rollback
- Code: `git revert <sha>` on main (auto-deploys in ~3 min).
- Pin a version: `fly ssh console -C "sh -c 'echo tags/live-2026-10-19 > /data/gh/REF'"` then restart
  (auto-updates pause while pinned; delete `/data/gh/REF` and restart to go back to main).
- Emergency: `touch /data/gh/DISABLE` + restart runs the code baked into the Docker image (`/app`, older until the next `fly deploy`).

## PYRETHEUM (BURN Tower interior)
- `client/js/tower-interior.js`: overlay Three.js scene opened from the BURN tower's explore interaction
  (`nearestInteract()` / `interact()` in `client/js/app.js`) or the BURN info card button. The city render pauses
  while it is open (`window.__burnTowerOpen`); city sim and multiplayer keep running. Esc / EXIT returns to the city.
- Aegis map: set `AEGIS_MAP_URL` at the top of `tower-interior.js` once the approved URL is confirmed. It opens in an
  in-game iframe with an "Open in new tab" fallback (some sites block embedding).
- Midnightbluff private floor: server-gated by `GET /api/tower/midnightbluff` (XAMAN sign-in token). Approved wallets
  come only from the `MIDNIGHTBLUFF_WALLETS` env var / Fly secret (comma-separated r-addresses). Unset = locked for everyone.
  Never put the list in client code.
- Holder art: a signed-in player's own selected Firekeepers / 589 NFT (from the existing verified `/api/nft` cache) hangs
  in its gallery. No collection scraping or rehosting; galleries link to xrp.cafe.
- `?towertest=1` exposes `window.__towerTest` for automated tests only.

## Zombies: Gantry, new perks, Night Shift quest, audio (feat/zombies-polish)
- **The Gantry** (classic Refinery, so ranked/daily get it too): upper level (h 3.6 m) over the Warehouse. Catwalk ring + two
  4-cell ramps between the crate rows; rubble at the foot of each ramp is a door (1250 pts, clearing either opens zone 7).
  4 upper vents (east wall x2, south wall x2) with outside ledges. Defined in `server/cod.js` CLASSIC.upper; the server grid
  has a second layer (`UPG`), entities carry `lv`/`y`, ramps are shared flow-field nodes, `lift()` sets height/floor
  (floor flips at a ramp's midpoint). Cross-floor shots only inside the atrium and only to spots not roofed by the deck.
  Client mirrors it in `client/arena/cod.js` (`walkable(x,z,open,lv)`, `lift`). Procedural maps have no upper level.
- **Perks** (appended, older perk bits unchanged): Slag Skin 2000, Afterburn 2500, Pressure Valve 2000 (on the Gantry),
  Cinder Leech 1500. **Boons**: Flashpoint (crit), Overpressure (fire rate / fuel). Max 4 perks still; revive restores one.
- **Night Shift quest** (`server/quest.js`, free play + daily, off in ranked): radio note at round breaks from wave 2 →
  Valve Wheel → Igniter Fuse → Key Card (wakes a Cinder Warden) → carry each to the Flare Console (classic: Control Room).
  Reward: +2000 pts each and a free Forge of the gun in hand (or a perk / +1500). Snapshot `s.q`, events note/qpick/qfit/qdone.
- **Audio**: CC0 Freesound samples in `client/arena/sfx/` (sources + licenses in `sfx/LICENSES.md`, rebuild with
  `tools/zombie-audio/`). `sfx.js` = WebAudio graph + 3D voices, `zaudio.js` = who/when (groans, breath, shrieks, steps,
  crawlers, roars, impacts, weapon beds, heartbeat + muffle + vignette + Android vibrate), `music.js` = Burn City Lives once
  per match then the shuffled playlist. Server now answers byte ranges for audio (iOS Safari needs them).
- Eternal Grind theme: `client/dungeon/music/the-grind-never-ends.mp3`, 🎵 button / M, `localStorage.egMusicMute`.
- Local test env (ignored on Fly): `ZOMBIE_TEST_TP=1` (ws `{t:'tp'}` teleport), `ZOMBIE_TEST_OPEN=<bitmask>`, plus the
  existing `ZOMBIE_CLASSIC`, `ZOMBIE_START_WAVE`, `ZOMBIE_START_POINTS`, `ZOMBIE_TEST_GOD`. Arena `?debug=1` exposes
  `__tp`, `__hb({hp,near})`, `__za`, `__music`, `__st`, `__me`.

- **iPhone view + rotate (Arena, all modes)**: `client/arena/index.html` `fitView()` keeps the horizontal FOV sane: base vFOV 70, floor hFOV 75°
  (portrait 390x844 → vFOV ~118°, was hFOV ~36° = "zoomed in"), cap hFOV 100° on touch landscape; desktop 16:9/16:10 unchanged (vFOV 70).
  Refits on resize, orientationchange and visualViewport resize, plus once 250 ms later (iOS reports stale sizes right after a rotate).
  `arena-ui.css`: the short-landscape two-column menu grid is `#menu:not([hidden])` and `#menu[hidden]` is forced `display:none` (the old
  `#menu{display:grid!important}` beat `[hidden]` on specificity, so rotating mid-match in Zombies / Light Cycles showed the menu over the game).
  Touch number inputs/selects are 16px and the viewport meta has `maximum-scale=1` (iOS focus auto-zoom). `?debug=1` → `window.__camView()`
  ({fov, aspect, hfov}). Playwright check: iPhone 14 emulation, start a match, resize 390x844 ↔ 844x390 + fire orientationchange/resize.
- **Auto-fire (Zombies, on by default)**: `client/arena/index.html` reads `localStorage.bcAuto2` (on unless `'0'`); the old `bcAuto` key is ignored,
  so everyone started with it on once (bc-v48) and only an explicit toggle-off is remembered. Reach = server `fireRange(p)` in `server/game.js`
  (gun in hand, Forged ×1.15, Long Reach +8%/level, last-stand pistol 17/22 m), the same number the server fires with, sent as player snapshot
  field 21 (`me.ar` in net.js); client falls back to 8.5 m. Target pick skips zombies with no line of sight: candidates in the cone are sorted nearest-first and get one `world.los()` ray each (`client/arena/cod.js`, a same-floor copy of the server's flame LOS; cross-floor pairs pass), so it never fires at a zombie behind a wall. Damage rules unchanged (the server's `Z.los` still decides hits). Test: `test/zombie-sim.js` "auto range".

## Rules for bots
- One bot at a time; one branch per feature (`feat/<name>`), PR into `main`.
- Never commit secrets (XUMM keys, wallet seeds, tokens). Use `fly secrets set`.
- Don't touch `/data` contents from code changes without a migration note.
- Keep files small and edits surgical; run syntax checks + smoke tests before merge.
- Tag stable releases (`v1-stable`, `v2-stable` ...).

## Key controls (for testing)
- City: right-drag look, left-click interact; mobile USE button.
- Zombies: 30s bleed-out, crawl, revive; free-play reconnect within 25s keeps points/guns/perks. N re-reads the radio note.
- Fishing: F start, Space/F cast-hook-reel, Esc reel in.
- Eternal Grind: WASD, mouse look, LMB attack, RMB/Q spell, F heal, 1/2 potions, E interact, Shift sprint, I inventory, Esc/P pause. Save key `egSave` in localStorage.

_Auto-deploy verified 2026-10-19._

## AEGIS City Watch (merged; superseded in part by the Pyramid HQ below)
- Client: `client/js/aegis.js` (lazy-loaded by app.js; `?noaegis` / `?aegis=0` or Settings → "Live AEGIS feed" turns it off).
  Polls `https://api.xrpl.fun/v1/aegis/city` every 60 s (backoff, paused when hidden), validates everything, never loads the AEGIS sdk.js.
- Threat level (with hysteresis: 2 polls to escalate, 3 polls + 5 min to calm) drives: Auto weather (rain / storm, ~25 s crossfade, only when
  more severe than market weather), sky tint (`U.aegisTint/aegisA`), police patrols + call odds (`events.js` `EV.setThreat`), CRITICAL unit roll-out,
  siren cue (sound on only), alert faces on street billboards (`citylife.js` `L.setAlert`) and tower holograms, searchlights/drones.
- Screens: police station roof, airport terminal canopy, bracket arms on the tallest towers. Poster (img.youtube.com, CORS *) or a looping
  preview clip (`preview_clip_url` from AEGIS on api.xrpl.fun / xrpl.fun, or our own `/aegis/clip/<id>.mp4`). Max 3 decoding (2 on phones).
- Ticker lines join the event-banner queue as `type:'aegis'`, always behind gameplay events.
- Server clip job (`server/aegis-clips.js`): OFF unless `AEGIS_CLIPS=1` and the image has yt-dlp + ffmpeg (`--build-arg AEGIS_TOOLS=1`).
  Needs a bigger machine than the current 256 MB shared-cpu VM. YouTube ToS risk: prefer clips supplied by the AEGIS API.


## AEGIS Pyramid HQ (feat/aegis-pyramid, sw bc-v50-aegispyr)
Supersedes the City Watch notes above where they differ: **AEGIS never changes weather, sky or billboards any more.**
- **Weather**: purely market mood again (TVL-weighted 24 h change). `app.js` `autoKey()` = `moodWeather`; the AEGIS sky tint (`U.aegisTint/aegisA`)
  and the AEGIS wchip text are gone; `window.setAegisWeather` is kept as a no-op returning false. The tower-billboard AEGIS alert swap in `app.js`
  is removed and `aegis.js` no longer calls `__cityLife.setAlert` (the `ad_ALERT` slot in citylife.js stays, unused). #28 owner art stays on billboards.
- **Landmark** `client/js/aegis-pyramid.js` (lazy import in app.js, `?nopyramid` skips it): glass/metal pyramid at **(84, 214)**, half-base 13 m,
  height 30 m, on open ground NE of centre between the inner districts and the Wilds trailhead (clear of streets, towers, airport, estate lake, gate).
  4 draw calls: merged body (plinth + faces + steps), merged additive glow (edges, bands, apex crystal), apex beam, merged standby posters.
  Top-level scene group + one collider (`r 13.5, h 15`), so the deep-Wilds city-hide (`wilds-gate.js` cityOff/hideNew) hides it and stashes
  its collider like every other city group; its frame loop returns while `__cityPaused`.
  Look by level: idle (feed off / unreachable / not read yet) dim teal, faint beam, standby posters · NORMAL cyan, slow breathe ·
  ELEVATED amber, brighter beam, ~1 Hz pulse · CRITICAL red, strong 1.6 Hz pulse, beam widens. Reduced-motion = no pulse.
- **Feeds** (`aegis.js`): `mounts()` returns only the pyramid faces (`__aegisPyr.mounts(n)`: 4 desktop, 2 phones, 1 low tier; town-facing faces
  first), screens lie on the face (tilt) with a bezel. The police-roof / airport / tower-arm screens are gone. Ticker lines + the CRITICAL banner
  run in a strip on the screens (no longer queued as city banners; Response Ops notices still are). Tap a screen = cam modal; tap the pyramid
  body / table = AEGIS console. No pyramid (failed / `?nopyramid`) = no screens, nothing else changes.
- **Ported from ae149c9** (Response Ops WIP): command table (globe, now 2-3 instanced pin draws instead of one mesh per cam) placed in front of
  the town-facing face at (84, 192); anomaly beacons (ELEVATED 1, CRITICAL 3) spawn on a ring 27-45 m round the pyramid (wave-seeded, same on
  every client); hold-USE stabilise, responder badge (local only), `{t:'ab'}` co-op relay in `city.js` / `server/city.js` (rate-limited,
  cosmetic); drone searchlights (ELEVATED 3 / CRITICAL 9, phones 2/6) circle the beacons or the apex. `__nearHooks` / `__mmHooks` in app.js.
- **Test hook** `?debug=1` (or `?aegistest`): `__aegisPyr.force('NORMAL'|'ELEVATED'|'CRITICAL'|'idle'|null)`; it also pins
  `__aegis.force(lv)` so table/beacons/drones follow; `null` returns to the feed. State: `__aegisPyr.{level,colHex,beamA,glowA,screensLive}`.
- **Fail safe**: API down / bad payload = pyramid idle with standby posters, no table/beacons/drones, city untouched. Note the live API only sends
  CORS for the production origin, so on localhost the feed shows `error` (tests route it).
- **Beacons on alert** (sw bc-v51-polish): when the level rises (or the first feed read is ELEVATED/CRITICAL) outside the live 5-of-8-min window, beacons spawn at once with key `w<N>a-i`, wave-seeded spots (`spots(w+100003)`) and a full 5 min life from now; one alert set per wave (CRITICAL after ELEVATED adds the missing two). Test: `__aegis.tOff` into minute 6 + `__aegisPyr.force('CRITICAL')` → 3 beacons.
- Gaps: beacons are ~6 draws each (only at ELEVATED/CRITICAL); phones on the low tier get 1 face screen; pins on the globe are no longer
  individually tappable (the console lists the cams).

## UI design system (client/ui.css "Ember Glass")
- `client/ui.css` is loaded **last** in `index.html` and restyles every overlay, including panels other modules inject. `style.css` keeps structure only.
  Arena uses the same tokens in `client/arena/arena-ui.css`; Eternal Grind keeps its own look in `client/dungeon/eg.css`.
- **Tokens** (`:root` in ui.css): type `--f-ui/--f-mono/--t-*`, surfaces `--glass/--glass-2/--edge/--hair`, brand `--ember*`, shape `--r*`,
  sizes `--tap:44px` (touch minimum) and `--ctl` (toolbar height: 40 desktop, 44 on touch), layout zones `--top/--row2/--left/--right/--bottom`.
  Position new floating UI with the zone tokens, never raw px from the screen edge.
- **z-order scale** (use the tokens, not numbers): `--z-world 2` (labels, toasts) < `--z-hud 10` (toolbar, status chips, minimap, HUD)
  < recap card 20 < `--z-ctl 30` (touch controls, gear column) < `--z-pop 45` (popovers) < `--z-panel 75` (#info card)
  < overflow menu `#more` 76 < `--z-modal 100` (guide, replay, shops) < `--z-top 130` (AEGIS modal). The 3D canvas has no z-index;
  toolbar/menu buttons carry `position:relative;z-index:1` so taps never land on it. A closed `#more` is `visibility:hidden`.
- **Safe areas**: `viewport-fit=cover` is set on all three pages. Only use `--sa-t/--sa-b/--sa-l/--sa-r` (= `env(safe-area-inset-*)`), via the zone
  tokens. Touch `--bottom` has a 10px floor above the inset (iPhone home bar). Test with emulated insets (portrait 47/34, landscape 47 L/R + 21 bottom)
  (headless Chrome reports 0 insets, so test harnesses rewrite `env(safe-area-inset-*)` in the served CSS).
- **44px rule**: on touch (`body.touch`, set by `js/ui.js`), every button, chip, summary, close ✕ and card link is at least 44x44. Short landscape phones
  (`max-height:500px`) get the same; lay out in two columns rather than shrinking targets.
- Layout groups are built in `js/ui.js` (mode segment, `#more` overflow menu, `#status` chips, `#gearBar`, body classes `mFly/mExplore/moreOpen/uiHudOpen`).
  It only moves existing elements; ids and handlers stay intact. Closed HUD `<details>` sections render no boxes (`display:none`) so audits and hit tests stay honest.
- Bump `VERSION` in `client/sw.js` (`bc-v<N+1>-<slug>`, one above main) on every client change.

## City pause menu: Explore option (feat/pause-explore)
- `client/js/app.js`, block "view menu" (`#vMenu`, opened by Esc on desktop or the ✕ Exit button on touch while in Explore / Fly; Esc also during a Tour):
  buttons are 1 Orbit · 2 Fly · 3 Tour · 🚶 Explore · 4 Resume. Explore goes through the same `go(v)` → `setMode('explore')` path as the toolbar's
  Explore button (avatar spawn / drop under the drone from Fly, touch joystick + JUMP/RUN/USE on phones, menu closes). Desktop Explore keeps its
  normal free cursor (right-drag look), so no pointer lock there, same as the toolbar entry. Choosing Explore while already exploring = Resume
  (no `setMode`, which would reset jetpack/web and pitch). No hotkey (1-4 unchanged). Styling comes from the existing `#vMenu button` rules in `ui.css`
  (48px rows, ≥44 touch), plus one `ui.css` rule: short landscape phones (`max-height:500px`) lay the card out in two columns (title + Resume span both) so
  five rows never fill the screen. The menu has no current-mode highlight, so none was added.
- Test hook: `?debug=1` or `?exploretest` → `window.__vMenu` = {show, go, on}. Used to open the menu from Orbit / on a phone Tour, where there is no
  Esc / ✕ Exit entry point (Orbit's own way into Explore is the toolbar).
- Playwright flow used: desktop 1280x800 + iPhone 14 390x844 portrait / 844x390 landscape (emulated insets), open pause from Explore, Fly, Tour and
  Orbit, tap Explore, then WASD / CDP touch drag on `#joy`. SwiftShader runs ~2 fps, so movement is checked as "position changed", not distance.

## The Wilds — Cinderwilds forest M1 (lazy-loaded)
- **Files**: `client/js/wilds-gate.js` (always loaded, small: trailhead gate + signs, the PvP/PvE warning, loading veil, lazy-load/unload,
  every city hook), `client/js/wilds.js` (the forest: world build, creatures AI, encounters, Mara Venn + quests, journal, HUD),
  `wilds-rules.js` (pure game rules + save; unit test `node tools/wilds/rules.test.mjs`), `wilds-creatures.js` (procedural creature rigs),
  `wilds-audio.js` (music + ambience), `client/data/wilds/*.json` (creatures / abilities / quests), `client/music/wilds/*.mp3` (~3 MB each).
- **App hook**: one line in `app.js` next to the AEGIS import: `import('./wilds-gate.js')` (skipped with `?nowilds`). The gate registers on the
  existing generic hooks only: `window.__preRender` (per-frame), `window.__interactors` (USE prompts via `nearestInteract()`/`interact()`),
  `window.__exploreLock` (wraps any previous lock) and one capture-phase keydown listener. No other app.js changes.
- **Lazy-load flow**: startup draws only the gate (forest ellipse centre (0,625), radii 255×228; gate at (0,394), signpost at (3.5,318)).
  Within 60 m of the gate in Explore → `import('./wilds.js')` + the 3 JSON files are prefetched (no music). Crossing into the ellipse →
  "WARNING PVP AND PVE AREA AHEAD. PROCEED?" → PROCEED unlocks Web Audio inside the tap, shows the forest loading veil with progress, builds the
  forest in stages, `renderer.compileAsync` warms its shaders, then fades in. Leave by the return path and stay > 150 m from the gate (camera
  outside the forest too) for 30 s → `unload()`: meshes removed, geometries/materials/textures disposed, every collider tagged `wilds:1` removed
  (gate colliders are tagged `wildsGate:1` and stay), audio elements + AudioContext released, DOM removed. Re-entering rebuilds the identical
  (seeded) forest. A bound companion only follows you while the forest is loaded.
- **Save**: `localStorage.bcWilds` (local-only, versioned/migrated in `wilds-rules.js`), survives unload/reload.
- **Music**: "Whispers of the Wilderness" streams only after PROCEED; "Beneath the Hollow" (battle) is fetched on the first encounter or prefetched
  ~9 s after entering. Crossfades via one Web Audio graph (iOS-safe). Audible only when the city sound toggle is on (or city music was playing).
  The service worker never caches `/music/`; only `js/wilds-gate.js` is precached, `wilds*.js` + `data/wilds/*.json` are runtime-cached on demand.
- **Flags**: `?nowilds` (off), `?wildstest` or `?debug=1` → `window.__wildsGate` (state, `prefetch()`, `proceed()`, `unload()`, counters) and
  `window.__wilds.test` (`state()`, `nearest(sp)`, `walkTo(x,z)`, `inspectNearest()`, `hold()`, `talk()`, `journal()`, `travel()`);
  `?wildstest&wildsunload=<s>` shortens the unload timer for tests. Playwright flow used: `setMode('explore')`, set `__city.P.pos`, PROCEED, engage.
- **Gaps (M1)**: PvP is not live (warning text says so); save is device-only; the companion disappears in the city once the forest unloads;
  on iOS the very first PROCEED before the module finished prefetching relies on the gate-created AudioContext (music may need one more tap).

- **Deep area — Glassroot Grove (M2, `client/js/wilds-deep.js` + `wilds-deep-data.js`)**: zone 2 of the design package (mineral-veined roots,
  old power conduits, ruins; Lv 5–12) with **Orrick Vale** (Ruin Surveyor, "Tags in the Roots": 3 survey tags) and **Sable Kest** (Field Tinker,
  "The Missing Tinker": 3 tools + settle the territorial Briarback ⚠), the **Confluence** stones (recipe preview only), and the deep species
  (Briarback, Brookwarden, Veilwing, Kilnfox, the elite Rootcoloss Lv 16 + some Shardmole/Mosskit/Cinderling). New rigs are variants in
  `wilds-creatures.js` (`VARIANT`: base rig + scale + own parts, same 2 materials). Content/layout lives in `js/wilds-deep-data.js` (not
  `client/data/wilds/`), loaded only with the module.
  - **Way in / out**: the far-end spur from the clearing (30,628) to the **threshold arch** at THRESH (30,812). Within 70 m → `import('./wilds-deep.js')`;
    walk through the teal veil (or USE "Go deeper") → "DEEPER INTO THE CINDERWILDS" veil + shrink pulse → built in stages → you stand at (1400,990).
    Back: walk south through the return arch (or USE) → you're at (30,807) in Fernway Verge. Deep unloads `UNLOAD_S` (30 s) after you leave it,
    and always before Fernway Verge unloads.
  - **"Bigger on the inside" (TARDIS)**: the Grove is its own realm *off the city map* (DEEP centre (1400,1370), r 420 ≈ 3.4× Fernway Verge's area),
    so the trailhead/forest footprint seen from the city is unchanged. `app.js` clamps walkers to `window.__exploreLim || 900` (set to 1990 only in
    the deep area; the server clamps positions to ±2000). Multiplayer: positions are sent as-is; `window.__peerRealm` (wilds-gate.js) makes
    `city.js` draw only peers in your own realm (deep vs city), and a teleport > 60 m snaps a peer instead of gliding across the map.
    Fernway Verge itself was NOT moved into an interior space (it stays on the map so city/forest players keep sharing positions; option (b) scaling was rejected for collision/camera/PvP risk).
  - **City unloaded while inside** (`cityOff`/`cityOn` in wilds-gate.js): every city scene child is hidden (lights, avatar, companion,
    peers `userData.peer`, deep root `userData.wildsDeep` stay), new city objects are hidden as they appear, every non-deep collider is stashed,
    `window.__cityPaused = true` (app.js frame skips `anim`/cars/TL/labels/minimap/etc.; airport, citylife, events, npc, fish, boat, retain, aegis
    ticks return early; FX/pumpEvents + multiplayer keep running), `body.wl-cityoff` hides labels/minimap/NPC tags and the city-only HUD (`#hud` stats panel, `#status`/`#wchip`/`#live` chips, `#evbanner`, `#tourCap`, `#info`, `#tip`; restored on return), fog `0.021` (phones 0.026),
    background = fog colour, camera far 320. Nothing is destroyed, so coming back is instant. Tree colliders are pooled (~150 within 44 m).
  - **Gameplay reuse**: wilds.js `zoneApi.setZone(ZONE)` runs creatures/encounters/binding/companion/HUD/journal/NPC talk (`talkNpc`) against
    the deep world (spawn slots with `lv` bands, `qtag` for quest creatures, zone `keep()` / `respawn()`); music stays the forest score.
- **Travel lock (forest + deep)**: `window.__wildsTravelLock(on)` in app.js (one helper; wilds-gate.js flips it every frame from
  `inForest || deep`): blocks `setMode` to Orbit/Fly/Tour (the Tour button too), web (Q), jetpack, skateboard (skate.js `toggle` guard); body
  class `wl-travel` hides Orbit/Fly/Tour/Web/Jet/Board/▲▼/timeline buttons and the pause menu's Orbit/Fly/Tour (Explore/Resume stay).
  Web/jet toggles are restored on unlock. Reload never keeps the lock (nothing is stored).
- **Return barrier**: walking out of Fernway Verge stops at the ellipse edge (e 0.98) and asks "RETURN TO BURN CITY? [Stay] [PROCEED]"
  (entry-warning style). PROCEED steps you out (shrink pulse) and the forest's normal leave runs; Stay keeps you in. A jump of > 8 m in one
  frame (teleport / respawn / fast travel) is never blocked.
- **Safety net** (`safety()` hook, own try/catch, every frame): city hidden but nobody inside → `cityOn()`; moved out of the deep realm by
  anything (teleport, respawn) → `abortDeep()`; > 3 consecutive deep-frame errors or a failed deep load → `abortDeep()` (city back on, you
  stand at the threshold in Fernway Verge, controls normal); stale prompt state cleared; travel lock follows where you actually are.
  A "Return to BURN City?" prompt still open after a teleport/respawn out of the forest is closed silently (`G.closePrompt`, counted in `G.staleExit`).
- **Kill switch**: `WILDS_DEEP_ENABLED` in `wilds-gate.js` (false = no threshold arch, no deep module, no city unload). Per visit:
  `?nodeep=1` (deep off), `?nowildslock` (no travel lock + no return barrier).
- **Save v2**: `bcWilds` now `v: 2` with `zones.glassroot { visits, picked{tag_a..., clue_1...}, confluenceSeen }`; v1 saves migrate in place
  (unit test `node tools/wilds/rules.test.mjs`, which also checks one tag = one objective via `meta.obj`).
- **Test hooks** (`?wildstest` / `?debug=1`): `__wildsGate.deep` (`enterDeep`, `exitDeep`, `abortDeep`, `unloadDeep`, `CO`, `active()`),
  `__wildsGate.EX` / `exitPrompt` / `travelLock` / `shrink`, `__wildsDeep` (`treeCount`, `visChunks`, `pool`, `test.interactor/act/pick`).
- **Leak check (sw bc-v51-polish)**: desktop `?wildstest`, `__city.R.info.memory.geometries` after 3 enterDeep/exitDeep/unloadDeep trips: 917 (forest) → 920 → 922 → 923; ~36-50 deep geometries are freed each trip, the +3/+2/+1 residue shrinks (city-side churn, not deep disposal), so no fix needed.
- **Gaps (M2)**: Ashen Hollow / "A Pulse Beneath Ash" and the Confluence fusion itself are not built (preview only); deep players see each
  other but the city's own player list has no realm label; the companion re-appears beside you after each crossing (no follow animation
  through the veil); Fernway Verge is not an interior space (only the deep area is "bigger on the inside").

## City v3 — streets, junctions, LED lights, billboard art
- **Streets v3** (`client/js/app.js`, block "streets v3"): one opaque merged strip mesh for every ring road + hub avenue (no blending, no overlap).
  Cross-section in metres from the centreline: asphalt ±2.5, curb to 2.78, sidewalk to 4.8 (= `ROAD_HW`); cars drive ±1.25.
  Each vertex carries `aj` (junction data): rings get the signed arc distance to the nearest avenue junction + the side the avenue joins on,
  avenues get the distance from their start/end junction centres (`window.__roadJ` lists the junctions). The shader uses it for the rounded curb
  corners (radius `RF` 2 m), zebra crosswalks (3.1–4.9 m from the junction centre on the ring, plus the strip across the avenue mouth), stop bars,
  and to stop the double amber centre line (inside 5.45 m) and the white edge lines (across the crosswalk band) short of every junction.
  Ember curb glow + sidewalk edge light at night, wet darkening from `U.wet`. Estate roads reuse the same shader (`STREETML`, `aj` kind 0).
  The old white crosswalk boxes in `citylife.js` are no longer drawn (the `walks` list is kept for counts only).
- **River road decks**: `RIVER_BR` (up to 24 unit directions) is filled from the avenues that cross the river ring (r 75–87). The river shader
  discards itself under each deck (the road shows through) and draws an ember rail at 5 m either side.
- **Street lights**: slim tapered mast + swept arm + LED bar head with an ember ring, 2 instanced draws (`window.__lamps`) + 1 glow-sprite pass.
- **Buildings**: darker glass/steel day palette, ember accent lines every ~22 m of height (above 8 m), warm horizon band in the reflection.
  Ground grid glow is ember instead of blue.
- **Billboard art** (`client/js/citylife.js`, block "owner artwork"): files in `client/img/ads/` — `<name>.webp` (1024 px long side) and
  `<name>-m.webp` (512 px, phones / low tier). Current set: `burn-xrp-imm-ring` + `burn-skull-imm` (3:1 banners, 15×5 m),
  `burn-dragon-ring`, `burn-coin-scarcity`, `xrpyro-dashboard` (3:2 posters, 9×6.04 m), `fire-trio` + `flywheel-psalms` (2:3 portrait pylons, 5×7.45 m).
  The `ART` table maps each file to a shape and a district (`alt` = a second spot 35 m off, `out` = metres pushed away from the hub for crowded
  districts; the dragon board uses `out 42` + a crowd check). Placement: nearest free roadside spot, 13 m back from the street, facing it.
  Cost: **2 draws for all 7 boards** — one merged frame mesh + one merged face mesh whose UVs point into an atlas canvas (2048² desktop,
  1024² phones; cells in `SLOTS`) painted ~1.2 s after the city is ready (1x1 placeholder until then). Night glow via `L.artGlow(day)`.
  IMG / RACC keep their atlas boards (12×5) and the AEGIS alert faces cover only those.
  **Swap art**: export the new image at the same aspect ratio as the board shape (3:1, 3:2 or 2:3), save as WebP at 1024 px and 512 px (`-m`)
  under the same file name, bump the sw VERSION. New file name or shape → edit the `ART` row (a 4th poster fits in `SLOTS.poster`;
  more banners/portraits need a new atlas cell). Images are fitted inside their cell with their own aspect, never stretched.
  Test hooks: `window.__cityLife.artBoards` (positions), `.artAtlas` (atlas rects), `.artLoaded` (images painted), `.artCanvas`.
  Source originals: 1000014819 = $BURN/XRP/$IMM ring, 1000014929 = $BURN skull $IMM, 8D76C5A3 = dragon ouroboros (BURN IMM XRPYRO),
  9A70E085 = XRPyro dashboard, IMG_0219 = $BURN scarcity coin, IMG_9082 = Fire Trio, IMG_9886 = Flywheel Psalms.

## Strict gold: permanently locked AMM pools (feat/gold-lock-strict)
- **One rule, one file**: `client/js/goldlock.js` (plain script: `require()` on the server, `import './goldlock.js'` in app.js -> `globalThis.BCGold`).
  Gold = `locked_pct >= GOLD_MIN_LOCK_PCT` (95, % of LP supply held by black-holed accounts) **AND** `tvl_xrp >= GOLD_MIN_TVL_XRP` (5000) **AND** priced
  (XRP pair, or `tvl_priced === true`). Black-holed = lsfDisableMaster + (no RegularKey or a known black-hole RegularKey) + no SignerList (`isBlackholedInfo`).
  Change the thresholds only there.
- **Server** (`server/eco.js`): `isBlackhole()` uses `BCGold.isBlackholedInfo`; `locked_pct` is floored to 0.1 (never rounds 94.96 up to 95);
  `recompute()` sets `p.tvl_priced` + `p.gold` (both in `POOL_LIVE`). Test hook: `eco._readPool(p)` (used by the fixture test).
- **Client** (`client/js/app.js`): `b.forever = BCGold.isGold(b.p)` drives everything gold: Forever Rails (gold pools only, full length), ∞ FOREVER plaques,
  core-flow gold (`lk` = 0/1), gold seal rings, "LOCKED FOREVER" labels, gold swirls + sparks. Non-gold pools have zero gold: partly locked get ember seals and a
  blue `.lockLbl.part` "LP locked · X%" label. `window.__gold` = {min_tvl, min_pct, forced, pools}.
- **Gold dispersal**: gold swirls dissolve over their lower half (fragment discard on a flow-moving cell hash + glowing edge, same swirl mesh) and shed golden motes
  that drift outward + up with the flow and fade, all in the existing sparks Points draw (+0 draw calls). Budget is the sparks cap: phones 150, desktop 360 total
  (dispersal takes up to half when gold pools exist, the rest stays normal sparks), Low quality = off, hidden when adaptive quality has turned bloom off.
  `window.__swirl` = {n, geos, particles, sparks, disperse, gold}.
- **Visual test hook**: `?debug=1&goldtest=1` (top-2 TVL pools) or `goldtest=XRP/BURN,XRP/IMM` (pairs or AMM accounts) forces gold for those pools (labels say "· test").
- **Tests/audit**: `test/goldlock-sim.js` (in `npm test`, fixture-based, stubbed fetch: rule edges, signer list/regular key, 94.96% floor, locked pool < 5k not gold,
  unpriced pair). `scripts/lockaudit.js` re-audits every tracked pool against the ledger -> `lock-audit.md`.
- **Gaps**: gold is decided when the city builds; a pool crossing the line while the page is open turns gold on the next load. Real-phone check of the dispersal
  look/fps is still pending (tested in headless iPhone 14 emulation, SwiftShader).

## AEGIS Live Cams (feat/live-cams, sw bc-v52-livecams)
- **Server** `server/cams.js` (hook: one line in `server.js` before `/api/eco/live`, plus `Cams.start()` at boot).
  Key: `process.env.YT_API_KEY || process.env.Youtube_API` (the Fly secret is named **`Youtube_API`**). Never sent to the client.
  With a key: YouTube Data API v3 `search.list` (type=video, eventType=live, videoEmbeddable) per category + one `videos.list`
  (liveStreamingDetails,snippet,status) for viewer counts; keeps only public, embeddable, still-live streams. Cold start searches all 6
  categories (600 units); after that one category per tick round-robin (`CAMS_TICK_MIN`, default 20 min) + one videos.list → ~7.3k units/day.
  No key / API error = last good list, else the curated `FALLBACK` (12 ids, oembed-checked Oct 2026; live state not verifiable from the sandbox).
  Cache `<DATA_DIR>/cams.json`. Categories: City/Traffic, Nature/Wildlife, Beach/Ocean, Space/ISS, Weather/Storms, Airports.
- **API**: `GET /api/cams` → `{source:'youtube'|'fallback', updated, categories:[{name, streams:[{id,title,channel,viewers}]}]}` (viewers desc,
  30/min/IP). `GET|POST /api/cams/:id/comments` (`{text, name, pid}`): 200 chars, 1 per 5 s per IP and per player id, last 100 per stream,
  `social.clean` (profanity mask, `<>` → `‹›`) + URL removal, persisted to `<DATA_DIR>/cam-comments.json`. Names are client-supplied (city WS name
  via `window.__myName`, set in `city.js`), so they are cosmetic, not authenticated.
- **Client** (`aegis.js`): polls `SRV/api/cams` every 10 min; Pyramid faces show the top streams across categories as `i.ytimg.com` hqdefault
  thumbnails with a viewer count; tapping one opens the live browser (`__aegis.openLive(cam|null)`): category tabs, ranked list, one
  youtube-nocookie iframe (the only iframe, only in the modal), comments under the player (textContent only). The console has a
  "Browse live streams" button. `/api/cams` down = the old AEGIS cams/modal (`openPlain`). CSP already had `frame-src https:`.
- Tests: `test/cams-sim.js` (in `npm test`): fallback, stubbed API ranking/filtering, quota round-robin, key never leaked, comment length/rate/escape/URL.
- Gaps: comments have no moderation UI/report button; the dead "acquiring signal" screens were the AEGIS feed's cams (localhost CORS / stale ids), now replaced.

## View menu on phones / return from the arena (sw bc-v53-orbitfix)
- Phones (`MOBILE`): the top-centre `#vExit` button now shows in every mode: "✕ Exit" in Explore/Fly, "☰ View" in Orbit and Tour, and opens `#vMenu` (Orbit/Fly/Tour/Explore/Resume; the Wilds travel lock still hides all but Explore/Resume via `body.wl-travel`). Landscape phones hide the `#btns .seg` mode dock, so before this Orbit had no way out.
- Arena gate tap stores `sessionStorage.bc_ret` (mode, walker pos, camera, yaw); the next city load restores Explore/Fly at that spot when no `?mode`/`?view` is given. `pageshow` (bfcache) closes a stale open menu.
