# Burn City — XRPL BURN/IMM ecosystem in 3D

Read-only 3D visualisation of the BURN / IMM / XRPyro AMM ecosystem on the XRP Ledger (three.js r160, no build step).

## What's new in v3
- **Live ledger events** (read-only websocket, `wss://xrplcluster.com` → `s1`/`s2.ripple.com` fallback, exponential backoff 1→30 s + jitter, heartbeat watchdog, status dot):
  - **Burns**: Payments of BURN / IMM / IMG / XRPyro back to their issuer (all four issuers are blackholed, verified via `account_info`: DisableMaster + blackhole RegularKey) → fireball + shockwave from the tower, banner, session counter.
  - **Big trades**: Payment / OfferCreate touching any ecosystem AMM account, sized by the AMM's XRP balance change (non-XRP pools: token change × xrpl.to price, marked *est.*) ≥ threshold → light pulse along that bridge + toast. Default **500 XRP**; set `?trade=1000` or `localStorage.bc_trade`.
  - **Lock ceremonies**: LP tokens paid into a known blackholed wallet, plus a 15-min `amm_info` + `account_lines` recheck of locked % → scaffold eases into a solid light-road + flash + banner.
- **Time-lapse replay** (HUD → Replay): 365 days of daily closes; towers scale with price vs today, bridges dim with activity, weather follows that day's mood. Play/pause, 2/6/20 days per second, *Live* returns to the snapshot.
- **Graphics setting** Auto/Low/Medium/High (localStorage `bc_quality`, or `?q=low`). Auto: phones with ≤4 cores or ≤3 GB → Low, other phones → Medium, desktops → High.
- **Share links**: 🔗 Link copies the exact camera (`?cam=x,y,z,tx,ty,tz`), or `?mode=explore&pos=x,z,yaw`; also `?view=<TOKEN>|hub|overview|burn|imm|street`, `?mode=fly|explore`.
- Tour has captions and a light-road stop.

### Demo / test triggers
`?demo=1` random stream (`&demoMs=4000` mean gap) · `?demo=burn`, `?demo=trade,trade,lock`, `?demo=all` one-shots · `?live=0` disables the websocket. Demo events are labelled DEMO and never added to the real burn counter.

## Layout
```
xrpl-city/        index.html, style.css, js/app.js, js/live.js, js/net.js, data.js, data/timeline.json, build_data.py, build_timeline.py, shot.js, perf.js, soak.js, previews/, AUDIT.md
  server/         tiny Node WebSocket relay (multiplayer stub)
xrpl-arb/         data scripts: ecosystem.py (pools/nodes -> ecosystem_core.json), recorder.py (5-min snapshots), backfill.py, scan/momentum/deep
```

## Host
Pure static files. Any static host works (Netlify, Vercel, S3/CloudFront, GitHub Pages, nginx):
```
cd xrpl-city && python3 -m http.server 8765   # local test → http://localhost:8765
```
three.js loads from unpkg via importmap; self-host `three` if you need offline/CSP-strict hosting.

## Refresh data
```
cd xrpl-arb && python3 ecosystem.py          # re-crawl AMMs (xrplcluster.com JSON-RPC) -> ecosystem_core.json
python3 recorder.py &                          # optional: snapshots every 5 min -> data/snapshots.csv
cd ../xrpl-city && python3 build_data.py       # -> data.js (uses curl for xrpl.to stats)
python3 build_timeline.py                      # -> data/timeline.json (time-lapse; uses optional/history if present)
```
Cron example: `*/15 * * * * cd /srv/xrpl-arb && python3 ecosystem.py && cd ../xrpl-city && python3 build_data.py`.
Market mood (TVL-weighted 24h change) drives auto weather: >+1% clear, −0.5…+1% fog, −2…−0.5% rain, < −2% storm.

## Embed in xrpburn.com
```html
<iframe src="https://YOUR-HOST/xrpl-city/index.html" style="width:100%;height:80vh;border:0" allow="fullscreen; autoplay"></iframe>
```
URL params: `view=overview|street|burn|imm|hub|explore`, `weather=auto|clear|fog|rain|storm|cycle`, `tod=0..1`, `ws=wss://host:port`.

## Controls
Orbit (drag/scroll/pinch), Fly (WASD+mouse), Explore (WASD, Shift run, Space jump, E interact, V 1st/3rd person; touch joystick on mobile), Tour. Audio muted by default.

## Multiplayer (optional)
```
cd server && npm install && PORT=8787 node server.js
```
Open `index.html?ws=ws://localhost:8787`. Protocol (JSON): `hello{id,name}`, `state{id,p,yaw,anim}` (~10 Hz), `chat{id,text}`, `leave{id}`, server→client `peers[...]`. Client: `js/net.js` (PlayerState + NetClient). Stub only: no auth/rate-limit — add those before going public.

## Performance notes
Draw calls (overview, 1280×720): Low ≈500 · Medium ≈690 · High ≈1360. Payload: see release notes. Serve with gzip/brotli (all text assets compress 3–5×).
`node perf.js label "q=low&live=0" "iPhone 13" 4` → load time, heap, draw calls (device profile + CPU throttle). `node soak.js 11` → 11-minute soak with demo events.

## Screenshots / QA
`node shot.js out.png "view=burn" 13000` (needs playwright-core + Chrome). Previews in `previews/`.

Data is read-only; nothing here signs or submits transactions.

## Visual mapping (v4)

| What you see | What it means | Source |
|---|---|---|
| Tower **height** | Market cap in XRP = circulating supply (issued minus issuer, `gateway_balances`) × AMM price, log scale. Marked *est.* when the price comes from a thin pool (<1,000 XRP depth) or is routed through a non-XRP pool. xrpl.to mcap is **not** used. | `tools/enrich.py` → `data.js` (`circ`, `price_amm`, `price_src`, `price_thin`, `mcap_amm`) |
| Tower **base width** | Total AMM pool TVL in XRP, sqrt scale | `data.js` `tvl` |
| **Build quality** (5 tiers) | TVL-weighted % of the token's LP locked in blackholed wallets: Under construction (<15%: scaffold cage, crane, blinking work lights, dim sparse windows) · Framed (15–40%) · Standard (40–70%) · Premium (70–92%: glass curtain wall, chrome trims, holo rings) · Flagship (≥92%: + crown spires, animated light strips, landing pad) | `data.js` pools `locked_pct` |
| **Flames** on a tower | Permanent burn marks: one per burn tx (Payment of the token to its own issuer). Capped per tower (10/16/24 by graphics tier) and city-wide (140/280/460); past the cap flames get hotter/larger instead of more numerous. Live burns add marks in real time. BURN = orange fire, IMM = ice-blue, XRPyro = red-hot inferno. | `data.js` `burn_txs`, `burn_vol`, `burn_complete` |
| **Launchpad** lots | Bonding-curve tokens on xrpl.fun that have no AMM pool yet: pit, cranes, wireframe ghost of the future tower, progress ring = bond %. On graduation the ghost rises into a tower. | `tools/launchpad.py` → `launchpad.js` |
| **Sponsored** blimp/billboards | Active paid placements on xrpburn.com (Headliner/Spotlight), rotated and labelled *Sponsored*. When none are active, default content shows. | `tools/ads.py` → `ads.js` |

### Nightly refresh
After `build_data.py` writes `data.js`, run:
```
python3 tools/enrich.py data.js 90   # mcap, burn counts (90 s scan budget per token)
python3 tools/launchpad.py launchpad.js
python3 tools/ads.py ads.js
python3 tools/history.py history.js 90   # Replay history: appends today's real snapshot, scans new burns
```
Burn counts are from the issuer's `account_tx`; very busy issuers can't be fully scanned in the time budget, so the card shows "≥N (partial scan)" and no burned-% in that case.

### Replay (city history time-lapse)
**▶ Replay city history** (panel) or `?replay=1` plays the real ecosystem history day by day: tokens appear as empty
lots on their launch day, rise into towers when their first AMM pool is created, grow with market cap (height) and
TVL (base width), and gain a permanent flame on each day a real burn hit the issuer. Controls: play/pause, 1x/4x/16x
(1x = 4 days/s), a dated scrubber, Esc / ✕ Live to return. Code: `js/replay.js` (only drives existing tower params).

Data: `tools/history.py` → `history.js` (~100 KB, ~25 KB gzipped), lazy-loaded only when Replay opens.

| Field | Source |
|---|---|
| Launch day (`l`) | earliest of the issuer's first ledger tx (XRPL `account_tx` forward) and xrpl.to's listing date |
| Bond day (`a`) | first tx of the earliest AMM account among the token's pools |
| Market cap (`m`, log10×100) | daily close (xrpl.to OHLC, Data by xrpl.to) × circulating supply (today's obligations + burns made after that day) |
| TVL (`t`) | **estimated** before nightly snapshots: today's pool TVL × √(close/today's close) for pools alive that day; real from the nightly runs (`tr`) |
| Approximate (`x`) | days with no trade data are log-interpolated and shown as "≈ approximate"; tokens unknown to xrpl.to carry today's values back |
| Burns (`b`) | validated Payments of the token delivered to its own issuer, per day. `bp` = scan still partial (busy issuer; backfills each night) |
| Lock % (`k`) | nightly snapshots only; `k0` = today's value carried back (no older lock history exists) |

`tools/history_cache.json` keeps scan markers, burns and nightly snapshots so each run is incremental.

### ads.js format (hand-editable)
```js
window.ADS={"active":[{"ticker":"BURN","name":"Burn","tagline":"…","issuer":"r…","logo_url":"https://…/logo.png","color":"#ff5a1a","tier":"Headliner","url":"https://xrpburn.com/dex/trade/BURN-XRP"}]};
```
Only `ticker` is required. Logos must be https and served with CORS (`Access-Control-Allow-Origin`) to render on the 3D canvas; otherwise a text badge is shown.

### Music
`music/` holds the owner's own tracks re-encoded at 96 kbps (streamed only on Play, never cached by the service worker). `music/playlist.json` lists title + file.

## v5 (Oct 2026)
- New towers: **Budzy** (`r9WdD3QspvnQSR71kmcffNDFyjPV2pdTdU`, XRP pool) and **$BTCK** (`rUWehZhgLx8DTRSP1tQfmHUUjGysLRgxw3`, XRP/666/$BWTZ pools), added to the `SEED` list in `xrpl-arb/ecosystem.py` and `CORE` in `draw_ecosystem.py` so nightly refreshes keep them.
- Burn visuals: noise-shader flames (flicker, heat-shimmer, molten scorch cracks, smoke wisps) + GPU embers, sized by burn size, per-token fire themes. Live burns: fireball from the sky with a trail, impact flash, shockwave, ember burst, screen heat haze, flare-up of the new flame. Big burns (≥1% of supply or ≥10× the token's average burn) add a fire tornado and an optional camera shake (`?shake=0` or the HUD toggle). `?demo=burn` plays a normal then a big demo burn; `?view=fire` frames the BURN tower. Demo flames are temporary (25 s).
- Guide: ~5.8 s per step, Back/Next, step counter + progress bar, pauses on hover/touch. Buttons ≥40 px (≥44 px on touch).
