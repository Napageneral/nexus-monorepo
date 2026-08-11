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

# Build, test, validate, and package inside the exact Linux/AMD64 environment.
# The bundled output is platform-neutral JavaScript, but esbuild's executable
# is host-specific; invoking a host-installed binary would make the release
# proof depend on the operator machine's architecture.

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
      mkdir -p /runner-temp/workspace/packages/adapters/nexus-adapter-sdks &&
      cp -a /workspace/packages/adapters/alibaba /runner-temp/workspace/packages/adapters/alibaba &&
      cp -a /workspace/packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts /runner-temp/workspace/packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts &&
      cp /opt/nex/node_modules/.pnpm/@esbuild+linux-x64@0.27.3/node_modules/@esbuild/linux-x64/bin/esbuild /runner-temp/workspace/packages/adapters/alibaba/node_modules/esbuild/bin/esbuild &&
      chmod 0500 /runner-temp/workspace/packages/adapters/alibaba/node_modules/esbuild/bin/esbuild &&
      cd /runner-temp/workspace/packages/adapters/alibaba &&
      npm test && npm run lint &&
      node /opt/nex/nexus.mjs package validate . &&
      node /opt/nex/nexus.mjs package release . &&
      mkdir -p /workspace/packages/adapters/alibaba/dist &&
      cp dist/alibaba-0.3.2.tar.gz dist/alibaba-0.3.2.tar.gz.sha256 /workspace/packages/adapters/alibaba/dist/'
