#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTDOOR_DIR="/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor"
PACKAGE_SCRIPT="${ROOT_DIR}/scripts/package-release.sh"

read_manifest_field() {
  local manifest_path="$1"
  local field_name="$2"
  node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const value=manifest[process.argv[2]]; if(typeof value !== "string" || !value.trim()) process.exit(1); process.stdout.write(value.trim());' \
    "${manifest_path}" "${field_name}"
}

publish_one() {
  local package_name="$1"
  shift

  local package_dir
  case "${package_name}" in
    app) package_dir="${ROOT_DIR}/app" ;;
    admin) package_dir="${ROOT_DIR}/admin" ;;
    hub) package_dir="${ROOT_DIR}/hub" ;;
    *)
      echo "unknown package target: ${package_name}" >&2
      exit 1
      ;;
  esac

  "${PACKAGE_SCRIPT}" "${package_name}" >/dev/null

  local manifest_path="${package_dir}/app.nexus.json"
  local package_id
  package_id="$(read_manifest_field "${manifest_path}" id)"
  local version
  version="$(read_manifest_field "${manifest_path}" version)"
  local tarball_path="${ROOT_DIR}/dist/releases/${package_id}/${package_id}-${version}.tar.gz"

  (
    cd "${FRONTDOOR_DIR}"
    pnpm exec tsx ./scripts/publish-app-release.ts \
      --package-root "${package_dir}" \
      --tarball "${tarball_path}" \
      "$@"
  )
}

main() {
  local target="${1:-all}"
  shift || true

  case "${target}" in
    app|admin|hub)
      publish_one "${target}" "$@"
      ;;
    all)
      publish_one app "$@"
      publish_one admin "$@"
      publish_one hub "$@"
      ;;
    *)
      echo "usage: $0 [app|admin|hub|all] [frontdoor publish args]" >&2
      echo "example: $0 all --frontdoor-db /tmp/frontdoor.db --target-os linux --target-arch arm64" >&2
      exit 1
      ;;
  esac
}

main "$@"
