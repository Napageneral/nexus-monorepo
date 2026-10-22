#!/usr/bin/env bash
# Full-runtime proof for the Flexport adapter package, modeled on
# packages/adapters/mercury/scripts/test-full-postgres-install-cleanroom.sh.
#
# It installs the exact released dist/flexport-<version>.tar.gz into a throwaway Nex runtime backed
# by a throwaway PostgreSQL 17, on a private --internal Docker network (no published ports, no
# host network, CPU/memory/PID limits), runs the fake Flexport API (testdata/fake-flexport.mjs)
# inside the runtime container on 127.0.0.1, creates connection cleanroom-flexport with fake
# credentials and base_url http://127.0.0.1:<port>, runs records.backfill, reads records.scan for
# platform flexport, checks one shipment bundle Record (with its document attachment), one network
# Record and the eight-method catalog, sends one flexport.documents.create of more than 200 KiB to
# the fake through the runtime (over 64 KiB the runtime must pass it as --payload-file; inline it
# would exceed Linux's 128 KiB per-argument limit), and writes a private JSON receipt. Every
# resource is named flexport-cleanroom-* and removed on exit.
#
# Assumptions (each is checked, and the script stops with a message when one does not hold):
#   - docker, jq, git, openssl, tar and sha256sum or shasum are on PATH; the Docker daemon runs
#     Linux/AMD64 images (natively or emulated).
#   - NEX_RELEASE_IMAGE is a MoonSleep Nex release image built from deploy/moonsleep/
#     Dockerfile.empty-runtime: node on PATH, /opt/nex/nexus.mjs (the CLI), /opt/nex/dist/
#     postgres-record-store-migrate.js, the nex-moonsleep user 20042, a runtime on 127.0.0.1:18789
#     that reads /run/moonsleep-load-credentials/{postgres-dsn,runtime-token,bootstrap-seed.yaml},
#     curl inside the image, and an org.opencontainers.image.revision label of 40 hex.
#   - POSTGRES_RELEASE_IMAGE is the PostgreSQL 17 image production runs (nex-recovery-postgres:17.9-pgvector-0.8.2-*):
#     binaries in /usr/lib/postgresql/17/bin, a uid 1000 default user, and the vector, unaccent and pg_trgm
#     extensions available (the Nex baseline needs them; production's moonsleep_nex has them). The proof runs its
#     own initdb on a tmpfs and creates the database, the extensions and the production roles.
#   - The moonsleep-empty-v1 bootstrap seeds entity_moonsleep_tyler, which the runtime binds the
#     connection's receiver contact to (the adapter's health returns that account contact).
#   - dist/flexport-<version>.tar.gz was built from this clean worktree (scripts/package-release.sh)
#     and its adapter.nexus.json equals the worktree's.
#   - records.backfill is served over the runtime WebSocket only (not HTTP), so the proof calls it
#     through `node /opt/nex/nexus.mjs runtime call` inside the runtime container as uid 20042.
#   - The fake Flexport API listens on FLEXPORT_FAKE_PORT (default 18931) inside the runtime
#     container's network namespace; nothing else in the container may use that port.
#   - The network is --internal: neither the runtime nor the adapter can reach api.flexport.com.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UMBRELLA_ROOT="$(cd "${ROOT_DIR}/../../.." && pwd)"
NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
POSTGRES_IMAGE="${POSTGRES_RELEASE_IMAGE:?set POSTGRES_RELEASE_IMAGE to the exact Linux/AMD64 PostgreSQL 17 image}"
RECEIPT_PATH="${CLEANROOM_RECEIPT_PATH:-${TMPDIR:-/tmp}/flexport-runtime-cleanroom-receipt.json}"
FAKE_PORT="${FLEXPORT_FAKE_PORT:-18931}"
CONNECTION_ID="cleanroom-flexport"
RUNTIME_USER="20042:20042"
EXPECTED_METHODS='["flexport.bookings.create","flexport.documents.create","flexport.network.get","flexport.products.create","flexport.products.update","flexport.shipments.bundle","flexport.shipments.list","flexport.status"]'

fail() {
  echo "[cleanroom] FAIL: $*" >&2
  exit 1
}

for command_name in docker jq git openssl tar; do
  command -v "${command_name}" >/dev/null || fail "required command is unavailable: ${command_name}"
done
command -v sha256sum >/dev/null || command -v shasum >/dev/null || fail "sha256sum or shasum is required"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}
sha256_of_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -d' ' -f1
  else
    shasum -a 256 | cut -d' ' -f1
  fi
}
size_of() {
  stat -c '%s' "$1" 2>/dev/null || stat -f '%z' "$1"
}

[[ "${FAKE_PORT}" =~ ^[0-9]{4,5}$ && "${FAKE_PORT}" != "18789" ]] || fail "FLEXPORT_FAKE_PORT must be a free 4-5 digit port other than 18789"
PACKAGE_VERSION="$(jq -er '.version' "${ROOT_DIR}/adapter.nexus.json")"
PACKAGE_ARTIFACT="${ROOT_DIR}/dist/flexport-${PACKAGE_VERSION}.tar.gz"
FIXTURE_DOCUMENT="${ROOT_DIR}/testdata/fixtures/documents/D1.pdf"

git -C "${UMBRELLA_ROOT}" rev-parse --git-dir >/dev/null 2>&1 || fail "${UMBRELLA_ROOT} is not a git worktree"
[[ -z "$(git -C "${UMBRELLA_ROOT}" status --porcelain=v1 --untracked-files=all -- packages/adapters/flexport packages/adapters/nexus-adapter-sdks)" ]] \
  || fail "the flexport package and the adapter SDK must be committed and clean"
[[ -f "${PACKAGE_ARTIFACT}" ]] || fail "release artifact is missing: ${PACKAGE_ARTIFACT} (run scripts/package-release.sh)"
[[ -f "${FIXTURE_DOCUMENT}" ]] || fail "fixture document is missing: ${FIXTURE_DOCUMENT}"

artifact_manifest="$(tar -xzOf "${PACKAGE_ARTIFACT}" ./adapter.nexus.json 2>/dev/null || tar -xzOf "${PACKAGE_ARTIFACT}" adapter.nexus.json)" \
  || fail "release artifact has no adapter.nexus.json"
jq -e --slurpfile source "${ROOT_DIR}/adapter.nexus.json" '. == $source[0]' <<<"${artifact_manifest}" >/dev/null \
  || fail "release artifact manifest differs from the worktree's adapter.nexus.json"

docker info >/dev/null 2>&1 || fail "the Docker daemon is not reachable"
docker image inspect "${NEX_IMAGE}" >/dev/null 2>&1 || fail "NEX_RELEASE_IMAGE is not present locally: ${NEX_IMAGE}"
docker image inspect "${POSTGRES_IMAGE}" >/dev/null 2>&1 || fail "POSTGRES_RELEASE_IMAGE is not present locally: ${POSTGRES_IMAGE}"
[[ "$(docker image inspect "${NEX_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]] || fail "NEX_RELEASE_IMAGE must be Linux/AMD64"
[[ "$(docker image inspect "${POSTGRES_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]] || fail "POSTGRES_RELEASE_IMAGE must be Linux/AMD64"

source_revision="$(git -C "${UMBRELLA_ROOT}" rev-parse HEAD)"
source_tree="$(git -C "${UMBRELLA_ROOT}" rev-parse 'HEAD^{tree}')"
nex_revision="$(docker image inspect "${NEX_IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "${nex_revision}" =~ ^[0-9a-f]{40}$ ]] || fail "NEX_RELEASE_IMAGE is missing an exact 40-hex revision label"
nex_manifest_digest="$(docker image inspect "${NEX_IMAGE}" --format '{{range .RepoDigests}}{{println .}}{{end}}' | sed -n 's/.*@//p' | head -1)"
[[ "${nex_manifest_digest}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "NEX_RELEASE_IMAGE has no registry manifest digest (the production migrator requires one, as nex-migrate-roll passes it)"

artifact_sha256="$(sha256_of "${PACKAGE_ARTIFACT}")"
artifact_size="$(size_of "${PACKAGE_ARTIFACT}")"
document_sha256="$(sha256_of "${FIXTURE_DOCUMENT}")"
document_size="$(size_of "${FIXTURE_DOCUMENT}")"
suffix="$$-$(openssl rand -hex 4)"
network="flexport-cleanroom-${suffix}"
postgres_container="${network}-postgres"
runtime_container="${network}-runtime"
postgres_volume="${network}-postgres"
state_volume="${network}-state"
credential_volume="${network}-credentials"
migrator_volume="${network}-migrator"
# The MoonSleep Nex image runs with NEXUS_MOONSLEEP_PRODUCTION_CREDENTIALS=1: each PostgreSQL credential is read from its
# canonical /run/nex-credentials path and must authenticate its production database user, so the cleanroom uses the
# production role names and the migrator invocation of infra/site/bin/nex-migrate-roll (moonsleep-v1).
runtime_role="nex_moonsleep_runtime"
migrator_role="nex_moonsleep_migrator"
access_role="nex_runtime_operator"
owner_role="nex_runtime_schema_owner"
runtime_token="nex_rt_$(openssl rand -hex 24)"
export NEX_CLEANROOM_TOKEN="${runtime_token}"

cleanup() {
  docker rm -f "${runtime_container}" "${postgres_container}" >/dev/null 2>&1 || true
  docker volume rm -f "${postgres_volume}" "${state_volume}" "${credential_volume}" "${migrator_volume}" >/dev/null 2>&1 || true
  docker network rm "${network}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The token reaches each container command through its environment (docker exec -e NAME, no value
# on the docker command line). curl reads the Authorization header from a private 0600 file that
# the container shell's printf builtin writes in its /tmp tmpfs and removes on exit, so the token is
# never on curl's command line. The one exception is `nexus runtime call --url ... --token` for
# records.backfill below: with --url the CLI takes no token from the environment, so this run's
# throwaway token is on that one node command line, inside the isolated container only.
runtime_exec() {
  docker exec -e NEX_CLEANROOM_TOKEN "${runtime_container}" "$@"
}

# runtime_curl <curl arguments...>: curl inside the runtime container with the runtime token.
runtime_curl() {
  runtime_exec sh -c '
    umask 077
    header="/tmp/.cleanroom-runtime-auth.$$"
    trap "rm -f \"${header}\"" EXIT
    printf "Authorization: Bearer %s\n" "${NEX_CLEANROOM_TOKEN}" > "${header}"
    curl -H "@${header}" "$@"
  ' sh "$@"
}

runtime_get() {
  runtime_curl -fsS "http://127.0.0.1:18789$1"
}

# POST <path> <json-body>; prints the body and fails on a non-2xx status.
runtime_post() {
  runtime_curl -sS --fail-with-body -H "Content-Type: application/json" --data "$2" "http://127.0.0.1:18789$1"
}

PG_BIN=/usr/lib/postgresql/17/bin
pg_psql() {
  docker exec -i "${postgres_container}" "${PG_BIN}/psql" -X -h /run/postgresql -U postgres "$@"
}

wait_for_postgres() {
  local attempt
  for attempt in $(seq 1 90); do
    if pg_psql -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs "${postgres_container}" >&2 || true
  fail "PostgreSQL did not become ready"
}

wait_for_runtime() {
  local attempt
  for attempt in $(seq 1 120); do
    if runtime_get /health >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs "${runtime_container}" >&2 || true
  fail "the Nex runtime did not become healthy on 127.0.0.1:18789"
}

wait_for_fake_flexport() {
  local attempt
  for attempt in $(seq 1 30); do
    if runtime_exec curl -fsS "http://127.0.0.1:${FAKE_PORT}/__fake/stats" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker exec "${runtime_container}" cat /tmp/fake-flexport.log >&2 || true
  fail "the fake Flexport API did not start inside the runtime container"
}

echo "[cleanroom] create isolated PostgreSQL 17 and Nex resources (${network})"
docker network create --internal "${network}" >/dev/null
docker volume create "${postgres_volume}" >/dev/null
docker volume create "${state_volume}" >/dev/null
docker volume create "${credential_volume}" >/dev/null
docker volume create "${migrator_volume}" >/dev/null

postgres_dsn="postgresql://${runtime_role}@postgres:5432/moonsleep_nex"

docker run --rm \
  --platform linux/amd64 \
  --network none \
  --read-only \
  --cpus 1 --memory 256m --pids-limit 64 \
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
  --cpus 1 --memory 256m --pids-limit 64 \
  --user 0:0 \
  --env "POSTGRES_DSN=${postgres_dsn}" \
  --env NEX_CLEANROOM_TOKEN \
  --mount "type=volume,src=${credential_volume},dst=/target" \
  --entrypoint sh \
  "${NEX_IMAGE}" \
  -c 'set -eu
      umask 077
      chmod 0750 /target
      printf "%s\n" "$POSTGRES_DSN" > /target/postgres-dsn
      printf "%s\n" "$NEX_CLEANROOM_TOKEN" > /target/runtime-token
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
  --cpus 1 --memory 1g --pids-limit 256 \
  --security-opt no-new-privileges \
  --user 1000:1000 \
  --tmpfs /cleanroom-pgdata:rw,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=2g \
  --tmpfs /run/postgresql:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0775 \
  --entrypoint sh \
  "${POSTGRES_IMAGE}" \
  -c 'set -eu
      B=/usr/lib/postgresql/17/bin
      D=/cleanroom-pgdata/pgdata
      "$B/initdb" -D "$D" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
      printf "host all all all trust\n" >> "$D/pg_hba.conf"
      exec "$B/postgres" -D "$D" -c listen_addresses="*" -c unix_socket_directories=/run/postgresql' >/dev/null
wait_for_postgres
pg_psql -d postgres -v ON_ERROR_STOP=1 -qc 'CREATE DATABASE moonsleep_nex' >/dev/null
pg_psql -d moonsleep_nex -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null || fail "POSTGRES_RELEASE_IMAGE lacks an extension the Nex baseline needs (vector, unaccent, pg_trgm)"
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
postgres_version="$(pg_psql -d moonsleep_nex -Atqc 'SHOW server_version')"
[[ "${postgres_version}" == 17.* ]] || fail "POSTGRES_RELEASE_IMAGE is PostgreSQL ${postgres_version}, not 17"

pg_psql -d moonsleep_nex -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE ROLE ${owner_role} NOLOGIN;
CREATE ROLE ${access_role} NOLOGIN;
CREATE ROLE ${migrator_role} LOGIN;
CREATE ROLE ${runtime_role} LOGIN;
GRANT ${owner_role} TO ${migrator_role};
GRANT ${access_role} TO ${runtime_role};
GRANT CONNECT, CREATE ON DATABASE moonsleep_nex TO ${owner_role};
GRANT CONNECT, CREATE ON DATABASE moonsleep_nex TO ${migrator_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${runtime_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${access_role};
ALTER DATABASE moonsleep_nex OWNER TO ${owner_role};
SQL

docker run --rm \
  --platform linux/amd64 \
  --network none \
  --read-only \
  --cpus 1 --memory 256m --pids-limit 64 \
  --user 0:0 \
  --env "MIGRATOR_DSN=postgresql://${migrator_role}@postgres:5432/moonsleep_nex" \
  --mount "type=volume,src=${migrator_volume},dst=/target" \
  --entrypoint sh \
  "${NEX_IMAGE}" \
  -c 'set -eu; umask 077; printf "%s\n" "$MIGRATOR_DSN" > /target/postgres-migrator-dsn; chown root:root /target/postgres-migrator-dsn; chmod 0400 /target/postgres-migrator-dsn'

# A fresh database: the production pass (NEXUS_MOONSLEEP_PRODUCTION_CREDENTIALS=1, as nex-migrate-roll runs it) reads
# the existing migration ledger first and refuses an empty schema, so this one migrator run takes the fresh-install
# path. It still reads its credential from the canonical path as the production migrator user; the runtime below
# keeps the image default (production credentials on).
migration_receipt="$(docker run --rm \
  --platform linux/amd64 \
  --network "${network}" \
  --read-only \
  --cpus 1 --memory 1g --pids-limit 128 \
  --security-opt no-new-privileges \
  --env NEXUS_RUNTIME_STORAGE_PROFILE=moonsleep-postgres-v1 \
  --user 0:0 \
  --mount "type=volume,src=${migrator_volume},dst=/run/nex-credentials,readonly" \
  --env NEXUS_POSTGRES_CONNECTION_FILE=/run/nex-credentials/postgres-migrator-dsn \
  --env NEXUS_MOONSLEEP_PRODUCTION_CREDENTIALS=0 \
  --env "NEXUS_MIGRATION_CANDIDATE_SOURCE_REVISION=${nex_revision}" \
  --env "NEXUS_MIGRATION_CANDIDATE_IMAGE_MANIFEST_DIGEST=${nex_manifest_digest}" \
  --env "NEXUS_POSTGRES_RECORDS_RUNTIME_ROLE=${runtime_role}" \
  --env "NEXUS_POSTGRES_RECORDS_ACCESS_ROLE=${access_role}" \
  --env "NEXUS_POSTGRES_RECORDS_OWNER_ROLE=${owner_role}" \
  --env NEXUS_POSTGRES_RECORDS_SCHEMA=nex_runtime \
  --entrypoint node \
  "${NEX_IMAGE}" \
  /opt/nex/dist/postgres-record-store-migrate.js)"
jq -e '.ok == true and .storage_profile == "moonsleep-postgres-v1"' <<<"${migration_receipt}" >/dev/null \
  || fail "the PostgreSQL record store migration failed: ${migration_receipt}"

docker run -d \
  --name "${runtime_container}" \
  --platform linux/amd64 \
  --network "${network}" \
  --read-only \
  --cpus 2 --memory 3g --pids-limit 512 \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add SETUID \
  --cap-add SETGID \
  --mount "type=volume,src=${state_volume},dst=/var/lib/nex" \
  --mount "type=volume,src=${credential_volume},dst=/run/moonsleep-load-credentials,readonly" \
  --mount "type=bind,src=$(dirname "${PACKAGE_ARTIFACT}"),dst=/artifacts,readonly" \
  --mount "type=bind,src=${ROOT_DIR}/testdata,dst=/flexport-testdata,readonly" \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
  --tmpfs /run/nex-credentials:rw,nosuid,nodev,noexec,mode=0700 \
  "${NEX_IMAGE}" >/dev/null
wait_for_runtime

echo "[cleanroom] start the fake Flexport API inside the runtime container on 127.0.0.1:${FAKE_PORT}"
docker exec --user "${RUNTIME_USER}" "${runtime_container}" test -r /flexport-testdata/fixtures/flexport.json \
  || fail "uid 20042 cannot read the bind-mounted testdata (make it world-readable)"
docker exec -d --user "${RUNTIME_USER}" "${runtime_container}" \
  sh -c 'exec node /flexport-testdata/fake-flexport.mjs --host 127.0.0.1 --port "$1" > /tmp/fake-flexport.log 2>&1' sh "${FAKE_PORT}"
wait_for_fake_flexport

echo "[cleanroom] upload and install the exact Flexport artifact"
release_id="cleanroom-flexport-${artifact_sha256:0:16}"
operation_id="${release_id}-install"
artifact_name="flexport-${PACKAGE_VERSION}.tar.gz"
upload_response="$(runtime_curl -sS --fail-with-body \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/artifacts/${artifact_name}" \
  "http://127.0.0.1:18789/api/operator/packages/upload?operation_id=${operation_id}&filename=${artifact_name}")" \
  || fail "package upload failed: ${upload_response:-no response}"
jq -e --arg sha256 "${artifact_sha256}" --argjson size "${artifact_size}" '
  .ok == true and .staged_artifact.sha256 == $sha256 and .staged_artifact.size_bytes == $size
' <<<"${upload_response}" >/dev/null || fail "unexpected upload response: ${upload_response}"
install_body="$(jq -nc \
  --arg version "${PACKAGE_VERSION}" \
  --arg release_id "${release_id}" \
  --arg operation_id "${operation_id}" \
  --argjson staged "$(jq -c '.staged_artifact' <<<"${upload_response}")" \
  '{kind:"adapter",package_id:"flexport",version:$version,release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$staged.server_path,sha256:$staged.sha256,size_bytes:$staged.size_bytes}}')"
install_response="$(runtime_post /api/operator/packages/install "${install_body}")" || fail "package install failed: ${install_response:-no response}"
jq -e --arg version "${PACKAGE_VERSION}" '.ok == true and .package_id == "flexport" and .version == $version and .status == "active"' \
  <<<"${install_response}" >/dev/null || fail "unexpected install response: ${install_response}"

package_state="$(runtime_get /api/operator/packages/adapter/flexport)"
jq -e --arg version "${PACKAGE_VERSION}" '.status == "active" and .active_version == $version' <<<"${package_state}" >/dev/null \
  || fail "unexpected package state: ${package_state}"
package_health="$(runtime_get /api/operator/packages/adapter/flexport/health)"
jq -e --arg version "${PACKAGE_VERSION}" '
  .healthy == true and .adapter.name == "flexport-adapter" and .adapter.platform == "flexport" and .adapter.version == $version
' <<<"${package_health}" >/dev/null || fail "unexpected package health: ${package_health}"

echo "[cleanroom] create connection ${CONNECTION_ID} with fake credentials"
create_body="$(jq -nc \
  --arg connection_id "${CONNECTION_ID}" \
  --arg base_url "http://127.0.0.1:${FAKE_PORT}" \
  '{adapter:"flexport",authMethodId:"flexport_client_credentials",connectionId:$connection_id,
    fields:{client_id:"fake-flexport-client-id",client_secret:"fake-flexport-client-secret-not-real",account:"cleanroom"},
    config:{base_url:$base_url,backfill_since:"2001-01-01T00:00:00Z"},automaticActivation:false}')"
create_response="$(runtime_post /runtime/operations/adapters.connections.create "${create_body}")" \
  || fail "adapters.connections.create failed: ${create_response:-no response}"
jq -e --arg id "${CONNECTION_ID}" '
  .ok == true and .payload.status == "connected" and .payload.connectionId == $id and
  .payload.service == "flexport" and .payload.account == "cleanroom"
' <<<"${create_response}" >/dev/null || fail "unexpected connection: ${create_response}"

echo "[cleanroom] run records.backfill through the runtime"
backfill_params="$(jq -nc --arg id "${CONNECTION_ID}" '{connectionId:$id,since:"2001-01-01T00:00:00Z"}')"
backfill_output="$(docker exec -e NEX_CLEANROOM_TOKEN --user "${RUNTIME_USER}" "${runtime_container}" sh -c '
  NEXUS_RUNTIME_TOKEN="${NEX_CLEANROOM_TOKEN}" exec node /opt/nex/nexus.mjs runtime call records.backfill \
    --url ws://127.0.0.1:18789 --token "${NEX_CLEANROOM_TOKEN}" --timeout 600000 --json --params "$1"
' sh "${backfill_params}")" || fail "records.backfill failed: ${backfill_output:-no output}"
backfill_result="$(sed -n '/^{/,$p' <<<"${backfill_output}" | jq -c '.')" || fail "records.backfill printed no JSON: ${backfill_output}"
jq -e '.processed == 2 and .failed == 0' <<<"${backfill_result}" >/dev/null \
  || fail "records.backfill did not ingest exactly two Records: ${backfill_result}"

echo "[cleanroom] read the Records back with records.scan"
scan_body="$(jq -nc --arg id "${CONNECTION_ID}" '{platform:"flexport",connection_id:$id,after_scan_sequence:0,limit:100}')"
scan_response="$(runtime_post /runtime/operations/records.scan "${scan_body}")" || fail "records.scan failed: ${scan_response:-no response}"
jq -e '.ok == true and (.payload.records | length) == 2' <<<"${scan_response}" >/dev/null \
  || fail "records.scan did not return exactly two flexport Records: ${scan_response}"
shipment_record="$(jq -c '[.payload.records[] | select(.source_record_type == "flexport_shipment_bundle")]' <<<"${scan_response}")"
network_record="$(jq -c '[.payload.records[] | select(.source_record_type == "flexport_network")]' <<<"${scan_response}")"
jq -e --arg sha256 "${document_sha256}" --argjson size "${document_size}" '
  length == 1 and .[0].provider_record_id == "shipment:1234567" and
  (.[0].provider_version_ref | startswith("bundle:sha256:")) and
  (.[0].attachments | length) == 1 and
  .[0].attachments[0].id == "document:D1" and
  .[0].attachments[0].content_hash == $sha256 and
  .[0].attachments[0].size == $size and
  ((.[0].payload.attachments[0].source_url // "") | startswith("nex-artifact:")) and
  .[0].payload.attachments[0].content_sha256 == $sha256 and
  .[0].payload.source_metadata.provider_payload.contract == "moonsleep.flexport_shipment_bundle.v1"
' <<<"${shipment_record}" >/dev/null || fail "unexpected shipment bundle Record: ${shipment_record}"
jq -e '
  length == 1 and .[0].provider_record_id == "network:me" and
  .[0].payload.source_metadata.provider_payload.contract == "moonsleep.flexport_network.v1"
' <<<"${network_record}" >/dev/null || fail "unexpected network Record: ${network_record}"

bundle_json_sha256="$(jq -j '.[0].payload.source_metadata.provider_payload.provider_object_json' <<<"${shipment_record}" | sha256_of_stdin)"
[[ "${bundle_json_sha256}" == "$(jq -r '.[0].payload.source_metadata.provider_payload.provider_object_sha256' <<<"${shipment_record}")" ]] \
  || fail "provider_object_sha256 does not match provider_object_json"
jq -e '
  .[0].payload.source_metadata.provider_payload.provider_object_json | fromjson |
  (keys == ["containers","customs_entries","documents","invoices","legs","shipment"]) and
  .shipment.id == 1234567 and ([.legs[].id] == [21,22]) and ([.documents[].id] == ["D1","D3"])
' <<<"${shipment_record}" >/dev/null || fail "the shipment bundle is not the reader's six-key shape for 1234567"

echo "[cleanroom] check the method catalog and the status method"
methods_response="$(runtime_post /runtime/operations/adapters.methods '{"id":"flexport"}')" || fail "adapters.methods failed: ${methods_response:-no response}"
jq -e --argjson expected "${EXPECTED_METHODS}" '
  .ok == true and ([.payload.methods[].name] | sort) == $expected and
  ([.payload.methods[] | select(.action == "write") | .name] | sort) ==
    ["flexport.bookings.create","flexport.documents.create","flexport.products.create","flexport.products.update"] and
  ([.payload.methods[] | select(.mutates_remote == true) | .name] | length) == 4
' <<<"${methods_response}" >/dev/null || fail "unexpected method catalog: ${methods_response}"
status_body="$(jq -nc --arg id "${CONNECTION_ID}" '{connection_id:$id,payload:{}}')"
status_response="$(runtime_post /runtime/operations/flexport.status "${status_body}")" || fail "flexport.status failed: ${status_response:-no response}"
jq -e '.ok == true and .payload.automatic_writes == false and .payload.token_requests_24h == 1' <<<"${status_response}" >/dev/null \
  || fail "unexpected flexport.status: ${status_response}"

echo "[cleanroom] send a flexport.documents.create over 200 KiB to the fake through the runtime"
# The request is built inside the container into a 0600 file in its /tmp tmpfs and sent with
# --data @file: the body is never on a command line. Over 64 KiB the runtime hands the adapter a
# --payload-file because adapter.info says supports_payload_file; inline, the spawn would fail
# with E2BIG on this Linux runtime.
document_request="$(runtime_exec node -e '
  const { createHash, randomBytes } = require("node:crypto");
  const { writeFileSync } = require("node:fs");
  const body = JSON.stringify({
    shipment_id: "1234567",
    document_type: "commercial_invoice",
    file_name: "CI-cleanroom.pdf",
    file: randomBytes(160 * 1024).toString("base64"),
  });
  const sha256 = createHash("sha256").update(body).digest("hex");
  const request = {
    connection_id: process.argv[1],
    payload: { body_json: body, body_sha256: sha256, go: "cleanroom: fake document upload", confirm: "SEND_TO_FLEXPORT" },
    timeout_ms: 120000,
  };
  writeFileSync("/tmp/cleanroom-document-request.json", JSON.stringify(request), { mode: 0o600 });
  process.stdout.write(JSON.stringify({ body_bytes: Buffer.byteLength(body), body_sha256: sha256 }));
' "${CONNECTION_ID}")" || fail "could not build the document request"
document_body_sha256="$(jq -er '.body_sha256' <<<"${document_request}")"
document_body_bytes="$(jq -er '.body_bytes' <<<"${document_request}")"
(( document_body_bytes > 200 * 1024 )) || fail "the document body is not over 200 KiB: ${document_body_bytes}"
document_response="$(runtime_curl -sS --fail-with-body -H "Content-Type: application/json" \
  --data @/tmp/cleanroom-document-request.json \
  "http://127.0.0.1:18789/runtime/operations/flexport.documents.create")" \
  || fail "flexport.documents.create failed: ${document_response:-no response}"
jq -e '.ok == true and .payload.status == "sent" and .payload.path == "/documents" and .payload.flexport_id == "DOC-2001"' \
  <<<"${document_response}" >/dev/null || fail "unexpected flexport.documents.create result: ${document_response}"

fake_stats="$(runtime_exec curl -fsS "http://127.0.0.1:${FAKE_PORT}/__fake/stats")"
jq -e '.token_requests == 1 and .downloads.D1 == 1 and (.downloads.D3 // 0) == 0 and (.downloads.D9 // 0) == 0' <<<"${fake_stats}" >/dev/null \
  || fail "unexpected fake Flexport traffic: ${fake_stats}"
jq -e --arg sha256 "${document_body_sha256}" --argjson bytes "${document_body_bytes}" '
  (.writes | length) == 1 and .writes[0].method == "POST" and .writes[0].path == "/documents" and
  .writes[0].sha256 == $sha256 and .writes[0].bytes == $bytes
' <<<"${fake_stats}" >/dev/null || fail "the fake did not receive the document body byte for byte: ${fake_stats}"

mkdir -p "$(dirname "${RECEIPT_PATH}")"
(
  umask 077
  jq -n \
    --arg source_revision "${source_revision}" \
    --arg source_tree "${source_tree}" \
    --arg nex_revision "${nex_revision}" \
    --arg postgres_version "${postgres_version}" \
    --arg package_version "${PACKAGE_VERSION}" \
    --arg artifact_sha256 "${artifact_sha256}" \
    --argjson artifact_size_bytes "${artifact_size}" \
    --arg connection_id "${CONNECTION_ID}" \
    --argjson backfill "${backfill_result}" \
    --argjson shipment "$(jq -c '.[0] | {id, provider_record_id, provider_version_ref, payload_sha256, attachments: [.attachments[] | {id, content_hash, size}]}' <<<"${shipment_record}")" \
    --argjson network_record "$(jq -c '.[0] | {id, provider_record_id, provider_version_ref, payload_sha256}' <<<"${network_record}")" \
    --argjson methods "$(jq -c '[.payload.methods[] | {name, action, mutates_remote, connection_required}] | sort_by(.name)' <<<"${methods_response}")" \
    --argjson document_write "$(jq -c '{method:"flexport.documents.create", body_bytes, body_sha256, delivered_to:"fake_flexport"}' <<<"${document_request}")" \
    --argjson fake_flexport "${fake_stats}" \
    '{
      contract:"nex_flexport_runtime_cleanroom_v1",
      source_revision:$source_revision,
      source_tree:$source_tree,
      nex_revision:$nex_revision,
      postgres_version:$postgres_version,
      package:{id:"flexport",version:$package_version,artifact_sha256:$artifact_sha256,artifact_size_bytes:$artifact_size_bytes},
      install:"active",
      connection:{id:$connection_id,service:"flexport",account:"cleanroom",automatic_activation:false},
      backfill:$backfill,
      records:{shipment_bundle:$shipment,network:$network_record},
      methods:$methods,
      large_document_write:$document_write,
      fake_flexport:$fake_flexport,
      isolation:{docker_network:"internal",published_ports:false,host_network:false},
      authorities:{
        api_flexport_com_called:false,
        provider_write:false,
        production_runtime_touched:false,
        credential_disclosure:false
      }
    }' > "${RECEIPT_PATH}.tmp"
)
mv -f "${RECEIPT_PATH}.tmp" "${RECEIPT_PATH}"
receipt_sha256="$(sha256_of "${RECEIPT_PATH}")"
echo "Flexport runtime cleanroom PASS"
echo "receipt=${RECEIPT_PATH}"
echo "receipt_sha256=${receipt_sha256}"
