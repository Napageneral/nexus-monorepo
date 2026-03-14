#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PACKAGES_DIR}/.." && pwd)"
FRONTDOOR_DIR="${REPO_ROOT}/frontdoor/nexus-frontdoor"

usage() {
  cat <<'EOF'
Usage:
  publish-package.sh <package-root-or-manifest-root> [--tarball /abs/path/to/package.tar.gz] [frontdoor publish args...]

Examples:
  publish-package.sh /abs/path/to/packages/apps/spike/app --tarball /abs/path/to/packages/apps/spike/dist/spike-1.0.2-linux-arm64.tar.gz --frontdoor-db /tmp/frontdoor.db --target-os linux --target-arch arm64
  publish-package.sh /abs/path/to/packages/adapters/git --tarball /abs/path/to/packages/adapters/git/dist/nexus-adapter-git-1.0.11-linux-arm64.tar.gz --frontdoor-db /tmp/frontdoor.db --target-os linux --target-arch arm64
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

PACKAGE_ROOT=""
TARBALL_PATH=""
FORWARD_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --tarball)
      shift
      if [[ $# -eq 0 || -z "${1:-}" ]]; then
        echo "missing value for --tarball" >&2
        usage >&2
        exit 1
      fi
      TARBALL_PATH="$1"
      ;;
    *)
      if [[ -z "${PACKAGE_ROOT}" ]]; then
        PACKAGE_ROOT="$1"
      else
        FORWARD_ARGS+=("$1")
      fi
      ;;
  esac
  shift
done

if [[ -z "${PACKAGE_ROOT}" ]]; then
  echo "missing package root" >&2
  usage >&2
  exit 1
fi

PACKAGE_ROOT="$(cd "${PACKAGE_ROOT}" && pwd)"

if [[ ! -d "${FRONTDOOR_DIR}" ]]; then
  echo "missing Frontdoor workspace: ${FRONTDOOR_DIR}" >&2
  exit 1
fi

MANIFEST_PATH=""
PUBLISH_SCRIPT=""

if [[ -f "${PACKAGE_ROOT}/app.nexus.json" ]]; then
  MANIFEST_PATH="${PACKAGE_ROOT}/app.nexus.json"
  PUBLISH_SCRIPT="./scripts/publish-app-release.ts"
elif [[ -f "${PACKAGE_ROOT}/adapter.nexus.json" ]]; then
  MANIFEST_PATH="${PACKAGE_ROOT}/adapter.nexus.json"
  PUBLISH_SCRIPT="./scripts/publish-adapter-release.ts"
else
  echo "expected app.nexus.json or adapter.nexus.json at ${PACKAGE_ROOT}" >&2
  exit 1
fi

PACKAGE_ID="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const value=String(manifest.id||"").trim(); if(!value) process.exit(1); process.stdout.write(value);' "${MANIFEST_PATH}")"
VERSION="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const value=String(manifest.version||"").trim(); if(!value) process.exit(1); process.stdout.write(value);' "${MANIFEST_PATH}")"

if [[ -z "${TARBALL_PATH}" ]]; then
  TARBALL_PATH="${PACKAGE_ROOT}/dist/${PACKAGE_ID}-${VERSION}.tar.gz"
fi

if [[ ! -f "${TARBALL_PATH}" ]]; then
  echo "missing tarball: ${TARBALL_PATH}" >&2
  echo "run 'nex package release ${PACKAGE_ROOT}' first or pass --tarball explicitly" >&2
  exit 1
fi

(
  cd "${FRONTDOOR_DIR}"
  pnpm exec tsx "${PUBLISH_SCRIPT}" \
    --package-root "${PACKAGE_ROOT}" \
    --tarball "${TARBALL_PATH}" \
    "${FORWARD_ARGS[@]}"
)
