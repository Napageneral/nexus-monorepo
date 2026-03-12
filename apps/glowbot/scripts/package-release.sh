#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist/releases"

read_manifest_field() {
  local manifest_path="$1"
  local field_name="$2"
  node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const value=manifest[process.argv[2]]; if(typeof value !== "string" || !value.trim()) process.exit(1); process.stdout.write(value.trim());' \
    "${manifest_path}" "${field_name}"
}

copy_optional_dir() {
  local source_dir="$1"
  local target_dir="$2"
  local name="$3"
  if [[ -d "${source_dir}/${name}" ]]; then
    mkdir -p "${target_dir}/${name}"
    rsync -a \
      --exclude='*.test.ts' \
      --exclude='*.spec.ts' \
      --exclude='*.tsbuildinfo' \
      --exclude='node_modules' \
      "${source_dir}/${name}/" "${target_dir}/${name}/"
  fi
}

copy_required_dir() {
  local source_dir="$1"
  local target_dir="$2"
  local name="$3"
  if [[ ! -d "${source_dir}/${name}" ]]; then
    echo "missing required directory: ${source_dir}/${name}" >&2
    exit 1
  fi
  mkdir -p "${target_dir}/${name}"
  rsync -a \
    --exclude='*.test.ts' \
    --exclude='*.spec.ts' \
    --exclude='*.tsbuildinfo' \
    --exclude='node_modules' \
    "${source_dir}/${name}/" "${target_dir}/${name}/"
}

package_app_like() {
  local package_dir="$1"
  local package_label="$2"
  shift 2
  local required_dirs=("$@")

  local manifest_path="${package_dir}/app.nexus.json"
  if [[ ! -f "${manifest_path}" ]]; then
    echo "missing manifest: ${manifest_path}" >&2
    exit 1
  fi

  local package_id
  package_id="$(read_manifest_field "${manifest_path}" id)"
  local version
  version="$(read_manifest_field "${manifest_path}" version)"

  local archive_dir="${DIST_DIR}/${package_id}"
  local archive_path="${archive_dir}/${package_id}-${version}.tar.gz"
  local stage_dir
  stage_dir="$(mktemp -d)"
  trap 'rm -rf "${stage_dir}"' RETURN

  mkdir -p "${archive_dir}"
  cp "${manifest_path}" "${stage_dir}/app.nexus.json"

  for dir_name in "${required_dirs[@]}"; do
    copy_required_dir "${package_dir}" "${stage_dir}" "${dir_name}"
  done

  # Optional conventional directories. These stay package-local if present.
  copy_optional_dir "${package_dir}" "${stage_dir}" "assets"
  copy_optional_dir "${package_dir}" "${stage_dir}" "bin"
  copy_optional_dir "${package_dir}" "${stage_dir}" "jobs"
  copy_optional_dir "${package_dir}" "${stage_dir}" "shared"

  tar -czf "${archive_path}" -C "${stage_dir}" .
  printf '%s\t%s\n' "${package_label}" "${archive_path}"
  rm -rf "${stage_dir}"
  trap - RETURN
}

package_glowbot() {
  package_app_like \
    "${ROOT_DIR}/app" \
    "glowbot" \
    "dist" \
    "hooks" \
    "methods" \
    "clinic-profile" \
    "pipeline" \
    "product-control-plane"
}

package_glowbot_admin() {
  package_app_like \
    "${ROOT_DIR}/admin" \
    "glowbot-admin" \
    "dist" \
    "hooks" \
    "methods"
}

package_glowbot_hub() {
  package_app_like \
    "${ROOT_DIR}/hub" \
    "glowbot-hub" \
    "bin" \
    "src"
}

main() {
  local target="${1:-all}"
  mkdir -p "${DIST_DIR}"

  case "${target}" in
    app)
      package_glowbot
      ;;
    admin)
      package_glowbot_admin
      ;;
    hub)
      package_glowbot_hub
      ;;
    all)
      package_glowbot
      package_glowbot_admin
      package_glowbot_hub
      ;;
    *)
      echo "usage: $0 [app|admin|hub|all]" >&2
      exit 1
      ;;
  esac
}

main "$@"
