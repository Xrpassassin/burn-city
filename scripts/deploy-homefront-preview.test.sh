#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/checkout"
cp scripts/deploy-homefront-preview.sh fly.homefront-preview.toml Dockerfile.homefront-preview "$tmp/checkout"
cd "$tmp/checkout"
git init -q -b preview/homefront-direct-walking
git add .
git -c user.name=Preview -c user.email=preview@example.invalid commit -qm fixture
export MOCK_LOG="$tmp/fly.log" MOCK_REVISION="$(git rev-parse HEAD)"
export PATH="$tmp/bin:$PATH" FLY_HOMEFRONT_PREVIEW_API_TOKEN=mock-preview-only
cat > "$tmp/bin/flyctl" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "$FLY_API_TOKEN" == mock-preview-only ]]
printf '%s\n' "$*" >>"$MOCK_LOG"
case "$1" in
  status) [[ "$*" == "status -a burn-city-homefront-preview-551" ]] ;;
  deploy) [[ "$*" == "deploy -a burn-city-homefront-preview-551 -c fly.homefront-preview.toml --remote-only --ha=false --build-arg HOMEFRONT_PREVIEW_REVISION=$MOCK_REVISION" ]] ;;
  *) exit 1 ;;
esac
MOCK
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "${*: -1}" == "https://burn-city-homefront-preview-551.fly.dev/healthz" ]]
printf '{"status":"preview","saves":"memory-only","payments":false,"movement":"direct","revision":"%s"}\n' "${MOCK_HEALTH_REVISION:-$MOCK_REVISION}"
MOCK
printf '#!/usr/bin/env bash\nexit 0\n' >"$tmp/bin/sleep"
chmod +x "$tmp/bin/"*
bash deploy-homefront-preview.sh
[[ "$(wc -l <"$MOCK_LOG")" -eq 2 ]]

if MOCK_HEALTH_REVISION=stale bash deploy-homefront-preview.sh >"$tmp/stale.log" 2>&1; then
  echo >&2 "Deployment incorrectly accepted a stale revision"
  exit 1
fi
grep -q 'Could not verify' "$tmp/stale.log"

: >"$MOCK_LOG"
if env -u FLY_HOMEFRONT_PREVIEW_API_TOKEN bash deploy-homefront-preview.sh >"$tmp/missing.log" 2>&1; then
  exit 1
fi
grep -q 'Missing dedicated' "$tmp/missing.log"
[[ ! -s "$MOCK_LOG" ]]

sed -i 's/burn-city-homefront-preview-551/burn-city-game/' fly.homefront-preview.toml
git add fly.homefront-preview.toml
git -c user.name=Preview -c user.email=preview@example.invalid commit -qm wrong-target
if bash deploy-homefront-preview.sh >"$tmp/production.log" 2>&1; then
  exit 1
fi
grep -q 'Refusing to deploy to the production app' "$tmp/production.log"
[[ ! -s "$MOCK_LOG" ]]
echo 'Preview deploy checks passed: correct app and revision, stale image rejected, credentials required, production blocked.'
