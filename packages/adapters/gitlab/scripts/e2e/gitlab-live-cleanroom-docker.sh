#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UMBRELLA_ROOT="$(cd "$ROOT_DIR/../../.." && pwd)"
NEX_ROOT="$(cd "$UMBRELLA_ROOT/nex" && pwd)"
SHARED_E2E_ROOT="$UMBRELLA_ROOT/packages/adapters/scripts/e2e"

RESOLVED_JSON=""
if [[ -z "${GITLAB_TOKEN:-}" ]]; then
  RESOLVED_JSON="$(
    FORGE_SERVICE=gitlab \
    FORGE_DEFAULT_HOST="${GITLAB_HOST:-https://gitlab.com/api/v4}" \
    FORGE_CREDENTIAL_ID="${GITLAB_CREDENTIAL_ID:-}" \
    NEX_ROOT_ENV="$NEX_ROOT" \
    NEXUS_WORKSPACE_ROOT_ENV="${NEXUS_WORKSPACE_ROOT:-$HOME/nexus}" \
    "$SHARED_E2E_ROOT/resolve-forge-credential.sh"
  )"
fi

export FORGE_ADAPTER_ID=gitlab
export FORGE_DISPLAY_NAME="GitLab"
export FORGE_AUTH_METHOD_ID=gitlab_api_key
export FORGE_HOST="${GITLAB_HOST:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["host"] if raw else "https://gitlab.com/api/v4"))')}"
export FORGE_TOKEN="${GITLAB_TOKEN:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["token"] if raw else ""))')}"
export FORGE_USERNAME="${GITLAB_USERNAME:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["username"] if raw else ""))')}"
export FORGE_EXPECTED_METHODS='["gitlab.branches.create","gitlab.pull_requests.create","gitlab.pull_requests.comments.create","gitlab.pull_requests.merge"]'

if [[ -z "$FORGE_TOKEN" ]]; then
  echo "GitLab credentials are required. Set GITLAB_TOKEN or GITLAB_CREDENTIAL_ID." >&2
  exit 1
fi

exec "$SHARED_E2E_ROOT/forge-live-cleanroom-docker.sh"
