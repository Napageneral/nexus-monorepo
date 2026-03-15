#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NEX_CLI="${ROOT_DIR}/../../../nex/dist/entry.js"

(cd "${ROOT_DIR}" && pnpm build)
chmod +x "${ROOT_DIR}/dist/index.js"

node "${NEX_CLI}" package validate "${ROOT_DIR}"
node "${NEX_CLI}" package release "${ROOT_DIR}"
