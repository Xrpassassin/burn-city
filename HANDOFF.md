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

## AEGIS City Watch (branch feat/aegis, not merged)
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
