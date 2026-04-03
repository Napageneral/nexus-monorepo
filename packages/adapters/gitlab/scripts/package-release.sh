#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NEX_CLI="${ROOT_DIR}/../../../nex/dist/entry.js"
MANIFEST_PATH="${ROOT_DIR}/adapter.nexus.json"
COMMAND_NAME="$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(path.basename(manifest.command));' "${MANIFEST_PATH}")"

if [[ -f "${ROOT_DIR}/package.json" ]]; then
  (cd "${ROOT_DIR}" && pnpm build)
elif [[ -f "${ROOT_DIR}/go.mod" ]]; then
  BUILD_TARGET="."
  if [[ -d "${ROOT_DIR}/cmd/${COMMAND_NAME}" ]]; then
    BUILD_TARGET="./cmd/${COMMAND_NAME}"
  fi
  mkdir -p "${ROOT_DIR}/bin"
  (cd "${ROOT_DIR}" && go build -o "./bin/${COMMAND_NAME}" "${BUILD_TARGET}")
fi

node "${NEX_CLI}" package validate "${ROOT_DIR}"
node "${NEX_CLI}" package release "${ROOT_DIR}"
