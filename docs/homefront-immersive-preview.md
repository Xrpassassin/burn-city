# Homefront immersive UI — isolated Fly preview

**Scope:** Draft PR #551 (`feat/homefront-immersive-ui-shell`). Production game `burn-city-game` is never a deployment target for this procedure.

The preview serves the **actual Homefront HTML, refuge and Graveyard Three.js clients** using `scripts/homefront-preview-gateway.cjs`, a standalone password-gated HTTP service. It runs Homefront-only gameplay handlers against **disposable in-memory state** with a synthetic wallet/account. No production database or `/data` volume is mounted. There is no production payment service, Xaman authentication, Estates purchase endpoint, jetpack payment endpoint, or XRP treasury secret. Player actions only modify the fake server state in RAM and disappear on restart.

## What is ready

- `fly.homefront-preview.toml`: dedicated app `burn-city-homefront-preview-551`; no volumes; HTTP health check; auto-stop when idle; continuous movement disabled.
- `Dockerfile.homefront-preview`: dedicated entrypoint, not the production Dockerfile or GitHub volume bootstrap.
- `scripts/homefront-preview-gateway.cjs`: password-protected site and API, secure HttpOnly SameSite cookie, rate-limited login, preview banner, read-only jetpack status, all other non-Homefront APIs rejected. Homefront gameplay actions operate **only on local in-memory fake data**.
- `scripts/homefront-preview-gateway.test.mjs`: asserts fail-closed password, session and fake account, protected static assets, and rejection of production wallet, token, and Estates routes.
- `scripts/deploy-homefront-preview.sh`: manually deploys **only** the dedicated app with a **separate app-scoped token**, refusing production app and persistent volume references. No auto-deploy on PR pushes.

## Review without any new Fly.io credentials

The feature branch already has a GitHub Actions browser-acceptance workflow that
launches the real Homefront refuge/Graveyard Three.js scenes with synthetic data
and captures screenshots. To review its current state **without** creating a
Fly app, password, token, or billable resource:

1. Open [Homefront immersive UI browser acceptance](https://github.com/Xrpassassin/burn-city/actions/workflows/homefront-immersive-ui-browser.yml).
2. Select the latest successful run for PR #551.
3. Download the **Homefront interface screenshots** artifact from that run.
   It includes signed-in desktop and simulated mobile portrait/landscape views.

This is the correct first review path while the owner is not ready to provision
a dedicated cloud preview. The artifact does not offer interactive physical-phone
testing or real-network multiplayer acceptance. It never enables
`HOMEFRONT_CONTINUOUS_MOVEMENT` and does not authenticate to Fly.io.

A separate scoped Fly token and preview-only password are needed **only if**
the owner later chooses the optional isolated live Fly preview below. Existing
production `FLY_IO`, `FLY_IOV2` or `FLY_API_TOKEN` credentials should not
be copied into that app.

## One-time Fly setup (owner action)

These commands can create billable Fly resources. Use your own Fly login on your own machine. **Do not paste passwords, tokens, seeds or treasury credentials into ChatGPT or GitHub issues.**

```bash
flyctl auth login
flyctl apps create burn-city-homefront-preview-551 --org YOUR_FLY_ORG
# Choose a random private password of at least 20 characters.
flyctl secrets set -a burn-city-homefront-preview-551 --stage HOMEFRONT_PREVIEW_PASSWORD='YOUR_NEW_RANDOM_PREVIEW_PASSWORD'
# Create a token scoped only to this new app (not the live app).
flyctl tokens create deploy -a burn-city-homefront-preview-551
```

Store the newly issued *preview-app-only* deploy token as `FLY_HOMEFRONT_PREVIEW_API_TOKEN` in your local terminal credential environment. Do **not** reuse `FLY_IO`, `FLY_IOV2`, production `FLY_API_TOKEN`, or any treasury/Xaman secret.

## Deploy reviewed branch only

```bash
git fetch origin
git switch feat/homefront-immersive-ui-shell
# Requires only the NEW preview-app token in FLY_HOMEFRONT_PREVIEW_API_TOKEN.
bash scripts/deploy-homefront-preview.sh
```

The script fails closed if the app does not already exist or is inaccessible, the current branch is wrong, the dedicated token is missing, or the config mentions a production app or persistent mount. It does not create or destroy apps. After deployment, verify the password-protected preview and its unauthenticated `/healthz` endpoint.

## Manual release acceptance

1. On desktop and a physical phone: sign into the preview using its **preview-only password**, not Xaman. Confirm the preview marker says **SYNTHETIC DATA · NO PAYMENTS**. Never connect a real wallet.
2. Check refuge in third-person, open and close Inventory/Journal/Build/Manage, inspect at least two management categories, and verify no duplicated or overlapping panels.
3. Choose a building, verify the drawer closes while the 3D yard remains visible, place it into the fake refuge, then use **Finish building**. Verify Build returns correctly and the result is only in the fake state.
4. Enter and leave the Graveyard; verify camera controls, movement, menu access restrictions and return routing. Note that PR #549 continuous WASD movement and PR #550 direct expedition routing are **not** part of this preview.
5. Test iOS touch joystick and 3D camera with actual gestures, including safe areas and screen rotation. Repeat with a busy fake base to reveal scaling/clipping issues.
6. Collect screenshots and note any UI overlaps or server errors. Do not merge until this review is complete and the owner accepts gameplay feel.

After testing, stop or destroy the preview app through Fly to avoid unexpected ongoing charges. This does not affect the production app or persistent data.

## Explicit limitations

- Synthetic preview data does not test existing real accounts or wallets; that is intentional.
- Fly deployment has **not** occurred merely because these files are committed or CI passes. The dedicated app/password/token must be created and the manual deploy command run first.
- Browser CI proves the actual refuge/Graveyard 3D scenes, HUD layering, and key construction handoff, but cannot certify physical-device touch comfort or remote network latency.
