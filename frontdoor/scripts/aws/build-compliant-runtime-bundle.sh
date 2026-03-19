#!/usr/bin/env bash

set -euo pipefail
export COPYFILE_DISABLE=1

usage() {
  cat <<'EOF' >&2
Usage:
  build-compliant-runtime-bundle.sh \
    [--nex-root /abs/path/to/nex] \
    [--output /abs/path/to/nex-runtime-bundle.tgz] \
    [--skip-build]

Builds a self-contained runtime source bundle for the compliant AWS image
builder. The bundle contains the current built Nex runtime tree plus the lockfile
needed to install Linux production dependencies on the builder instance.
EOF
  exit 2
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NEX_ROOT_DEFAULT="$(cd "${SCRIPT_DIR}/../../../../nex" && pwd)"
NEX_ROOT="${NEX_ROOT_DEFAULT}"
OUTPUT="/tmp/nex-runtime-bundle.tgz"
SKIP_BUILD="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --nex-root)
      NEX_ROOT="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    -*)
      printf 'Unknown option: %s\n' "$1" >&2
      usage
      ;;
    *)
      usage
      ;;
  esac
done

if [ ! -d "$NEX_ROOT" ]; then
  printf 'Nex root not found: %s\n' "$NEX_ROOT" >&2
  exit 1
fi

cd "$NEX_ROOT"

if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi

if [ "$SKIP_BUILD" != "true" ]; then
  pnpm build
fi

STAGE_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

BUNDLE_ROOT="${STAGE_DIR}/runtime"
mkdir -p "$BUNDLE_ROOT"

for path in package.json pnpm-lock.yaml nexus.mjs dist assets README.md LICENSE; do
  if [ -e "$path" ]; then
    rsync -a "$path" "$BUNDLE_ROOT/"
  fi
done

find "$BUNDLE_ROOT" -name '._*' -delete

if [ ! -f "${BUNDLE_ROOT}/package.json" ] || [ ! -f "${BUNDLE_ROOT}/pnpm-lock.yaml" ] || [ ! -f "${BUNDLE_ROOT}/dist/index.js" ]; then
  echo "runtime bundle staging is incomplete" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
tar -czf "$OUTPUT" -C "$STAGE_DIR" runtime
printf '%s\n' "$OUTPUT"
