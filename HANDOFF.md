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

### Estates live payout prerequisites — Oct 29, 2026

- Read-only XRPL checks confirmed IMG/PLX pool `rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ`, IMG issuer `rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd`, PLX issuer `rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q`, and a treasury LP balance at validated ledger 107988107.
- Actual Pollux IMG reward: tx `84C32FA3653FB912F5E51A030BFEBC00DBA2D69638848276B6670FD9C786EE54`, ledger 107987683 / hash `C2C9E18FB714886006FBA617816FE3DECE1593502F7D8378C4FDBDF27A34796C`, from `r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V` to the Estates treasury. Exact delivery `0.31949269804787` IMG. Its structured memo names the designated pool. This evidence does not approve an entire historical range or all payments from that source.
- Receipt accounting retains existing micro-IMG units. Additive table `estate_img_reward_precision` stores exact delivery and sub-micro dust atomically with new receipts; no existing balances change units. Dust is retained for audit, not distributed or automatically rolled forward. Do not drop this table on rollback. Legacy receipts have no precision row; replay remains accepted only for an exact micro-unit match.
- The IMG scanner independently verifies other source Payments too, excluding validated non-IMG deliveries and `tec` failures from IMG funding while still checking their ledger/time binding. XRP minimum rewards are **not** yet allocated by this IMG pipeline.
- Tests: `for test in server/estate-img-*.test.js; do node "$test" || exit 1; done`, server/game syntax checks, and `node server/estate-sale-production-gates.test.js`. Read-only in-memory replay of the actual ledger above also passed. No transaction was signed or submitted.
- Activation remains incomplete: production scanner/allocation/hour-close wiring, pool-specific reward classification, durable payout execution/reconciliation, owner trustline checks, IMG-to-XRP settlement, funding/reserve caps, and production signing/configuration access. Global `/api/status` reported `payoutsPaused:true` during this check; diagnose that pause before changing it because other treasury jobs share it. No payout worker or activation flag was added by this receipt compatibility fix.

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
- **Swirl colours + gold lock vein** (PR replacing #118): every AMM swirl takes its pool's live activity colour (`b.actCol`, blue → purple → orange → red, same as the bridge tube;
  the swirl core is that colour lerped 35% toward the rail core's cyan, the glow sheath is the colour itself), and so do its sparks. Repaint is CPU-only: `swirlRecolor()` (set in the
  swirl block, called at the end of `actScore()`) rewrites the merged mesh's `sc` rgb per vertex range + the spark colours. Still ONE merged swirl draw + ONE Points draw.
  Gold pools (`b.forever`) are NOT painted gold any more: they keep the activity colour and get a **gold vein** down the middle of the swirl tube and of the rail core
  (view-facing band from the kept tube normals, `off = sqrt(1 - nView.z²)`; vein where `off < w`). Width `w = veinW(b)` (app.js, above the rails polish block):
  log10 of `b.lockedXrp` (= tvl_xrp × locked share), ~3.2k XRP → .28 of the core radius, 1M+ XRP → .88, clamped. Swirls pack it into `fl.y` (`sp + 8·round(100·w)`,
  unpacked in the vertex shader; the sheath gets `w/2.6` so both shells share one vein); the rail core gets a `vw` uniform. The old gold shimmer + lower-half dissolve now
  act on the vein only (the activity-coloured tube never breaks up); gold dispersal motes and gold sparks are unchanged. LOW tier: same vein, core shell only (no sheath).
  `window.__swirl.veins` = [{pool, lockedXrp, w}]. Gap: partly locked (non-gold) pools get no vein, by the strict-gold rule; no live pool is gold right now, so check it with `goldtest`.
- **Lock halo** (see the AMM locked liquidity section below): the vein stays the strict-gold badge; how much LP is locked is the gold chain halo.
- **Rail sync** (sw bc-v70-railsync): every major rail (TVL >= 100, a tower end that gets a swirl) now ENDS on that tower's swirl helix start instead of running to the roof
  near the tower axis: `helixAt()` (app.js, above the pool loop) is the swirl's own helix (same radius, height, spin, per-tower order + cap: LOW 3 / else 6), computed from the plain arc;
  `railSync()` rebuilds the rail as a CurvePath of two cubics: helix start (leaving along the helix tangent) -> the old arc midpoint (same clearance height, horizontal) -> the other helix start.
  The swirl then starts exactly at the rail end (no Bezier lead-in, `b.hx[end]` reused; one extra spline point so it leaves along the true helix tangent). Rail thickness, activity colours,
  flow phase and the gold vein are unchanged (same tube radius/shaders). Ends without a swirl (minor pools, capped towers, ends below 8 m) keep the old roof endpoint. `curve.v0/v2` stay the end points
  (garage decks). CurvePath.getPoint is clamped (three returns null at t=1 from float error). Test: `?debug=1&railsync=0` shows the old endpoints (A/B only). +0 draws.
- **Visual test hook**: `?debug=1&goldtest=1` (top-2 TVL pools) or `goldtest=XRP/BURN,XRP/IMM` (pairs or AMM accounts) forces gold for those pools (labels say "· test").
- **Tests/audit**: `test/goldlock-sim.js` (in `npm test`, fixture-based, stubbed fetch: rule edges, signer list/regular key, 94.96% floor, locked pool < 5k not gold,
  unpriced pair). `scripts/lockaudit.js` re-audits every tracked pool against the ledger -> `lock-audit.md`.
- **Gaps**: gold is decided when the city builds; a pool crossing the line while the page is open turns gold on the next load. Real-phone check of the dispersal
  look/fps is still pending (tested in headless iPhone 14 emulation, SwiftShader).

## AMM locked liquidity halos + black-hole supply singularities (city/amm-lock, sw bc-v69-ammlock)
- **Files**: `server/amm-lock.js` (verification, cache, `/api/amm-lock`), `client/js/amm-lock.js` (visuals + card sections + `?locktest` fixture), `test/amm-lock-sim.js` (in `npm test`).
- **Hooks (small)**: `server/server.js` requires it, routes `/api/amm-lock`, calls `AmmLock.start(Eco)` after `Eco.start()` (it reuses `eco.rpc`, so the same ws + HTTP fallback).
  `client/js/app.js`: `initAmmLock({...})` right after the first `actScore()`; `showInfo` opens `u.kind==='ammlock'` (singularity tap) and appends the lock/burn section
  to pool + token cards (`window.__ammLock.card`); the pool card's "Locked LP" row and the hover tip read `__ammLock.lpText(p)` ("x% verified" or "x% reported · unverified").
- **Visual hierarchy** (+3 draw calls total; 2 on LOW tier / reduced motion): bridge body unchanged (thickness = TVL, colour = activity blue→purple→orange→red);
  **gold chain halo** = ONE InstancedMesh of segmented torus rings at each bridge's arc midpoint: lit gold arc = VERIFIED permanently locked share of LPTokenBalance
  (ring thickness also grows with it; ≥ 89% gets a slow glint), dim amber dashes = time-locked (Escrow), faint steel = the rest, grey dashes = UNVERIFIED with a reported lock (no gold at all).
  **Singularity** = ONE InstancedMesh, one per TOKEN (never per pool), black core + violet rim, beside the tower on the side away from the hub at street level
  (apart from every rail), radius `1.1 + 3.4·sqrt(burn share)`; **particles** = ONE Points draw, motion fully in the vertex shader (no per-frame CPU), phones 14 / desktop 32 per singularity,
  off on LOW tier and with `prefers-reduced-motion` (halo glint frozen too). Invisible pick spheres (0 draws) make singularities tappable. Matrices re-applied every 2 s (towers rescale with mcap; minor-pool toggle).
- **Halo vs #121 gold vein**: the vein **stays** for strict gold only (≥ 95% verified AND ≥ 5k XRP, `goldlock.js`) and the halo is the measurement for every pool. They use the same
  black-hole rule, so a gold pool always also has a (near-)full halo: the halo says *how much*, the vein + Forever Rails say *certified*. Replacing the vein would have removed a protected,
  liquidity-weighted signal; keeping it as the badge avoids two competing "how much" readings. The legend in the cards says so.
- **Verification rules** (server): permanent = `account_info` lsfDisableMaster AND (no RegularKey or a `BCGold.BH_KEYS` black-hole key) AND no SignerList AND not an AMM account (`AMMID`).
  Pool %: LP held by permanent accounts / `amm_info.lp_token` (LPTokenBalance), floored to 0.01. LP holders ≥ 0.1% are classified (max 60), smaller ones are "not checked" and never counted.
  LP in Escrow objects on the AMM (`account_objects type escrow`) = time-locked. A holder whose account_info fails makes the pool **unverified** (`locked_pct: null`, `locked_pct_min` kept).
  Token burn: balances of black-hole holders (issuer and AMM accounts excluded; top 30 holders ≥ 0.01% of supply, 25 trustline pages) / **`gateway_balances` obligations** on the issuer
  (fallback: sum of the issuer's trustline balances when the scan is complete; `supply_src` says which). Incomplete trustline scan = `partial` (lower bound).
  Master-disabled holders that still have a key or signers = "sent to designated address" (not counted). Issuer black-holed = `issuer_keys_disabled`, shown separately, never burned supply.
  Old `locked_pct` in `data.js` is shown only as "reported · unverified" until the API has a verified figure. Burn history (`burn_vol`, tokens returned to the issuer) is shown as reported context.
- **Cache / rate limit**: full refresh every 2 h (first run 90 s after boot, `AMM_LOCK_DELAY_MS`), ≥ 150 ms between calls (single flight), account_info cached 6 h. Anything older than 6 h
  (server and client check `t_ms`) is served as UNVERIFIED with no %. `AMM_LOCK=0` disables it. A full pass is ~1,000 calls / ~6 min.
- **API**: `GET /api/amm-lock` → `{ts, t_ms, last_ok, rules, pools: {amm: {status, locked_pct, locked_lp, lp_supply, lp_supply_src, time_locked_pct, held_pct, unchecked_pct, destinations[{acct, pct, cls, reason, source}], reported_pct}},
  tokens: {name: {status, burned, burned_pct, supply, supply_src, black_holes[...], issuer_keys_disabled, issuer_src, pools[]}}}` (503 `warming_up` before the first pool is read).
- **Test hooks**: `?locktest` = client fixture on real bridges/towers (partial 90.5%, 100%, keyed holders 10%, failed fetch, escrow 50+20%, 0%, small pool; tokens: multi-pool 15%, 60%,
  issuer black-holed with no burn, failed fetch, designated address). `?debug=1` or `?locktest` adds `window.__ammLock.view()/apply()/load()`.
- **Gaps**: halo sits at one point per bridge (midpoint), not along the rail; no pool→singularity link line (left out to keep the 3-draw budget and avoid implying the tokens are in the pool);
  token scans check only the top 30 holders (a tiny black-hole balance below 0.01% is not counted, so burn is a slight lower bound); RLUSD is not scanned (unverified);
  Escrow detection depends on IOU escrows being listed on the AMM account (TokenEscrow); real-phone look/fps still pending (headless SwiftShader only).

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

## Fishing: fight upgrade, daily challenges, tackle shop panel (sw bc-v54-fishing)
- Files: client/js/fish.js (line-tension bar in the reel UI; Tackle & Bait panel fix: the `fPanel` element was being swallowed by a trailing comment on main and is now created again), client/js/fishing-rules.mjs (+ fishing-rules.test.mjs: rules, journal, daily challenges), server/fish.js + server/server.js (server-authoritative daily challenges), test/fish-sim.js.
- Tests: `npm run test:fishing-rules`, `node test/fish-sim.js`; `npm run test:all` runs both plus the server sims.
- Hooks: `window.__fish.openShop()` / `openLog()` for smoke tests. Touch ghost-click guard (pointerdown + capture-phase click filter) is unchanged.
- Known gap: not yet in the default `npm test`; iPhone 390x844 smoke is about 5 draw calls above main (~403 vs ~398 in the swiftshader harness).
- Cast generation guard (sw bc-v72-fishgen): `castAt` bumps `castGen`; the bite timer, the bite-escape timer and the post-`api('cast')` continuation only act if they belong to the current cast. Before, cancelling a cast (Reel in / Esc / too-early hook) and recasting let the old cast's timer fire an early `❗ Bite!` on the new cast (reproduced in Playwright on iPhone 13 and desktop). A used-up bait now falls back to Worm before the cast (the server already did this; the UI said `bait: shrimp` with 0 left).

## CinderWilds city horizon (sw bc-v55-horizon)
- client/js/wilds-gate.js `buildForestHorizon()`: visual-only distant forest skyline north of the city (group `wilds-horizon`; 1 ridge mesh + 4 InstancedMesh, 132 trees, about 5 draw calls, no colliders, no forest loading).
- It stands inside the playable forest area (z 485-580), so `frame()` shows it only while the Cinderwilds module is unloaded; while the deep area is active, cityOff/cityOn hide and restore it like any other city object.
- Fixed on integrate: a stray literal `\n` token before the boot block (a module syntax error; `node --check` misses it on ESM, use `node --input-type=module --check < file`).
- iPhone 390x844 smoke (swiftshader, ?perf=1): city ~402 calls (main ~396-404 in the same harness), forest 278, deep 53.

## Blacktide (pirate region prototype, `/blacktide/`)
- Files: `client/blacktide/` (index.html, blacktide.js, ocean.js, style.css, README.md, THIRD_PARTY_LICENSES.md). Own three.js scene from `vendor/three` (importmap); no shared renderer, no server protocol changes.
- **Phone fixes (sw bc-v56-btphone)**: portrait hFOV floor 66° (`fitView()`, refits on resize + orientationchange; was ~28° across so the ship filled the screen); frame dt cap .04 → .1 (below 25 fps the ship sailed in slow motion); ocean grid 64² on touch (100² desktop; normals are recomputed on the CPU every frame); keyboard hint hidden on touch; empty favicon (console 404).
- **Test hook**: `?bttest` or `?debug=1` → `window.__bt` = `state()` {started, speed, heading, x, z, cam, proj} and `info()` {calls, tris, geos, dpr}.
- **Smoke harness** (not in git): Playwright WebKit as iPhone 13 (390x844, touch, mobile Safari UA) + Chromium (SwiftShader) mobile + desktop: TAKE THE HELM, hold ▲ / ↶, FIRE, camera follow, fps, draw calls, console errors. Sandbox note: WebKit needs `proxy:{server:'per-context'}` + a context proxy with `bypass:'127.0.0.1'` to reach a local server.
- **City entry (sw bc-v57-btlink)**: one pause-menu item in `client/js/app.js` (view menu `#vMenu`): `⚓ Blacktide` stores `sessionStorage.bc_ret` (same object as the arena gate) and navigates to `blacktide/`. Blacktide's top-left "BURN CITY / BLACKTIDE" link (`../`) brings you back; the existing bc_ret restore puts you back in Explore/Fly at the same spot. Hidden while the Wilds travel lock is on (`body.wl-travel`), since you can't leave the forest/deep realm that way. Tested: desktop Chromium + iPhone 13 emulation (Chromium, touch joystick) menu → Blacktide → return → walk. Headless WebKit can't finish the city load in this sandbox (stalls at 55% "Building pool bridges", pre-existing, not Blacktide), so the city half of the trip is not WebKit-tested.
- **Ports + trade + saves (sw bc-v58-bttrade)**: `client/blacktide/trade.js` (ports, DOCK button, port market panel, HUD Waters/Doubloons rows; hooked into `blacktide.js` with `Trade.init(scene)` + `Trade.tick(ship.position)` per frame, which locks the helm while docked) and `server/blacktide.js` (one hook line in `server.js` after `/api/cams`).
  - Currency: **gold doubloons**, Blacktide-only. Not BURN, XRP, any XRPL token or city money; nothing converts in or out.
  - API: `GET /api/bt/world` (public: regions, ports, goods, current prices, 30/min/IP) · `GET /api/bt/state` · `POST /api/bt/buy|sell {port, good, qty}` · `POST /api/bt/upgrade {kind:'hold'}`. Auth = the city's XAMAN bearer token (`localStorage.bcToken`, `Pay.checkToken`); 60 req/min per captain + 120/min per IP. qty must be a JSON integer 1..1000. The server computes every price (base x port multiplier x a deterministic ±10% per 6 h "tide"; sell = 85% of that port's buy, so no same-port loop), checks gold, hold space and cargo; client gold/price/cap fields are ignored.
  - Save: `<DATA_DIR>/blacktide.json` (`/data` on Fly) via `server/store.js` (atomic write + .bak), written on every trade. New captain: 200 g, hold 20. Hold upgrade +10 for 300 / 700 / 1500 g (max 3 tiers). XP = units sold; level = 1 + floor(sqrt(xp/25)) (shown in state, not yet used for gating).
  - Ports (on existing islands): Cinder Cove (-56,-84), Saltmere (120,40), Gallows Reach (-135,115). Goods: rum, sugar, spice, timber, silk.
  - **Regions** (data in `server/blacktide.js` `REGIONS`): `ashen-shallows` levelMin 1, pvp false, protected, live (all ports are here) · `blackreach` levelMin 8, pvp true, not live · `cinder-maw` levelMin 20, pvp true, not live. **No PvP gameplay exists.** Design for later: entering a pvp region needs `level >= levelMin` (server-checked), a warning prompt like the Wilds gate, cargo at risk only there, and server-authoritative ship positions/combat first (today positions are client-side, so docking range is not server-verified; trading only needs a valid port id).
  - Not signed in: prices show, trade buttons are disabled with a "sign in with XAMAN in BURN City" note.
  - Tests: `test/bt-sim.js` (in `npm test`): regions shape, spreads, qty/port/good validation, capacity, overspend, sell-without-cargo, upgrade tiers, save + reload from disk, HTTP auth (missing/expired/forged token), client fields ignored, rate limit. Phone smoke (WebKit iPhone 13): dock Cinder Cove → buy 2 rum → dock Saltmere → sell 1 → reload → same gold/hold; also a server restart keeps it. `?bttest`: `__bt.tp(x,z)`, `__bt.trade.state()/ports()`.
  - Hold upgrade also smoke-tested in the port panel (WebKit iPhone 13: cap 20 → 30, 1000 → 700 g, survives reload).
  - Not built yet: NPC ships, quests, speed upgrade, level gating, multiplayer, server-side ship position.

## Oct 22 GPT batch (integrate/gpt-oct22)
- **PYRETHEUM directory + rooftop** (`client/js/tower-interior.js`): wall directory near the entrance, lift menu, guarded `travelTo()` (never lands on a blocked point),
  Ember Bar menu, lounge seating, rooftop Sky Lounge (InstancedMesh skyline/windows/planters, glass perimeter collision).
  Private residences call `GET /api/tower/residence` (Bearer `bcToken`), which **does not exist on the server yet**, so entry always fails closed.
  `?towertest=1` adds `travelTo` and `checkDestinations()` (floor + collision + rooftop perimeter probes) to `window.__towerTest`; nothing runs for normal players.
  Asset policy: `docs/pyretheum-visual-assets.md`.
- **Skate physics** (`client/js/skate-physics-core.mjs` + `.test.mjs`, in `npm test` and `npm run test:skate`): carving keeps world momentum, lateral grip decay, board lean.
- **Forest polish**: `wilds-gate.js` toggles `body.wl-forest` in the forest / deep area to hide city banners and toasts; skate touch buttons respect safe areas and small phones.
- **BURN Radio plan** (`client/music/README.md`): docs only. Audius profile streaming does not by itself grant in-game sync/public-performance rights; use only the official Audius API/embed and confirm the owner holds the rights to every track before shipping.

## Eternal Grind labs + design batch (integrate/eternal-grind-oct22, sw bc-v60-egoct22)
Merged 15 Xrpassassin branches from Oct 21 22:08–23:18 (feat/eternal-grind-progression-core was superseded by feat/eternal-grind-xp-core-integration, which carries the same module plus the live wiring).
- **Live game changes (client/dungeon/index.html):** enemy attack telegraphs (windup pulse/tint), procedural combat SFX (`sfx.mjs`, pause-menu toggle, `localStorage.egSfxMute`, AudioContext only after a gesture), XP awards routed through `progression-core.mjs` (`advanceExperience`, same curve as before).
- **Opt-in model pilot:** `?enemyModels=1` swaps Harpy sprites for the animated Quaternius Bat. GLTFLoader/SkeletonUtils are lazy `import()`ed only with that flag, so the default/mobile load is unchanged.
- **Standalone labs (no save writes):** `audio-lab.html`, `combat-lab.html`, `visual-lab.html`, `enemy-behavior-lab.html`, `forest-encounter-lab.html`, `regional-encounter-planner.html`, `character-migration-lab.html`, `enemy-model-workshop.html`. The title-screen Workshop button only shows with `?debug=1` or `?labs=1`.
- **Assets:** CC0 Quaternius Slime/Bat/Dragon as binary GLB in `client/dungeon/a/models/` (+ `PROVENANCE.txt`). The branch shipped them as ~24k lines of base64; they were decoded byte-for-byte. Never commit base64 blobs. Vendored three r160 `examples/jsm/loaders/GLTFLoader.js` + `utils/SkeletonUtils.js` (MIT, client/vendor/three/LICENSE).
- **Pure modules + tests:** `progression-core`, `character-migration-preview`, `migration-plan`, `migration-staged-writer` (`npm run test:eternal-grind`, also run by `npm test`). Two branch test bugs fixed (undefined `twoThreshold`; stale error regex).
- **Docs/data only:** `docs/design/*` progression/class proposals + beta migration safety contract, `client/dungeon/FOREST_ENCOUNTER_CATALOG(.schema).json` + contract.
- Gaps: migration writer/planner are not wired into the live save yet; model pilot tints overwrite material base colors (cosmetic, flag-only).

## Pyretheum residences stub (fix/tower-residence-stub, sw bc-v61-residence)
`/api/tower/residence` (server/server.js, next to `/api/tower/midnightbluff`): 401 without a Xaman token, 429 when rate-limited, otherwise `503 {error:'not_available_yet', residences:[]}`. `client/js/tower-interior.js` shows "Private residences are not open yet…" for that error. Replace with the real XRPL NFT ownership check (Firekeepers / 589 Protocol / RACC → `residences:[{key,unit,kind,name}]`) when it is built.
Known open items (Oct 22): live cams fall back because the running machine has no `Youtube_API` env (secret set Oct 21 but not applied; needs `fly secrets deploy` or `fly deploy`); Blacktide dock range is client-only (server `/api/bt` trusts the dock claim).

## Blacktide NPC ships, spectral ocean, cannon combat + Play section (integrate/blacktide-npc, sw bc-v62-btnpc)
Integrates Xrpassassin PRs #96 → #97 → #99 → #101 (stacked; tip #101 merged) and #103.
- **Ocean** (`client/blacktide/ocean.js`): deterministic 16-component directional spectrum (adapted from DRIFT, MIT; `THIRD_PARTY_NOTICES.md`), analytic normals, wavelengths ≥ 62 so the 64² phone grid doesn't alias. Same `sampleOceanHeight` contract for ships/ports. Also fixes the main bug where `elapsed+=dt` sat inside a comment (waves were frozen).
- **NPC ships** (`boats.js`, `boat-ai.js`): 3 procedural vessels (2 merchants, 1 patrol) on routes near the three ports; merchants evade, the patrol notices/approaches/engages. ~5 meshes each (≈15 draw calls).
- **Combat** (`combat.js`, `cannon-ai.js`): player broadside damages/sinks NPCs; the patrol telegraphs (red lamp + message) then fires. **Client-side and cosmetic only**: no gold, loot, XP or server call on hits/sinks; hull 0 just disables the ship (no repair/respawn yet). Trade, `/api/bt`, ports/docking, hold upgrade and saves are unchanged and still server-authoritative. Still no PvP.
- `?bttest` `__bt.state().boats` lists live NPCs (id, kind, x, z, health).
- **Play section** (`client/js/play-menu.js`, #103; *superseded by the Movement & Games hub below, file removed*): top-right `▶ Play` button opens a game picker; Blacktide moved out of the pause view menu into it. It calls `window.__launchBlacktide()` (app.js: stores `sessionStorage.bc_ret`, then `blacktide/`), so the `../` return link still restores Explore/Fly at the same spot. Hidden under `body.wl-travel`.
- Tests: `npm run test:blacktide` (ocean, boat AI, cannon AI; also in `npm test`). CI: `.github/workflows/blacktide-ocean-test.yml`.
- Gaps: NPC sinkings don't respawn until reload; no repair; cannonballs allocate a small geometry per shot (disposed on expiry).

## City transport/fly controls, input-latency HUD, AEGIS live explorer (integrate/city-aegis, sw bc-v63-cityaegis)
Integrates Xrpassassin PRs #105 → #106 → #107 → #108 → #109 (stacked; tip #109 merged; #103 already landed in #112).
- **Transport menu** (`client/js/transport-menu.js`; *superseded by the Movement & Games hub below, file removed*): top-right `⇄ Transport` (Flight → `window.__setBurnMode('fly')`; Lake boat → Explore + a hint). `✈ Fly` left the `#btns` mode dock (still in the pause view menu). Phones (≤520px) show the icon only so it sits between `#vExit` and `▶ Play` (the full label overlapped `#vExit` on iPhone 13; fixed on integrate). `setMode` keeps the Wilds travel-lock guard.
- **Fly on desktop** (app.js): no pointer lock on click any more; right-drag looks, left-click inspects (hover tips + `showInfo` work in Fly like Explore).
- **`?perf=1` HUD**: adds input→next-frame p95 (`__perf.inputP95`, `inputSamples`); the listeners only exist with `?perf`.
- **AEGIS live explorer** (`client/js/aegis.js` `openLive`): "All streams" tab, search + sort, feed-health line (CONNECTED / DEGRADED / STALE from `LC.ok`/`LC.fails`/`LC.source`), incident cards that open the best title-matched stream (text match only, not location-verified), one iframe at a time, stale comment responses ignored. All text via textContent.
  - `?citysrv=` is now restricted to same-origin, burn-city-game.fly.dev, or localhost (http allowed only for localhost); anything else falls back to the default server.
  - Server untouched: `/api/cams` YouTube search keeps `safeSearch: 'moderate'` (#104) and the YouTube source.
- Gaps (fixed in sw bc-v67-hub): the phone Fly help line now shows touch controls; Lake boat now takes you to the dock.

## Wilds: Yuka wander steering + Glassroot ambient wildlife/enemies (integrate/wilds-yuka, sw bc-v64-wildsyuka)
Integrates Xrpassassin PRs #110 → #111 (stacked; tip #111 merged).
- **Yuka** (`client/vendor/yuka/`): upstream yuka 0.7.8 `build/yuka.module.js` byte-for-byte from the npm tarball + upstream MIT `LICENSE` + `PROVENANCE.txt` (sha256). The branch's copy had an edited copyright year; it was replaced with the exact upstream file. Loaded only with the Wilds forest module (~440 KB, not on the city path).
- `client/js/wilds-yuka-ai.mjs`: one Yuka `Vehicle` + `WanderBehavior` per creature, used only for the idle/wander heading in `pickWander`; Burn City still owns position, collision, terrain bounds, animation and state. Agents are disposed on despawn/zone unload/reset. Fixed on integrate: non-finite `dt` is now rejected (the branch's own test expected that and failed).
- `client/js/wilds-ambient-spawns.mjs`: deterministic (seeded) ambient slots in the deep area (8 Mirehare, 6 Ashfang, 3 Veilwing, 3 Shardmole; 9 hostile), away from trails, creek, clearings and authored quest spawns. Hostile slots chase and start an encounter within 2.8 m only while exploring (`⚔` tag).
- New species Mirehare + Ashfang: rigs in `wilds-creatures.js`; data in `client/js/wilds-ambient-species.mjs`, merged into the loaded `creatures.json` by `prefetch()` only when the id is missing (`client/data/wilds/` is not edited by integrations; moving them into the JSON later is fine, the JSON wins).
- `wilds-navmesh-adapter.mjs` + `docs/cinderwilds-three-pathfinding-spike.md`: isolated three-pathfinding adapter, not wired into live movement.
- Tests: `npm run test:wilds` (yuka-ai, ambient-spawns, ambient-species, navmesh-adapter; also in `npm test`).

## Wilds navigation pieces + zombie nav harness (integrate/wilds-zombie-nav, sw bc-v65-wildsnav)
Integrates Xrpassassin PRs #44 → #46 … #60 (stacked; tip #60 merged), #45 and #61.
- **Pure, renderer-free modules** (`client/js/wilds-*.mjs`, each with a `.test.mjs` + `docs/wilds-*.md`): waypoint follower, path smoothing, route validation, navigation harness/controller/simulation, replan policy/queue/worker/orchestrator, route invalidation, replan pipeline simulation, navigation load test + benchmark (`npm run bench:wilds-navigation`), world-query profiler. **Not wired into live creature movement.**
- Only live-file change: `wilds.js` `__wilds.test.previewPath` (`?wildstest` / `?debug=1` only) now validates the sampled route with `validateWorldRoute` before drawing it.
- Tests: `npm run test:wilds-nav` (in `npm run test:wilds`, so in `npm test`). Zombie harness `test/zombie-nav-sim.js` (`npm run test:zombie-nav`, appended to `npm run test:all`): checks the classic map's real `server/cod.js` flow field (reachability, next step lowers distance, waypoint passes body collision) for 1/2/4/8 players. No server/zombie gameplay changes; Zombies joystick/landscape layout untouched.
- Fixed on integrate (all three failed on the branch itself): waypoint follower now stops after `maxWaypointsPerStep` (the cap was overrun by one); load-test expectation (queue-full rejects the newest arrival, so `sim-2-0/2-1` remain); pipeline test passes `sampleSpacing: 0.1` because its 0.2 m blocker sits between 0.75 m samples. Note: route validation is sample-based, so obstacles narrower than `sampleSpacing` can be missed.

## Graphics labs (integrate/graphics-labs, sw bc-v66-gfxlabs)
Integrates Xrpassassin PRs #63, #64, #65, #66, #67. All comparison tools are opt-in; normal players (phones included) see the same image and the same draw calls, DPR caps and adaptive quality unchanged, no new passes/lights.
- **Wilds presets** (`wilds-graphics-profiles.mjs` #63, `wilds-atmosphere-presets.mjs` #65): multipliers on the existing fog density/tint, light-shaft opacity and foliage sway (`UNI.uSway`). Production always uses `balanced` (all 1, tint .85 = the old constants). `?wildstest` / `?debug=1`: `__wilds.test.setGraphicsPreset('balanced'|'cinematic'|'mobile')`, `setAtmospherePreset('balanced'|'moonlit'|'clear')` (reset on unload). #63 and #65 both scaled fog/shafts; integrate keeps both (factors multiply).
- **Ground material lab** (`wilds-ground-materials.mjs`, #64): the alternate "natural" floor texture is only created with `TEST`; `__wilds.test.setGroundMaterial('natural'|'current')`.
- **City bloom comparison** (`bloom-comparison-presets.mjs`, #66): `?graphicslab` adds `window.__graphicsTest.setBloomPreset('balanced'|'ember'|'crisp')` (scales the existing UnrealBloomPass strength, sets radius/threshold). Without the flag `bloomStrengthScale` stays 1.
- **Zombie visual palette** (`client/arena/zombie-visual-presets.mjs` + `docs/zombie-visual-asset-plan.md`, #67): data + plan only, not imported by the arena yet.
- Tests: `npm run test:graphics-labs` (in `npm test`).

## Movement & Games hub (ui/movement-games-hub, PR #117, sw bc-v67-hub)
Replaces `transport-menu.js` + `play-menu.js` (both deleted; nothing else imported them) with `client/js/movement-games-menu.js`.
- **Opener** `#bcMoveGamesOpen` sits inside the `#btns` toolbar before `🎮 Play` / `⋯` (`ui.js` keeps it on the bar via its `stay` set), so it never covers them (the old fixed buttons hid `🎮 Play` and `⋯ More` on every screen). Phones (≤520px wide or ≤500px tall, i.e. portrait and landscape): label `⇄ Play ▾`, and the toolbar's `🎮 Play` is hidden there because there is no room beside `✕ Exit`/`☰ View`; the arena is the hub's **Multiplayer arena** entry instead (it clicks `#playBtn`, so the same handler).
- **Entries**: Orbit / Explore / Tour / Flight (`window.__setBurnMode`, `#tour`), Lake boat, Blacktide (`window.__launchBlacktide`, so `bc_ret` + the `../` return link still work), Multiplayer arena, Fishing, The Wilds, BURN City (Orbit). Every entry closes the panel first (also when refused). Esc closes it in the capture phase, so it doesn't also open the pause menu; `pageshow` closes a stale one.
- **Take me there** (app.js hook `window.__walkTo(x, z, face)`): Explore at a real anchor, facing it. Lake boat: `__boatWorld.docks[0].base + dock dir·3` (the spot `boat.js` drops you when you leave a boat; `🚤 Board boat` shows). Fishing: fishing dock `base + dir·16` (within the 6 m cast zone at the tip; `🎣 Fish` shows). Wilds: 16 m south of `GATE` (from `wilds-gate.js`, dynamic import, so `?nowilds` hides the entry), outside the warning ellipse, inside the 60 m prefetch radius. Refuses during the travel lock, in a boat or in the tower; then it falls back to Explore + a hint.
- **Hints** use city toasts via the app.js hook `window.__bcToast(text)` (text only, escaped), not `#help`, which every mode change rewrites.
- **Wilds travel lock** (`body.wl-travel`): only Explore and Multiplayer arena show (same as the toolbar, where `🎮 Play` stays in the Wilds) plus a note; JS also refuses the other keys.
- **Touch text**: Flight shows `left stick, drag to look, ▲ / ▼`, Lake boat `tap 🚤 Board boat`; app.js phone Fly help line: `Left stick fly · drag to look · ▲ up · ▼ down · tap things to inspect` (was WASD/right-click).
- Desktop Fly (right-drag look, left-click inspect) is unchanged; `✈ Fly` is still in the pause view menu.
- Test hook: `?debug=1` or `?hubtest` gives `window.__hub` = {open, close, travel, spots, locked}.
- **City Fly layout fix** (`js/ui.js` `syncMode`): it read the mode from the `#btns` dock, but `✈ Fly` left the dock in #109, so Fly read as Orbit and `body.mFly` was never set: on phones the Orbit/Explore dock stayed up in Fly, `🏁 Race drone` sat on top of it and the ▼ button, the minimap sat on the stick. It now asks `window.__city.getMode()` (falls back to the dock).
- **Phone UI cleanup (same PR)**, CSS only: Blacktide return link (`.brand`) and TAKE THE HELM are 44px tall on touch; the vessel HUD starts below the notch in portrait (it overlapped the return link); landscape phones now get the touch sailing controls (they were shown only ≤700px wide, so an 844px-wide iPhone in landscape could not steer or fire), a compact HUD and notch-safe sides. Eternal Grind title/character/death screens keep 44px buttons on phones (`body.m .scr button`). Arena lobby checkbox rows (`Teammates' trails kill`, `Best of 3`) are 44px tap rows on touch.
- Audit harness used (not in git): Playwright Chromium as iPhone 13 portrait (390x844, insets 47/34) + landscape (844x390, insets 47 L/R, 21 bottom) + desktop 1366x800, `serviceWorkers:'block'` (otherwise the city's SW serves the other pages from cache and the inset rewrite never runs), env(safe-area-inset-*) rewritten in the served CSS/JS; flags touch targets <44, controls covered by another control, offscreen and inside-the-safe-area controls.

## Hub travel journeys: airport → Zombies, Aegis Pyramid → Light Cycles (PR #132, sw bc-v71-exptravel)
- Files: `client/js/experience-registry.mjs` (+ `.test.mjs`, in `npm test`), kiosk/pad + hit volumes in `client/js/airport.js` (airport kiosk at -130,-535) and `client/js/aegis-pyramid.js` (pad at X+20), travel card in `app.js` `showInfo` (`kind:'experience'`), `#returnCity` in `client/arena/index.html` (shown only for `?from=airport|aegis-pyramid-plaza`). Details: `docs/experience-travel-framework-handoff.md`.
- Return position uses the existing `sessionStorage.bc_ret` restore (Explore at the kiosk's `returnX/Z`, facing `returnYaw`). The old decorative avenue portal rings are removed.
- Stabilization (Hark): travel card buttons 44px; `pageshow` (bfcache back) clears a stale boarding overlay / travel card in the city and the return overlay in the arena; repeated Return taps run one teardown.
- Verified in Playwright (iPhone 13 + desktop, `serviceWorkers:'block'`): kiosk tap → card → Stay (no `bc_ret` left) → Enter (double tap = one launch) → arena free play in the right mode with Return visible, no overlap in portrait/landscape → Return → city Explore at the exact return point. The bfcache path is syntax-only.

## Eternal Grind seeded dungeon layout prototype (PR #131, isolated lab)
- Files: `client/dungeon/dungeon-layout-core.mjs` (+ `.test.mjs`, in `npm run test:eternal-grind`), `dungeon-layout-lab.html/.mjs` (open `/dungeon/dungeon-layout-lab.html`), `DUNGEON_LAYOUT_PROTOTYPE.md`, `DUNGEON_LAYOUT_LAB.md`. Not imported by the live dungeon (`/dungeon/index.html`), combat, loot or saves; not precached by the SW.
- Contract: `generateDungeonLayout({ seed, columns=5, rows=5, loopChance=.12 })` → grid rooms + corridors between grid neighbours (spanning tree + loops), `entranceId` 0, `bossId` = farthest room, `mainPathLength`.
- Stabilization (Hark): the lab had no import map, so `import 'three'` failed in the browser; it now uses the same map as the other dungeon labs (`../vendor/three/build/three.module.min.js`). Checked 70 seed/size/loop combos: deterministic, all rooms reachable, boss is the farthest room, corridors only join neighbours.

## fix/cinderwilds-entry-exit-spacing (PR #127, sw bc-v74-wildsentry)
Proceeding into the Cinderwilds stages the player 16 m up the trail (wilds-gate.js stageEntry) and the return barrier only prompts past ell>1.015, so the first step after entry can't trigger RETURN. Verified: arrive z=410, no prompt on first steps, prompt when walking back out (z≈401.6).

## feature/forest-sign-airport-transit-plan (PR #123, sw bc-v75-wildssign)
City-side THE WILDS direction sign enlarged (4.2x1.25 at y=3.0, wilds-gate.js buildGate) + docs/airport-city-traffic-integration-plan.md (plan only, nothing wired).

## feature/cinderwilds-exploration-map (PR #126, sw bc-v76-wildsmap)
Fog-of-exploration minimap + full field map in Fernway Verge and Glassroot (client/js/wilds-map.js; created in wilds.js buildDom, updated each frame, disposed in unload; Glassroot map data on wilds-deep.js ZONE.map). M / ⤢ opens, Esc/✕ closes, explore input locked while open (window.__wildsMapOpen in __exploreLock). Explored cells in localStorage bc.wilds.explored.v1 (device-local). Map is north-up with world +x drawn to the left (matches the 3D view). Desktop minimap sits below #wlHud/#wlQuest (top 196px).

## fix/explore-camera-zoom-stability (PR #125, sw bc-v77-camzoom)
Third-person Explore camera zoom: mouse wheel and two-finger pinch on the canvas (2.5-14 m, app.js exploreCamDistance). Only canvas touches count toward a pinch (camTouches filters out the joystick finger), so joystick + look-drag still looks. yaw/pitch are only re-derived when the mode actually changes; default pitch only on first spawn.

## feature/shared-airborne-banner-planes (PR #122, sw bc-v78-bannerplanes)
Two banner tow planes on a shared Unix-time schedule (airport.js poseTowPlane/updBannerPlanes; 240 s cycle, banners alternate ETERNAL GRIND / LIGHT CYCLES; canvas placeholder art, both planes share the two textures). Client clock only (no server sync); route crosses the city at 40-78 m.

## feature/lake-waterfront-estates (PR #124, sw bc-v79-estates)
Lake enlarged (estate.js lakeFrame D 62->78, Wd 175->210; shader divisors match) and the Estates lot rebuilt as Waterfront Estates: 9 tiered homes (trailer/apartment/starter/family/mansion), pocket park, trees, fences, lights, entrance sign; all merged per material (~17 meshes). Visual only: buying/renting/interiors not implemented. Estates card text updated.

## gameplay/zombie-cosmodrome-graybox (PR #120, sw bc-v80-cosmodrome)
Zombies fixed map 02 The Ashen Cosmodrome: server/cod.js COSMODROME def (7 zones, 7 doors, 10 windows, wallbuys/box/perks/forge/power), chosen by ?map=cosmodrome (arena menu button #cosmoBtn) -> findRoom(mapId) keeps cosmodrome rooms separate; ranked/daily stay on the Refinery. Client landmark/ruin dressing in client/arena/cod.js when L.kind==='cosmodrome' (individual meshes, ~+40 draw calls vs a procedural map on mobile low). test/zombie-cosmodrome-sim.js in test:all. ZOMBIE_MAP=cosmodrome forces it locally (ignored on Fly).

### Zombies map progression (Oct 22, 2026)
Free Play on the Refinery (Map 1) OR a random map advances the same room to The Ashen Cosmodrome when every living player extracts on the helicopter (`server/heli.js` `advances()`). Ranked, daily and team-lobby rooms never advance. The Cosmodrome cannot be requested directly. Test: `test/zombie-map-progression-sim.js`.

## Wilds: Yuka pursuit for Glassroot hostiles (PR #143, sw bc-v82-yukapursuit)
- `wilds-yuka-ai.mjs` `updateWildsPursuitAgent`: the creature's Yuka agent swaps WanderBehavior → SeekBehavior while a Glassroot (`ZONE`) hostile chases an exploring player (2.6–9 m, no encounter/cooldown, not fleeing) and swaps back on the next wander update. `steer()` still owns obstacles, bounds and movement. Doc: `docs/wilds-yuka-pursuit.md`.
- Creature inspect range 3.6 m → 5 m; hidden/gone creatures are skipped (fleeing ones are now inspectable).
- Verified (Playwright, SwiftShader, desktop + iPhone 13, `?wildstest`): hostile Ashfang placed 6 m away switches to `ai.pursuing` and closes distance; Inspect prompt shows; no page errors. Not checked: oscillation near obstacles on real devices.

## Zombies visual detail + opt-in GLB models (PR #146, sw bc-v83-zombiedetail)
- `client/arena/fx.js`: three more instanced parts in the horde rig (chest armor on brutes/juggernauts, wounds on id%3 / Lope, dorsal spike on juggernaut/skitter). Cosmetic only; server zombies, hitboxes and net state unchanged.
- `?zombieModels=1` (opt-in): `zombie-model-pilot.mjs` loads 4 skinned GLBs (`client/arena/assets/zombies/`: 3 MIT Storm Apocalypse by mars-tw + 1 CC0 Quaternius; license/README beside them) with the vendored GLTFLoader/SkeletonUtils; up to 8 zombies within 28 m get an animated model, the instanced copy is hidden; load failure falls back to procedural. Selection logic in `zombie-model-selection.mjs`. Tests (in `test:graphics-labs`): selection + GLB contract.
- Fixed on integrate: `remove()` read `item.visual`, which was never stored (TypeError every frame once a model left the near set); arena CSP `connect-src` gained `blob:` so GLTFLoader's embedded textures load.
- Verified (Playwright, desktop + iPhone 13): flag on → 4 GLBs 200, textured model visible, waves 1→2 with kills, no page errors; flag off → no GLB requests, no errors. Not checked: real-device frame time with the flag.

## Zombies Homefront settlement (PR #147, sw bc-v84-homefront)
- Unranked, persistent personal refuge. Arena menu button `#homefrontBtn` → `client/arena/homefront.html` (own page, own 3D yard with CC0 Quaternius/Kenney GLBs in `client/arena/assets/homefront/`). Docs: `docs/zombies-homefront.md`.
- Server: `server/homefront-core.js` (pure rules: build/expedition/assign/workday/defend/repair, caps, clamps) + `server/homefront.js` (`GET /api/homefront`, `POST /api/homefront/action`), hooked in `server/server.js` before the other `/api/*` handlers. Auth = `Pay.checkToken` bearer (401 otherwise); limits 90/min per account + 180/min per IP (429); body cap 8 KB (400); saves to `DATA_DIR/homefront.json` via `store.save` (tmp+rename, .bak). No XRPL/payments/ranked side effects.
- Fixed on integrate: page module had 3 literal `\n` tokens and a missing `)` (the whole page script failed to parse); `initWorld()/renderWorld()` were never called, so the 3D yard and tap-to-place never appeared (now called from `render()`, guarded); `BUILDINGS[...]` lookups use `Object.hasOwn` (`constructor` was a 500); oversized body is a 400.
- Tests: `npm run test:homefront` (core sim, API sim, asset contract; in `npm test`), core sim also in `test:all`.
- Known gaps: superseded by #148's cached store (below); a corrupt `homefront.json` still trips `store.load`'s global payout pause like any other store file; log lines all show the current day.

## Homefront: visits, shared Graveyard, parties, airport flight lobby (PR #148, sw bc-v85-homefrontmp)
- Builds on #147. Detail docs: `docs/homefront-airport-flight-handoff.md`, `docs/homefront-playable-handoff.md`, `docs/homefront-terrain-contract.md`.
- Server modules: `server/homefront-world.js` (shared XRPL Graveyard world: presence TTL 45 s, spawns, districts, POIs, parties ≤ 4 with 6-hex share codes, leader-driven grouped movement, boss HP, cache/rescue cooldowns), `homefront-combat.js`, `-survival.js`, `-inventory.js`, `-loot.js`, `-terrain.js`, `-collision.js`, `-director.js`, `-freshness.js`; routes in `server/homefront.js`: `GET /api/homefront/visit?owner=` (public, read-only, 60/min/IP, 404 unless the owner set `visibility: public`; default private), `GET /api/homefront/world`, `POST /api/homefront/world/{enter,move,aim,leave,party/create,party/join,party/leave,survival,inventory,loot,encounter,attack,reload,scavenge,boss-hunt,cache,rescue}` (bearer auth, 120/min per account + 300/min per IP).
- Persistence: `server/homefront-store.js` caches `homefront.json` (shallow copy per load: refuges are only replaced, never mutated in place, since `Core.validateBase` clones) and `homefront-world.json` (structuredClone per load/save) in memory after one `store.load` (keeps .bak recovery + corrupt-file payout pause), and writes dirty files with `store.save` (tmp+rename+.bak) 400 ms after the first change, coalescing bursts. Flushed on process `exit` and on SIGTERM/SIGINT (handler in `server/server.js`, Fly sends SIGINT on deploy). A hard kill (OOM/SIGKILL) can lose ≤ 400 ms of Homefront progress. Single-process only: never run two machines against one volume. Handlers keep load→mutate→save free of `await`, which is what makes concurrent boss hits / cache claims safe.
- Authority: catalog tables in `homefront-core.js` and `homefront-inventory.js` are null-prototype (`constructor`/`toString` ids used to NaN a save's embers/resources); rule errors (snake_case codes, incl. `big`) are 400, anything else is 500 with a generic code; `normalizeWorld` repairs stale/duplicate party memberships; `party/leave` lets a follower regain movement without leaving the expedition.
- Flight lobby: `server/flight-lobby.js` (`?mode=flight` WS, ≤ 8 per flight, server countdown). `flight_depart` carries a `flight` token; `client/arena/flight-lobby.html` passes `&flight=` into the Zombies URL and `findRoom` seats every holder of that token in one arrival room (separate from the open `arrival=helicopter` room; malformed tokens fall back). The lobby connects to the page's own origin on localhost/127.0.0.1/fly.dev (any port), else prod; `?api=` overrides.
- Tests: `npm run test:homefront` now includes `test/homefront-store-sim.js` (cache, coalescing, isolation, corruption pause, exit/SIGTERM flush) and `test/homefront-security-sim.js` (prototype keys, error classes, party edges, movement clamps); `test/flight-lobby-sim.js` checks the flight token. Multi-client check used on the PR: 4 signed accounts over HTTP + WS (party via code, grouped movement, shared markers, concurrent boss hits, single cache claim, flight → one Zombies room, daily/free-play split, 120/min limit).
- Known gaps: no real-device or real multi-user load test yet; world presence is HTTP polling (no push); party codes are 24-bit (rate limit makes guessing slow, and joining only grants following); Embers are Homefront-only and never touch XRPL or ranked.


## Homefront is its own game (Oct 23, 2026)
Homefront is no longer a Zombies side mode: it is a separate, unranked survival game reached from the arena menu (`client/arena/homefront.html`). Pillars: a third-person (and, per Derrik, first-person) explorable shared world (the Graveyard), player-led farming, customizable fortifications, and server-owned damage + auto-repair. It reuses Zombies assets/audio/rigs but never touches XRPL, payments, ranked, daily or Zombies rooms. Audit it as a game on those terms.
- Camera rule (Derrik, Oct 23): exploring, farming, fighting and visiting are always third-person or first-person; the ONLY top-down/bird's-eye view is base-building (construction) mode.

## Homefront world batch: cosmetics, loot focus, smoothing, environment damage/repair, fortifications, farming, third-person camera, shared audio (PRs #150–#160, sw bc-v86-homefrontworld)
- #150 local avatar shows equipped outfit/backpack colors (hex-validated); #151 selected crate pulses; #152 explorers interpolate between snapshots with a step bob; #153 `client/arena/HOMEFRONT_ENVIRONMENT_ASSET_SOURCES.md` intake plan (no assets added).
- Environment damage/repair (#154/#155): `server/homefront-environment.js` catalogs buildings/vehicles/trees/logs/debris from `homefront-collision.js` OBSTACLES (Map lookup, unknown ids rejected). `POST /api/homefront/world/environment/damage {structureId}`: in expedition, ≤ 8 units, 350 ms cooldown, damage 8–60 from weapon power. Destroyed structures (health 0) are removed from movement collision (`removedObstacleIds`) so breaches open routes. Repair: after the area (24 units) is empty of active players for 45 s, health restores over 20 s. Stored in `homefront-world.json` `environmentStructures` via homefront-store. Pure client mirror: `client/arena/homefront-environment-damage.mjs`.
- Fortifications (#156): new buildings entrance/exit (cap 1), sandbags, barbed_wire (1.0 spacing), trench (upgrade tiers 1–3 via `trench_upgrade`), turret (`turret_manning`; manned turrets spend up to 3 ammo each per defense, then unman). `rotate_structure` turns 45°. `Core.threatProfile(base)` drives defense and is returned with `GET /api/homefront` and every action (siege forecast UI). Siege damage hits the outer ring first.
- Farming (#157): `farmPlots` (≤ 24) on the refuge; actions `farm_till {x,z}`, `farm_plant {plotId,crop}` (potato/beans/corn, null-prototype CROPS, costs `seeds`, new bases start with 6), `farm_water`, `farm_harvest`; growth advances on `workday` (watered +1 + farmers/2, else +1 if any farmer). Expedition recruitment and assigning the farmer role require at least one planted crop. Farm UI (added on merge): "🌱 Farm plots" under Build — Till (tap the yard), crop choice, Plant/Water/Harvest cards; plots render in the yard.
- Camera (#158/#159): Graveyard follow camera is third-person by default; right-drag orbits, wheel zooms (3.5–10.5). V toggled a tactical overview in this batch; #161 removes it (camera rule above).
- Audio (#160): reuses `client/arena/zaudio.js` + `sfx/` bank (positional groans, heartbeat, hit/headshot/death only after server-confirmed combat).
- Fixed on merge: farming had no client UI (players could never plant, which blocked recruitment); environment tests added to `npm run test:homefront`; environment authority test is CommonJS.
- Known gaps: no mobile orbit/zoom gesture yet; no first-person mode yet; refuge yard still uses a fixed elevated camera outside construction; environment damage griefing is bounded only by rate limits and auto-repair.

## Homefront animated infected squads, director, protected construction (PRs #161–#163, sw bc-v87-homefrontinfected)
- Director (`server/homefront-director.js`: `planEncounter`, `planHorde`, `advanceDirector`; `homefront-world.js` `tickDirector` on enter/move): per-player phase calm/engaged/alert/assault, spawn cadence 4.5–18 s, local cap, gunfire noise (`noiseLevel/lastNoiseAt/noiseX/Z` set by attacks) pulls infected to the sound; auto-spawns the player's encounter when none is active. Snapshot carries `director`.
- Squads: encounters carry `members` (≤ 5, roles stalker/flanker/bruiser/straggler/runner, special = leader). Attacks target a member (`targetId` = member id or encounter id; aim point within 1.75 of that member). Pursuit leash = `pursuitRadius` (16 + 5×risk) with last-known position.
- Fixed on merge: members walked straight at the target with no pathfinding and overwrote the A*-routed anchor, so squads stuck on ridges (world-sim regression). Now only the anchor runs bounded A*; the first living member *is* the anchor, others step to formation slots and regroup onto the anchor when blocked > 6 units away; killing the lead hands the anchor to the next member without a jump. Member maxHp now equals its spawned hp (bars started partly empty). Tilling now needs the same 1.65 gap from structures that building needs from plots.
- Client: Graveyard reuses `zombie-model-pilot.mjs` rigs (cap 8 desktop / 4 coarse-pointer; procedural proxies stay as hitboxes), hit/death reactions after server confirmation; destroyed environment structures hide and debris bursts; V tactical view removed (exploration is third-person only). Refuge yard: choosing a placement (or tilling) switches to an overhead construction camera and freezes yard infected movement/animation until the server confirms or the player cancels (#162); #163 rejects structures within 1.65 of a farm plot.
- Known gaps: client renders one infected actor per encounter, not per squad member; director state lives per player (no shared district pressure across a party yet).

## Homefront views: first-/third-person everywhere, overhead only while building (sw bc-v88-homefrontviews)
- `client/arena/homefront-view.mjs` (shared by the refuge yard in `homefront.html` and the Graveyard in `homefront-graveyard-3d.js`): `readViewMode/writeViewMode` (localStorage `bcHomefrontView`, `third` default, only `third|first` storable), `cameraPose()` (the only straight-down pose is `building:true`), `worldMove()` (stick/WASD → world step relative to camera heading), `attachViewControls(host)` (on-canvas 🎥/👁 toggle button, V key, touch joystick on coarse pointers, drag-to-look, pinch zoom, IntersectionObserver so offscreen canvases skip `renderer.render`). Tests: `client/arena/homefront-view.test.mjs` (in `npm run test:homefront` + CI).
- Refuge yard: you walk a small survivor avatar (WASD / joystick, clamped to the yard, pushed out of the shelter) in third- or first-person; choosing a placement or tilling switches to the overhead construction camera (look/joystick/toggle hidden, yard infected frozen) and leaving build mode lerps back to the previous view. Visits use the same walking view, read-only.
- Graveyard: same toggle; first-person hides the local avatar; taps now arrive on release from the view controller so drag-to-look never travels; WASD/joystick sends one server-clamped move (10 units toward the stick) per 950 ms (server cooldown 900 ms). Right-drag orbit and wheel zoom are unchanged.
- Server perf: `server/homefront-collision.js` files obstacles in a 6-unit spatial hash (queries with radius ≤ 1.5 read one cell; larger radii fall back to the full scan). Parity test vs brute force over 20k random points; ~14× faster point queries (200k: ~300 ms → ~21 ms locally).
- Assets: Kenney Survival Kit 2.0 (CC0) `fence-fortified`, `fence-doorway`, `workbench`, `box-large`, `tent-canvas` + `Textures/colormap.png` in `client/arena/assets/homefront/kenney-survival/` (provenance + zip SHA-256 in that folder's README, license file copied) replace the procedural wall/gate/entrance/exit/workshop/storage/infirmary when loaded; shared clones are flagged `userData.sharedAsset` so `clearGroup` never disposes the source geometry.
- Known gaps: on touch, vertical drag scrolls the page (`touch-action: pan-y` kept so the long page stays scrollable), so pitch is desktop/right-drag only; yard walking is client-side presentation (all refuge actions stay server-validated buttons).

## Homefront siege, survivors, materials (PRs #164–#184 batch, sw bc-v89-homefrontsiege)
- All rules live in `server/homefront-core.js` behind the existing `POST /api/homefront/action` (bearer auth, 90/min/account + 180/min/IP, 8 KB body, null-prototype catalogs). No new endpoints.
- Mechanics (#164): each workday mechanics repair `mechanics×10` HP across the most-damaged structures (1 wood + 1 scrap per 12 HP). Job signage / work targets (#165–#166): refuge yard sprites show each survivor's role or live task; survivors walk to their station.
- Guards and siege (#167–#175): `threatProfile` weights guards by morale × skill; `start_siege` opens one incoming incident (`base.lastSiege`, ≤ 3 phases, replaced not appended) that `defend` resolves (outer-ring target, guard breach cover ≤ 25 % on a damaged defensive target, after-action report). `emergency_repair {target}` restores +100 HP to a defensive structure (tier-priced). Destroyed defenses render as wreckage; a live breach alert offers the priority repair.
- Survivors (#176–#179): persisted `task/taskTarget/taskReason` re-synced after every action (`syncSurvivorBehavior`); deterministic per-survivor `stats` (combat/scavenging/farming/medical/engineering/endurance 1–10, hashed from owner+id, normalized on load) scale labor and guard strength. Gear variants + task-aware clip selection are presentation only.
- Materials (#180–#181): resources `stone`, `steel` (expedition drops, quarry → stone, smelter turns 2 scrap + 1 stone → 1 steel, market). `upgrade_structure_material` wood→stone→steel (HP ×1/1.75/2.8, defense +0/2/5, damage resistance 0/18/35 %); `reinforce_gate` steel plating 0–2. `validateBase` rescales HP by integrity so old saves load at wood tier.
- Reactive siege (#182–#184): yard infected path to breaches; impacts/defensive tracers are client presentation of server state.
- Fixed on merge: literal `\n` token broke the refuge page module (#165); stone/steel were wiped whenever field packing ran (`Inventory.normalizeResources` now carries `REFUGE_ONLY = seeds, stone, steel`); quarry/smelter/salvage yard were unplaceable (client caps/costs missing); breach wreckage `block()` colour arg; guard-defense test regex; live siege tracer lines capped (16 touch / 40 desktop). Kept main's leader-only squad pathfinding (#182's per-member A* dropped: up to 5×2600-node searches per encounter per tick), the 1.65 tilling gap, seed normalization and the view/camera rules.
- Known gaps: yard siege visuals are client-side presentation of the last server result (no live server tick in the refuge); tracers allocate a Line per shot (capped, not pooled).

## Homefront firearm tiers (PRs #185–#188 combined, sw bc-v90-homefrontfirearms)
- ChatGPT opened four parallel machine-gun PRs off #184. They overlapped on `heavy_machine_gun` (four different stat lines and two unlock models) but each also added a distinct gun, so they became one tier ladder in `server/homefront-firearms.js` (null-prototype, frozen): **T1 `smg`** (#186) refuge level 2 · **T2 `assault_rifle`** (#187) level 3 · **T3 `machine_gun`** (#185) level 4 + Industrial Yard surveyed · **T4 `heavy_machine_gun`** (#188 base; HMG also in #185/#186/#187) level 5 + Sealed Research Annex surveyed. "Settlement development" = refuge `level` (1 + ⌊(day−1)/5⌋, server-derived from workdays).
- Server authority: `craft_weapon`, `equip_weapon` and `Combat.attack` all call `Firearms.unlockStatus` (codes `weapon_requires_refuge_level_N`, `weapon_requires_zone_<zone>`, `weapon_locked`); attack also requires the equipped gun to be in `base.weapons`. Clients send only `targetId`/`aimPoint`.
- Automatic fire = one server-resolved burst per request (3/3/4/5 rounds), because the world API allows 120 req/min per account (moves + polls share it). Every weapon interval is ≥ 900 ms (SMG/AR 950, MG 1000, HMG 1050). The server spends `min(rounds, loaded)` from the magazine, rolls each round's zone, applies per-round falloff, and walks the burst onto the nearest living squad member within the tier's spread and range after a kill. Response `combat.hits[]` (`targetId, damage, hitZone, killed`), `rounds`, `weaponId`, `hitTargetId`. Noise per tier feeds the director. `GET /api/homefront` + actions return `firearmTiers` (public table) for the weapon bench.
- Client: weapon bench lists tiers with lock reasons; Graveyard autofire cadence mirrors the server table; tracers come from `client/arena/homefront-tracers.mjs` (one pooled `LineSegments` + one reusable muzzle flash, 12 touch / 32 desktop, zero per-shot allocation, test `homefront-tracers.test.mjs`); one tracer per server round, staggered 70 ms; `sfx.weaponFire` (#185's procedural synth) for follow-up rounds. Tier silhouettes (mag, ammo box, support grip).
- Known gaps: hit blood droplets still allocate small meshes per hit (pre-existing); one rendered actor per encounter, so burst tracers fan out around it rather than hitting individual member models.

## Homefront siege emplacements: .50 cal, mortars, gun platforms, live siege (sw bc-v91-homefrontemplacements)
- Derrik's request (Oct 23, 2026). Server: `server/homefront-siege.js` (rules + route glue), `server/homefront-platforms.js` (deck/stair geometry, line of sight, placement gap, stair path; ESM mirror `client/arena/homefront-platforms.mjs`, parity-tested). Client: `client/arena/homefront-siege.mjs` (presentation) + small hooks in `homefront.html` (build list/caps/costs, `drawStructure` → `buildEmplacement`, yard walking via `canStep/heightAt`, "🎯 Live siege defense" panel, defender mode).
- **Tier 5 `fifty_cal`** (`.50 Cal Heavy Gun`) in `server/homefront-firearms.js`: refuge level 6, no zone gate, 5-round bursts, 1150 ms, magazine 100, `pierce: 3` (in a live siege each round also hits up to 2 infected behind the first on the same line, 75 % damage). Graveyard client arrays (`FIREARM_IDS`, `WEAPON_DELAY`, `TRACER_COLOR`, silhouettes) include it.
- **Structures** (`homefront-core.js` BUILDINGS): `gun_platform` (18 wood + 12 scrap, 200 HP, cap 4): 2.2×2.2 deck 2.4 up, stairs on local +z (rotation-aware), railings elsewhere; 2.6 spacing to anything (incl. farm plots) and the stair foot must stay in the yard (`placement_out_of_bounds`, also on rotate). `mortar_pit` (8 wood + 20 scrap + 4 steel, 150 HP, cap 2, **refuge level 5**, `structure_requires_refuge_level_5`). Client caps/costs mirror the server (asserted in `test/homefront-graveyard-3d.test.mjs`).
- **Live siege API** (inside the world route, so bearer auth + the 120/min/account world gate apply): `GET /api/homefront/world/siege?owner=&refuge=1`, `POST …/siege/start {compact}` (host only; `compact:true` from coarse pointers caps the horde at 24 vs 36), `…/join {owner}`, `…/post {owner, post: structureId|'ground'}` (one defender per post; a guard on that deck climbs down), `…/fire {owner, aim:{x,z}}`, `…/leave`. Only `aim` is read on fire; everything else is server state. Access: host, an existing defender, or a member of the host's Graveyard party (`sameParty`); everyone else gets 404 `siege_not_found`. Defender link = `homefront.html?visit=<owner>&defend=1`.
- **Approach**: 2–4 packs (threat/level scaled), directions ≥ 45° apart over a 162–252° arc, spawn 46–58 out, all reach the wall (r 10.5) in 26–40 s. Positions are closed-form in time (`memberPos`), so there is no server tick: each request `advance()`s guard volleys (guards on free platforms, 2 s cadence) and the end (all dead → repelled; last arrival + 20 s → breached). Wall pressure 0.25/s per walker, 0.6/s per brute → `Core.applyLiveSiegeResult` (not an applyAction type, so clients cannot submit it) damages the outer ring, sets `lastSiege` (`live: true`), +8 Embers (+1 per 3 kills) to the host on repel, ≤ 10 Embers to helpers. Cooldown 90 s between sieges. State persists in `DATA_DIR/homefront-siege.json` via homefront-store (`normalizeState` drops malformed entries; finished sieges pruned after 10 min).
- **Guns**: equipped firearm only (`siege_requires_firearm`), unlock re-checked, interval ≥ 900 ms (`siege_fire_cooldown`), rounds = min(tier rounds, shooter's own refuge ammo). Range = 18 + 2×tier (+10 on a platform); cone = spread×2.5°; LOS from the post eye (deck 2.4 + 1.5, ground 1.5 just inside the wall) — walls block ground shooters, platforms see over them. **Mortar**: must hold a `mortar_pit` post, host level ≥ 5, 3 ammo from the host refuge per shell, 3.2 s cooldown, range 12–52 from the pit, impact ≥ 11 from the refuge centre (`mortar_too_close|_out_of_range|_danger_close`), seeded scatter ≤ 0.8, splash 3.2 (48 → 19 dmg).
- **Client**: instanced horde (24 touch / 36 desktop), pooled tracers (12/32 via `homefront-tracers.mjs`), fixed explosion pool (4/8) + capped dust Points (48/128), pooled guard figures that walk the stair path, approach apron to r 66 + fog far 70/82 during a siege. One 250 ms scheduler sends either a fire (≥ 950 ms; mortar 3.2 s) or a poll (1.5 s active) — never both, ~60–65 req/min. Camera rule unchanged (third/first anytime, overhead only while building); avatar floor height follows `heightAt`, `canStep` makes deck edges railings with axis sliding. Mortar target = tap the ground (invisible 140×140 aim plane, tap < 8 px movement).
- Tests: `test/homefront-platforms.test.mjs` (parity, stairs up/down, railings, rotated stairs, LOS, placement, level gate), `test/homefront-siege-sim.js` (fairness over 200 seeds, access, posts, mortar rules, forged fields, cooldown, 2 platform defenders + mortar wipe one horde, breach damage, apply-once, normalization), `test/homefront-siege-view.test.mjs` (caps, pooling, extrapolation parity) — all in `npm run test:homefront` + the homefront CI workflow.
- Known gaps: yard walking/stairs are client presentation (taking a post is the server action that sets the eye); the client horde is instanced boxes (no rigged GLB per member); guards don't spend ammo; no live-siege visuals in the Graveyard; real multi-user/real-device load untested beyond local scripts.

## Homefront exploration batch: landmarks, interiors, survivor profiles, refuge interactions (PRs #189 #190 #191 #195, sw bc-v92-homefrontexplore)
- Carried: #189 (docs: `docs/homefront-survivor-simulation-contract.md`, `docs/homefront-survivor-integration-audit.md`), #190 (authored exploration world/landmarks, included via #191), #191 (interior exploration + terrain relief, stacked on #190), #195 (contextual 3D survivor/structure/farm interactions). Design notes: `docs/homefront-exploration-world-content.md`.
- **Exploration / landmarks** (#190): `client/arena/homefront-exploration-content.mjs` (static catalog keyed to the server's `POINTS_OF_INTEREST`; ids/coords must match exactly), `homefront-exploration-guidance.mjs` (route/story breadcrumbs, Field Journal), `homefront-landmark-builder.mjs` (archetype geometry, shared materials), `homefront-ground-detail.mjs`. Server `server/homefront-exploration.js` persists discoveries/intel per account; `GET /api/homefront/world/exploration`, `POST …/exploration/discover {landmarkId}`. Frontier depth (0–100, rises toward the city core, `frontierDepthAt` in homefront-world.js) feeds `Director.planEncounter` as a small pressure ramp; noise stays a separate multiplier. Terrain height field amplified on both `client/arena/homefront-terrain-generation.mjs` and `server/homefront-terrain.js` (keep them in parity).
- **Interiors** (#191): `server/homefront-interiors.js` + client `homefront-interior-world.mjs` (seven room networks: inspect/search/power/door, open-roof shells). Endpoints (world route, bearer auth + 120/min/account world gate): `POST /api/homefront/world/interior/enter {landmarkId}`, `…/action {actionId}`, `…/door {doorId}`, `…/leave`. Proximity and room requirements are checked server-side; searches reward through `Inventory` (overflow → refuge), duplicates rejected. State (room flags, clues, searches, opened doors, breaches) is null-prototype and persisted per account in `homefront-world.json`. `server/homefront-collision.js` adds room-wall segments + closed-door blockers (only the active player's shell counts; removal lists are Set-backed, interior profiles memoized). Infected path to ordinary closed doors and batter them open; clue/power-gated secure doors can't be breached. Noisy actions and loot containers publish a server-owned sound position the director/combat investigate.
- **Survivor rarity / traits / talents** (#191): `homefront-core.js` gives each new recruit a seed-derived rarity (Common 70 / Uncommon 20 / Rare 8 / Epic 1.8 / Legendary 0.2 %, contribution 1.00–1.20×), two traits, one talent (×1.25 on the matching role), a background and symmetric pair chemistry. This is a **separate system** from #192's per-survivor `stats` (combat/scavenging/… 1–10); both are normalized on load and both scale labor/guards — keep both. Old saves default to Common.
- **Refuge interactions** (#195): `client/arena/homefront-navigation.mjs` (dependency-free steering: obstacle avoidance, separation, task→station routing, cots) + `homefront.html` hooks: raycast survivor inspection, `E`/touch proximity actions for survivors/structures/farm plots (existing server actions only), hinged gates that open as you approach, storage-shed lid, workshop wheel. Visitor mode stays read-only.
- **Fixed on merge**: survivor-actor proximity var collision between #191/#195, route-recovery retry cycling, stale test regexes; null-proto interior state; per-frame lookup caches. **Doorway route-leg check**: `walkedRouteClear` in `server/homefront-world.js` replays `advanceAlongTerrainPath` and validates every walked leg (plus the final partial leg) instead of the start→end straight line, which rejected ~10 % of turning moves through doorways as `terrain_path_blocked`. **Party regroup**: a follower more than two moves behind (or stuck > 8.5 away) is placed at `Collision.findSafePosition` beside the leader (not while inside an interior).
- **Tests** (all in `npm run test:homefront` + homefront CI paths): `server/homefront-exploration.test.js`, `server/homefront-interiors.test.js`, `client/arena/homefront-{exploration-content,exploration-guidance,interior-world,landmark-builder,ground-detail,navigation}.test.mjs`, `test/homefront-survivor-inspection.test.mjs`, `test/homefront-survivor-economy-sim.js`, `test/homefront-interior-route-sim.js` (doorway legs), `test/homefront-explore-multiplayer-sim.js` (4 accounts: exploration, interiors, party regroup).
- **Known gaps**: gate open/closed state is client-only, not synced between players; interiors are one floor plan per account in the shared world, not separate multiplayer instances (2D X/Z walls, no stairs/multi-floor); `homefront-world.json` grows with every account's interior/exploration state (no pruning yet); infected squads can spawn right beside the player; real-device mobile GPU and doorway camera framing still need playtesting.

## Fishing progression + private boat fleet (PR #196, sw bc-v93-fishfleet)
- **Angler XP / levels** (`client/js/fishing-rules.mjs` `xpForCatch`/`anglerProgress`/`rodUnlockLevel`, mirrored in `server/fish.js` `xpForCatch`/`anglerLevel`/`ROD_LEVELS`): XP = 10 + 12×rarity + kg (kg capped at 30); 10 levels (thresholds 0…3050). Rods gate by level on the server (`level_locked`): Carbon 2, Pro 5, Ember Legend 10. Signed-in XP lives in `fish_prof.xp`; pre-progression saves backfill once per process from server `fish_catch` rows (sp+kg), never from client data.
- **Boats** (`BOATS` in both files, keep in parity): Harbor Skiff (starter, 12 kg), Bass Runner 1,200 coins (60 kg, deep access), Offshore Cruiser 5,000 (200 kg), Abyssal Hunter 14,000 (900 kg). Lake coins only (free, no XRP). Server: `POST /api/fish/buy {kind:'boat', id}` (buying an owned boat just selects it; price is never multiplied by `qty`), `POST /api/fish/boat-select {id}` (`boat_not_owned`). Both behind the existing bearer auth + 40/min/account fish gate. `fish_prof.boats`/`selectedBoat` are normalized on load (bad JSON, unknown ids, unowned selection → skiff). Guests keep their fleet in `localStorage.bcFish` (not imported on sign-in).
- **Catch gating** (server `roll`): species with `boat: N` need you aboard a tier ≥ N boat; deep species need `deep` + a boat with depth ≥ 1; fish heavier than the boat's capacity (9 kg from shore) can't be rolled. Four new species: Copper Sunfish, Gilded Trout, Bluewater Swordfish, Abyssal Lanternfish (24 total). `onBoat`/`deep` are still client-reported location flags (the fish endpoint has no server-side position check) — the boat class itself is server-owned.
- **Client**: `client/js/boat.js` spawns only your selected boat at the private dock (`syncFleetBoat` respawns it after a purchase/select), speed scales by class, dark central deep-water basin (`__boat.getDeepWater()`, radius `D×0.38`). Shop panel shows Angler Level + XP bar, locked rods, and "Private Dock · Your Fleet" buy/select cards. Others see your boat class while underway: city presence `p` field 13 `bt`; for signed-in players the server only broadcasts a class that wallet owns (30 s cache), otherwise skiff.
- **Fixed on merge**: `const BOATS` was declared after the guest-profile normalization that reads it, so `fish.js` threw a TDZ ReferenceError for every new guest (fishing + boats never initialised); boat price multiplied by a client `qty`; XP backfill re-scanned the catch table on every profile read; client preferred-bait table lacked the four new species; XP bar had no height; presence `bt` trusted the client for signed-in players.
- **Tests**: `npm run test:fishing-rules`, `node test/fish-sim.js`, `npm run test:fishing-fleet` (`test/fish-fleet-mp-sim.js`, in `test:all`: legacy-save migration, 401s, 10 parallel boat buys charge once, parallel bait buys can't overspend, forged qty/price/coins ignored, prototype keys, per-account isolation, 4-client presence boat class). Browser: `fleet_smoke.mjs`/`stab_fish.mjs` style Playwright runs (new guest, buy/select/board, deep basin, catch, stale-timer, reload).
- **Known gaps**: no server position check for aboard/deep (pre-existing trust model); guest→wallet import still carries rods without the level gate (one-time, capped); boats are cosmetic hull scales of one model; remote peers' boats rebuild a hull (2 meshes) when their class changes.
## Estates: property ledger, owner-wallet check, enterable interiors with doors + furniture (PRs #197 + #199, sw bc-v94-estates)
- **Files**: `server/estates.js` (SQLite schema in `shop.db`: `estate_property_ownership`, `estate_profit_weeks`, `estate_profit_allocations`, all with CHECK/PK/UNIQUE/FK constraints; `getState`, `previewWeeklyAllocation`), `server/estate-economy.js` (catalog from `client/data/estate-catalog.json`, `propertyWeight`, `allocateProfit` = BigInt largest-remainder split, sorted by property id), `server/estate-wallet.js` (Xaman SignIn identity proof for the treasury address; no ledger transaction), `client/js/estate.js` (9 procedural interiors, hinged doors, furniture footprints, `__estateInteriorGuard` / `__estateCameraGuard` / `__estateAutoExit`), hooks in `client/js/app.js` (`__estateEnter` / `__estateExit`, card "Enter this residence" button, explore-tick guard call). Docs: `docs/estate-*.md`.
- **Treasury wallet**: `ESTATE_TREASURY_ADDRESS`, default `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb`. **Confirmed by Derrik as his wallet (Oct 23, 2026).** Owner-control is only proven after an admin runs the Xaman SignIn verify flow (in-memory, resets on restart).
- **API** (all behind bearer auth first → 401 logged out; per-account 60/min + the shared 30/min/IP API limit → 429): `GET /api/estates` (catalog + your holdings; `salesEnabled:false`, `distributionsEnabled:false`). `POST /api/estates/buy` → always **409 `sales_not_configured`** and never reads the request body (no client amount/tx/property is ever used). `/api/estates/wallet/{status,verify/start,verify/finish}` need the `x-admin-token` as well → 403 otherwise. Nothing anywhere submits an XRPL transaction or a distribution.
- **Interiors**: rooms are staged at lot-local x≈270–338, z≈−48…16 (hidden until entered; browser audit confirms no overlap with each other, the lake, terrain, or any other scene mesh/instance). Movement guard clamps to the room and pushes out of furniture, keeping a clear entry lane. If the player is relocated more than 3 m outside the active room (fly/orbit/travel/walkTo/respawn), the guard **auto-exits** (clears `__estateInteriorId`, hides the room, removes the HUD) instead of yanking them back.
- **Tests**: `npm run test:estates` (`test/estate-economy-sim.js`, `test/estates-money-sim.js`: 5000-case allocateProfit fuzz [exact sum, ≥ 0, integer, ≤ 1 drop from exact, order-independent], DB constraint rejections, 5 players × 120 parallel forged buys → 409 and zero rows, unfinished-body buy still 409, 401/403 matrix, rate limits — each simulated player uses its own `fly-client-ip`), `client/js/estate-interior-physics.test.mjs`, `npm run test:estates-wallet`. Browser: Playwright desktop + iPhone 13 (`serviceWorkers:'block'`): overlap audit, enter/exit all tiers, far-relocation auto-exit.
- **Known gaps / before enabling sales**: prices, payment token, settlement verification (tx hash → ownership insert in one transaction), final share weights and a payout approval flow are all unbuilt and need an audit; the wallet verification state is in memory only; on iPhone the in-room HUD pill sits over the Market chip (cosmetic); camera lerps in from outside on entry at very low fps.

## Homefront open-world RPG — architecture (Phase 1, Derrik's redesign, Oct 23, 2026)
Derrik's vision: an open-world RPG. Each player owns a **private Homefront instance** (all refuge/build/farm/workshop/siege/survivor/emplacement systems and their UI live there); outside it is **one shared, persistent open world** (the Graveyard, with #198's landmarks/interiors) where players spawn far apart, see strangers only in render/interest range, and only party members appear on the map. PvP on in the world, no friendly fire inside a party, PvP off in Homefront instances. Phase 1 is the framework on top of the existing systems (no rewrite). Built as sequenced PRs; each subsection below names its PR.

### (a) Shared avatar + movement, travel between Homefront and the world (sw bc-v95-rpgtravel)
- **Shared movement physics**: `client/js/player-motion.mjs` (pure, allocation-free): `MOTION` (walk 5, run 11, jump 7.5, gravity 20, turn 12, cadences), `speedFor(run, scale)`, `stepVertical` (jump/gravity/landing on a floor), `stepGait` (stride phase/amp for `poseWalker`), `turnToward`, `createMotion`. The city (`client/js/app.js` `updExplore`) now reads its walk/run speed, jump, gravity, turn rate and cadence from it (no duplicated literals; asserted by `client/js/player-motion.test.mjs`). Homefront uses it at `YARD_SCALE = 0.68` (walk 3.4 u/s as before, run 7.5, ~0.9 u jump).
- **Shared avatar**: the city's `client/js/walker.js` (`buildWalker`/`poseWalker`) now renders the Homefront yard avatar (`homefront.html`, scale 0.82, turned to face +Z) and every Graveyard explorer (`homefront-graveyard-3d.js`, `EXPLORER_SCALE` 1.45, lite rig on touch and for remote players). walker.js caches geometry/materials, so its meshes are tagged `userData.sharedAsset` and both `clearGroup`s skip them (never dispose shared geometry). One three.js instance: the page import map maps `three` to `./vendor/three.module.min.js`, the same URL the page imports.
- **Controls** (`client/arena/homefront-view.mjs`): Shift = run, Space = jump (keys go to the visible canvas, so the hidden Graveyard no longer swallows yard input); on coarse pointers a JUMP (tap) and RUN (hold) button sit bottom-right opposite the joystick (hidden with the other controls in build mode). Camera rule unchanged: third/first anytime, overhead only in build mode. Graveyard jump is a client-side arc on the local avatar (the server still owns position).
- **Travel** (`server/homefront-travel.js` + `client/arena/homefront-travel.mjs`): players at home are tracked in `homefront-world.json` `homefronts: {acct: {host, partyCode, lastSeen, pendingTravel}}` (TTL 45 s; the page polls `GET /api/homefront/world/travel` every 15 s). They are *not* in `players`, so no world snapshot, director, encounter or PvP reaches them. `World.prune` keeps party members whose home presence is fresh; `World.leave(…, {keepParty:true})` (sent as `POST /world/leave {travel:true}`) returns home with the party intact; legacy leave (no flag) still drops the party. A follower is only movement-locked while the leader is actually in the world.
  - Routes (world route: bearer auth → 401, 120/min/account + 300/min/IP): `GET /world/travel` → `{space, instance:'own'|'friend', instanceHostId, pendingTravel, party:{code, leader, members:[{id, you, leader, where:'world'|'homefront'|'offline', inYourInstance}]}}`; `POST /world/travel {action}`: `party_create | party_join {code} | party_leave` (parties can be formed at home), `visit {member: survivor-id}` (Join friend's Homefront — party members only, else `refuge_private_or_not_found`), `home`, `summon`. `POST /world/enter {withParty:true}` from a leader at home summons every member in the same Homefront instance (their own clients finish the trip on their next poll) and `Travel.rejoinOnEnter` puts arrivals back in the party beside the leader.
  - `GET /world/refuge?owner=<acct>|member=<survivor-id>`: read-only refuge for its owner, a party member, or anyone if it is public; everyone else gets **404** (`/api/homefront/visit` is unchanged and still 404s private refuges). Party members also receive `owner` so the existing defender link (`?visit=<owner>&defend=1`, siege access = `sameParty`) works.
  - UI: `🧭 Travel` in the RPG nav (and the gate button) opens a sheet: Travel to the Wastes / Travel with party (leader) / Join friend's Homefront (per member at home) / Back to my Homefront / Start or join a party / Return to Homefront (in the world). Visiting a party friend uses `?visit=<owner>&party=1` (read-only).
- Tests: `client/js/player-motion.test.mjs`, `test/homefront-travel-sim.js` (both in `npm run test:homefront` + homefront CI paths). Debug hook: `?debug=1` exposes `window.__hfYard` (yard player + motion) for Playwright.

### (b) Shared world: far spawns, interest management, party-only map, PvP rules (sw bc-v96-rpgworld)
- **Far spawns** (`server/homefront-world.js` `chooseSafeSpawn`): the server picks the first authored spawn (usual least-used order) that is ≥ `MIN_SPAWN_DISTANCE` (60) from every other explorer (own party excluded); if none qualifies it scores all spawns plus the **expanded frontier rim** (`FRONTIER_SPAWNS`, 16 points at r 86, ids `frontier_N`) and takes the one farthest from the nearest explorer. Safe footprints per spawn are memoised (static collision). New players carry `spawnedAt` (10 s PvP spawn protection).
- **Interest management**: `World.snapshot` builds a uniform spatial hash (`INTEREST_CELL` 20) once per snapshot and sends only **self + party members (anywhere) + strangers within `INTEREST_RADIUS` (40)**; infected encounters only within radius+10 (or your own). Because every world endpoint returns `World.snapshot`, no route broadcasts every player. `publicPlayer.party` now means "in *your* party"; strangers' spawn ids are no longer sent. Snapshot carries `interest: {radius, mapShows:'party'}` and `selfPvp {recentHits, kills, downedAt, protectedUntil}`. 400 explorers → ~9 ms snapshot, ~50 sent.
- **Map**: the Homefront page's world map (`drawGraveyardMap`) draws only you and your party; strangers are in-world only (3D, in range).
- **PvP** (`server/homefront-pvp.js`, `POST /api/homefront/world/pvp {targetId: survivor-id, aimPoint:{x,z}}`, world route auth + 120/min gate): target must be an explorer the attacker is allowed to see (interest set), not in the attacker's party (`friendly_fire_blocked`), past spawn protection, within weapon range; players at home can't hit or be hit (`pvp_disabled_in_homefront`). Weapon = the refuge's equipped weapon with the firearm unlock + ownership re-check; firearms keep the tier burst rule (one burst per request, rounds = min(tier rounds, loaded magazine), interval = max(900 ms, tier interval) → `pvp_cooldown`, `reload_required`), melee/shotgun/marksman from a fixed table. Hit chance from distance/spread, per-round falloff, seeded per request; an aim point more than 1.75 from the target's server position misses every round. Lethal damage downs the target: far respawn (`chooseSafeSpawn`) at 60 health, interior exited, field pack kept (Phase 1). Only `targetId`/`aimPoint` are read.
- **Client** (`homefront-graveyard-3d.js`): strangers in range carry `userData.pvpTarget`; tapping one shows `⚔ Attack survivor` (`#pvpAttack`), which posts the target's last server position; hit feedback from `selfPvp.recentHits`.
- Tests: `test/homefront-pvp-interest-sim.js` (4 far spawns ≥ 60, crowded → frontier rim, interest fuzz over 24 placements × 4 viewers, party on map, stranger PvP damage, cooldown, friendly fire, off-target/unseen/forged payloads, spawn protection, range, SMG burst + magazine, kill → far respawn, Homefront PvP off, 400-player snapshot). `homefront-world-sim`/`homefront-api-sim`/`homefront-explore-multiplayer-sim` updated: far-apart strangers no longer see each other.
- Known gaps: PvP has no loot drop/penalty yet; the in-browser two-player PvP tap flow is untested (server rules covered over HTTP with 4 clients); the world itself is still the 200×200 authored map (the frontier expansion is the rim spawn ring, not a bigger map); bosses/caches/rescues are still shared world-wide.

### (c) RPG character sheet + minimal HUD (sw bc-v97-rpgsheet)
- **Server** `server/homefront-rpg.js` (persisted per account in `DATA_DIR/homefront-rpg.json` through homefront-store; load → mutate → save with no `await`): level/XP (`xpForLevel(n) = 50·n·(n−1)`, max level 30), five skills (marksman/scavenger/survivalist/engineer/leader, rank ≤ 5, one point per level; **bonuses are listed as planned, not applied yet**), gear items with slots `head/body/back/gadget` (weapon stays the refuge's equipped weapon), a quest journal stub (5 counter quests) and an activity log. Old saves get a fresh sheet back-filled once from refuge days + surveyed zones (`backfilled` flag).
- **XP is server-only**: `Rpg.award(store, acct, source)` is called from existing server events (infected kill, crate loot, landmark discovery, rescue, boss kill, workday, defend repel, live-siege repel for every defender, PvP kill, first world entry). There is no client route that adds XP, items or quest progress. Loot hook: a searched crate has a deterministic 15 % chance (account + crate + day) to hold a missing loot item. `Rpg.grantItem` (idempotent) is for purchases/exemptions only (jetpacks, PR d).
- **API** (world route: bearer auth → 401, 120/min/account gate): `GET /api/homefront/world/rpg` → `{sheet}`; `POST …/rpg {action: learn {skill} | equip {item} | unequip {slot} | track {quest}}` → `{sheet}`; anything else → 400 (`unknown_rpg_action`, `item_not_owned`, `no_skill_points`, …). Prototype keys are rejected (null-prototype catalogs + `hasOwnProperty`). Award responses carry `rpgAward {source, xp, levelUp, item, questsDone}`.
- **Client** `client/arena/homefront-hud.mjs` (hooked from `homefront.html`; `?classic=1` keeps the old layout): one HUD strip (health bar, ammo/melee or refuge level, quick slots bandage/eat/drink that click the existing buttons, a party-only minimap, ☰ Menu) and one overlay with tabs Character / Inventory / Journal / Build / Manage / Travel (I opens Inventory, Esc closes). Build → workshop mode, Manage → one management panel at a time behind a tab strip, Travel → the travel sheet. Camera rule unchanged.
- **Fixed in this PR**: the Workshop/build panel showed on iPhone (and desktop) in home, world and manage modes. Cause: a stray `</div>` at the end of `#survivalPanel` closed `.grid` early, so every panel after it (privacy, stores, status, incident, live siege, **build**, scavenge, tycoon, log) escaped the page's `.grid>.panel` mode rules. Removed the stray tag; added `body:not(.rpg-mode-workshop) #buildPanel{display:none!important}` and a HUD toggle so the build panel shows only in build mode (its tab); the manage tab strip now honours `[hidden]` (its `display:flex` overrode it).
- **Tests**: `test/homefront-rpg-sim.js` (normalize/back-fill once, corrupt profiles, forged/prototype payloads → 400 and no XP, server events award XP, quests, concurrent skill spends ≤ earned points, loot gear hook, equip/unequip, idempotent grants) and `client/arena/homefront-hud.test.mjs` (party-only minimap, build-panel rule, all panels inside `.grid`), both in `npm run test:homefront` + the homefront CI workflow.
- **Known gaps**: skill bonuses are not applied to gameplay yet; armor is shown but does not reduce damage yet; quests are a fixed stub list; the HUD polls the page state every 700 ms (no event bus).

### (d) Jetpacks + real-XRP payments (sw bc-v98-jetpacks)
- **Prices / treasury**: Homefront jetpack **30 XRP**, city jetpack **5 XRP**, paid to Derrik's treasury `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb`. Env: `JETPACK_PAYMENTS` (**`1` = purchases on; default off → `/api/jetpack/invoice` and `/claim` return 409 `payments_disabled`**), `JETPACK_TREASURY_ADDRESS`, `JETPACK_PRICE_CITY_DROPS`, `JETPACK_PRICE_HOMEFRONT_DROPS`, `JETPACK_FREE_CITY`, `JETPACK_FREE_HOMEFRONT` (comma lists; set = replaces the default), `JETPACK_XRPL_WSS` / `JETPACK_XRPL_NETWORK` (verifier node; default `XRPL_WSS`; `testnet` also forces Xaman's network). Rollback: `fly secrets unset JETPACK_PAYMENTS -a burn-city-game`.
- **Exemptions (free, work with the flag off)**: city — Derrik `rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA`, the treasury, Gnasty `rDtUEMFVDi3K7TUQAQLi6xxa1WCer84dcA`, and `rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST`; Homefront — Derrik's two wallets only. The city also keeps `server/city.js` `JETSET` (Derrik's original allowlist); `hasJet` = JETSET ∪ exemptions ∪ paid grants.
- ⚠️ **`rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST` = BURN (Derrik's dad, personal wallet; exemption only, not a burn address).** "BURN" is a nickname. Use it ONLY as an identity in the free-city-jetpack exemption list. It is never a burn address, treasury, payout, or destination for any tokens or XRP. (Audit Oct 24, 2026, Derrik clarified Oct 23: it appears only in `server/city.js` JETSET (base64), `server/jetpack.js` exemptions, `test/goldlock-sim.js` (asserted *not* a black hole), `client/js/app.js` `lpTag` (highlights its LP share, display only), and LP-holder data in `client/data.js` / `lock-audit.md` / `server/eco-discovered.json`. No code sends anything to it; the game burn job pays `BURN_ISSUER` `rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd`.)
- **Server** `server/jetpack.js` (SQLite `DATA_DIR/jetpack.db`: `jp_invoices` (unique `tag`), `jp_used_tx` (hash PK), `jp_grants` (acct+kind PK)). Routes (bearer auth first → 401; 30/min/account + 60/min/IP → 429): `GET /api/jetpack` → `{payments, network, treasury, prices, owned, exempt}`; `POST /api/jetpack/invoice {kind:'city'|'homefront'}` (only `kind` is read; re-uses an open invoice < 9 min old; ≤ 6/h) → `{invoice:{id, drops, destination, destinationTag, memo}, xaman:{uuid, qr, deeplink}|null}` (Xaman payload when `XAMAN_API_KEY` is set, same SDK as `server/payments.js`); `POST /api/jetpack/claim {invoice, txHash?}` (hash from the Xaman payload when omitted). Grant rules (`checkTx`): validated, Payment, tesSUCCESS, `Destination` = treasury, `DestinationTag` = invoice tag, invoice memo, sender = signed-in account, no `tfPartialPayment`, XRP only (string `DeliverMax`/`delivered_amount`, IOU → `wrong_currency`), `delivered_amount` ≥ price (BigInt drops), hash never used (checked before the ledger call and again inside a `BEGIN IMMEDIATE` transaction with the grant). Homefront grants also add `homefront_jetpack` to the RPG sheet (idempotent, re-synced on every status read). Jetpack sales are **not** added to `burn_owed` (the BURN job is unchanged); 3.22% of each goes to the separate IMG buy-and-burn below (`server/img-burn.js`).
- **Client**: shared physics in `client/js/player-motion.mjs` (`JETPACK`, `jetHorizontal`, `jetVertical`, `stepFuel`); the city's `jetStep` in `app.js` now calls them (same numbers, asserted). Homefront: `client/arena/homefront-jetpack.mjs` — yard flight at scale 0.3, ceiling 5.5, 6 s of fuel, refuel 0.5 tank/s on the ground, glide down when empty; JET toggle (J / thumb button stacked above RUN, fuel bar above it), hold Space/JUMP to climb, C to descend; hidden + off in build mode; never changes the camera (overhead only in build mode). Purchase sheet `client/js/jetpack-shop.mjs` (Xaman deeplink/QR or manual tag + memo, polls claim every 4 s); HUD Inventory shows "Buy · 30 XRP" or how to fly; city `client/js/jetpack-city.mjs` adds a "🚀 5 XRP" button beside 🚀 Jet for signed-in non-owners while payments are on.
- **Tests**: `test/jetpack-pay-sim.js` (mocked ledger: flag gate, 401s, exemptions incl. env override, server-only price/destination/tag, forged hash, forged ledger hash, partial, underpaid ×2, wrong destination (incl. the BURN wallet), wrong tag, wrong/missing memo, wrong sender, IOU ×2, failed, non-payment, unvalidated → 202, cross-account 404, 12 concurrent claims → one grant, replay on another invoice/account, concurrent cross-invoice hash, restart persistence, price env), `client/arena/homefront-jetpack.test.mjs`, jet parity in `client/js/player-motion.test.mjs`; in `test:homefront`, `test:all` (`test:jetpack` alone) and the homefront CI workflow.
- **LIVE since Oct 24, 2026 ~00:35 PDT**: `JETPACK_PAYMENTS=1` is a Fly app secret (set through the Machines API `POST /v1/apps/burn-city-game/secrets/JETPACK_PAYMENTS`, then a machine update with `min_secrets_version` so the running server picked it up; init cmd `sh /data/boot.sh` unchanged). Verified in the running process: enabled, mainnet, treasury `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb`, prices 5 / 30 XRP, Xaman keys present; logged-out `GET /api/jetpack`, `/invoice`, `/claim` → 401, forged token → 401. No mainnet payload was created or paid. **Rollback**: `fly secrets unset JETPACK_PAYMENTS -a burn-city-game` (or Machines API `DELETE …/secrets/JETPACK_PAYMENTS` + machine update) → purchases 409 again; grants already made stay.
- **Testnet round trip (before enabling)**: local server on this code with `JETPACK_XRPL_WSS=wss://s.altnet.rippletest.net:51233 JETPACK_XRPL_NETWORK=testnet JETPACK_TREASURY_ADDRESS=<faucet wallet B>` and test prices 2 / 3 XRP; faucet wallet A paid the invoice (tag + memo) with a real testnet Payment (tesSUCCESS) → claim granted the city jetpack; re-claim idempotent; the same hash on a second invoice → 409 `replay`; a 1 XRP underpay → 402 `underpaid`; a wrong-memo payment → 402 `memo_mismatch`; Homefront jetpack stayed unowned. Repeat this before changing `server/jetpack.js` verification.
- **Known gaps**: the Homefront jetpack flies in your refuge yard only (the shared world is server-positioned 2D); no jetpack model on the yard avatar yet; Xaman payloads expire after 10 min (invoice claimable for 24 h); refunds/overpayment handling is manual; a buyer whose city tab was open sees the jet immediately (client flag) and the server confirms it on the next presence connect.

### (e) Jetpack IMG buy-and-burn (sw bc-v100-imgburn)
- **Rule (Derrik, Oct 24, 2026)**: 3.22% of every verified jetpack sale is owed to a batched buy-and-burn of **IMG** (`IMG_ISSUER` `rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd`), not BURN. The other 96.78% simply **stays in the treasury** `rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb`; Derrik deposits it into the IMG/XRP pool himself with his own bot. **No server-side AMMDeposit exists or should be added.** Shop (32.2%) and ranked (3.22%) BURN behaviour is unchanged (`burn_owed.json`, `server/burn.js` run()).
- **Files**: `server/img-burn.js` (new), `server/burn.js` (refactor only: `quoteToken` + `burnTx` extracted and reused by both jobs; the BURN tx is byte-identical, checked), `server/server.js` (`GET /img-burns` public ledger; `require('./img-burn').start()` next to the BURN job), `test/img-burn-sim.js` (in `test:jetpack`, `test:homefront`, `test:all`).
- **How it works**: sales are copied idempotently from `jp_used_tx` (written only by a successful claim) into `jp_img_sales` (hash PK) in `jetpack.db`. Owed (BigInt drops) = floor(Σ sale drops × BPS / 10000) − Σ batch drops not `failed` (cumulative floor: ≤ 1 drop rounding in total). When owed ≥ min, one batch: quote on the IMG/XRP AMM (pool asset2 must be exactly IMG/issuer), `guard.check` (pause switch, account reserve + owner reserve + `RESERVE_MARGIN_DROPS` + `JETPACK_IMG_RESERVE_FLOOR_DROPS` + fee), one cross-currency partial Payment treasury → IMG issuer (SendMax = exact drops, DeliverMin = quote × (1 − slippage)). The signed blob + hash are stored (`submitted`) before submit; a batch is `done` only when the tx is validated tesSUCCESS with IMG/issuer delivered. tec (e.g. slippage `tecPATH_PARTIAL`) or expiry past LastLedgerSequence → `failed` (owed released). tesSUCCESS with an unexpected delivery → `held` (not released; manual review). Restart: `building` → failed (nothing sent), `submitted` → re-checked/resubmitted by the same hash. One batch in flight at a time. Destination is always the IMG issuer; the dad wallet `rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST`, the treasury and `JETPACK_FORBIDDEN_DESTINATIONS` are refused.
- **Signing**: production holds `TREASURY_SEED` (Fly secret; it derives `TREASURY_ADDRESS` = rwfnp…, checked in-process Oct 24, 2026 without printing), so the server signs on its own. No Xaman owner prompt was built (not needed); without a seed `run()` returns `blocked: no_signing_key` and sends nothing.
- **Env**: `JETPACK_TREASURY_AUTO=1` (gate; off → nothing is sent, sales still accrue), `JETPACK_IMG_BURN_BPS` (322), `JETPACK_IMG_BURN_MIN_DROPS` (1 XRP), `JETPACK_IMG_BURN_MAX_DROPS` (50 XRP per batch), `JETPACK_IMG_RESERVE_FLOOR_DROPS` (10 XRP), `JETPACK_IMG_MAX_SLIPPAGE` (default `MAX_SLIPPAGE` 0.03), `JETPACK_IMG_BURN_INTERVAL_MS` (1 h; first run 90 s after boot), `JETPACK_IMG_ISSUER` / `JETPACK_IMG_CURRENCY` (tests), `JETPACK_FORBIDDEN_DESTINATIONS`. Also honours `DRY_RUN` and `PAYOUTS_PAUSED`.
- **Testnet proof (Oct 24, 2026)**: faucet issuer + LP + treasury; LP created a test IMG/XRP AMM (40 XRP / 100,000 IMG, 1% fee); a 40 XRP sale → 1,288,000 drops owed → one validated tesSUCCESS Payment (hash DC018314…3DC47F87) delivered 3,089.32 IMG to the issuer (issuer obligations fell by the same amount); a second run skipped (idempotent). Script: `/workspace/work/imgburn-testnet.js` (Hark workspace, not committed).
- **Rollback**: unset `JETPACK_TREASURY_AUTO` (Machines API `DELETE /v1/apps/burn-city-game/secrets/JETPACK_TREASURY_AUTO` + machine update with `min_secrets_version`) → no more batches; owed keeps accruing. Emergency stop for every outgoing tx: `PAYOUTS_PAUSED=true` or `data/pause.json`.
- **Known gaps**: quote uses float math for the IOU side (drops are exact BigInt); no admin UI (use `GET /img-burns`); a `held` batch needs manual review in `jetpack.db`.

## Estates batch: weekly accounting, sale confirmation, Estates Island, property rights, guest access (PRs #223–#237, sw bc-v101-estates)
- **Ledger/accounting (#223–#226, server-only, not routed):** `server/estate-owner-rewards.js` (combined-owner allocation), `server/estate-weekly-snapshots.js`, `server/estate-sale-confirmation.js`, `estates.js` `createWeeklySnapshot/transitionWeeklySnapshot/recordWeeklyPayoutStatus`. Nothing sends XRP; payout rows only record status + a 64-hex tx hash. `client/data/estate-catalog.json` now holds 21 island lots (the 9 city IDs are unchanged). Hark fixes: `weekStartUtc` regex was double-escaped (`\\d`, rejected every date); `createWeeklySnapshot` used better-sqlite3's `db.transaction` (absent in node:sqlite) → explicit BEGIN/COMMIT/ROLLBACK.
- **Estates Island (#227–#234):** `client/js/estates-island-*.mjs`, `experience-instance-pool.mjs`; installed from `app.js` via `installEstatesIslandLive` (root at x+650, bridge gate at city (445,188), explicit Enter panel; `updExplore` hands movement to `__estatesIslandLive.tick` while on the island, reusing the walker pose + MOTION cadence). Own collision controller (not player-motion.mjs). E or the panel buttons (mobile has no E binding; buttons work).
- **Rights (#235):** `server/estates-rights.js` + `estates-access-policy.js`; route renamed by Hark to **`GET /api/estates/rights?propertyId&action`** because #237 uses `GET /api/estates/access` for the owner guest list. Grants are derived only from `estate_property_ownership`; owners only (does not yet consult #237 invites).
- **Guest access (#237):** `server/estate-access.js` (tables `registered_wallets`, `estate_property_invites`), routes `/api/estates/access{,/search,/check,/invite,/revoke}` behind sign-in + estates rate gate; sign-in (`payments.finishSignIn`) now registers the wallet and fails with `registration_unavailable` if that write fails. `__estateEnter` now requires sign-in and owner/invite — **with sales disabled nobody owns a property, so the #207 interiors are currently unreachable for everyone** (his intent; revisit when sales open or allow unowned showrooms).
- Tests: all Estates/island tests are in `npm test`; `.github/workflows/estates-island-live.yml` runs them too.
## Zombies: Ashen Cosmodrome cover/flow, campaign carryover, Forge II, specials, Ashen Warden, RAVAGER rotary (PRs #200 #202 #203 #204, sw bc-v102-cosmo)
- Server: `server/cod.js` (cosmodrome cover islands, Forge tier II at `FORGE2_COST`=10000, now also sent in `layout().forge2Cost`), `server/game.js` (cosmodrome-only types 6 airborne hunter, 7 ranged shooter, 8 Ashen Warden boss on waves 8/12/16…; armor/stagger feedback skipped in ranked + daily), `server/rotary-rules.js` (RAVAGER spin-up/heat/lock), `server/zombie-campaign.js` (carryover). Ranked/daily keep the classic Refinery, so leaderboard balance is unchanged.
- Client: `client/arena/cod.js` Forge II prompt, `fx.js` rotary tracers, `net.js` extra snapshot fields.
- Tests: `test/zombie-campaign-carryover-sim.js`, `zombie-forge-tier-sim.js`, `zombie-cosmodrome-enemies-sim.js`, `npm run test:zombie-ravager` (all in `test:all`).

## Fishing: moving lake feeding schools (PR #201, sw bc-v103-fishschools)
- `client/js/fish.js` builds 3 glowing rings (`feedingSpots`) on the lake that drift every 14–32 s; a cast landing within 9 m gets `feedingSpotBonus` (`client/js/fishing-rules.mjs`): wider reel zone + shorter bite wait, client-side only. Catch rolls stay server-side for signed-in anglers (server/fish.js unchanged); lake coins have no real value.
- Only #201's own 5 commits were cherry-picked; its first 29 commits were #196, already on main as c7b1e63 with Hark's fixes.
## NFT walker avatars: realism, trait components, collection recipes, asset/GLB pipelines, runtime adapter (PRs #205 #206 #208 #209 #211 #213 #218–#222 #236, sw bc-v104-nftavatars)
- Runtime: `client/js/nftchar.js` (procedural NFT character on the shared walker; `userData.anim` driven from `updExplore` after `poseWalker`, MOTION cadence kept), `nft-avatar-components.js`, `nft-avatar-reconstruction.js`, `nft-avatar-collection-recipes.js`, `nft-avatar-adapters.js`, `nft-avatar-runtime-adapter.js` (shared Zombies/Homefront hook, not yet wired into the arena pages). `city.js` caps detailed peer NFT models (4 on mobile, 8 desktop) via `activeNftModels`/`nftModelCap()`.
- Server: `server/nft.js` metadata schema 2 (on-ledger URI wins; optional `api.xrpl.to` enrichment, never ownership proof; 512px contain thumbnails). Schema bump re-fetches every cached NFT once. Hark trimmed `mediaFiles` out of `charFor` (city presence broadcast) — it stays on the picker payload (`pub`). `model3d`/`animation` URLs are stored only; nothing loads remote GLBs.
- Offline tooling (not served at runtime): `scripts/nft-avatar-*.mjs`, `tools/blender/nft_avatar_generator.py`, `assets/nft-avatars/`, workflow `.github/workflows/nft-avatar-fidelity.yml`. Dev page `client/nft-avatar-visual-qa.html` is public but read-only.
- Tests: `npm run test:nft-avatar` (in `test:all`).

## Estates: tourable interiors while unowned; Island rights read #237 invites (sw bc-v105-tours)
- **Rule (server-authoritative, `server/estate-access.js` `accessFor`)**: unowned property (sales disabled → all of them today) → `{allowed:true, role:'tour', mode:'tour', permissions:['enter','inspect']}` for anyone, signed in or not. Owned → #237 rule unchanged: owner (`enter,inspect,build,invite`), invited wallet (`role:'guest'`, `enter,inspect`), signed-out → 401 `sign_in_required`, stranger → 403 `no_access`. `canAct(acct, id, action)` is the helper for any future ownership action (furniture edits, invites, rights).
- **Routes**: new public `GET /api/estates/tour?propertyId` (before the estates bearer gate; optional bearer; 60/min/IP `estates-tour-ip` + the shared 30/min/IP limit; 200/401/403/404). `/api/estates/access/check` now returns 200 tour for unowned (was 404 `not_owned`). `/api/estates/rights` passes `access: EstateAccess` so `resolveEstateRights` grants invitees `enter,inspect` (`role:'guest'`, never build/invite/trade); tour visitors get nothing from rights (island private area stays owner + invite).
- **Client** (`client/js/app.js`): `__estateEnter` calls `/api/estates/tour` (honours `?citysrv=`), stores `window.__estateAccess {propertyId, role, mode, permissions}` + `window.__estateTourMode`; HUD prefixes `TOUR · ` and sets `data-mode`; `window.__estateCan(action)` gates interior ownership actions (server re-checks); `__estateManageAccess` refuses during a tour. Cleared on `__estateExit` and `estate.js` `__estateAutoExit`.
- **Tests**: `test/estate-access.test.js` (tour for unowned incl. signed-out, owner/invitee/stranger, canAct, tour/guest cannot invite/list/revoke, island rights via invites), `server/estates-rights.test.js` (injected `access`), `test/estates-money-sim.js` HTTP "Tours" block (rows inserted then removed; end state still 0 rows), `estate-interior-physics.test.mjs` greps. Playwright desktop + iPhone 13 (`serviceWorkers:'block'`, `?noguide=1&citysrv=<local>`): signed-out `__estateEnter('mansion-01')` → inside, tour HUD, `__estateCan('build'|'invite')` false, manage-access refused.
- **Known gaps**: there is no furniture-edit API yet; when one is added it must call `EstateAccess.canAct(acct, id, 'build')`. When sales open, tours stop automatically for sold lots.


## UI overlap pass (fix/ui-overlaps, sw bc-v106-overlaps)
- **Audit helper** (manual, needs Playwright, not in `npm test`): `scripts/ui-overlap-collect.js` (in-page collector, no deps: painted boxes of visible fixed/absolute HUD roots, pairs from different roots intersecting ≥3px, fixed boxes outside the safe-area insets; boxes are clipped by overflow ancestors; roots >45% of the viewport count as intentional overlays; `data-overlap-ok` or a per-page ignore selector allow-lists deliberate layering) + `scripts/ui-overlap-audit.mjs` (runner). Run: `PLAYWRIGHT_DIR=<dir with node_modules/playwright> HF_TOKEN=<signed token> node scripts/ui-overlap-audit.mjs http://localhost:8080 TAG [pages] [port,land,se,desk]` → `./ui-audit/TAG/overlaps.json` + screenshots. Pages: city (`?noguide=1&recap=1`), ioshint (injected iOS install hint), tour (`__estateEnter('mansion-01')`), island (walk to the bridge gate, Enter Estates Island), hf-home/hf-build/hf-manage/hf-world (homefront.html; rpgWorkshop / rpgManagement / enterExpedition), zombies (landscape phones + desktop), lobby (flight-lobby.html). Devices: iPhone 13 portrait (insets 47/34) and landscape (47 L/R, 21 bottom), Playwright "iPhone SE" (320x568, inset 20 top), desktop 1280x800. Service workers blocked; `env(safe-area-inset-*)` rewritten in served CSS/JS/HTML.
- **Fixes (CSS-only, `client/ui.css` block [8], plus one line each in `client/js/pwa.js` and `client/arena/homefront.html`)**:
  - Estate interior banner (`#estateInteriorHud`, `TOUR · ESTATES · …`): on touch it now takes the status-chip row while inside (`#status` hidden via `body:has(#estateInteriorHud)`, back on exit); landscape: between the minimap and gear columns. It used to sit at top:68px over the top row (☰ View / ✕ Exit, ⇄ Play, BURN CITY) and the Market chip.
  - `#recap` is an Orbit card: hidden in Explore / Fly and while an estate banner exists (it covered the banner, minimap column, streak chip, gear bar, prompt, and the desktop HUD panel). On short phones (≤600px tall) it scrolls and ends above the streak chip. `#vHint`/`#tapTip` hide inside a residence and, in Explore/Fly on phones, stay between the side columns.
  - Phones ≤520: `#status` chips stay on one row (`#live` truncates with an ellipsis); a wrapped second row ran under the Explore minimap and the recap.
  - ≤380px wide: ⇄ Play is icon-only and ☰ View/✕ Exit is right-anchored beside it; ≤340px: the BURN CITY brand text gives way to the flame mark (the top row did not fit on iPhone SE / mini).
  - iOS install hint (`#iosHint`): touch = bottom row between the minimap and City chat, desktop = bottom edge, `width:max-content`; `#help` hides while it is up; `pwa.js` waits until Orbit to show it (in Explore/Fly the bottom edge belongs to the touch controls).
  - Desktop `#help` line is `max-content`, capped to clear the minimap + Keys button.
  - Homefront: `#homefrontInteractionPrompt` sits at bottom 146px when the touch joystick exists (it covered the joystick and RUN/JUMP). Homefront camera rule untouched.
- **Not changed (by rule)**: Zombies HUD/joystick/landscape layout. The audit still reports transient Zombies layering (zone-name `#codhud` flash over the minimap/toast, crosshair + hit marker by design); SE *portrait* Zombies is not a supported orientation.

### Estates sales runtime (Oct 29)
- `server/estate-sales-runtime.js` replaces the three disconnected production kill switches with one explicit startup gate: `ESTATE_SALES_ENABLED=1`, mainnet, `DRY_RUN=false`, configured Xaman credentials and treasury. Default remains disabled. New reservations/payment requests also honor the treasury pause; reconciliation of already-signed incoming payments remains possible while paused. No distributions or outgoing transfers are enabled.
- The existing authenticated reserve/start/confirm/session/quote routes use this runtime. `/api/estates/purchase/payment/review` handles an expired signing session through the existing late-payment review registry, without refunds or ownership assignment. Pending ledger validation returns HTTP 202. SDK access reuses `Pay.sdk`; XRPL requests reuse `Pay.ledger`.
- Property cards mount `estate-purchase-ui.mjs`: server quote, existing reservation recovery, Xaman review link, explicit confirmation, settled portfolio state and owner IMG/XRP preference. Reservation pointers are scoped to wallet/property. No client amount or share weight is submitted. SW precache includes the module (v117).
- Validation: full `npm test` passed locally; all estate-sale suites and runtime/HTTP tests passed, using simulated credentials/ledger only. Browser CI tests the mobile/desktop component with fake responses. No live purchase was performed. Production flag is not set by this change; browser CI must pass before merge.

### Hourly Estates runtime and settlement software
- `server/estate-hourly-service.js` wires the contiguous scanner, source/pool-scoped receipt verification, historical ownership allocation, completed-hour reconciliation and durable IMG/XRP executor. `ESTATE_ACCOUNTING_ENABLED=1` enables scan/accounting; settlement additionally requires `ESTATE_DISTRIBUTIONS_ENABLED=1`, mainnet and `DRY_RUN=false`. Defaults remain disabled.
- Additive tables: `estate_img_retained_receipts` (no-owner rewards), `estate_hourly_payouts` (unique hour/owner, signed blob/hash/envelope persisted before submit, debit/delivery/remainder proof), `estate_payout_credits` (whole micro-IMG remainder rolled into the next funded intent). Preserve these tables on rollback; never delete a submitted intent or signed blob to force a retry.
- Watchdog known transactions include the durable Estates payout hashes. No manual AMM transaction or arbitrary address is allowlisted. Existing treasury pause is unchanged.
- Authenticated `/api/estates/payouts` returns only the caller's public payout status/history; no blob or key. Property UI reads actual enabled status and can refresh history. SW v118.
- `ESTATES_ACTIVATION.md` contains the operator-only bootstrap/activation steps, accounting scope, caps, dust/credit behavior, failure/recovery limitations and first-mainnet-proof requirements. No live outgoing transaction or production activation was performed during development.
