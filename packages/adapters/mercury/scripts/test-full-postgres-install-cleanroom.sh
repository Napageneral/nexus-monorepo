#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UMBRELLA_ROOT="$(cd "${ROOT_DIR}/../../.." && pwd)"
NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
POSTGRES_IMAGE="${POSTGRES_RELEASE_IMAGE:?set POSTGRES_RELEASE_IMAGE to the exact Linux/AMD64 PostgreSQL 17 image}"
RECEIPT_PATH="${CLEANROOM_RECEIPT_PATH:-/private/tmp/mercury-full-postgres-install-cleanroom-receipt.json}"
PACKAGE_VERSION="$(jq -r '.version' "${ROOT_DIR}/adapter.nexus.json")"
PACKAGE_ARTIFACT="${ROOT_DIR}/dist/mercury-${PACKAGE_VERSION}.tar.gz"

for command_name in docker jq openssl shasum; do
  command -v "${command_name}" >/dev/null || {
    echo "required command is unavailable: ${command_name}" >&2
    exit 1
  }
done

[[ -z "$(git -C "${UMBRELLA_ROOT}" status --porcelain=v1 --untracked-files=all)" ]] || {
  echo "cleanroom source worktree must be clean" >&2
  exit 1
}
[[ -f "${PACKAGE_ARTIFACT}" ]] || {
  echo "exact Mercury release artifact is unavailable: ${PACKAGE_ARTIFACT}" >&2
  exit 1
}

docker image inspect "${NEX_IMAGE}" >/dev/null
docker image inspect "${POSTGRES_IMAGE}" >/dev/null
[[ "$(docker image inspect "${NEX_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]] || {
  echo "NEX_RELEASE_IMAGE must be Linux/AMD64" >&2
  exit 1
}
[[ "$(docker image inspect "${POSTGRES_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]] || {
  echo "POSTGRES_RELEASE_IMAGE must be Linux/AMD64" >&2
  exit 1
}

source_revision="$(git -C "${UMBRELLA_ROOT}" rev-parse HEAD)"
source_tree="$(git -C "${UMBRELLA_ROOT}" rev-parse 'HEAD^{tree}')"
nex_revision="$(docker image inspect "${NEX_IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "${nex_revision}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Nex image is missing an exact 40-hex revision label" >&2
  exit 1
}

artifact_sha256="$(shasum -a 256 "${PACKAGE_ARTIFACT}" | awk '{print $1}')"
artifact_size="$(stat -f '%z' "${PACKAGE_ARTIFACT}")"
suffix="${PPID}-$$"
network="nex-mercury-cleanroom-${suffix}"
postgres_container="${network}-postgres"
runtime_container="${network}-runtime"
postgres_volume="${network}-postgres"
state_volume="${network}-state"
credential_volume="${network}-credentials"
runtime_role="nex_mercury_runtime"
migrator_role="nex_mercury_migrator"
runner_temp="$(mktemp -d /private/tmp/nex-mercury-full-postgres.XXXXXX)"
chmod 0700 "${runner_temp}"

cleanup_resources() {
  docker rm -f "${runtime_container}" "${postgres_container}" >/dev/null 2>&1 || true
  docker volume rm -f "${postgres_volume}" "${state_volume}" "${credential_volume}" >/dev/null 2>&1 || true
  docker network rm "${network}" >/dev/null 2>&1 || true
}

cleanup() {
  cleanup_resources
  rm -rf -- "${runner_temp}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_postgres() {
  local attempt
  for attempt in $(seq 1 90); do
    if docker exec "${postgres_container}" \
      psql -X -U postgres -d moonsleep_nex -Atqc 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs "${postgres_container}" >&2 || true
  return 1
}

wait_for_runtime() {
  local attempt
  for attempt in $(seq 1 90); do
    if docker exec "${runtime_container}" sh -c '
      token=$(cat /run/moonsleep-load-credentials/runtime-token)
      curl -fsS -H "Authorization: Bearer ${token}" http://127.0.0.1:18789/health >/dev/null
    ' 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  docker logs "${runtime_container}" >&2 || true
  return 1
}

package_request() {
  local path="$1"
  docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec curl -fsS -H "Authorization: Bearer ${token}" "http://127.0.0.1:18789$1"
  ' sh "${path}"
}

install_package() {
  local release_id="$1"
  local operation_id="${release_id}-install"
  local staged_path="/var/lib/nex/state/packages/staging/${operation_id}/artifact.tar.gz"
  local body

  docker exec --user 20042:20042 "${runtime_container}" sh -c '
    set -eu
    install -d -m 0700 "$(dirname "$2")"
    cp "$1" "$2"
    chmod 0600 "$2"
  ' sh "/artifacts/mercury-${PACKAGE_VERSION}.tar.gz" "${staged_path}"

  body="$(jq -nc \
    --arg package_id mercury \
    --arg version "${PACKAGE_VERSION}" \
    --arg release_id "${release_id}" \
    --arg operation_id "${operation_id}" \
    --arg server_path "${staged_path}" \
    --arg sha256 "${artifact_sha256}" \
    --argjson size_bytes "${artifact_size}" \
    '{kind:"adapter",package_id:$package_id,version:$version,release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$server_path,sha256:$sha256,size_bytes:$size_bytes}}')"

  docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec curl -sS \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      --data "$1" \
      http://127.0.0.1:18789/api/operator/packages/install
  ' sh "${body}"
}

echo "[cleanroom] create isolated PostgreSQL 17 and Nex resources"
docker network create --internal "${network}" >/dev/null
docker volume create "${postgres_volume}" >/dev/null
docker volume create "${state_volume}" >/dev/null
docker volume create "${credential_volume}" >/dev/null

runtime_token="nex_rt_$(openssl rand -hex 24)"
postgres_dsn="postgresql://${runtime_role}@postgres:5432/moonsleep_nex"

docker run --rm \
  --platform linux/amd64 \
  --network none \
  --read-only \
  --user 0:0 \
  --mount "type=volume,src=${state_volume},dst=/target" \
  --entrypoint sh \
  "${NEX_IMAGE}" \
  -c 'set -eu
      install -d -m 0700 -o nex-moonsleep -g nex-moonsleep /target/state
      printf "%s\n" \
        "{" \
        "  \"runtime\": {" \
        "    \"port\": 18789," \
        "    \"bind\": \"loopback\"," \
        "    \"auth\": {\"mode\": \"token\", \"token\": \"\${NEXUS_RUNTIME_TOKEN}\"}" \
        "  }" \
        "}" > /target/state/config.json
      chown nex-moonsleep:nex-moonsleep /target/state/config.json
      chmod 0600 /target/state/config.json'

docker run --rm \
  --platform linux/amd64 \
  --network none \
  --read-only \
  --user 0:0 \
  --env "POSTGRES_DSN=${postgres_dsn}" \
  --env "RUNTIME_TOKEN=${runtime_token}" \
  --mount "type=volume,src=${credential_volume},dst=/target" \
  --entrypoint sh \
  "${NEX_IMAGE}" \
  -c 'set -eu
      umask 077
      chmod 0750 /target
      printf "%s\n" "$POSTGRES_DSN" > /target/postgres-dsn
      printf "%s\n" "$RUNTIME_TOKEN" > /target/runtime-token
      printf "%s\n" \
        "owner:" \
        "  name: Tyler" \
        "assistant:" \
        "  name: MoonSleep Ops" \
        "operators:" \
        "  - name: Casey" > /target/bootstrap-seed.yaml
      chown root:root /target/postgres-dsn /target/runtime-token /target/bootstrap-seed.yaml
      chmod 0400 /target/postgres-dsn /target/runtime-token /target/bootstrap-seed.yaml'

docker run -d \
  --name "${postgres_container}" \
  --platform linux/amd64 \
  --network "${network}" \
  --network-alias postgres \
  --security-opt no-new-privileges \
  --env POSTGRES_DB=moonsleep_nex \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --mount "type=volume,src=${postgres_volume},dst=/var/lib/postgresql/data" \
  --tmpfs /run/postgresql:rw,nosuid,nodev,noexec,mode=0775 \
  "${POSTGRES_IMAGE}" >/dev/null
wait_for_postgres
postgres_version="$(docker exec -u postgres "${postgres_container}" psql -X -d moonsleep_nex -Atqc 'SHOW server_version')"
[[ "${postgres_version}" == 17.* ]]

docker exec -i "${postgres_container}" psql -X -U postgres -d moonsleep_nex -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE ROLE ${migrator_role} LOGIN;
CREATE ROLE ${runtime_role} LOGIN;
GRANT CONNECT, CREATE ON DATABASE moonsleep_nex TO ${migrator_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${runtime_role};
SQL

migration_receipt="$(docker run --rm \
  --platform linux/amd64 \
  --network "${network}" \
  --read-only \
  --security-opt no-new-privileges \
  --env NEXUS_RUNTIME_STORAGE_PROFILE=moonsleep-postgres-v1 \
  --env NEXUS_POSTGRES_MIGRATOR_CONNECTION_ENV=CLEANROOM_MIGRATOR_DATABASE_URL \
  --env "CLEANROOM_MIGRATOR_DATABASE_URL=postgresql://${migrator_role}@postgres/moonsleep_nex" \
  --env "NEXUS_POSTGRES_RECORDS_RUNTIME_ROLE=${runtime_role}" \
  --env NEXUS_POSTGRES_RECORDS_SCHEMA=nex_runtime \
  --entrypoint node \
  "${NEX_IMAGE}" \
  /opt/nex/dist/postgres-record-store-migrate.js)"
jq -e '.ok == true and .storage_profile == "moonsleep-postgres-v1"' <<<"${migration_receipt}" >/dev/null

docker run -d \
  --name "${runtime_container}" \
  --platform linux/amd64 \
  --network "${network}" \
  --read-only \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add SETUID \
  --cap-add SETGID \
  --mount "type=volume,src=${state_volume},dst=/var/lib/nex" \
  --mount "type=volume,src=${credential_volume},dst=/run/moonsleep-load-credentials,readonly" \
  --mount "type=bind,src=$(dirname "${PACKAGE_ARTIFACT}"),dst=/artifacts,readonly" \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
  --tmpfs /run/nex-credentials:rw,nosuid,nodev,noexec,mode=0700 \
  "${NEX_IMAGE}" >/dev/null
wait_for_runtime

echo "[cleanroom] install exact Mercury artifact and verify active health"
release_id="cleanroom-mercury-${artifact_sha256:0:16}"
install_response="$(install_package "${release_id}")"
if ! jq -e '.ok == true and .package_id == "mercury" and .status == "active"' <<<"${install_response}" >/dev/null; then
  echo "Mercury package install failed: ${install_response}" >&2
  exit 1
fi

package_state="$(package_request /api/operator/packages/adapter/mercury)"
health_before="$(package_request /api/operator/packages/adapter/mercury/health)"
jq -e --arg version "${PACKAGE_VERSION}" '
  .status == "active" and .active_version == $version
' <<<"${package_state}" >/dev/null
jq -e '
  .healthy == true and
  .adapter.name == "mercury" and
  .adapter.platform == "mercury" and
  .adapter.version == "0.3.0"
' <<<"${health_before}" >/dev/null

echo "[cleanroom] prove tampered staged bytes fail without replacing the active release"
tamper_operation="${release_id}-tamper"
tamper_path="/var/lib/nex/state/packages/staging/${tamper_operation}/artifact.tar.gz"
docker exec --user 20042:20042 "${runtime_container}" sh -c '
  set -eu
  install -d -m 0700 "$(dirname "$2")"
  cp "$1" "$2"
  printf x >> "$2"
  chmod 0600 "$2"
' sh "/artifacts/mercury-${PACKAGE_VERSION}.tar.gz" "${tamper_path}"
tamper_body="$(jq -nc \
  --arg version "${PACKAGE_VERSION}" \
  --arg release_id "${release_id}-tampered" \
  --arg operation_id "${tamper_operation}" \
  --arg server_path "${tamper_path}" \
  --arg sha256 "${artifact_sha256}" \
  --argjson size_bytes "${artifact_size}" \
  '{kind:"adapter",package_id:"mercury",version:$version,release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$server_path,sha256:$sha256,size_bytes:$size_bytes}}')"
tamper_status="$(docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  curl -sS -o /tmp/tamper-response -w "%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data "$1" \
    http://127.0.0.1:18789/api/operator/packages/install
' sh "${tamper_body}")"
[[ "${tamper_status}" =~ ^4 ]]
jq -e --arg version "${PACKAGE_VERSION}" '
  .status == "active" and .active_version == $version
' <<<"$(package_request /api/operator/packages/adapter/mercury)" >/dev/null

echo "[cleanroom] restart Nex and verify exact package rehydration"
docker restart "${runtime_container}" >/dev/null
wait_for_runtime
package_state_after="$(package_request /api/operator/packages/adapter/mercury)"
health_after="$(package_request /api/operator/packages/adapter/mercury/health)"
jq -e --arg version "${PACKAGE_VERSION}" '
  .status == "active" and .active_version == $version
' <<<"${package_state_after}" >/dev/null
jq -e '.healthy == true and .adapter.name == "mercury"' <<<"${health_after}" >/dev/null

runtime_counts="$(docker exec -u postgres "${postgres_container}" \
  psql -X -d moonsleep_nex -Atqc "
    SELECT json_build_object(
      'records', (SELECT COUNT(*) FROM nex_runtime.records),
      'receipts', (SELECT COUNT(*) FROM nex_runtime.record_ingest_receipts),
      'adapter_instances', (SELECT COUNT(*) FROM nex_runtime.adapter_instances),
      'connections', (SELECT COUNT(*) FROM nex_runtime.adapter_connections)
    )")"
jq -e '
  .records == 0 and .receipts == 0 and
  .adapter_instances == 0 and .connections == 0
' <<<"${runtime_counts}" >/dev/null

mkdir -p "$(dirname "${RECEIPT_PATH}")"
jq -n \
  --arg source_revision "${source_revision}" \
  --arg source_tree "${source_tree}" \
  --arg nex_revision "${nex_revision}" \
  --arg postgres_version "${postgres_version}" \
  --arg package_version "${PACKAGE_VERSION}" \
  --arg artifact_sha256 "${artifact_sha256}" \
  --argjson artifact_size_bytes "${artifact_size}" \
  --argjson runtime_counts "${runtime_counts}" \
  '{
    contract:"nex_mercury_full_postgres_install_cleanroom_v1",
    source_revision:$source_revision,
    source_tree:$source_tree,
    nex_revision:$nex_revision,
    postgres_version:$postgres_version,
    package:{id:"mercury",version:$package_version,artifact_sha256:$artifact_sha256,artifact_size_bytes:$artifact_size_bytes},
    install:"active",
    health_before_restart:"healthy",
    health_after_restart:"healthy",
    tampered_stage:"rejected",
    runtime_counts:$runtime_counts,
    authorities:{
      provider_write:false,
      payment_create:false,
      payment_release:false,
      journal_post:false,
      tax_file:false,
      distribution:false,
      production_cutover:false,
      credential_disclosure:false
    }
  }' > "${RECEIPT_PATH}.tmp"
chmod 0600 "${RECEIPT_PATH}.tmp"
mv -f "${RECEIPT_PATH}.tmp" "${RECEIPT_PATH}"
receipt_sha256="$(shasum -a 256 "${RECEIPT_PATH}" | awk '{print $1}')"
echo "Mercury full PostgreSQL install cleanroom PASS"
echo "receipt=${RECEIPT_PATH}"
echo "receipt_sha256=${receipt_sha256}"
