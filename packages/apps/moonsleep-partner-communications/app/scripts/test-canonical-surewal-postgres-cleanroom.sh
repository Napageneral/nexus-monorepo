#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
UMBRELLA_ROOT="$(cd "${ROOT_DIR}/../../../.." && pwd -P)"
NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
POSTGRES_IMAGE="${POSTGRES_RELEASE_IMAGE:?set POSTGRES_RELEASE_IMAGE to a Linux/AMD64 PostgreSQL 17 image}"
RECEIPT_PATH="${CLEANROOM_RECEIPT_PATH:-/private/tmp/moonsleep-partner-canonical-surewal-pg17-receipt.json}"
FAILURE_STATE_PATH="${RECEIPT_PATH}.failure-state-stat.txt"
APP_VERSION="$(jq -r '.version' "${ROOT_DIR}/app.nexus.json")"
CORE_REVISION="$(jq -r '.governing_core.commit' "${ROOT_DIR}/contracts/partner-canonical-profiles.v1.json")"
CORE_TREE="$(jq -r '.governing_core.tree' "${ROOT_DIR}/contracts/partner-canonical-profiles.v1.json")"
APP_ARTIFACT="${ROOT_DIR}/dist/moonsleep-partner-desk-${APP_VERSION}.tar.gz"

for command_name in docker jq node openssl shasum; do
  command -v "${command_name}" >/dev/null || {
    echo "required command is unavailable: ${command_name}" >&2
    exit 1
  }
done
[[ -f "${APP_ARTIFACT}" && ! -L "${APP_ARTIFACT}" ]] || {
  echo "exact Partner Desk package release is missing" >&2
  exit 1
}
[[ -z "$(git -C "${UMBRELLA_ROOT}" status --porcelain=v1 --untracked-files=all)" ]] || {
  echo "cleanroom source worktree must be clean" >&2
  exit 1
}
[[ "$(git -C "${UMBRELLA_ROOT}/nex" rev-parse HEAD)" = "${CORE_REVISION}" ]] || {
  echo "nested Nex source is not the governed terminal core" >&2
  exit 1
}
[[ "$(git -C "${UMBRELLA_ROOT}/nex" rev-parse 'HEAD^{tree}')" = "${CORE_TREE}" ]] || {
  echo "nested Nex tree is not the governed terminal tree" >&2
  exit 1
}

docker image inspect "${NEX_IMAGE}" "${POSTGRES_IMAGE}" >/dev/null
[[ "$(docker image inspect "${NEX_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]]
[[ "$(docker image inspect "${POSTGRES_IMAGE}" --format '{{.Os}}/{{.Architecture}}')" = "linux/amd64" ]]
nex_config_user="$(docker image inspect "${NEX_IMAGE}" --format '{{.Config.User}}')"
nex_entrypoint="$(docker image inspect "${NEX_IMAGE}" --format '{{json .Config.Entrypoint}}')"
[[ -z "${nex_config_user}" ]]
[[ "${nex_entrypoint}" = '["/usr/local/bin/moonsleep-nex-entrypoint"]' ]]
runtime_passwd="$(docker run --rm --platform linux/amd64 --network none --read-only \
  --entrypoint getent "${NEX_IMAGE}" passwd nex-moonsleep)"
IFS=: read -r runtime_user _runtime_password runtime_uid runtime_gid _runtime_gecos \
  runtime_home runtime_shell <<<"${runtime_passwd}"
[[ "${runtime_user}" = "nex-moonsleep" ]]
[[ "${runtime_uid}" =~ ^[1-9][0-9]*$ ]]
[[ "${runtime_gid}" =~ ^[1-9][0-9]*$ ]]
[[ "${runtime_home}" = "/var/lib/nex" ]]
[[ "${runtime_shell}" = "/usr/sbin/nologin" ]]
nex_revision="$(docker image inspect "${NEX_IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "${nex_revision}" = "${CORE_REVISION}" ]] || {
  echo "Nex image revision does not match the terminal core" >&2
  exit 1
}

source_revision="$(git -C "${UMBRELLA_ROOT}" rev-parse HEAD)"
source_tree="$(git -C "${UMBRELLA_ROOT}" rev-parse 'HEAD^{tree}')"
app_sha256="$(shasum -a 256 "${APP_ARTIFACT}" | awk '{print $1}')"
suffix="${PPID}-$$"
network="nex-partner-canonical-${suffix}"
postgres_container="${network}-postgres"
runtime_container="${network}-runtime"
postgres_volume="${network}-postgres"
state_volume="${network}-state"
credential_volume="${network}-credentials"
runtime_role="nex_moonsleep_runtime"
migrator_role="nex_moonsleep_migrator"
runner_temp="$(mktemp -d /private/tmp/nex-partner-canonical.XXXXXX)"
chmod 0700 "${runner_temp}"
[[ ! -L "${FAILURE_STATE_PATH}" ]]
rm -f -- "${FAILURE_STATE_PATH}"

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

runtime_call() {
  local method="$1" params="${2:-{}}"
  docker exec "${runtime_container}" sh -c '
    set -eu
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    runtime_uid="$1"
    runtime_gid="$2"
    method="$3"
    params="$4"
    export NEXUS_RUNTIME_TOKEN="$token"
    exec setpriv \
      --reuid="$runtime_uid" --regid="$runtime_gid" --clear-groups --no-new-privs \
      /opt/nex/nexus.mjs runtime call "$method" --params "$params" --json \
      --timeout 60000
  ' sh "${runtime_uid}" "${runtime_gid}" "${method}" "${params}"
}

prove_joined_evidence() {
  docker exec "${runtime_container}" sh -c '
    set -eu
    runtime_uid="$1"
    runtime_gid="$2"
    staged_dir="$(mktemp -d /tmp/partner-joined-evidence.XXXXXX)"
    cp /evidence/revision-bindings.json "${staged_dir}/revision-bindings.json"
    cp /run/moonsleep-load-credentials/runtime-token "${staged_dir}/runtime-token"
    chmod 0700 "${staged_dir}"
    chmod 0600 "${staged_dir}/revision-bindings.json"
    chmod 0400 "${staged_dir}/runtime-token"
    chown -R "${runtime_uid}:${runtime_gid}" "${staged_dir}"
    exec setpriv \
      --reuid="$runtime_uid" --regid="$runtime_gid" --clear-groups --no-new-privs \
      sh -c '\''
        set -eu
        staged_dir="$1"
        trap '\''"'\''"'\''rm -rf -- "$staged_dir"'\''"'\''"'\'' EXIT
        node /proof/prove-canonical-joined-evidence.mjs \
          --bindings "${staged_dir}/revision-bindings.json" \
          --token_file "${staged_dir}/runtime-token"
      '\'' sh "${staged_dir}"
  ' sh "${runtime_uid}" "${runtime_gid}"
}

wait_for_postgres() {
  local consecutive=0
  for _attempt in $(seq 1 90); do
    if docker exec "${postgres_container}" psql -X -U postgres -d moonsleep_nex -Atqc 'SELECT 1' >/dev/null 2>&1; then
      consecutive=$((consecutive + 1))
      [[ "${consecutive}" -ge 3 ]] && return 0
    else
      consecutive=0
    fi
    sleep 1
  done
  docker logs "${postgres_container}" >&2 || true
  return 1
}

capture_runtime_state_failure() {
  local temporary="${FAILURE_STATE_PATH}.tmp.$$"
  umask 077
  {
    printf 'image_id=%s\n' "$(docker image inspect "${NEX_IMAGE}" --format '{{.Id}}')"
    printf 'image_user=%s\n' "${nex_config_user}"
    printf 'image_entrypoint=%s\n' "${nex_entrypoint}"
    printf 'serving_identity=%s:%s:%s\n' "${runtime_user}" "${runtime_uid}" "${runtime_gid}"
    printf 'container_state=%s\n' \
      "$(docker inspect "${runtime_container}" --format '{{json .State}}' 2>/dev/null || printf unavailable)"
    docker run --rm --platform linux/amd64 --network none --read-only --user 0:0 \
      --mount "type=volume,src=${state_volume},dst=/var/lib/nex,readonly" \
      --entrypoint sh "${NEX_IMAGE}" -c '
        for path in /var/lib/nex /var/lib/nex/state /var/lib/nex/state/data /var/lib/nex/state/config.json; do
          if [ -e "$path" ] || [ -L "$path" ]; then
            stat -c "path=%n type=%F uid=%u gid=%g mode=%a links=%h inode=%i device=%d size=%s" "$path"
          else
            printf "path=%s missing=true\n" "$path"
          fi
        done
      ' 2>&1 || true
  } > "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${FAILURE_STATE_PATH}"
}

wait_for_runtime() {
  for _attempt in $(seq 1 90); do
    local state
    state="$(docker inspect "${runtime_container}" --format '{{.State.Status}}' 2>/dev/null || true)"
    if [[ -n "${state}" && "${state}" != "created" && "${state}" != "running" ]]; then
      capture_runtime_state_failure
      docker logs "${runtime_container}" >&2 || true
      return 1
    fi
    if docker exec "${runtime_container}" sh -c '
      token=$(cat /run/moonsleep-load-credentials/runtime-token)
      curl -fsS -H "Authorization: Bearer ${token}" \
        http://127.0.0.1:18789/health >/dev/null
    ' 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  capture_runtime_state_failure
  docker logs "${runtime_container}" >&2 || true
  return 1
}

install_app() {
  local release_id="cleanroom-partner-${app_sha256:0:16}"
  local operation_id="${release_id}-install"
  local staged_path="/var/lib/nex/state/packages/staging/${operation_id}/artifact.tar.gz"
  local size_bytes body response
  size_bytes="$(LC_ALL=C wc -c < "${APP_ARTIFACT}" | tr -d '[:space:]')"
  docker exec --user "${runtime_uid}:${runtime_gid}" "${runtime_container}" sh -c '
    set -eu
    install -d -m 0700 "$(dirname "$2")"
    cp "$1" "$2"
    chmod 0600 "$2"
  ' sh "/artifacts/moonsleep-partner-desk-${APP_VERSION}.tar.gz" "${staged_path}"
  body="$(jq -nc \
    --arg package_id "moonsleep-partner-desk" \
    --arg version "${APP_VERSION}" \
    --arg release_id "${release_id}" \
    --arg operation_id "${operation_id}" \
    --arg server_path "${staged_path}" \
    --arg sha256 "${app_sha256}" \
    --argjson size_bytes "${size_bytes}" \
    '{kind:"app",package_id:$package_id,version:$version,release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$server_path,sha256:$sha256,size_bytes:$size_bytes}}')"
  response="$(docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec curl -sS -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
      --data "$1" http://127.0.0.1:18789/api/operator/packages/install
  ' sh "${body}")"
  jq -e '.ok == true and .package_id == "moonsleep-partner-desk" and .status == "active"' \
    <<<"${response}" >/dev/null
}

postgres_counts() {
  docker exec -u postgres "${postgres_container}" psql -X -d moonsleep_nex -Atqc \
    "SELECT json_build_object(
      'records',(SELECT COUNT(*) FROM nex_runtime.records),
      'revisions',(SELECT COUNT(*) FROM nex_runtime.record_revisions),
      'receipts',(SELECT COUNT(*) FROM nex_runtime.record_ingest_receipts),
      'events',(SELECT COUNT(*) FROM nex_runtime.durable_events),
      'entities',(SELECT COUNT(*) FROM nex_runtime.entities),
      'contacts',(SELECT COUNT(*) FROM nex_runtime.contacts),
      'contact_observations',(SELECT COUNT(*) FROM nex_runtime.contact_observations),
      'queue',(SELECT COUNT(*) FROM nex_runtime.job_queue),
      'dispatch_receipts',(SELECT COUNT(*) FROM nex_runtime.event_dispatch_receipts),
      'adapter_instances',(SELECT COUNT(*) FROM nex_runtime.adapter_instances))"
}

memory_counts() {
  docker exec --user "${runtime_uid}:${runtime_gid}" "${runtime_container}" node --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync("/var/lib/nex/state/data/memory.db", { readOnly: true });
    const count = (table, where = "") =>
      Number(db.prepare(`SELECT COUNT(*) value FROM ${table} ${where}`).get().value);
    const value = {
      profiles: count("element_profiles"),
      fact_profiles: count("element_profiles", "WHERE element_type = '\''fact'\''"),
      observation_profiles: count("element_profiles", "WHERE element_type = '\''observation'\''"),
      facts: count("elements", "WHERE type = '\''fact'\''"),
      observations: count("elements", "WHERE type = '\''observation'\''"),
      fact_receipts: count("fact_creation_receipts"),
      sets: count("sets"),
      set_members: count("set_members"),
      set_seals: count("set_seals"),
      candidates: count("observation_candidates"),
      candidate_dispositions: count("observation_candidate_fact_dispositions"),
      promotions: count("observation_promotion_receipts"),
      heads: count("canonical_observation_heads"),
      outbox: count("projection_outbox"),
      outbox_delivered: count("projection_outbox", "WHERE status = '\''delivered'\''"),
    };
    db.close();
    process.stdout.write(JSON.stringify(value));
  '
}

checks=()
pass_check() {
  checks+=("$1")
}

echo "[partner-canonical] build deterministic provider-free synthetic records"
node --experimental-strip-types "${ROOT_DIR}/scripts/build-synthetic-surewal-records.mjs" \
  --fixture "${ROOT_DIR}/fixtures/canonical/surewal-cross-channel-golden.v1.json" \
  --out "${runner_temp}/records-first.jsonl" > "${runner_temp}/records-first-receipt.json"
node --experimental-strip-types "${ROOT_DIR}/scripts/build-synthetic-surewal-records.mjs" \
  --fixture "${ROOT_DIR}/fixtures/canonical/surewal-cross-channel-golden.v1.json" \
  --out "${runner_temp}/records-second.jsonl" > "${runner_temp}/records-second-receipt.json"
cmp "${runner_temp}/records-first.jsonl" "${runner_temp}/records-second.jsonl"
jq -e '.record_count == 6 and .alibaba_record_count == 5 and .gmail_record_count == 1 and .provider_calls == 0 and .provider_write_authority == false' \
  "${runner_temp}/records-first-receipt.json" >/dev/null
record_output_sha256="$(shasum -a 256 "${runner_temp}/records-first.jsonl" | awk '{print $1}')"
pass_check "01_source_exact"

echo "[partner-canonical] create isolated PostgreSQL 17 and terminal-core runtime"
docker network create --internal "${network}" >/dev/null
docker volume create "${postgres_volume}" >/dev/null
docker volume create "${state_volume}" >/dev/null
docker volume create "${credential_volume}" >/dev/null
runtime_token="nex_rt_$(openssl rand -hex 24)"
postgres_dsn="postgresql://${runtime_role}@postgres:5432/moonsleep_nex"

state_volume_bootstrap="$(docker run --rm --platform linux/amd64 \
  --network none --read-only --security-opt no-new-privileges \
  --user 0:0 --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE \
  --mount "type=volume,src=${state_volume},dst=/target" \
  --entrypoint sh "${NEX_IMAGE}" -c '
    set -eu
    runtime_uid="$1"
    runtime_gid="$2"
    test "$(id -u):$(id -g)" = "0:0"
    test -d /target
    test ! -L /target
    test -z "$(find /target -mindepth 1 -maxdepth 1 -print -quit)"
    install -d -m 0700 -o "$runtime_uid" -g "$runtime_gid" \
      /target/state /target/state/data
    chmod 0700 /target
    chown "$runtime_uid:$runtime_gid" /target
    test "$(stat -c "%u:%g:%a" /target)" = "$runtime_uid:$runtime_gid:700"
    test "$(stat -c "%u:%g:%a" /target/state)" = "$runtime_uid:$runtime_gid:700"
    test "$(stat -c "%u:%g:%a" /target/state/data)" = "$runtime_uid:$runtime_gid:700"
    test ! -e /target/state/config.json
    test ! -L /target/state/config.json
    test "$(find /target -mindepth 1 -maxdepth 1 -printf "%f\n")" = "state"
    test "$(find /target/state -mindepth 1 -maxdepth 1 -printf "%f\n")" = "data"
    printf "{\"uid\":%s,\"gid\":%s,\"state\":\"/var/lib/nex/state\",\"data\":\"/var/lib/nex/state/data\",\"config_precreated\":false}\n" \
      "$runtime_uid" "$runtime_gid"
  ' sh "${runtime_uid}" "${runtime_gid}")"
jq -e \
  --argjson uid "${runtime_uid}" \
  --argjson gid "${runtime_gid}" \
  '.uid == $uid and .gid == $gid and
   .state == "/var/lib/nex/state" and
   .data == "/var/lib/nex/state/data" and
   .config_precreated == false' \
  <<<"${state_volume_bootstrap}" >/dev/null

docker run --rm --platform linux/amd64 --network none --read-only --user 0:0 \
  --env "POSTGRES_DSN=${postgres_dsn}" --env "RUNTIME_TOKEN=${runtime_token}" \
  --mount "type=volume,src=${credential_volume},dst=/target" --entrypoint sh "${NEX_IMAGE}" -c '
    set -eu
    umask 077
    chmod 0750 /target
    printf "%s\n" "$POSTGRES_DSN" > /target/postgres-dsn
    printf "%s\n" "$RUNTIME_TOKEN" > /target/runtime-token
    printf "%s\n" "owner:" "  name: Tyler" "assistant:" "  name: MoonSleep Ops" "operators:" "  - name: Casey" > /target/bootstrap-seed.yaml
    chown root:root /target/*
    chmod 0400 /target/*
  '
docker run -d --name "${postgres_container}" --platform linux/amd64 \
  --network "${network}" --network-alias postgres \
  --security-opt no-new-privileges \
  --env POSTGRES_DB=moonsleep_nex --env POSTGRES_HOST_AUTH_METHOD=trust \
  --mount "type=volume,src=${postgres_volume},dst=/var/lib/postgresql/data" \
  --tmpfs /run/postgresql:rw,nosuid,nodev,noexec,mode=0775 \
  "${POSTGRES_IMAGE}" >/dev/null
wait_for_postgres
postgres_version="$(docker exec -u postgres "${postgres_container}" \
  psql -X -d moonsleep_nex -Atqc 'SHOW server_version')"
[[ "${postgres_version}" == 17.* ]]
pass_check "02_postgres_17"
docker exec -i "${postgres_container}" psql -X -U postgres -d moonsleep_nex \
  -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE ROLE ${migrator_role} LOGIN;
CREATE ROLE ${runtime_role} LOGIN;
GRANT CONNECT, CREATE ON DATABASE moonsleep_nex TO ${migrator_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${runtime_role};
SQL
migration_receipt="$(docker run --rm --platform linux/amd64 --network "${network}" \
  --read-only --security-opt no-new-privileges \
  --env NEXUS_RUNTIME_STORAGE_PROFILE=moonsleep-postgres-v1 \
  --env NEXUS_POSTGRES_MIGRATOR_CONNECTION_ENV=CLEANROOM_MIGRATOR_DATABASE_URL \
  --env "CLEANROOM_MIGRATOR_DATABASE_URL=postgresql://${migrator_role}@postgres/moonsleep_nex" \
  --env "NEXUS_POSTGRES_RECORDS_RUNTIME_ROLE=${runtime_role}" \
  --env NEXUS_POSTGRES_RECORDS_SCHEMA=nex_runtime \
  --entrypoint node "${NEX_IMAGE}" /opt/nex/dist/postgres-record-store-migrate.js)"
jq -e '.ok == true and .storage_profile == "moonsleep-postgres-v1"' \
  <<<"${migration_receipt}" >/dev/null
pass_check "03_postgres_migration"

docker run -d --name "${runtime_container}" --platform linux/amd64 \
  --network "${network}" --read-only --security-opt no-new-privileges \
  --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID \
  --mount "type=volume,src=${state_volume},dst=/var/lib/nex" \
  --mount "type=volume,src=${credential_volume},dst=/run/moonsleep-load-credentials,readonly" \
  --mount "type=bind,src=$(dirname "${APP_ARTIFACT}"),dst=/artifacts,readonly" \
  --mount "type=bind,src=${runner_temp},dst=/evidence" \
  --mount "type=bind,src=${ROOT_DIR}/scripts,dst=/proof,readonly" \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
  --tmpfs /run/nex-credentials:rw,nosuid,nodev,noexec,mode=0700 \
  "${NEX_IMAGE}" >/dev/null
wait_for_runtime
runtime_state_contract="$(docker exec --user "${runtime_uid}:${runtime_gid}" \
  "${runtime_container}" sh -c '
    set -eu
    expected_identity="$1:$2"
    test "$(id -u):$(id -g)" = "$expected_identity"
    test "$(id -un)" = "nex-moonsleep"
    test "$(stat -c "%u:%g:%a" /var/lib/nex)" = "$expected_identity:700"
    test "$(stat -c "%u:%g:%a" /var/lib/nex/state)" = "$expected_identity:700"
    test "$(stat -c "%u:%g:%a" /var/lib/nex/state/data)" = "$expected_identity:700"
    test "$(stat -c "%u:%g:%a" /var/lib/nex/state/config.json)" = "$expected_identity:600"
    probe="/var/lib/nex/state/data/.partner-cleanroom-write-probe"
    (umask 077; : > "$probe")
    test "$(stat -c "%u:%g:%a" "$probe")" = "$expected_identity:600"
    rm "$probe"
    printf "{\"user\":\"%s\",\"uid\":%s,\"gid\":%s,\"mount\":\"/var/lib/nex\",\"state\":\"/var/lib/nex/state\",\"data\":\"/var/lib/nex/state/data\"}\\n" \
      "$(id -un)" "$(id -u)" "$(id -g)"
  ' sh "${runtime_uid}" "${runtime_gid}")"
jq -e \
  --arg user "${runtime_user}" \
  --argjson uid "${runtime_uid}" \
  --argjson gid "${runtime_gid}" \
  '.user == $user and .uid == $uid and .gid == $gid and
   .mount == "/var/lib/nex" and .state == "/var/lib/nex/state" and
   .data == "/var/lib/nex/state/data"' \
  <<<"${runtime_state_contract}" >/dev/null
pass_check "04_runtime_health"
install_app
pass_check "05_app_install"

health_before="$(runtime_call moonsleep-partner-desk.healthcheck '{}')"
jq -e '
  .status == "ok" and
  .continuous_projection == "dormant_pending_backfill_parity_and_activation_receipt" and
  .provider_write_authority == false and
  .reply_authority == false and
  .canonical_evidence.fact_profiles_registered == 5 and
  .canonical_evidence.observation_profiles_registered == 3 and
  .canonical_evidence.set_profiles_registered_in_package == 3 and
  .canonical_evidence.registration_complete == true and
  .canonical_evidence.canonical_promotion_enabled == false
' <<<"${health_before}" >/dev/null
pass_check "06_five_fact_profiles"
pass_check "07_three_observation_profiles"
pass_check "08_three_set_profiles"
jobs_before="$(runtime_call jobs.list '{}')"
subscriptions_before="$(runtime_call events.subscriptions.list '{}')"
jq -e '(.jobs | length) == 1 and .jobs[0].status == "inactive"' \
  <<<"${jobs_before}" >/dev/null
pass_check "09_job_inactive"
jq -e '(.subscriptions | length) == 2 and all(.subscriptions[]; .enabled == 0)' \
  <<<"${subscriptions_before}" >/dev/null
pass_check "10_subscriptions_disabled"

initial_counts="$(postgres_counts)"
jq -e '.records == 0 and .receipts == 0 and .events == 0 and .entities == 3 and .contacts == 0 and .queue == 0 and .dispatch_receipts == 0 and .adapter_instances == 0' \
  <<<"${initial_counts}" >/dev/null
pass_check "11_zero_provider_adapter_state"

seed_params='{"platform":"alibaba","space_id":"alibaba-moonsleep-fixture","contact_id":"surewal-rebecca-fixture","source_observation_id":"partner-canonical:surewal-fixture:v1","observed_at":1784680000000,"contact_name":"Surewal Rebecca","entity_name":"Surewal","entity_type":"organization","tags":["Partner","Supplier","Alibaba"]}'
seed_first="$(runtime_call contacts.observe "${seed_params}")"
seed_second="$(runtime_call contacts.observe "${seed_params}")"
jq -e '.created_entity == true and .created_contact == true and .replayed == false' \
  <<<"${seed_first}" >/dev/null
pass_check "12_identity_first_observation"
jq -e '.created_entity == false and .created_contact == false and .replayed == true' \
  <<<"${seed_second}" >/dev/null
pass_check "13_identity_replay"
surewal_entity_id="$(jq -r '.canonical_entity_id' <<<"${seed_first}")"
surewal_contact_id="$(jq -r '.contact.id' <<<"${seed_first}")"

jq --arg old_entity "entity-surewal-fixture" --arg new_entity "${surewal_entity_id}" \
  --arg old_contact "contact-rebecca-fixture" --arg new_contact "${surewal_contact_id}" \
  'walk(
    if type == "string" and . == $old_entity then $new_entity
    elif type == "string" and . == $old_contact then $new_contact
    else .
    end
  )' "${ROOT_DIR}/fixtures/canonical/surewal-cross-channel-golden.v1.json" \
  > "${runner_temp}/fixture-bound.json"
node --experimental-strip-types "${ROOT_DIR}/scripts/build-synthetic-surewal-records.mjs" \
  --fixture "${runner_temp}/fixture-bound.json" \
  --out "${runner_temp}/records-bound.jsonl" >/dev/null

ingest_first="$(docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  exec node /proof/ingest-jsonl-cleanroom.mjs /evidence/records-bound.jsonl "$token"
')"
jq -e '.completed == 6 and .skipped == 0 and .other == 0 and .total == 6' \
  <<<"${ingest_first}" >/dev/null
pass_check "14_six_records_ingested"
ingest_second="$(docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  exec node /proof/ingest-jsonl-cleanroom.mjs /evidence/records-bound.jsonl "$token"
')"
jq -e '.completed == 0 and .skipped == 6 and .other == 0 and .total == 6' \
  <<<"${ingest_second}" >/dev/null
pass_check "15_record_replay_zero_duplicate"

jq -c '.records[].source_record_id' "${runner_temp}/fixture-bound.json" |
while IFS= read -r quoted_record_id; do
  record_id="$(jq -r . <<<"${quoted_record_id}")"
  revisions="$(runtime_call records.revisions.list "$(jq -nc --arg record_id "${record_id}" '{record_id:$record_id}')")"
  jq -e '(.revisions | length) == 1 and (.revisions[0].id | length) > 0 and (.revisions[0].payload_sha256 | test("^[0-9a-f]{64}$"))' \
    <<<"${revisions}" >/dev/null
  jq -nc --arg source_record_id "${record_id}" \
    --arg revision_id "$(jq -r '.revisions[0].id' <<<"${revisions}")" \
    --arg payload_sha256 "$(jq -r '.revisions[0].payload_sha256' <<<"${revisions}")" \
    '{source_record_id:$source_record_id,revision_id:$revision_id,payload_sha256:$payload_sha256}'
done | jq -s 'sort_by(.source_record_id)' > "${runner_temp}/revision-bindings.json"
jq -e 'length == 6' "${runner_temp}/revision-bindings.json" >/dev/null
pass_check "16_postgres_revision_binding"

node --experimental-strip-types "${ROOT_DIR}/scripts/build-canonical-runtime-plan.mjs" \
  --manifest "${ROOT_DIR}/contracts/partner-canonical-profiles.v1.json" \
  --fixture "${runner_temp}/fixture-bound.json" \
  --bindings "${runner_temp}/revision-bindings.json" \
  --out "${runner_temp}/runtime-plan.json" > "${runner_temp}/plan-receipt.json"
jq -e '.fact_count == 26 and .observation_candidate_count == 9 and .set_profile_count == 3 and .canonical_promotion_authority == false' \
  "${runner_temp}/plan-receipt.json" >/dev/null
pass_check "17_runtime_plan_exact"

docker exec "${runtime_container}" node /proof/apply-canonical-runtime-plan.mjs \
  --plan /evidence/runtime-plan.json \
  --token_file /run/moonsleep-load-credentials/runtime-token \
  --out /evidence/apply-first.json > "${runner_temp}/apply-first-stdout.json"
jq -e '.fact_created == 26 and .fact_reused == 0 and .set_created == 9 and .set_reused == 0 and .observation_candidate_created == 9 and .observation_candidate_reused == 0 and (.set_profile_counts | length) == 3 and .canonical_promotion_count == 0 and .provider_calls == 0' \
  "${runner_temp}/apply-first.json" >/dev/null
pass_check "18_facts_sets_candidates_first_apply"

counts_after_first="$(postgres_counts)"
memory_after_first="$(memory_counts)"
jq -e '.records == 6 and .revisions == 6 and .receipts == 6 and .events == 6 and .queue == 0 and .dispatch_receipts == 0 and .adapter_instances == 0' \
  <<<"${counts_after_first}" >/dev/null
jq -e '.profiles == 8 and .fact_profiles == 5 and .observation_profiles == 3 and .facts == 26 and .observations == 0 and .fact_receipts == 26 and .sets == 9 and .set_seals == 9 and .candidates == 9 and .promotions == 0 and .heads == 0 and .outbox == 0' \
  <<<"${memory_after_first}" >/dev/null
pass_check "19_core_storage_counts"

docker exec "${runtime_container}" node /proof/apply-canonical-runtime-plan.mjs \
  --plan /evidence/runtime-plan.json \
  --token_file /run/moonsleep-load-credentials/runtime-token \
  --out /evidence/apply-replay.json > "${runner_temp}/apply-replay-stdout.json"
jq -e '.fact_created == 0 and .fact_reused == 26 and .set_created == 0 and .set_reused == 9 and .observation_candidate_created == 0 and .observation_candidate_reused == 9 and .canonical_promotion_count == 0' \
  "${runner_temp}/apply-replay.json" >/dev/null
counts_after_replay="$(postgres_counts)"
memory_after_replay="$(memory_counts)"
[[ "$(jq -S -c . <<<"${counts_after_first}")" = "$(jq -S -c . <<<"${counts_after_replay}")" ]]
[[ "$(jq -S -c . <<<"${memory_after_first}")" = "$(jq -S -c . <<<"${memory_after_replay}")" ]]
pass_check "20_full_replay_zero_duplicate"

jq -e '
  .provider_write == false and
  .identity_merge == false and
  .external_domain_write == false and
  .draft_or_send == false and
  .canonical_promotion == false
' "${runner_temp}/runtime-plan.json" >/dev/null
jq -e '.promotions == 0 and .heads == 0 and .outbox == 0 and .observations == 0' \
  <<<"${memory_after_replay}" >/dev/null
joined_evidence="$(prove_joined_evidence)"
jq -e '
  .ok == true and
  .joined.fact_count == 26 and
  .joined.source_revision_count == 6 and
  .joined.source_reference_count >= 26 and
  .observation_replay_reused == true and
  .stale_head.refused == true and
  .stale_head.receipt_count_unchanged == true and
  .stale_head.outbox_count_unchanged == true and
  .outbox.lease_conflict_refused == true and
  .outbox.status == "delivered" and
  .outbox.reclaimed_after_delivery == 0 and
  .authority.provider_calls == 0 and
  .authority.provider_write == false and
  .authority.identity_merge == false and
  .authority.external_domain_write == false and
  .authority.draft_or_send == false and
  .authority.live_canonical_promotion == false
' <<<"${joined_evidence}" >/dev/null
memory_after_joined="$(memory_counts)"
jq -e '
  .profiles == 8 and
  .fact_profiles == 5 and
  .observation_profiles == 3 and
  .facts == 26 and
  .fact_receipts == 26 and
  .sets == 9 and
  .set_seals == 9 and
  .candidates == 9 and
  .promotions == 0 and
  .observations == 1 and
  .heads == 1 and
  .outbox == 1 and
  .outbox_delivered == 1
' <<<"${memory_after_joined}" >/dev/null
pass_check "21_joined_pg_memory_stale_head_outbox_zero_authority"

docker restart "${runtime_container}" >/dev/null
wait_for_runtime
health_after_restart="$(runtime_call moonsleep-partner-desk.healthcheck '{}')"
jq -e '.status == "ok" and .canonical_evidence.registration_complete == true and .canonical_evidence.canonical_promotion_enabled == false and .provider_write_authority == false and .reply_authority == false' \
  <<<"${health_after_restart}" >/dev/null
[[ "$(jq -S -c . <<<"${counts_after_replay}")" = "$(jq -S -c . <<<"$(postgres_counts)")" ]]
[[ "$(jq -S -c . <<<"${memory_after_joined}")" = "$(jq -S -c . <<<"$(memory_counts)")" ]]
pass_check "22_restart_durability"

[[ "${#checks[@]}" -eq 22 ]]
postgres_image_id="$(docker image inspect "${POSTGRES_IMAGE}" --format '{{.Id}}')"
nex_image_id="$(docker image inspect "${NEX_IMAGE}" --format '{{.Id}}')"
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
checks_json="$(printf '%s\n' "${checks[@]}" | jq -R . | jq -s .)"

cleanup_resources
[[ -z "$(docker ps -a --filter "name=${network}" --format '{{.Names}}')" ]]
[[ -z "$(docker volume ls --filter "name=${network}" --format '{{.Name}}')" ]]
[[ -z "$(docker network ls --filter "name=${network}" --format '{{.Name}}')" ]]

jq -n \
  --arg finished_at "${finished_at}" \
  --arg source_revision "${source_revision}" \
  --arg source_tree "${source_tree}" \
  --arg core_revision "${CORE_REVISION}" \
  --arg core_tree "${CORE_TREE}" \
  --arg nex_image_id "${nex_image_id}" \
  --arg nex_config_user "${nex_config_user}" \
  --arg nex_entrypoint "${nex_entrypoint}" \
  --arg runtime_user "${runtime_user}" \
  --argjson runtime_uid "${runtime_uid}" \
  --argjson runtime_gid "${runtime_gid}" \
  --argjson state_volume_bootstrap "${state_volume_bootstrap}" \
  --arg postgres_image_id "${postgres_image_id}" \
  --arg postgres_version "${postgres_version}" \
  --arg app_version "${APP_VERSION}" \
  --arg app_sha256 "${app_sha256}" \
  --arg record_output_sha256 "${record_output_sha256}" \
  --arg surewal_entity_id "${surewal_entity_id}" \
  --arg surewal_contact_id "${surewal_contact_id}" \
  --argjson joined_evidence "${joined_evidence}" \
  --argjson checks "${checks_json}" \
  --argjson postgres_counts "${counts_after_replay}" \
  --argjson memory_counts "${memory_after_joined}" \
  '{
    ok:true,
    proof:"moonsleep-partner-canonical-surewal-postgres-cleanroom-v1",
    finished_at:$finished_at,
    source:{revision:$source_revision,tree:$source_tree,clean:true},
    core:{
      revision:$core_revision,
      tree:$core_tree,
      image_id:$nex_image_id,
      platform:"linux/amd64",
      image_config_user:$nex_config_user,
      image_entrypoint:$nex_entrypoint,
      serving_identity:{user:$runtime_user,uid:$runtime_uid,gid:$runtime_gid},
      state_mount:"/var/lib/nex",
      state_dir:"/var/lib/nex/state",
      data_dir:"/var/lib/nex/state/data",
      state_volume_bootstrap:$state_volume_bootstrap
    },
    postgres:{version:$postgres_version,image_id:$postgres_image_id,platform:"linux/amd64"},
    package:{id:"moonsleep-partner-desk",version:$app_version,sha256:$app_sha256},
    synthetic_cohort:{records:6,alibaba_records:5,gmail_records:1,record_output_sha256:$record_output_sha256,provider_calls:0},
    identity:{entity_id:$surewal_entity_id,contact_id:$surewal_contact_id,first_created:true,replay_created:false},
    canonical_evidence:{
      fact_profiles:5,
      observation_profiles:3,
      set_profiles:3,
      facts:26,
      staged_candidates:9,
      promotions:0,
      synthetic_joined_core_seam_observations:1,
      synthetic_joined_core_seam_projection_events:1,
      joined_proof:$joined_evidence
    },
    work_boundary:{job_status:"inactive",subscriptions:2,subscriptions_enabled:false},
    authority:{provider_write:false,identity_merge:false,external_domain_write:false,draft_or_send:false,canonical_promotion:false,live_canonical_promotion:false},
    replay:{records_reused:6,facts_reused:26,sets_reused:9,candidates_reused:9,counts_unchanged:true},
    postgres_counts:$postgres_counts,
    memory_counts:$memory_counts,
    checks:{passed:22,total:22,items:$checks},
    zero_residue:true
  }' > "${RECEIPT_PATH}"
chmod 0600 "${RECEIPT_PATH}"
trap - EXIT
rm -rf -- "${runner_temp}"
echo "[partner-canonical] PASS 22/22 receipt=${RECEIPT_PATH}"
