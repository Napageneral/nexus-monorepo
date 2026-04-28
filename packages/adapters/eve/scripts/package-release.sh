#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NEX_DIR="${ROOT_DIR}/../../../nex"
NEX_CLI="${NEX_DIR}/dist/entry.js"
MANIFEST_PATH="${ROOT_DIR}/adapter.nexus.json"
COMMAND_NAME="$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(path.basename(manifest.command));' "${MANIFEST_PATH}")"
HOST_OS="$(go env GOOS)"
HOST_ARCH="$(go env GOARCH)"
TARGET_OS="${PACKAGE_TARGET_OS:-${HOST_OS}}"
TARGET_ARCH="${PACKAGE_TARGET_ARCH:-${HOST_ARCH}}"

restore_host_binary() {
  if [[ "${TARGET_OS}" == "${HOST_OS}" && "${TARGET_ARCH}" == "${HOST_ARCH}" ]]; then
    return
  fi
  (cd "${ROOT_DIR}" && GOOS="${HOST_OS}" GOARCH="${HOST_ARCH}" go build -o "./bin/${COMMAND_NAME}" "./cmd/${COMMAND_NAME}")
}
trap restore_host_binary EXIT

if [[ ! -f "${NEX_CLI}" ]]; then
  NEX_CLI="${NEX_DIR}/nexus.mjs"
fi

mkdir -p "${ROOT_DIR}/bin"
(cd "${ROOT_DIR}" && GOOS="${TARGET_OS}" GOARCH="${TARGET_ARCH}" go build -o "./bin/${COMMAND_NAME}" "./cmd/${COMMAND_NAME}")

node "${NEX_CLI}" package validate "${ROOT_DIR}"
node "${NEX_CLI}" package release "${ROOT_DIR}"
