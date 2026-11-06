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
if [[ "$(git branch --show-current)" != "preview/homefront-direct-walking" ]]; then
  echo >&2 "Refusing deployment outside the reviewed preview/homefront-direct-walking branch."
  exit 2
fi
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo >&2 "Deploy from a clean checkout of the reviewed preview branch."
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
command -v node >/dev/null || { echo >&2 "Node.js is required to verify the deployed preview."; exit 2; }
# Do NOT reuse FLY_IO, FLY_IOV2 or FLY_API_TOKEN from the live deploy.
# This token should be app-specific. The app/password must be provisioned
# separately; the script does not create resources, set secrets or spend money.
if ! FLY_API_TOKEN="$FLY_HOMEFRONT_PREVIEW_API_TOKEN" flyctl status -a "$APP" >/dev/null; then
  echo >&2 "Preview app not found/access denied. Create the isolated app and set its private password first."
  exit 2
fi
echo "Deploying only $APP with the reviewed password-gated in-memory gateway"
revision="$(git rev-parse HEAD)"
FLY_API_TOKEN="$FLY_HOMEFRONT_PREVIEW_API_TOKEN" flyctl deploy \
  -a "$APP" -c "$CONFIG" --remote-only --ha=false \
  --build-arg "HOMEFRONT_PREVIEW_REVISION=$revision"
for attempt in {1..6}; do
  if curl -fsS --max-time 12 "https://$APP.fly.dev/healthz" | EXPECTED_REVISION="$revision" node -e '
    try {
      const health = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
      process.exit(health.status === "preview" && health.saves === "memory-only" &&
        health.payments === false && health.movement === "direct" &&
        health.revision === process.env.EXPECTED_REVISION ? 0 : 1);
    } catch { process.exit(1); }
  '; then
    echo "Verified direct-walking preview revision $revision at https://$APP.fly.dev/"
    exit 0
  fi
  if [[ "$attempt" != 6 ]]; then sleep 3; fi
done
echo >&2 "Could not verify the direct-walking preview revision."
exit 1
