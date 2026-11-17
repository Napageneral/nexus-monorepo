#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="${ROOT_DIR}/adapter.nexus.json"
PACKAGE_ID="$(node -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(m.id);' "${MANIFEST_PATH}")"
PACKAGE_VERSION="$(node -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(m.version);' "${MANIFEST_PATH}")"
ARCHIVE_PATH="${ROOT_DIR}/dist/${PACKAGE_ID}-${PACKAGE_VERSION}.tar.gz"
SHA_PATH="${ARCHIVE_PATH}.sha256"
STAGE_DIR="$(mktemp -d)"

cleanup() {
  rm -rf -- "${STAGE_DIR}"
  rm -f -- "${ARCHIVE_PATH}.tmp"
}
trap cleanup EXIT

if command -v nexus >/dev/null 2>&1; then
  NEX_CLI=(nexus)
else
  NEX_CLI=(node "${ROOT_DIR}/../../../nex/dist/entry.js")
fi

mkdir -p "${ROOT_DIR}/bin"
rm -f -- "${ROOT_DIR}/bin/plaid-adapter"
for target in darwin-arm64 linux-arm64 linux-amd64; do
  target_os="${target%-*}"
  target_arch="${target#*-}"
  (
    cd "${ROOT_DIR}"
    CGO_ENABLED=0 GOOS="${target_os}" GOARCH="${target_arch}" \
      go build -mod=vendor -trimpath -buildvcs=false -ldflags="-s -w -buildid=" \
      -o "./bin/plaid-adapter-${target}" ./cmd/plaid-adapter
  )
done

"${ROOT_DIR}/scripts/plaid-adapter-launcher.sh" adapter.info >/dev/null
"${NEX_CLI[@]}" package validate "${ROOT_DIR}"
"${NEX_CLI[@]}" package release "${ROOT_DIR}"

tar -xzf "${ARCHIVE_PATH}" -C "${STAGE_DIR}"
(
  cd "${ROOT_DIR}"
  go run ./scripts/build-deterministic-archive.go "${STAGE_DIR}" "${ARCHIVE_PATH}.tmp"
)
mv "${ARCHIVE_PATH}.tmp" "${ARCHIVE_PATH}"

if command -v shasum >/dev/null 2>&1; then
  archive_sha="$(shasum -a 256 "${ARCHIVE_PATH}" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  archive_sha="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
else
  printf 'No SHA-256 checksum utility found; install shasum or sha256sum.\n' >&2
  exit 1
fi
printf '%s  %s\n' "${archive_sha}" "$(basename "${ARCHIVE_PATH}")" >"${SHA_PATH}"
printf 'deterministic_archive_sha256=%s\n' "${archive_sha}"
