#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:/Users/tyler/.local/bin:${PATH}"
STACK_ROOT="${ROOT_DIR}/.demo-stack"
STATE_DIR="${STACK_ROOT}/tenant-dev-state"
RUNTIME_PORT="${RUNTIME_PORT:-28789}"
FRONTDOOR_PORT="${FRONTDOOR_PORT:-24789}"
TRUSTED_SECRET="${TRUSTED_SECRET:-frontdoor-demo-shared-secret-2026-02-23}"
TRUSTED_ISSUER="${TRUSTED_ISSUER:-https://frontdoor.demo.nexus}"
TRUSTED_AUDIENCE="${TRUSTED_AUDIENCE:-control-plane}"
TENANT_ID="${TENANT_ID:-tenant-dev}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-https://nexus-frontdoor-web.vercel.app}"
FRONTDOOR_PUBLIC_ORIGIN="${FRONTDOOR_PUBLIC_ORIGIN:-}"
FRONTDOOR_GOOGLE_CLIENT_ID="${FRONTDOOR_GOOGLE_CLIENT_ID:-}"
FRONTDOOR_GOOGLE_CLIENT_SECRET="${FRONTDOOR_GOOGLE_CLIENT_SECRET:-}"
AUTOPROVISION_ENABLED="${FRONTDOOR_AUTOPROVISION_ENABLED:-}"
if [[ -z "${AUTOPROVISION_ENABLED}" ]]; then
  if [[ -n "${FRONTDOOR_GOOGLE_CLIENT_ID}" ]] && [[ -n "${FRONTDOOR_PUBLIC_ORIGIN}" ]]; then
    AUTOPROVISION_ENABLED="true"
  else
    AUTOPROVISION_ENABLED="false"
  fi
fi
OIDC_ENABLED="false"
if [[ "${AUTOPROVISION_ENABLED}" == "true" ]] && [[ -n "${FRONTDOOR_GOOGLE_CLIENT_ID}" ]] && [[ -n "${FRONTDOOR_PUBLIC_ORIGIN}" ]]; then
  OIDC_ENABLED="true"
fi
CONTROL_UI_ROOT="${CONTROL_UI_ROOT:-/Users/tyler/nexus/home/projects/nexus/nex/dist/control-ui}"
PASSWORD_HASH='scrypt-sha256-v1$Q2Pk_UGb_MWMHj_iNKt5mw$9LMyZ85W_i5G5yK-q22uow7_jL3ule5gyrXxlXE3C0g'

mkdir -p "${STACK_ROOT}" "${STATE_DIR}"

cleanup() {
  local code="$?"
  for pid_file in runtime.pid frontdoor.pid runtime-tunnel.pid frontdoor-tunnel.pid; do
    local full="${STACK_ROOT}/${pid_file}"
    if [[ -f "${full}" ]]; then
      local pid
      pid="$(cat "${full}" || true)"
      if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
        kill "${pid}" 2>/dev/null || true
      fi
    fi
  done
  wait || true
  exit "${code}"
}
trap cleanup EXIT INT TERM

kill_port_listener() {
  local port="$1"
  if lsof -ti "tcp:${port}" >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" | xargs -r kill -9 || true
  fi
}

wait_for_port() {
  local port="$1"
  local tries="${2:-60}"
  for _ in $(seq 1 "${tries}"); do
    if nc -z 127.0.0.1 "${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_tunnel_url() {
  local log_file="$1"
  local tries="${2:-120}"
  local url=""
  for _ in $(seq 1 "${tries}"); do
    url="$(rg -o 'https://[-a-z0-9]+\.trycloudflare\.com' "${log_file}" --no-filename 2>/dev/null | tail -n 1 || true)"
    if [[ -n "${url}" ]]; then
      printf "%s\n" "${url}"
      return 0
    fi
    sleep 1
  done
  return 1
}

start_tunnel_with_retry() {
  local local_url="$1"
  local log_file="$2"
  local pid_file="$3"
  local attempts="${4:-5}"
  local url=""

  for _ in $(seq 1 "${attempts}"); do
    rm -f "${log_file}"
    cloudflared tunnel --url "${local_url}" --no-autoupdate > "${log_file}" 2>&1 &
    echo "$!" > "${pid_file}"

    url="$(wait_for_tunnel_url "${log_file}" 120 || true)"
    if [[ -n "${url}" ]]; then
      printf "%s\n" "${url}"
      return 0
    fi

    if [[ -f "${pid_file}" ]]; then
      local pid
      pid="$(cat "${pid_file}" || true)"
      if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
        kill "${pid}" 2>/dev/null || true
        sleep 1
        kill -9 "${pid}" 2>/dev/null || true
      fi
    fi
  done
  return 1
}

for pid_file in runtime.pid frontdoor.pid runtime-tunnel.pid frontdoor-tunnel.pid; do
  full="${STACK_ROOT}/${pid_file}"
  if [[ -f "${full}" ]]; then
    pid="$(cat "${full}" || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${pid}" 2>/dev/null || true
    fi
    rm -f "${full}"
  fi
done

kill_port_listener "${RUNTIME_PORT}"
kill_port_listener "$((RUNTIME_PORT + 1))"
kill_port_listener "${FRONTDOOR_PORT}"
pkill -f "cloudflared tunnel --url http://127.0.0.1:${RUNTIME_PORT}" || true
pkill -f "cloudflared tunnel --url http://127.0.0.1:${FRONTDOOR_PORT}" || true

cat > "${STATE_DIR}/config.json" <<JSON
{
  "runtime": {
    "hostedMode": true,
    "tenantId": "${TENANT_ID}",
    "bind": "loopback",
    "auth": {
      "mode": "trusted_token",
      "allowTailscale": false,
      "trustedToken": {
        "issuer": "${TRUSTED_ISSUER}",
        "audience": "${TRUSTED_AUDIENCE}",
        "hmacSecret": "${TRUSTED_SECRET}",
        "requireJti": true,
        "clockSkewSeconds": 60
      }
    },
    "controlUi": {
      "allowedOrigins": ["${ALLOWED_ORIGIN}"]
    }
  }
}
JSON

env -u NODE_OPTIONS \
  NEXUS_STATE_DIR="${STATE_DIR}" \
  NEXUS_CONFIG_PATH="${STATE_DIR}/config.json" \
  NEXUS_DISABLE_NEX_ADAPTERS=1 \
  nexus runtime run --port "${RUNTIME_PORT}" --bind loopback --auth trusted_token --force \
  > "${STACK_ROOT}/runtime.log" 2>&1 &
echo "$!" > "${STACK_ROOT}/runtime.pid"

if ! wait_for_port "${RUNTIME_PORT}" 90; then
  echo "[demo-stack] runtime did not start"
  tail -n 120 "${STACK_ROOT}/runtime.log" || true
  exit 1
fi

RUNTIME_TUNNEL_URL="$(
  start_tunnel_with_retry \
    "http://127.0.0.1:${RUNTIME_PORT}" \
    "${STACK_ROOT}/runtime-tunnel.log" \
    "${STACK_ROOT}/runtime-tunnel.pid" \
    5 || true
)"
if [[ -z "${RUNTIME_TUNNEL_URL}" ]]; then
  echo "[demo-stack] runtime tunnel URL not found"
  tail -n 120 "${STACK_ROOT}/runtime-tunnel.log" || true
  exit 1
fi

cat > "${STACK_ROOT}/frontdoor.config.json" <<JSON
{
  "host": "127.0.0.1",
  "port": ${FRONTDOOR_PORT},
  "baseUrl": "http://127.0.0.1:${FRONTDOOR_PORT}",
  "session": {
    "cookieName": "nexus_fd_session",
    "ttlSeconds": 604800,
    "storePath": "${STACK_ROOT}/frontdoor-sessions.db"
  },
  "runtimeToken": {
    "issuer": "${TRUSTED_ISSUER}",
    "audience": "${TRUSTED_AUDIENCE}",
    "secret": "${TRUSTED_SECRET}",
    "activeKid": "v1",
    "keys": {
      "v1": "${TRUSTED_SECRET}"
    },
    "ttlSeconds": 600,
    "refreshTtlSeconds": 2592000
  },
  "security": {
    "rateLimits": {
      "loginAttempts": { "windowSeconds": 60, "maxAttempts": 30, "blockSeconds": 60 },
      "loginFailures": { "windowSeconds": 900, "maxAttempts": 8, "blockSeconds": 900 },
      "tokenEndpoints": { "windowSeconds": 60, "maxAttempts": 120, "blockSeconds": 60 },
      "proxyRequests": { "windowSeconds": 60, "maxAttempts": 1000, "blockSeconds": 30 }
    }
  },
  "tenants": {
    "${TENANT_ID}": {
      "runtimeUrl": "http://127.0.0.1:${RUNTIME_PORT}",
      "runtimePublicBaseUrl": "${RUNTIME_TUNNEL_URL}"
    }
  },
  "users": [
    {
      "id": "user-owner",
      "username": "owner",
      "passwordHash": "${PASSWORD_HASH}",
      "tenantId": "${TENANT_ID}",
      "entityId": "entity-owner",
      "displayName": "Owner",
      "email": "owner@example.com",
      "roles": ["operator"],
      "scopes": ["operator.admin"]
    }
  ],
  "oidc": {
    "enabled": ${OIDC_ENABLED},
    "providers": {
      "google": {
        "clientId": "${FRONTDOOR_GOOGLE_CLIENT_ID:-change-me}",
        "clientSecret": "${FRONTDOOR_GOOGLE_CLIENT_SECRET:-}",
        "issuer": "https://accounts.google.com",
        "jwksUrl": "https://www.googleapis.com/oauth2/v3/certs",
        "authorizeUrl": "https://accounts.google.com/o/oauth2/v2/auth",
        "tokenUrl": "https://oauth2.googleapis.com/token",
        "userInfoUrl": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid profile email",
        "redirectUri": "${FRONTDOOR_PUBLIC_ORIGIN:-http://127.0.0.1:${FRONTDOOR_PORT}}/api/auth/oidc/callback/google"
      }
    },
    "mappings": []
  },
  "autoProvision": {
    "enabled": ${AUTOPROVISION_ENABLED},
    "storePath": "${STACK_ROOT}/frontdoor-autoprovision.db",
    "providers": ["google"],
    "tenantIdPrefix": "tenant",
    "defaultRoles": ["operator"],
    "defaultScopes": ["operator.admin"],
    "command": "node ${ROOT_DIR}/scripts/provision-tenant-local.mjs",
    "commandTimeoutMs": 120000
  }
}
JSON

(
  cd "${ROOT_DIR}" && \
    env -u NODE_OPTIONS \
      FRONTDOOR_CONFIG_PATH="${STACK_ROOT}/frontdoor.config.json" \
      FRONTDOOR_HOST=127.0.0.1 \
      FRONTDOOR_PORT="${FRONTDOOR_PORT}" \
      FRONTDOOR_BASE_URL="http://127.0.0.1:${FRONTDOOR_PORT}" \
      FRONTDOOR_OIDC_ENABLED="${OIDC_ENABLED}" \
      FRONTDOOR_AUTOPROVISION_ENABLED="${AUTOPROVISION_ENABLED}" \
      FRONTDOOR_TENANT_CONTROL_UI_ROOT="${CONTROL_UI_ROOT}" \
      FRONTDOOR_TENANT_REQUIRE_CONTROL_UI=1 \
      FRONTDOOR_TENANT_BUILD_UI_IF_MISSING=1 \
      FRONTDOOR_TENANT_CONTROL_UI_ALLOWED_ORIGINS="${FRONTDOOR_PUBLIC_ORIGIN:-${ALLOWED_ORIGIN}}" \
      pnpm -s exec tsx src/index.ts \
      > "${STACK_ROOT}/frontdoor.log" 2>&1
) &
echo "$!" > "${STACK_ROOT}/frontdoor.pid"

if ! wait_for_port "${FRONTDOOR_PORT}" 90; then
  echo "[demo-stack] frontdoor did not start"
  tail -n 120 "${STACK_ROOT}/frontdoor.log" || true
  exit 1
fi

FRONTDOOR_TUNNEL_URL="$(
  start_tunnel_with_retry \
    "http://127.0.0.1:${FRONTDOOR_PORT}" \
    "${STACK_ROOT}/frontdoor-tunnel.log" \
    "${STACK_ROOT}/frontdoor-tunnel.pid" \
    8 || true
)"
if [[ -z "${FRONTDOOR_TUNNEL_URL}" ]]; then
  echo "[demo-stack] frontdoor tunnel URL not found"
  tail -n 120 "${STACK_ROOT}/frontdoor-tunnel.log" || true
  exit 1
fi

cat > "${STACK_ROOT}/stack.env" <<ENV
STACK_ROOT=${STACK_ROOT}
STATE_DIR=${STATE_DIR}
RUNTIME_PORT=${RUNTIME_PORT}
FRONTDOOR_PORT=${FRONTDOOR_PORT}
TENANT_ID=${TENANT_ID}
TRUSTED_ISSUER=${TRUSTED_ISSUER}
TRUSTED_AUDIENCE=${TRUSTED_AUDIENCE}
RUNTIME_TUNNEL_URL=${RUNTIME_TUNNEL_URL}
FRONTDOOR_TUNNEL_URL=${FRONTDOOR_TUNNEL_URL}
ALLOWED_ORIGIN=${ALLOWED_ORIGIN}
FRONTDOOR_PUBLIC_ORIGIN=${FRONTDOOR_PUBLIC_ORIGIN}
AUTOPROVISION_ENABLED=${AUTOPROVISION_ENABLED}
OIDC_ENABLED=${OIDC_ENABLED}
ENV

echo "[demo-stack] ready"
echo "[demo-stack] runtime:   ${RUNTIME_TUNNEL_URL}"
echo "[demo-stack] frontdoor: ${FRONTDOOR_TUNNEL_URL}"

while true; do
  for pid_file in runtime.pid frontdoor.pid; do
    pid="$(cat "${STACK_ROOT}/${pid_file}" || true)"
    if [[ -z "${pid}" ]] || ! kill -0 "${pid}" 2>/dev/null; then
      echo "[demo-stack] process died: ${pid_file}"
      exit 1
    fi
  done
  sleep 5
done
