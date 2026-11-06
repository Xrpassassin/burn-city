# Homefront guest play — wallet only for persistent saves

Status: integrated from draft #552 onto main + #562 fullscreen menus in the
`feat/homefront-playable-20261106` review branch. **Not merged or deployed.**

## Player experience
- Open Homefront without a wallet: game automatically creates a playable
  **disposable solo refuge** and opens the real third-person WebGL scene.
- Build, perform workdays, manage survivors, earn in-session C.I.N.D.E.R.S.
  experience, and explore a **private isolated** Graveyard world using the same
  authoritative gameplay rules as regular Homefront.
- The HUD shows **Guest (unsaved)** and exposes **Connect wallet to save**
  through its in-world menu. No wallet pop-up is needed to begin playing.
- A guest session is held only in server RAM and a token held only in page
  memory. It **does not** save to disk, XRPL, a guest account, or the browser.
  Reloading, closing the page, server restart or 90 minutes idle loses progress.
- Connecting Xaman **begins or restores the existing wallet-linked account**.
  It does *not* import guest gains, inventory, resources, structures or level
  into that account. Say this clearly to avoid surprise.
- Guest multiplayer and PvP against real wallet players are disabled by
  isolation: every guest has a private world instance. Connecting a wallet
  enables the existing shared multiplayer features.

## Enforcement
- The normal `/api/homefront` and `/api/homefront/world/*` endpoints retain
  their original Xaman/Pay bearer authorization.
- Guest routes are `POST /api/homefront/guest/start` and
  `/api/homefront/guest[/{action,world,...}]`. A separate 256-bit random
  guest capability in `X-Homefront-Guest` is mandatory. It is **not** a bearer
  login for wallets, settlement purchases, NFTs, jetpacks or other APIs.
- Guests use the same validated Homefront handler against a fresh
  `Map`-backed store supplied explicitly as `store`. None of its writes can
  reach `HFStore.shared` or the production Graveyard database.
- The RAM session table has a capacity limit of 128, 90-minute idle expiry and
  server-side per-IP creation throttling. A caller holds at most three live
  sessions; a new start replaces its oldest slot. Unclaimed sessions expire
  after five minutes. Tune budgets after load testing. Guests do not survive
  machine restart and currently require single-machine routing: the session
  map is process-local, with no Fly affinity implementation in this change.
- The experimental continuous-movement two-key release gate is unchanged.
  No wallet, treasury, Estates, Xaman or payment code is modified.

## Expiration and cross-origin release checks

- The browser holds a guest token only in memory. After 90 minutes idle or a
  Fly machine restart, the server returns `401 guest_session_expired`.
  Homefront clears the expired token, releases held controls, closes the stale
  world and shows a **Guest session ended** dialog. Restarting creates a new
  disposable world; no combat, crafting or settlement mutations are silently
  retried. A real wallet-linked account remains separate.
- The introductory tutorial and guest field survival display say plainly that
  progress is temporary, not saved, and never transferred on Xaman login.
- Homefront may be served from `https://xrpassassin.github.io` while using the
  `https://burn-city-game.fly.dev` API. The production CORS OPTIONS response
  must allow exactly the `x-homefront-guest` request header in addition to the
  existing content-type and authorization headers. It still restricts origins
  to the prior allowlist and never enables credentialed wildcard requests.
- `test/homefront-guest-cors.test.mjs` evaluates the real production JSON/
  OPTIONS CORS response in an isolated VM. The Chromium guest smoke also runs
  a third real WebGL session with the game page and API on **different
  origins**, verifies the browser's successful CORS response and separately
  validates the real server's explicit HTTP OPTIONS response. Browser
  interception can suppress an implicit preflight count, so the test does
  not depend on that counter.

## Acceptance
- `node test/homefront-guest-sim.mjs`: gameplay, guest isolation, no
  persistent store access, invalid token rejection, TTL and capacity.
- `node test/homefront-guest-client.test.mjs`: memory-only transport,
  route rewriting and wallet sign-in boundary.
- `npm run test:homefront`: full regression suite.
- GitHub Actions `Homefront wallet-free guest play`: actual browser loads
  real Three.js Homefront on desktop/mobile without wallet, opens in-world
  Inventory, reloads and verifies fresh account.
- Before release, manually test Xaman sign-in *from* guest, restored old
  wallet progress, shared Graveyard player visibility, physical phone
  touch/camera performance, and Fly multi-machine behavior.

**Release sequence:** review this combined integration against main, not a
blind merge of #551 or #552. Preserve #562 and keep production direct movement
disabled until its separate release acceptance. A merge is not a deployment
or hosted acceptance. Test physical touch hardware, live wallet restoration
and multi-machine routing before claiming those are verified.
