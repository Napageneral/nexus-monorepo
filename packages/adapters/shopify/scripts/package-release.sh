#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="${ROOT_DIR}/adapter.nexus.json"
COMMAND_NAME="$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(path.basename(manifest.command));' "${MANIFEST_PATH}")"
PACKAGE_TARGET_OS="${PACKAGE_TARGET_OS:-linux}"
PACKAGE_TARGET_ARCH="${PACKAGE_TARGET_ARCH:-amd64}"
HOST_OS="$(go env GOHOSTOS)"
HOST_ARCH="$(go env GOHOSTARCH)"

if [[ "${HOST_OS}/${HOST_ARCH}" != "${PACKAGE_TARGET_OS}/${PACKAGE_TARGET_ARCH}" ]]; then
  printf '%s\n' \
    "package release target ${PACKAGE_TARGET_OS}/${PACKAGE_TARGET_ARCH} must run on a matching host; current host is ${HOST_OS}/${HOST_ARCH}" \
    >&2
  exit 2
fi

if [[ -n "${PACKAGE_NEXUS_ENTRY:-}" ]]; then
  [[ "${PACKAGE_NEXUS_ENTRY}" = /* && -f "${PACKAGE_NEXUS_ENTRY}" ]] || {
    echo "PACKAGE_NEXUS_ENTRY must name an existing absolute file" >&2
    exit 2
  }
  PACKAGE_CLI=(node "${PACKAGE_NEXUS_ENTRY}" package)
elif command -v nexus >/dev/null 2>&1; then
  PACKAGE_CLI=(nexus package)
else
  PACKAGE_CLI=(node "${ROOT_DIR}/../../../nex/dist/entry.js" package)
fi

if [[ -f "${ROOT_DIR}/go.mod" ]]; then
  if [[ -f "${ROOT_DIR}/scripts/materialize-graphql-catalog.mjs" ]]; then
    node "${ROOT_DIR}/scripts/materialize-graphql-catalog.mjs"
  fi
  BUILD_TARGET="."
  if [[ -d "${ROOT_DIR}/cmd/${COMMAND_NAME}" ]]; then
    BUILD_TARGET="./cmd/${COMMAND_NAME}"
  fi
  mkdir -p "${ROOT_DIR}/bin"
  (cd "${ROOT_DIR}" && CGO_ENABLED=0 GOOS="${PACKAGE_TARGET_OS}" GOARCH="${PACKAGE_TARGET_ARCH}" go build -o "./bin/${COMMAND_NAME}" "${BUILD_TARGET}")
fi

"${PACKAGE_CLI[@]}" validate "${ROOT_DIR}"
"${PACKAGE_CLI[@]}" release "${ROOT_DIR}"
