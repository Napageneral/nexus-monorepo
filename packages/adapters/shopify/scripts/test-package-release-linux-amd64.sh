#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UMBRELLA_ROOT="$(cd "${ROOT_DIR}/../../.." && pwd)"
NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
GO_MODULE_CACHE="${GO_MODULE_CACHE:-$(go env GOMODCACHE)}"
suffix="${PPID}-$$"
cleanroom_image="shopify-release-cleanroom:${suffix}"
runner_temp="$(mktemp -d /private/tmp/shopify-release-cleanroom.XXXXXX)"
chmod 0700 "${runner_temp}"

cleanup() {
  docker image rm "${cleanroom_image}" >/dev/null 2>&1 || true
  rm -rf -- "${runner_temp}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker image inspect "${NEX_IMAGE}" >/dev/null
[[ "$(docker image inspect "${NEX_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]] || {
  echo "NEX_RELEASE_IMAGE must be a Linux/AMD64 image" >&2
  exit 1
}
[[ -d "${GO_MODULE_CACHE}" ]] || {
  echo "Go module cache is unavailable: ${GO_MODULE_CACHE}" >&2
  exit 1
}

docker build \
  --platform linux/amd64 \
  --build-arg "NEX_IMAGE=${NEX_IMAGE}" \
  --file "${ROOT_DIR}/scripts/Dockerfile.release-cleanroom" \
  --tag "${cleanroom_image}" \
  "${ROOT_DIR}/scripts"

docker run --rm \
  --platform linux/amd64 \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
  --mount "type=bind,src=${runner_temp},dst=/runner-temp" \
  --mount "type=bind,src=${UMBRELLA_ROOT},dst=/workspace" \
  --mount "type=bind,src=${UMBRELLA_ROOT}/packages/package-kit,dst=/opt/nex/packages/package-kit,readonly" \
  --mount "type=bind,src=${UMBRELLA_ROOT}/nex/src,dst=/opt/nex/nex/src,readonly" \
  --mount "type=bind,src=${GO_MODULE_CACHE},dst=/go/pkg/mod,readonly" \
  --workdir /workspace/packages/adapters/shopify \
  --entrypoint bash \
  "${cleanroom_image}" \
  -c 'export PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin &&
       export GOCACHE=/runner-temp/go-cache GOPATH=/go TMPDIR=/runner-temp/tmp &&
       export HOME=/runner-temp/home XDG_CONFIG_HOME=/runner-temp/xdg NEXUS_STATE_DIR=/runner-temp/nex-state &&
       mkdir -p "${GOCACHE}" "${TMPDIR}" "${HOME}" "${XDG_CONFIG_HOME}" "${NEXUS_STATE_DIR}" &&
       go test ./... -count=1 &&
       go vet ./... &&
       PACKAGE_NEXUS_ENTRY=/opt/nex/nexus.mjs ./scripts/package-release.sh'
