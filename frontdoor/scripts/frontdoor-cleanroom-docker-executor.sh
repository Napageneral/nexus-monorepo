#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") <command> [args...]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTDOOR_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKERFILE_PATH="${SCRIPT_DIR}/e2e/Dockerfile"
IMAGE_NAME="${FRONTDOOR_CLEANROOM_IMAGE:-frontdoor-cleanroom-executor:local}"
CONTAINER_NAME="${FRONTDOOR_CLEANROOM_CONTAINER_PREFIX:-frontdoor-cleanroom}-$$"
PROOF_BUNDLE_HOST_DIR="${NEXUS_CLEANROOM_PROOF_BUNDLE_DIR:-}"
FRONTDOOR_SMOKE_ORIGIN_RAW="${FRONTDOOR_SMOKE_ORIGIN:-}"
FRONTDOOR_SMOKE_API_TOKEN="${FRONTDOOR_SMOKE_API_TOKEN:-}"
FRONTDOOR_CLEANROOM_FORCE_REBUILD="${FRONTDOOR_CLEANROOM_FORCE_REBUILD:-0}"

if [[ -z "${PROOF_BUNDLE_HOST_DIR}" ]]; then
  echo "missing NEXUS_CLEANROOM_PROOF_BUNDLE_DIR" >&2
  exit 1
fi
if [[ -z "${FRONTDOOR_SMOKE_ORIGIN_RAW}" ]]; then
  echo "missing FRONTDOOR_SMOKE_ORIGIN" >&2
  exit 1
fi
if [[ -z "${FRONTDOOR_SMOKE_API_TOKEN}" ]]; then
  echo "missing FRONTDOOR_SMOKE_API_TOKEN" >&2
  exit 1
fi
if [[ ! -f "${DOCKERFILE_PATH}" ]]; then
  echo "missing Dockerfile: ${DOCKERFILE_PATH}" >&2
  exit 1
fi

rewrite_origin_for_container() {
  node -e '
const raw = (process.argv[1] || "").trim();
if (!raw) process.exit(1);
try {
  const parsed = new URL(raw);
  const host = parsed.hostname.trim().toLowerCase();
  if (host === "127.0.0.1" || host === "localhost") {
    parsed.hostname = "host.docker.internal";
  }
  process.stdout.write(parsed.toString().replace(/\/+$/g, ""));
} catch {
  process.stdout.write(raw);
}
' "$1"
}

ensure_image() {
  if [[ "${FRONTDOOR_CLEANROOM_FORCE_REBUILD}" != "1" ]] && docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
    return
  fi
  docker build -t "${IMAGE_NAME}" -f "${DOCKERFILE_PATH}" "${FRONTDOOR_DIR}"
}

add_env_if_set() {
  local key="$1"
  local value="${!key:-}"
  if [[ -n "${value}" ]]; then
    DOCKER_ARGS+=(-e "${key}=${value}")
  fi
}

mkdir -p "${PROOF_BUNDLE_HOST_DIR}"
FRONTDOOR_SMOKE_ORIGIN="$(rewrite_origin_for_container "${FRONTDOOR_SMOKE_ORIGIN_RAW}")"
ensure_image

DOCKER_ARGS=(
  run
  --rm
  --name "${CONTAINER_NAME}"
  --add-host "host.docker.internal:host-gateway"
  -w /app
  -v "${PROOF_BUNDLE_HOST_DIR}:/proof-bundle"
  -e "NEXUS_CLEANROOM_PROOF_BUNDLE_DIR=/proof-bundle"
  -e "FRONTDOOR_SMOKE_ORIGIN=${FRONTDOOR_SMOKE_ORIGIN}"
  -e "FRONTDOOR_SMOKE_API_TOKEN=${FRONTDOOR_SMOKE_API_TOKEN}"
)

for key in \
  FRONTDOOR_SMOKE_PLAN \
  FRONTDOOR_SMOKE_SERVER_CLASS \
  FRONTDOOR_SMOKE_DISPLAY_NAME \
  FRONTDOOR_SMOKE_CLEANUP_MODE \
  FRONTDOOR_SMOKE_PROVISION_TIMEOUT_MS \
  FRONTDOOR_SMOKE_PROVISION_POLL_MS \
  FRONTDOOR_SMOKE_APPS \
  FRONTDOOR_SMOKE_APP_PROOF_COMMAND \
  FRONTDOOR_SMOKE_ADAPTERS \
  FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND \
  FRONTDOOR_SMOKE_KIND \
  FRONTDOOR_SMOKE_APP_ID \
  FRONTDOOR_SMOKE_ADAPTER_ID \
  FRONTDOOR_SMOKE_PURCHASE \
  FRONTDOOR_SMOKE_UNINSTALL \
  FRONTDOOR_SMOKE_TARGET_VERSION \
  FRONTDOOR_SMOKE_INSTALL_VERSION \
  FRONTDOOR_SMOKE_SLACK_AUTH_METHOD_ID \
  JIRA_SITE \
  JIRA_EMAIL \
  JIRA_API_TOKEN \
  JIRA_PROJECT_KEY \
  SLACK_BOT_TOKEN \
  SLACK_APP_TOKEN \
  SLACK_CHANNEL_ID \
  SLACK_THREAD_TS \
  SLACK_PROOF_MESSAGE
do
  add_env_if_set "${key}"
done

exec docker "${DOCKER_ARGS[@]}" "${IMAGE_NAME}" "$@"
