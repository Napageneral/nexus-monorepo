#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UMBRELLA_ROOT="$(cd "${ROOT_DIR}/../../.." && pwd)"
NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
NEX_SOURCE_ROOT="${NEX_SOURCE_ROOT:-${UMBRELLA_ROOT}/nex}"
runner_temp="$(mktemp -d /private/tmp/alibaba-release-cleanroom.XXXXXX)"
chmod 0700 "${runner_temp}"

cleanup() { rm -rf -- "${runner_temp}"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker image inspect "${NEX_IMAGE}" >/dev/null
[[ "$(docker image inspect "${NEX_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]] || {
  echo "NEX_RELEASE_IMAGE must be Linux/AMD64" >&2
  exit 1
}

# The bundled adapter is platform-neutral JavaScript. Build it once from the
# reviewed host source, then validate, test, and package those exact bytes in
# the isolated Linux/AMD64 release environment.
(cd "${ROOT_DIR}" && npm run build)

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
  --mount "type=bind,src=${NEX_SOURCE_ROOT}/src,dst=/opt/nex/nex/src,readonly" \
  --workdir /workspace/packages/adapters/alibaba \
  --entrypoint bash \
  "${NEX_IMAGE}" \
  -c 'export HOME=/runner-temp/home XDG_CONFIG_HOME=/runner-temp/xdg NEXUS_STATE_DIR=/runner-temp/nex-state &&
      mkdir -p "${HOME}" "${XDG_CONFIG_HOME}" "${NEXUS_STATE_DIR}" &&
      npm test && npm run lint &&
      node /opt/nex/nexus.mjs package validate . &&
      node /opt/nex/nexus.mjs package release .'
