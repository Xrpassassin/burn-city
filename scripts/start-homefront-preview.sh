#!/usr/bin/env bash
# Run the isolated gateway behind an HTTPS forwarding service.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

if [[ ! -d node_modules ]]; then
  echo >&2 'Run npm ci --ignore-scripts before starting the preview.'
  exit 2
fi
if [[ -z "${HOMEFRONT_PREVIEW_PASSWORD:-}" ]]; then
  read -rsp 'Preview password (at least 20 characters): ' HOMEFRONT_PREVIEW_PASSWORD
  printf '\n' >&2
fi
export HOMEFRONT_PREVIEW_PASSWORD
export PORT=8080 HOMEFRONT_PREVIEW_MODE=1 HOMEFRONT_CONTINUOUS_MOVEMENT=0
export DRY_RUN=true BURN_JOB_IN_SERVER=false
exec node scripts/homefront-preview-gateway.cjs
