#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UMBRELLA_ROOT="$(cd "$ROOT_DIR/../../.." && pwd)"
NEX_ROOT="$(cd "$UMBRELLA_ROOT/nex" && pwd)"
SHARED_E2E_ROOT="$UMBRELLA_ROOT/packages/adapters/scripts/e2e"

RESOLVED_JSON=""
if [[ -z "${BITBUCKET_TOKEN:-}" ]]; then
  RESOLVED_JSON="$(
    FORGE_SERVICE=bitbucket \
    FORGE_DEFAULT_HOST="${BITBUCKET_HOST:-https://api.bitbucket.org/2.0}" \
    FORGE_CREDENTIAL_ID="${BITBUCKET_CREDENTIAL_ID:-}" \
    NEX_ROOT_ENV="$NEX_ROOT" \
    NEXUS_WORKSPACE_ROOT_ENV="${NEXUS_WORKSPACE_ROOT:-$HOME/nexus}" \
    "$SHARED_E2E_ROOT/resolve-forge-credential.sh"
  )"
fi

export FORGE_ADAPTER_ID=bitbucket
export FORGE_DISPLAY_NAME="Bitbucket"
export FORGE_AUTH_METHOD_ID=bitbucket_api_key
export FORGE_HOST="${BITBUCKET_HOST:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["host"] if raw else "https://api.bitbucket.org/2.0"))')}"
export FORGE_TOKEN="${BITBUCKET_TOKEN:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["token"] if raw else ""))')}"
export FORGE_USERNAME="${BITBUCKET_USERNAME:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["username"] if raw else ""))')}"
export FORGE_SKIP_BACKFILL_WAIT="${FORGE_SKIP_BACKFILL_WAIT:-1}"
export FORGE_SETUP_TIMEOUT_MS="${FORGE_SETUP_TIMEOUT_MS:-300000}"
export FORGE_INITIAL_BACKFILL_SINCE="${BITBUCKET_BACKFILL_SINCE:-$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(minutes=5)).replace(microsecond=0).isoformat().replace('+00:00', 'Z'))
PY
)}"
export FORGE_PROOF_REPOSITORY_FULL_NAME="${BITBUCKET_PROOF_REPOSITORY_FULL_NAME:-fmcom/api}"
export FORGE_EXPECTED_METHODS='["bitbucket.repositories.list","bitbucket.repositories.get","bitbucket.workspaces.list","bitbucket.branches.list","bitbucket.commits.list","bitbucket.commits.diff.get","bitbucket.pull_requests.list","bitbucket.pull_requests.diff.get","bitbucket.pull_requests.source_archive.get","bitbucket.pull_requests.comments.list","bitbucket.branches.create","bitbucket.pull_requests.create","bitbucket.pull_requests.comments.create","bitbucket.pull_requests.merge"]'
export FORGE_PREFERRED_REPOSITORIES='["fmcom/api","api","fmcom/job-admin","job-admin","fmcom/infrastructure","infrastructure","fmcom/admin","admin"]'
export FORGE_PROOF_CALLS='[
  {
    "name": "repositories-list",
    "method": "bitbucket.repositories.list",
    "params": {
      "connection_id": "$CONNECTION_ID"
    }
  },
  {
    "name": "workspaces-list",
    "method": "bitbucket.workspaces.list",
    "params": {
      "connection_id": "$CONNECTION_ID"
    }
  },
  {
    "name": "repository-get",
    "method": "bitbucket.repositories.get",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME"
      }
    }
  },
  {
    "name": "branches-list",
    "method": "bitbucket.branches.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME"
      }
    }
  },
  {
    "name": "commits-list",
    "method": "bitbucket.commits.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME"
      }
    }
  },
  {
    "name": "commit-diff-get",
    "method": "bitbucket.commits.diff.get",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME",
        "sha": "$FIRST_COMMIT_SHA"
      }
    }
  },
  {
    "name": "pull-requests-list",
    "method": "bitbucket.pull_requests.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME",
        "states": ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
        "page_len": 10,
        "page": 1
      }
    }
  },
  {
    "name": "pull-request-diff-get",
    "method": "bitbucket.pull_requests.diff.get",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  },
  {
    "name": "pull-request-source-archive-get",
    "method": "bitbucket.pull_requests.source_archive.get",
    "timeout_ms": 300000,
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  }
]'

if [[ -z "$FORGE_TOKEN" ]]; then
  echo "Bitbucket credentials are required. Set BITBUCKET_TOKEN or BITBUCKET_CREDENTIAL_ID." >&2
  exit 1
fi

exec "$SHARED_E2E_ROOT/forge-live-cleanroom-docker.sh"
