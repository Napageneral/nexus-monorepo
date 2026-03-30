#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PACKAGES_DIR}/.." && pwd)"
CAPTURE_SCRIPT="${REPO_ROOT}/nex/scripts/e2e/capture-cleanroom-proof.sh"
SMOKE_SCRIPT="${SCRIPT_DIR}/hosted-cleanroom-package-smoke.py"

usage() {
  cat <<'EOF'
Usage:
  capture-hosted-cleanroom-package-smoke.sh <proof-id> --package-root <package-root> [hosted smoke args...]
EOF
}

if [[ $# -lt 3 ]]; then
  usage >&2
  exit 1
fi

PROOF_ID="$1"
shift

if [[ ! -x "${CAPTURE_SCRIPT}" ]]; then
  echo "missing capture script: ${CAPTURE_SCRIPT}" >&2
  exit 1
fi

exec "${CAPTURE_SCRIPT}" "${PROOF_ID}" python3 "${SMOKE_SCRIPT}" "$@"
