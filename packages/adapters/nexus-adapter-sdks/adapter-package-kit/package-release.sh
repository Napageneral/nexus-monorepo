#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
ROOT_DIR="$(cd "${ROOT_DIR}" && pwd)"
MANIFEST_PATH="${ROOT_DIR}/adapter.nexus.json"
PACKAGE_KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
DIST_DIR="${ROOT_DIR}/dist"
STAGE_DIR="$(mktemp -d)"
ARCHIVE_PATH="${DIST_DIR}/${PACKAGE_ID}-${VERSION}.tar.gz"
INFO_COMMAND=()
trap 'rm -rf "${STAGE_DIR}"' EXIT

mkdir -p "${ROOT_DIR}/bin"
mkdir -p "${DIST_DIR}"

if [[ -n "${ADAPTER_PACKAGE_RUNTIME:-}" ]]; then
  PACKAGE_RUNTIME="${ADAPTER_PACKAGE_RUNTIME}"
elif [[ -f "${ROOT_DIR}/package.json" ]]; then
  PACKAGE_RUNTIME="node"
elif [[ -f "${ROOT_DIR}/go.mod" ]]; then
  PACKAGE_RUNTIME="go"
else
  echo "failed to infer adapter package runtime; set ADAPTER_PACKAGE_RUNTIME" >&2
  exit 1
fi

if [[ "${PACKAGE_RUNTIME}" == "go" ]]; then
  DEFAULT_BUILD_TARGET="."
  if [[ -d "${ROOT_DIR}/cmd/${BIN_NAME}" ]]; then
    DEFAULT_BUILD_TARGET="./cmd/${BIN_NAME}"
  fi
  BUILD_TARGET="${ADAPTER_BUILD_TARGET:-${DEFAULT_BUILD_TARGET}}"
  INFO_BINARY="${STAGE_DIR}/bin/${BIN_NAME}.info"
  (
    cd "${ROOT_DIR}"
    env -u GOOS -u GOARCH -u GOARM go build -o "${INFO_BINARY}" "${BUILD_TARGET}"
    go build -o "./bin/${BIN_NAME}" "${BUILD_TARGET}"
  )
  INFO_COMMAND=("${INFO_BINARY}")
elif [[ "${PACKAGE_RUNTIME}" == "node" ]]; then
  if [[ ! -f "${ROOT_DIR}/package.json" ]]; then
    echo "missing package.json for node adapter packaging" >&2
    exit 1
  fi
  (
    cd "${ROOT_DIR}"
    pnpm build
  )
else
  echo "unsupported ADAPTER_PACKAGE_RUNTIME: ${PACKAGE_RUNTIME}" >&2
  exit 1
fi

cp "${MANIFEST_PATH}" "${STAGE_DIR}/adapter.nexus.json"
mkdir -p "${STAGE_DIR}/bin"

if [[ "${PACKAGE_RUNTIME}" == "go" ]]; then
  cp "${ROOT_DIR}/bin/${BIN_NAME}" "${STAGE_DIR}/bin/${BIN_NAME}"
elif [[ "${PACKAGE_RUNTIME}" == "node" ]]; then
  NODE_ENTRY="$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const pkg=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const binName=process.argv[2]; const main=pkg.main && typeof pkg.main==="string" ? pkg.main : ""; if (pkg.bin && typeof pkg.bin==="object" && typeof pkg.bin[binName]==="string") { process.stdout.write(pkg.bin[binName]); process.exit(0); } if (pkg.bin && typeof pkg.bin==="string") { process.stdout.write(pkg.bin); process.exit(0); } if (main) { process.stdout.write(main); process.exit(0); } process.exit(1);' "${ROOT_DIR}/package.json" "${BIN_NAME}")"
  if [[ -z "${NODE_ENTRY}" ]]; then
    echo "failed to infer node entry from package.json" >&2
    exit 1
  fi
  if [[ ! -f "${ROOT_DIR}/${NODE_ENTRY}" ]]; then
    echo "missing built node entry: ${ROOT_DIR}/${NODE_ENTRY}" >&2
    exit 1
  fi

  cat > "${STAGE_DIR}/bin/${BIN_NAME}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
exec node "\${ROOT_DIR}/${NODE_ENTRY}" "\$@"
EOF
  chmod +x "${STAGE_DIR}/bin/${BIN_NAME}"

  cp "${ROOT_DIR}/package.json" "${STAGE_DIR}/package.json"
  cp -R "${ROOT_DIR}/dist" "${STAGE_DIR}/dist"
  for asset_dir in raw api schemas openapi; do
    if [[ -d "${ROOT_DIR}/${asset_dir}" ]]; then
      cp -R "${ROOT_DIR}/${asset_dir}" "${STAGE_DIR}/${asset_dir}"
    fi
  done
  if [[ -d "${ROOT_DIR}/node_modules" ]]; then
    cp -R "${ROOT_DIR}/node_modules" "${STAGE_DIR}/node_modules"
  else
    echo "node_modules not present; packaging bundled node adapter without dependency tree" >&2
  fi
  INFO_COMMAND=("${STAGE_DIR}/bin/${BIN_NAME}")
fi

for asset_dir in raw api schemas openapi; do
  if [[ -d "${ROOT_DIR}/${asset_dir}" ]]; then
    rm -rf "${STAGE_DIR:?}/${asset_dir}"
    cp -R "${ROOT_DIR}/${asset_dir}" "${STAGE_DIR}/${asset_dir}"
  fi
done

SKILL_PATH="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const skill=typeof manifest.skill==="string" ? manifest.skill.trim() : ""; if (skill) process.stdout.write(skill);' "${MANIFEST_PATH}")"
if [[ -n "${SKILL_PATH}" && -f "${ROOT_DIR}/${SKILL_PATH}" ]]; then
  mkdir -p "${STAGE_DIR}/$(dirname "${SKILL_PATH}")"
  cp "${ROOT_DIR}/${SKILL_PATH}" "${STAGE_DIR}/${SKILL_PATH}"
fi

HOOK_PATHS="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const hooks=manifest.hooks && typeof manifest.hooks === "object" ? Object.values(manifest.hooks) : []; for (const value of hooks) { if (typeof value === "string" && value.trim()) process.stdout.write(value.trim()+"\n"); }' "${MANIFEST_PATH}")"
if [[ -n "${HOOK_PATHS}" ]]; then
  while IFS= read -r hookPath; do
    [[ -z "${hookPath}" ]] && continue
    if [[ ! -f "${ROOT_DIR}/${hookPath}" ]]; then
      echo "missing manifest hook: ${ROOT_DIR}/${hookPath}" >&2
      exit 1
    fi
    mkdir -p "${STAGE_DIR}/$(dirname "${hookPath}")"
    cp "${ROOT_DIR}/${hookPath}" "${STAGE_DIR}/${hookPath}"
  done <<< "${HOOK_PATHS}"
fi

if [[ -d "${ROOT_DIR}/hooks" ]]; then
  cp -R "${ROOT_DIR}/hooks" "${STAGE_DIR}/hooks"
fi

if [[ -d "${ROOT_DIR}/assets" ]]; then
  cp -R "${ROOT_DIR}/assets" "${STAGE_DIR}/assets"
fi

INFO_PATH="${STAGE_DIR}/adapter.info.json"
if ! "${INFO_COMMAND[@]}" adapter.info > "${INFO_PATH}"; then
  echo "failed to read adapter.info from staged adapter binary" >&2
  exit 1
fi
node "${PACKAGE_KIT_DIR}/build-catalog-descriptor.mjs" \
  "${STAGE_DIR}/adapter.nexus.json" \
  "${INFO_PATH}" \
  "${STAGE_DIR}/adapter.catalog.json"
cp "${STAGE_DIR}/adapter.catalog.json" "${DIST_DIR}/${PACKAGE_ID}-${VERSION}.adapter.catalog.json"
rm -f "${INFO_PATH}"
if [[ -n "${INFO_BINARY:-}" ]]; then
  rm -f "${INFO_BINARY}"
fi

tar -czf "${ARCHIVE_PATH}" -C "${STAGE_DIR}" .

printf '%s\n' "${ARCHIVE_PATH}"
