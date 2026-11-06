#!/usr/bin/env bash
# Manual, reviewed deployment ONLY. Never invokes production's Fly app.
set -euo pipefail
APP="burn-city-homefront-preview-551"
CONFIG="fly.homefront-preview.toml"
if [[ -z "${FLY_HOMEFRONT_PREVIEW_API_TOKEN:-}" ]]; then
  echo >&2 "Missing dedicated FLY_HOMEFRONT_PREVIEW_API_TOKEN. Production Fly tokens are never accepted."
  exit 2
fi
if [[ ! -f "$CONFIG" || ! -f Dockerfile.homefront-preview ]]; then
  echo >&2 "Run from the repository root on the reviewed Homefront preview branch."
  exit 2
fi
if [[ "$(git branch --show-current)" != "feat/homefront-guest-play-wallet-save-20261103" ]]; then
  echo >&2 "Refusing deployment outside the reviewed combined guest-play branch."
  exit 2
fi
if grep -Eq '^app[[:space:]]*=[[:space:]]*"burn-city-game"' "$CONFIG"; then
  echo >&2 "Refusing to deploy to the production app."
  exit 2
fi
if grep -Eq '(\[mounts\]|\[\[mounts\]\]|bcg_data|/data/boot\.sh)' "$CONFIG" Dockerfile.homefront-preview; then
  echo >&2 "Refusing preview with a persistent production mount or GitHub-volume boot."
  exit 2
fi
if [[ "$(grep -E '^app[[:space:]]*=' "$CONFIG" | tr -d '[:space:]"' )" != "app=$APP" ]]; then
  echo >&2 "Preview Fly app identity differs from the dedicated allowlist."
  exit 2
fi
command -v flyctl >/dev/null || { echo >&2 "Install flyctl before running this reviewed preview deployment."; exit 2; }
# Do NOT reuse FLY_IO, FLY_IOV2 or FLY_API_TOKEN from the live deploy.
# This token should be app-specific. The app/password must be provisioned
# separately; the script does not create resources, set secrets or spend money.
if ! FLY_API_TOKEN="$FLY_HOMEFRONT_PREVIEW_API_TOKEN" flyctl status -a "$APP" >/dev/null; then
  echo >&2 "Preview app not found/access denied. Create the isolated app and set its private password first."
  exit 2
fi
echo "Deploying only $APP with the reviewed password-gated in-memory gateway"
FLY_API_TOKEN="$FLY_HOMEFRONT_PREVIEW_API_TOKEN" flyctl deploy \
  -a "$APP" -c "$CONFIG" --remote-only --ha=false
curl -fsS --max-time 25 "https://$APP.fly.dev/healthz" | grep -F '"payments":false' >/dev/null
echo "Isolated Homefront preview health check passed. Confirm password login and manual phone QA before merging."
