#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"

case "${OS_NAME}/${ARCH_NAME}" in
  Darwin/arm64)
    TARGET="darwin-arm64"
    ;;
  Linux/aarch64|Linux/arm64)
    TARGET="linux-arm64"
    ;;
  Linux/x86_64|Linux/amd64)
    TARGET="linux-amd64"
    ;;
  *)
    echo "unsupported Plaid adapter runtime target: ${OS_NAME}/${ARCH_NAME}" >&2
    exit 64
    ;;
esac

exec "${ROOT_DIR}/bin/plaid-adapter-${TARGET}" "$@"
