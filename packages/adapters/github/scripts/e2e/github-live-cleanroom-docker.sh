#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UMBRELLA_ROOT="$(cd "$ROOT_DIR/../../.." && pwd)"
NEX_ROOT="$(cd "$UMBRELLA_ROOT/nex" && pwd)"
SHARED_E2E_ROOT="$UMBRELLA_ROOT/packages/adapters/scripts/e2e"

RESOLVED_JSON=""
GH_TOKEN_RESOLVED=""
GH_USERNAME_RESOLVED=""
if [[ -z "${GITHUB_TOKEN:-}" && -z "${GITHUB_CREDENTIAL_ID:-}" ]] && command -v gh >/dev/null 2>&1; then
  GH_AUTH_STATUS_RAW="$(gh auth status 2>/dev/null || true)"
  if [[ -n "$GH_AUTH_STATUS_RAW" ]]; then
    GH_TOKEN_RESOLVED="$(gh auth token 2>/dev/null || true)"
    if GH_USERNAME_CANDIDATE="$(gh api user --jq '.login' 2>/dev/null)"; then
      GH_USERNAME_RESOLVED="$GH_USERNAME_CANDIDATE"
    fi
    if [[ -z "$GH_USERNAME_RESOLVED" ]]; then
      GH_USERNAME_RESOLVED="$(
        printf '%s\n' "$GH_AUTH_STATUS_RAW" | sed -n 's/^  ✓ Logged in to github.com account \([^[:space:]]*\) (.*/\1/p' | head -n 1
      )"
    fi
  fi
fi
if [[ -z "${GITHUB_TOKEN:-}" && -z "$GH_TOKEN_RESOLVED" ]]; then
  RESOLVED_JSON="$(
    FORGE_SERVICE=github \
    FORGE_DEFAULT_HOST="${GITHUB_HOST:-https://api.github.com}" \
    FORGE_CREDENTIAL_ID="${GITHUB_CREDENTIAL_ID:-}" \
    NEX_ROOT_ENV="$NEX_ROOT" \
    NEXUS_WORKSPACE_ROOT_ENV="${NEXUS_WORKSPACE_ROOT:-$HOME/nexus}" \
    "$SHARED_E2E_ROOT/resolve-forge-credential.sh"
  )"
fi

export FORGE_ADAPTER_ID=github
export FORGE_DISPLAY_NAME="GitHub"
export FORGE_AUTH_METHOD_ID=github_api_key
export FORGE_HOST="${GITHUB_HOST:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["host"] if raw else "https://api.github.com"))')}"
export FORGE_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN_RESOLVED:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["token"] if raw else ""))')}}"
export FORGE_USERNAME="${GITHUB_USERNAME:-${GH_USERNAME_RESOLVED:-$(printf '%s' "$RESOLVED_JSON" | python3 -c 'import json,sys; raw=sys.stdin.read().strip(); print((json.loads(raw)["username"] if raw else ""))')}}"
export FORGE_SKIP_BACKFILL_WAIT="${FORGE_SKIP_BACKFILL_WAIT:-0}"
export FORGE_ENABLE_INGEST_PROOF="${FORGE_ENABLE_INGEST_PROOF:-1}"
export FORGE_SETUP_TIMEOUT_MS="${FORGE_SETUP_TIMEOUT_MS:-300000}"
export FORGE_RUNTIME_CALL_TIMEOUT_MS="${FORGE_RUNTIME_CALL_TIMEOUT_MS:-300000}"
export FORGE_SETUP_REPOSITORY_SELECTION="${GITHUB_SETUP_REPOSITORY_SELECTION:-all}"
if [[ -z "${FORGE_BACKFILL_WAIT_TIMEOUT_MS:-}" && "${FORGE_SETUP_REPOSITORY_SELECTION}" == "all" ]]; then
  export FORGE_BACKFILL_WAIT_TIMEOUT_MS=1800000
fi
export FORGE_PROOF_REPOSITORY_FULL_NAME="${GITHUB_PROOF_REPOSITORY_FULL_NAME:-napageneral/intent}"
export FORGE_PROOF_PULL_REQUEST_REPOSITORY_FULL_NAME="${GITHUB_PROOF_PULL_REQUEST_REPOSITORY_FULL_NAME:-Napageneral/intent}"
export FORGE_INITIAL_BACKFILL_SINCE="${GITHUB_INITIAL_BACKFILL_SINCE:-2026-01-01T00:00:00Z}"
export FORGE_MONITOR_PROOF_REPOSITORY_FULL_NAME="${GITHUB_MONITOR_PROOF_REPOSITORY_FULL_NAME:-Napageneral/intent}"
export FORGE_MONITOR_PROOF_PULL_REQUEST_ID="${GITHUB_MONITOR_PROOF_PULL_REQUEST_ID:-7}"
export FORGE_MONITOR_PROOF_TIMEOUT_MS="${GITHUB_MONITOR_PROOF_TIMEOUT_MS:-180000}"
export FORGE_MONITOR_PROOF_POLL_MS="${GITHUB_MONITOR_PROOF_POLL_MS:-5000}"
export FORGE_MONITOR_PROOF_COMMENT_BODY_PREFIX="${GITHUB_MONITOR_PROOF_COMMENT_BODY_PREFIX:-Nex cleanroom monitor proof}"
if [[ -n "${GITHUB_WORKSPACE:-}" ]]; then
  export FORGE_SETUP_WORKSPACE="$GITHUB_WORKSPACE"
elif [[ -n "${FORGE_PROOF_REPOSITORY_FULL_NAME:-}" && "$FORGE_PROOF_REPOSITORY_FULL_NAME" == */* ]]; then
  export FORGE_SETUP_WORKSPACE="${FORGE_PROOF_REPOSITORY_FULL_NAME%%/*}"
fi
export FORGE_EXPECTED_METHODS='["github.users.me.get","github.repositories.list","github.repositories.get","github.branches.list","github.commits.list","github.commits.diff.get","github.pull_requests.list","github.pull_requests.get","github.pull_requests.diff.get","github.pull_requests.files.list","github.pull_requests.reviews.list","github.pull_requests.commits.list","github.pull_requests.source_archive.get","github.pull_requests.comments.list","github.branches.create","github.pull_requests.create","github.pull_requests.comments.create","github.pull_requests.merge"]'
export FORGE_PROOF_CALLS='[
  {
    "name": "user-me-get",
    "method": "github.users.me.get",
    "params": {
      "connection_id": "$CONNECTION_ID"
    }
  },
  {
    "name": "repositories-list",
    "method": "github.repositories.list",
    "params": {
      "connection_id": "$CONNECTION_ID"
    }
  },
  {
    "name": "repository-get",
    "method": "github.repositories.get",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME"
      }
    }
  },
  {
    "name": "branches-list",
    "method": "github.branches.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME"
      }
    }
  },
  {
    "name": "commits-list",
    "method": "github.commits.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_REPO_FULL_NAME"
      }
    }
  },
  {
    "name": "commit-diff-get",
    "method": "github.commits.diff.get",
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
    "method": "github.pull_requests.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME"
      }
    }
  },
  {
    "name": "pull-request-get",
    "method": "github.pull_requests.get",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  },
  {
    "name": "pull-request-diff-get",
    "method": "github.pull_requests.diff.get",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  },
  {
    "name": "pull-request-files-list",
    "method": "github.pull_requests.files.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  },
  {
    "name": "pull-request-reviews-list",
    "method": "github.pull_requests.reviews.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  },
  {
    "name": "pull-request-commits-list",
    "method": "github.pull_requests.commits.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  },
  {
    "name": "pull-request-source-archive-get",
    "method": "github.pull_requests.source_archive.get",
    "timeout_ms": 300000,
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  },
  {
    "name": "pull-request-comments-list",
    "method": "github.pull_requests.comments.list",
    "params": {
      "connection_id": "$CONNECTION_ID",
      "payload": {
        "repository": "$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME",
        "pull_request_id": "$FIRST_PULL_REQUEST_ID"
      }
    }
  }
]'

if [[ -z "$FORGE_TOKEN" ]]; then
  echo "GitHub credentials are required. Set GITHUB_TOKEN or GITHUB_CREDENTIAL_ID." >&2
  exit 1
fi

exec "$SHARED_E2E_ROOT/forge-live-cleanroom-docker.sh"
