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
