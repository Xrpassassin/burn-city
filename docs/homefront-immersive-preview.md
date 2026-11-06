# Homefront fullscreen phone preview

The branch `preview/homefront-fullscreen` contains the Homefront fullscreen release candidate from PR #562 and an isolated Fly gateway. The gateway runs the real Homefront UI and gameplay handlers with one synthetic account and disposable in-memory saves. It uses the dedicated `burn-city-homefront-preview-551` app, separate from the live BURN City server.

## Run a phone preview without Fly

If you have GitHub Codespaces available, open the `preview/homefront-fullscreen` branch in a new Codespace. In its terminal, run:

```bash
npm ci --ignore-scripts
bash scripts/start-homefront-preview.sh
```

The launcher prompts for the preview password without echoing it. In the Codespace **Ports** panel, forward port **8080** and keep it **Private**. Open its forwarded HTTPS address on the phone while signed into the same GitHub account, then enter the preview password. The preview remains available while the Codespace is running. [GitHub port forwarding documentation](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)

## Deploy the reviewed branch

Use an existing preview app and its credentials if available. The deploy script checks that the app is accessible. It requires a dedicated preview-app deploy token in the terminal environment as `FLY_HOMEFRONT_PREVIEW_API_TOKEN`. Keep the preview password and token in your Fly and terminal setup.

If the app needs provisioning, sign in with Fly and run:

```bash
flyctl apps create burn-city-homefront-preview-551 --org YOUR_FLY_ORG
flyctl secrets set -a burn-city-homefront-preview-551 --stage HOMEFRONT_PREVIEW_PASSWORD="$HOMEFRONT_PREVIEW_PASSWORD"
flyctl tokens create deploy -a burn-city-homefront-preview-551
```

Set `HOMEFRONT_PREVIEW_PASSWORD` to a private, random value of at least 20 characters before staging it. App provisioning and machine usage may incur Fly charges. The preview is configured to stop when idle.

In a clean checkout, run:

```bash
git fetch origin preview/homefront-fullscreen
git switch --track origin/preview/homefront-fullscreen
bash scripts/deploy-homefront-preview.sh
```

If the branch already exists locally, switch to it and fast-forward from its origin branch before deploying.

## Phone acceptance

1. Open the forwarded HTTPS address or [the deployed Fly preview](https://burn-city-homefront-preview-551.fly.dev/) in Safari or Chrome and enter the preview-only password. Confirm the **PREVIEW · SYNTHETIC DATA · NO PAYMENTS** marker.
2. Move with the refuge joystick and check the camera in portrait and landscape. Open Inventory and Manage over the world.
3. Use Build to place a structure, then tap **Finish building**.
4. Use **Menu → Travel** to enter the Wastes and return. Dismiss the debrief.
5. Use **Menu → Return to BURN City**. In this isolated build it lands on the preview entrance, where **Reopen Homefront** starts another run.

The gateway and Chromium smoke checks run on the preview branch without Fly credentials. A physical phone run is the release acceptance step.
