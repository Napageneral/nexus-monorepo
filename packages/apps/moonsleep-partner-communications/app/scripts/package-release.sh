#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v nexus >/dev/null 2>&1; then
  PACKAGE_CLI=(nexus package)
else
  PACKAGE_CLI=(node "${ROOT_DIR}/../../../../nex/dist/entry.js" package)
fi

npm --prefix "${ROOT_DIR}" run build
"${PACKAGE_CLI[@]}" validate "${ROOT_DIR}"
"${PACKAGE_CLI[@]}" release "${ROOT_DIR}"
