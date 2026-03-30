#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTDOOR_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${FRONTDOOR_DIR}/.." && pwd)"
CAPTURE_SCRIPT="${REPO_ROOT}/nex/scripts/e2e/capture-cleanroom-proof.sh"
SMOKE_SCRIPT="${SCRIPT_DIR}/frontdoor-fresh-server-one-server-multi-app-smoke.mjs"
DOCKER_EXECUTOR="${SCRIPT_DIR}/frontdoor-cleanroom-docker-executor.sh"

PROOF_ID="${1:-frontdoor-fresh-server-multi-app}"

if [[ ! -x "${CAPTURE_SCRIPT}" ]]; then
  echo "missing capture script: ${CAPTURE_SCRIPT}" >&2
  exit 1
fi

if [[ ! -x "${DOCKER_EXECUTOR}" ]]; then
  echo "missing Docker executor: ${DOCKER_EXECUTOR}" >&2
  exit 1
fi

exec "${CAPTURE_SCRIPT}" "${PROOF_ID}" bash "${DOCKER_EXECUTOR}" node "./scripts/$(basename "${SMOKE_SCRIPT}")"
