#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
ROOT_DIR="$(cd "${ROOT_DIR}" && pwd)"
MANIFEST_PATH="${ROOT_DIR}/adapter.nexus.json"

if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "missing adapter manifest: ${MANIFEST_PATH}" >&2
  exit 1
fi

PACKAGE_ID="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(manifest.id);' "${MANIFEST_PATH}")"
VERSION="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(manifest.version);' "${MANIFEST_PATH}")"
COMMAND_PATH="$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(manifest.command || "");' "${MANIFEST_PATH}")"

if [[ -z "${COMMAND_PATH}" ]]; then
  echo "adapter manifest is missing command" >&2
  exit 1
fi

BIN_NAME="$(basename "${COMMAND_PATH}")"
BUILD_TARGET="${ADAPTER_BUILD_TARGET:-./cmd/${BIN_NAME}}"
DIST_DIR="${ROOT_DIR}/dist"
STAGE_DIR="$(mktemp -d)"
ARCHIVE_PATH="${DIST_DIR}/${PACKAGE_ID}-${VERSION}.tar.gz"
trap 'rm -rf "${STAGE_DIR}"' EXIT

mkdir -p "${ROOT_DIR}/bin"
mkdir -p "${DIST_DIR}"

(
  cd "${ROOT_DIR}"
  go build -o "./bin/${BIN_NAME}" "${BUILD_TARGET}"
)

cp "${MANIFEST_PATH}" "${STAGE_DIR}/adapter.nexus.json"
mkdir -p "${STAGE_DIR}/bin"
cp "${ROOT_DIR}/bin/${BIN_NAME}" "${STAGE_DIR}/bin/${BIN_NAME}"

tar -czf "${ARCHIVE_PATH}" -C "${STAGE_DIR}" adapter.nexus.json bin

printf '%s\n' "${ARCHIVE_PATH}"
