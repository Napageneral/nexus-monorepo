#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UMBRELLA_ROOT="$(cd "${ROOT_DIR}/../../../.." && pwd)"
ADAPTER_ROOT="${UMBRELLA_ROOT}/packages/adapters/alibaba"
NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
POSTGRES_IMAGE="${POSTGRES_RELEASE_IMAGE:?set POSTGRES_RELEASE_IMAGE to a Linux/AMD64 PostgreSQL 17 image}"
SNAPSHOT_ROOT="${ALIBABA_SNAPSHOT_ROOT:?set ALIBABA_SNAPSHOT_ROOT to the sealed Surewal snapshot root}"
OBJECT_ROOT="${ALIBABA_OBJECT_ROOT:?set ALIBABA_OBJECT_ROOT to the sealed attachment object root}"
CONTEXT_PATH="${ALIBABA_CONTEXT_PATH:?set ALIBABA_CONTEXT_PATH to the exact adapter context JSON}"
RECEIPT_PATH="${CLEANROOM_RECEIPT_PATH:-/private/tmp/moonsleep-partner-desk-surewal-cleanroom-receipt.json}"

ADAPTER_VERSION="$(jq -r '.version' "${ADAPTER_ROOT}/adapter.nexus.json")"
APP_VERSION="$(jq -r '.version' "${ROOT_DIR}/app.nexus.json")"
NATIVE_THREAD_ID='2215891521413-2216843498932#11011@icbu'
SUPPLIER_CONTACT_ID='2215891521413'
CONNECTION_ID='moonsleep-alibaba'
BACKFILL_SINCE="${BACKFILL_SINCE:-2024-01-01T00:00:00.000Z}"
BACKFILL_TO="${BACKFILL_TO:-2026-07-18T00:00:00.000Z}"
EXPECTED_RECORD_COUNT="${EXPECTED_RECORD_COUNT:-6325}"
EXPECTED_NATIVE_RECORD_COUNT="${EXPECTED_NATIVE_RECORD_COUNT:-6325}"
EXPECTED_NATIVE_MESSAGE_COUNT="${EXPECTED_NATIVE_MESSAGE_COUNT:-6132}"
EXPECTED_NATIVE_ORPHAN_COUNT="${EXPECTED_NATIVE_ORPHAN_COUNT:-193}"
EXPECTED_NATIVE_ATTACHMENT_COUNT="${EXPECTED_NATIVE_ATTACHMENT_COUNT:-1148}"

for numeric_value in "${EXPECTED_RECORD_COUNT}" "${EXPECTED_NATIVE_RECORD_COUNT}" "${EXPECTED_NATIVE_MESSAGE_COUNT}" "${EXPECTED_NATIVE_ORPHAN_COUNT}" "${EXPECTED_NATIVE_ATTACHMENT_COUNT}"; do
  [[ "${numeric_value}" =~ ^[0-9]+$ ]] || { echo "expected counts must be non-negative integers" >&2; exit 1; }
done

for command_name in docker jq openssl shasum; do
  command -v "${command_name}" >/dev/null || { echo "required command is unavailable: ${command_name}" >&2; exit 1; }
done
for required_path in "${SNAPSHOT_ROOT}" "${OBJECT_ROOT}" "${CONTEXT_PATH}"; do
  [[ -e "${required_path}" && ! -L "${required_path}" ]] || { echo "required evidence path is unavailable or symlinked: ${required_path}" >&2; exit 1; }
done

source_revision="$(git -C "${UMBRELLA_ROOT}" rev-parse HEAD)"
source_tree="$(git -C "${UMBRELLA_ROOT}" rev-parse 'HEAD^{tree}')"
[[ -z "$(git -C "${UMBRELLA_ROOT}" status --porcelain=v1 --untracked-files=all)" ]] || {
  echo "cleanroom source worktree must be clean" >&2
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
nex_revision="$(docker image inspect "${NEX_IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "${nex_revision}" =~ ^[0-9a-f]{40}$ ]] || { echo "Nex image is missing an exact revision" >&2; exit 1; }

adapter_artifact="${ADAPTER_ROOT}/dist/alibaba-${ADAPTER_VERSION}.tar.gz"
app_artifact="${ROOT_DIR}/dist/moonsleep-partner-desk-${APP_VERSION}.tar.gz"
[[ -f "${adapter_artifact}" && -f "${app_artifact}" ]] || { echo "package artifacts are missing" >&2; exit 1; }
adapter_sha256="$(shasum -a 256 "${adapter_artifact}" | awk '{print $1}')"
app_sha256="$(shasum -a 256 "${app_artifact}" | awk '{print $1}')"

suffix="${PPID}-$$"
network="nex-partner-desk-${suffix}"
postgres_container="${network}-postgres"
runtime_container="${network}-runtime"
postgres_volume="${network}-postgres"
state_volume="${network}-state"
credential_volume="${network}-credentials"
runtime_role="nex_moonsleep_runtime"
migrator_role="nex_moonsleep_migrator"
runner_temp="$(mktemp -d /private/tmp/nex-partner-desk-cleanroom.XXXXXX)"
chmod 0700 "${runner_temp}"

cleanup_resources() {
  docker rm -f "${runtime_container}" "${postgres_container}" >/dev/null 2>&1 || true
  docker volume rm -f "${postgres_volume}" "${state_volume}" "${credential_volume}" >/dev/null 2>&1 || true
  docker network rm "${network}" >/dev/null 2>&1 || true
}
cleanup() { cleanup_resources; rm -rf -- "${runner_temp}"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

runtime_call() {
  local method="$1" params="{}"
  if [[ $# -ge 2 ]]; then params="$2"; fi
  docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec /opt/nex/nexus.mjs runtime call "$1" --params "$2" --json \
      --url ws://127.0.0.1:18789 --token "$token"
  ' sh "${method}" "${params}"
}

package_get() {
  docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec curl -sS -H "Authorization: Bearer ${token}" \
      "http://127.0.0.1:18789/api/operator/packages/$1/$2"
  ' sh "$1" "$2"
}

install_package() {
  local package_class="$1" package_id="$2" release_id="$3" version="$4" source_path="$5" host_path="$6"
  local sha256 size_bytes operation_id staged_path body response
  sha256="$(shasum -a 256 "${host_path}" | awk '{print $1}')"
  size_bytes="$(LC_ALL=C wc -c < "${host_path}" | tr -d '[:space:]')"
  operation_id="${release_id}-install"
  staged_path="/var/lib/nex/state/packages/staging/${operation_id}/artifact.tar.gz"
  docker exec --user 20042:20042 "${runtime_container}" sh -c '
    set -eu; install -d -m 0700 "$(dirname "$2")"; cp "$1" "$2"; chmod 0600 "$2"
  ' sh "${source_path}" "${staged_path}"
  body="$(jq -nc --arg package_class "${package_class}" --arg package_id "${package_id}" \
    --arg version "${version}" --arg release_id "${release_id}" --arg operation_id "${operation_id}" \
    --arg server_path "${staged_path}" --arg sha256 "${sha256}" --argjson size_bytes "${size_bytes}" \
    '{kind:$package_class,package_id:$package_id,version:$version,release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$server_path,sha256:$sha256,size_bytes:$size_bytes}}')"
  response="$(docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec curl -sS -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
      --data "$1" http://127.0.0.1:18789/api/operator/packages/install
  ' sh "${body}")"
  jq -e --arg package_id "${package_id}" '.ok == true and .package_id == $package_id and .status == "active"' <<<"${response}" >/dev/null || {
    echo "package install failed for ${package_id}: ${response}" >&2
    return 1
  }
}

wait_for_postgres() {
  for attempt in $(seq 1 90); do
    docker exec "${postgres_container}" psql -X -U postgres -d moonsleep_nex -Atqc 'SELECT 1' >/dev/null 2>&1 && return 0
    sleep 1
  done
  docker logs "${postgres_container}" >&2 || true
  return 1
}

wait_for_runtime() {
  for attempt in $(seq 1 90); do
    if docker exec "${runtime_container}" sh -c '
      token=$(cat /run/moonsleep-load-credentials/runtime-token)
      curl -fsS -H "Authorization: Bearer ${token}" http://127.0.0.1:18789/health >/dev/null
    ' 2>/dev/null; then return 0; fi
    sleep 1
  done
  docker logs "${runtime_container}" >&2 || true
  return 1
}

postgres_json() {
  docker exec -u postgres "${postgres_container}" psql -X -d moonsleep_nex -Atqc "$1"
}

runtime_counts() {
  postgres_json "SELECT json_build_object(
    'records',(SELECT COUNT(*) FROM nex_runtime.records),
    'receipts',(SELECT COUNT(*) FROM nex_runtime.record_ingest_receipts),
    'events',(SELECT COUNT(*) FROM nex_runtime.durable_events),
    'entities',(SELECT COUNT(*) FROM nex_runtime.entities),
    'contacts',(SELECT COUNT(*) FROM nex_runtime.contacts),
    'observations',(SELECT COUNT(*) FROM nex_runtime.contact_observations),
    'tags',(SELECT COUNT(*) FROM nex_runtime.entity_tags),
    'queue',(SELECT COUNT(*) FROM nex_runtime.job_queue),
    'dispatch_receipts',(SELECT COUNT(*) FROM nex_runtime.event_dispatch_receipts),
    'adapter_instances',(SELECT COUNT(*) FROM nex_runtime.adapter_instances))"
}

sqlite_directory_counts() {
  docker exec --user 20042:20042 "${runtime_container}" node --input-type=module -e '
    import {DatabaseSync} from "node:sqlite";
    const db=new DatabaseSync("/var/lib/nex/state/data/identity.db",{readOnly:true});
    const value={channels:Number(db.prepare("SELECT COUNT(*) value FROM channels").get().value),participants:Number(db.prepare("SELECT COUNT(*) value FROM channel_participants").get().value),participant_messages:Number(db.prepare("SELECT COALESCE(SUM(message_count),0) value FROM channel_participants").get().value)};
    db.close(); process.stdout.write(JSON.stringify(value));'
}

echo "[partner-cleanroom] regenerate exact adapter output twice without network"
for pass in 1 2; do
  docker run --rm --platform linux/amd64 --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
    --mount "type=bind,src=${ADAPTER_ROOT}/dist,dst=/adapter,readonly" \
    --mount "type=bind,src=${SNAPSHOT_ROOT},dst=${SNAPSHOT_ROOT},readonly" \
    --mount "type=bind,src=${OBJECT_ROOT},dst=${OBJECT_ROOT},readonly" \
    --mount "type=bind,src=${CONTEXT_PATH},dst=/evidence/context.json,readonly" \
    --mount "type=bind,src=${runner_temp},dst=/output" \
    --env NEXUS_ADAPTER_CONTEXT_PATH=/evidence/context.json \
    --env NEXUS_ADAPTER_STATE_DIR=/tmp/adapter-state \
    --entrypoint sh "${NEX_IMAGE}" -c \
    '/adapter/index.js records.backfill --connection '"${CONNECTION_ID}"' --since '"${BACKFILL_SINCE}"' --to '"${BACKFILL_TO}"' --format jsonl > "/output/records-'"${pass}"'.jsonl"'
done
cmp "${runner_temp}/records-1.jsonl" "${runner_temp}/records-2.jsonl"
record_count="$(LC_ALL=C grep -c '^{' "${runner_temp}/records-1.jsonl")"
[[ "${record_count}" = "${EXPECTED_RECORD_COUNT}" ]] || { echo "unexpected Alibaba record count: ${record_count}" >&2; exit 1; }
record_output_sha256="$(shasum -a 256 "${runner_temp}/records-1.jsonl" | awk '{print $1}')"

echo "[partner-cleanroom] create isolated PostgreSQL 17 and Nex runtime"
docker network create --internal "${network}" >/dev/null
docker volume create "${postgres_volume}" >/dev/null
docker volume create "${state_volume}" >/dev/null
docker volume create "${credential_volume}" >/dev/null

runtime_token="nex_rt_$(openssl rand -hex 24)"
postgres_dsn="postgresql://${runtime_role}@postgres:5432/moonsleep_nex"

docker run --rm --platform linux/amd64 --network none --read-only --user 0:0 \
  --mount "type=volume,src=${state_volume},dst=/target" --entrypoint sh "${NEX_IMAGE}" -c '
    set -eu; install -d -m 0700 -o nex-moonsleep -g nex-moonsleep /target/state
    printf "%s\n" "{" "  \"runtime\": {\"port\":18789,\"bind\":\"loopback\",\"auth\":{\"mode\":\"token\",\"token\":\"\${NEXUS_RUNTIME_TOKEN}\"}}" "}" > /target/state/config.json
    chown nex-moonsleep:nex-moonsleep /target/state/config.json; chmod 0600 /target/state/config.json'

docker run --rm --platform linux/amd64 --network none --read-only --user 0:0 \
  --env "POSTGRES_DSN=${postgres_dsn}" --env "RUNTIME_TOKEN=${runtime_token}" \
  --mount "type=volume,src=${credential_volume},dst=/target" --entrypoint sh "${NEX_IMAGE}" -c '
    set -eu; umask 077; chmod 0750 /target
    printf "%s\n" "$POSTGRES_DSN" > /target/postgres-dsn
    printf "%s\n" "$RUNTIME_TOKEN" > /target/runtime-token
    printf "%s\n" "owner:" "  name: Tyler" "assistant:" "  name: MoonSleep Ops" "operators:" "  - name: Casey" > /target/bootstrap-seed.yaml
    chown root:root /target/*; chmod 0400 /target/*'

docker run -d --name "${postgres_container}" --platform linux/amd64 --network "${network}" --network-alias postgres \
  --security-opt no-new-privileges --env POSTGRES_DB=moonsleep_nex --env POSTGRES_HOST_AUTH_METHOD=trust \
  --mount "type=volume,src=${postgres_volume},dst=/var/lib/postgresql/data" \
  --tmpfs /run/postgresql:rw,nosuid,nodev,noexec,mode=0775 "${POSTGRES_IMAGE}" >/dev/null
wait_for_postgres
postgres_version="$(docker exec -u postgres "${postgres_container}" psql -X -d moonsleep_nex -Atqc 'SHOW server_version')"
[[ "${postgres_version}" == 17.* ]] || { echo "expected PostgreSQL 17, got ${postgres_version}" >&2; exit 1; }
docker exec -i "${postgres_container}" psql -X -U postgres -d moonsleep_nex -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE ROLE ${migrator_role} LOGIN;
CREATE ROLE ${runtime_role} LOGIN;
GRANT CONNECT, CREATE ON DATABASE moonsleep_nex TO ${migrator_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${runtime_role};
SQL

migration_receipt="$(docker run --rm --platform linux/amd64 --network "${network}" --read-only \
  --security-opt no-new-privileges --env NEXUS_RUNTIME_STORAGE_PROFILE=moonsleep-postgres-v1 \
  --env NEXUS_POSTGRES_MIGRATOR_CONNECTION_ENV=CLEANROOM_MIGRATOR_DATABASE_URL \
  --env "CLEANROOM_MIGRATOR_DATABASE_URL=postgresql://${migrator_role}@postgres/moonsleep_nex" \
  --env "NEXUS_POSTGRES_RECORDS_RUNTIME_ROLE=${runtime_role}" --env NEXUS_POSTGRES_RECORDS_SCHEMA=nex_runtime \
  --entrypoint node "${NEX_IMAGE}" /opt/nex/dist/postgres-record-store-migrate.js)"
jq -e '.ok == true and .storage_profile == "moonsleep-postgres-v1"' <<<"${migration_receipt}" >/dev/null

docker run -d --name "${runtime_container}" --platform linux/amd64 --network "${network}" --read-only \
  --security-opt no-new-privileges --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID \
  --mount "type=volume,src=${state_volume},dst=/var/lib/nex" \
  --mount "type=volume,src=${credential_volume},dst=/run/moonsleep-load-credentials,readonly" \
  --mount "type=bind,src=$(dirname "${adapter_artifact}"),dst=/artifacts/adapter,readonly" \
  --mount "type=bind,src=$(dirname "${app_artifact}"),dst=/artifacts/app,readonly" \
  --mount "type=bind,src=${runner_temp},dst=/evidence,readonly" \
  --mount "type=bind,src=${SNAPSHOT_ROOT},dst=${SNAPSHOT_ROOT},readonly" \
  --mount "type=bind,src=${OBJECT_ROOT},dst=${OBJECT_ROOT},readonly" \
  --mount "type=bind,src=${ROOT_DIR}/scripts,dst=/proof,readonly" \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 --tmpfs /run/nex-credentials:rw,nosuid,nodev,noexec,mode=0700 \
  "${NEX_IMAGE}" >/dev/null
wait_for_runtime

echo "[partner-cleanroom] install adapter and Partner Desk with work dormant"
install_package adapter alibaba "cleanroom-alibaba-${adapter_sha256:0:16}" "${ADAPTER_VERSION}" \
  "/artifacts/adapter/alibaba-${ADAPTER_VERSION}.tar.gz" "${adapter_artifact}"
install_package app moonsleep-partner-desk "cleanroom-partner-${app_sha256:0:16}" "${APP_VERSION}" \
  "/artifacts/app/moonsleep-partner-desk-${APP_VERSION}.tar.gz" "${app_artifact}"

jq -e --arg version "${ADAPTER_VERSION}" '.status == "active" and .active_version == $version' <<<"$(package_get adapter alibaba)" >/dev/null
jq -e --arg version "${APP_VERSION}" '.status == "active" and .active_version == $version' <<<"$(package_get app moonsleep-partner-desk)" >/dev/null
health_before="$(runtime_call moonsleep-partner-desk.healthcheck '{}')"
jq -e '.status == "ok" and .continuous_projection == "dormant_pending_backfill_parity_and_activation_receipt" and .provider_write_authority == false and .reply_authority == false' <<<"${health_before}" >/dev/null
jobs_before="$(runtime_call jobs.list '{}')"
subscriptions_before="$(runtime_call events.subscriptions.list '{}')"
jq -e '(.jobs|length)==1 and .jobs[0].name=="moonsleep-partner-desk.reviewed-open-loop-projection" and .jobs[0].status=="inactive"' <<<"${jobs_before}" >/dev/null
jq -e '(.subscriptions|length)==2 and all(.subscriptions[]; .event_type=="record.ingested" and .enabled==0) and ([.subscriptions[].match_json]|sort)==["{\"platform\":\"alibaba\"}","{\"platform\":\"gmail\"}"]' <<<"${subscriptions_before}" >/dev/null

initial_counts="$(runtime_counts)"
jq -e '.records==0 and .receipts==0 and .events==0 and .entities==3 and .contacts==0 and .observations==0 and .queue==0 and .dispatch_receipts==0 and .adapter_instances==0' <<<"${initial_counts}" >/dev/null

echo "[partner-cleanroom] seed the local Alibaba account identity and attach the connection dormant"
account_seed_params="$(jq -nc --arg contact_id "${CONNECTION_ID}" '{platform:"alibaba",space_id:"moonsleep-alibaba",contact_id:$contact_id,source_observation_id:"alibaba:moonsleep:routing-identity:v1",observed_at:1784680100000,contact_name:"MoonSleep Alibaba",entity_name:"MoonSleep Alibaba Integration",entity_type:"organization",tags:["MoonSleep","Integration","Alibaba"]}')"
account_seed_first="$(runtime_call contacts.observe "${account_seed_params}")"
account_seed_second="$(runtime_call contacts.observe "${account_seed_params}")"
jq -e '.created_entity==true and .created_contact==true and .replayed==false and .canonical_entity_id != ""' <<<"${account_seed_first}" >/dev/null
jq -e '.created_entity==false and .created_contact==false and .replayed==true and .canonical_entity_id != ""' <<<"${account_seed_second}" >/dev/null
account_entity_id="$(jq -r '.canonical_entity_id' <<<"${account_seed_first}")"

setup_start="$(runtime_call adapters.connections.custom.start '{"adapter":"alibaba","authMethodId":"alibaba_browser_snapshot","automaticActivation":false}')"
setup_session="$(jq -r '.sessionId' <<<"${setup_start}")"
[[ -n "${setup_session}" && "${setup_session}" != "null" ]]
jq -e '.status=="requires_input" and .service=="alibaba" and .secretFieldsPresent==false' <<<"${setup_start}" >/dev/null
setup_payload="$(jq -nc --arg snapshot_root "${SNAPSHOT_ROOT}" --arg object_root "${OBJECT_ROOT}" --arg account_id "${CONNECTION_ID}" '{snapshot_root:$snapshot_root,object_root:$object_root,account_id:$account_id,account_label:"MoonSleep Alibaba",confirm_read_only_capture:"ATTACH_SANITIZED_ALIBABA_CAPTURE"}')"
setup_submit_params="$(jq -nc --arg session_id "${setup_session}" --argjson payload "${setup_payload}" '{adapter:"alibaba",sessionId:$session_id,payload:$payload,automaticActivation:false}')"
setup_complete="$(runtime_call adapters.connections.custom.submit "${setup_submit_params}")"
jq -e --arg connection_id "${CONNECTION_ID}" '.status=="completed" and .connectionId==$connection_id and .account==$connection_id and .service=="alibaba" and .secretFieldsPresent==false and .metadata.automatic_activation.monitor.started==false' <<<"${setup_complete}" >/dev/null
connection_inventory="$(runtime_call adapters.connections.list '{}')"
jq -e --arg connection_id "${CONNECTION_ID}" '([.connections[]|select(.connectionId==$connection_id and .adapter=="alibaba" and .status=="connected")]|length)==1' <<<"${connection_inventory}" >/dev/null
account_contacts_after_setup="$(runtime_call contacts.list '{"platform":"alibaba","limit":100,"offset":0}')"
jq -e --arg connection_id "${CONNECTION_ID}" --arg entity_id "${account_entity_id}" '([.contacts[]|select(.space_id=="moonsleep-alibaba" and .contact_id==$connection_id and .observed_entity_id==$entity_id and .canonical_entity_id==$entity_id)]|length)==1' <<<"${account_contacts_after_setup}" >/dev/null
jq -e '(.jobs|length)==1 and .jobs[0].name=="moonsleep-partner-desk.reviewed-open-loop-projection" and .jobs[0].status=="inactive"' <<<"$(runtime_call jobs.list '{}')" >/dev/null

seed_params="$(jq -nc --arg contact_id "${SUPPLIER_CONTACT_ID}" '{platform:"alibaba",space_id:"moonsleep-alibaba",contact_id:$contact_id,source_observation_id:"alibaba:surewal:routing-identity:v1",observed_at:1784680200000,contact_name:"Surewal Alibaba",entity_name:"Surewal",entity_type:"organization",tags:["Partner","Supplier","Alibaba"]}')"
seed_first="$(runtime_call contacts.observe "${seed_params}")"
seed_second="$(runtime_call contacts.observe "${seed_params}")"
jq -e '.created_entity==true and .created_contact==true and .replayed==false and .canonical_entity_id != ""' <<<"${seed_first}" >/dev/null
jq -e '.created_entity==false and .created_contact==false and .replayed==true and .canonical_entity_id != ""' <<<"${seed_second}" >/dev/null
surewal_entity_id="$(jq -r '.canonical_entity_id' <<<"${seed_first}")"
surewal_contact_id="$(jq -r '.contact.id' <<<"${seed_first}")"
seed_counts="$(runtime_counts)"

echo "[partner-cleanroom] ingest the complete Surewal conversation twice"
ingest_first="$(docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  exec node /proof/ingest-jsonl-cleanroom.mjs /evidence/records-1.jsonl "$token"
')"
jq -e --argjson expected "${EXPECTED_RECORD_COUNT}" '.completed==$expected and .skipped==0 and .other==0 and .total==$expected' <<<"${ingest_first}" >/dev/null
counts_after_first="$(runtime_counts)"
directory_after_first="$(sqlite_directory_counts)"

ingest_second="$(docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  exec node /proof/ingest-jsonl-cleanroom.mjs /evidence/records-1.jsonl "$token"
')"
jq -e --argjson expected "${EXPECTED_RECORD_COUNT}" '.completed==0 and .skipped==$expected and .other==0 and .total==$expected' <<<"${ingest_second}" >/dev/null
counts_after_second="$(runtime_counts)"
directory_after_second="$(sqlite_directory_counts)"
[[ "$(jq -S -c . <<<"${counts_after_first}")" = "$(jq -S -c . <<<"${counts_after_second}")" ]]
[[ "$(jq -S -c . <<<"${directory_after_first}")" = "$(jq -S -c . <<<"${directory_after_second}")" ]]
jq -e --argjson expected "${EXPECTED_RECORD_COUNT}" '.records==$expected and .receipts==$expected and .events==$expected and .queue==0 and .dispatch_receipts==0 and .adapter_instances==0' <<<"${counts_after_second}" >/dev/null
echo "[partner-cleanroom] replay counts stable; inspect complete native conversation"

conversation_inspection="$(runtime_call moonsleep-partner-desk.alibaba.inspect-conversation "$(jq -nc --arg connection_id "${CONNECTION_ID}" --arg provider_thread_id "${NATIVE_THREAD_ID}" '{connection_id:$connection_id,provider_thread_id:$provider_thread_id}')")"
printf '%s\n' "${conversation_inspection}" >&2
jq -e --argjson records "${EXPECTED_NATIVE_RECORD_COUNT}" --argjson messages "${EXPECTED_NATIVE_MESSAGE_COUNT}" --argjson orphans "${EXPECTED_NATIVE_ORPHAN_COUNT}" --argjson attachments "${EXPECTED_NATIVE_ATTACHMENT_COUNT}" '.record_count==$records and .message_record_count==$messages and .orphan_attachment_record_count==$orphans and .attachment_row_count==$attachments and .provider_content_returned==false and .provider_write_authority==false' <<<"${conversation_inspection}" >/dev/null
echo "[partner-cleanroom] native conversation exact; project reviewed open-loop cohort"

sample_ids="$(docker exec -u postgres "${postgres_container}" psql -X -d moonsleep_nex -Atqc "SELECT id FROM nex_runtime.records WHERE metadata->>'family'='message' ORDER BY timestamp,id LIMIT 2")"
sample_first="$(printf '%s\n' "${sample_ids}" | sed -n '1p')"
sample_second="$(printf '%s\n' "${sample_ids}" | sed -n '2p')"
[[ -n "${sample_first}" && -n "${sample_second}" && "${sample_first}" != "${sample_second}" ]]
projection_params="$(jq -nc --arg first "${sample_first}" --arg second "${sample_second}" --arg entity "${surewal_entity_id}" --arg contact "${surewal_contact_id}" '{record_ids:[$first,$second],identity_resolutions:[{source_record_id:$first,status:"confirmed",decision_origin:"operator_review",canonical_entity_id:$entity,contact_id:$contact},{source_record_id:$second,status:"confirmed",decision_origin:"operator_review",canonical_entity_id:$entity,contact_id:$contact}],workspace_assertions:[{source_record_id:$first,category:"vendor",status:"confirmed",assertion_origin:"operator_review"},{source_record_id:$second,category:"vendor",status:"confirmed",assertion_origin:"operator_review"}],open_loop_assertions:[{open_loop_id:"surewal-commercial-review",canonical_entity_id:$entity,primary_source_record_id:$first,evidence_source_record_ids:[$first],closure_source_record_ids:[],title:"Review commercial question",summary:"Reviewed commercial open loop",labels:["commercial"],lifecycle:"waiting_on_partner",review_state:"confirmed",assertion_origin:"operator_review"},{open_loop_id:"surewal-production-review",canonical_entity_id:$entity,primary_source_record_id:$second,evidence_source_record_ids:[$second],closure_source_record_ids:[],title:"Review production question",summary:"Reviewed production open loop",labels:["production"],lifecycle:"waiting_on_moonsleep",review_state:"confirmed",assertion_origin:"operator_review"}],source_coverage_assertions:[{source_record_id:$first,disposition:"open_loop_evidence",open_loop_ids:["surewal-commercial-review"],assertion_origin:"operator_review"},{source_record_id:$second,disposition:"open_loop_evidence",open_loop_ids:["surewal-production-review"],assertion_origin:"operator_review"}]}')"
projection="$(runtime_call moonsleep-partner-desk.project-reviewed-cohort "${projection_params}")"
jq -e '.state=="reviewed_projection" and (.native_threads|length)==1 and (.open_loops|length)==2 and (.attention_queue|length)==1 and (.waiting_on_partner|length)==1 and (.review_queue|length)==0 and .provider_write_authority==false' <<<"${projection}" >/dev/null
echo "[partner-cleanroom] reviewed projection exact"

echo "[partner-cleanroom] commit immutable review revision and prove exact replay"
review_params="$(jq -c --arg workspace_key "surewal-cleanroom" --arg entity "${surewal_entity_id}" '. + {workspace_key:$workspace_key,canonical_entity_id:$entity,review_note:"Cleanroom operator review",review_idempotency_key:"partner-desk-cleanroom-review-0001",previous_revision_sha256:null}' <<<"${projection_params}")"
review_first="$(runtime_call moonsleep-partner-desk.review.commit "${review_params}")"
jq -e '.state=="review_committed" and .created==true and .review.workspace_key=="surewal-cleanroom" and (.projection.open_loops|length)==2 and .provider_write_authority==false' <<<"${review_first}" >/dev/null
review_revision="$(jq -r '.review.revision_sha256' <<<"${review_first}")"
[[ "${review_revision}" =~ ^[0-9a-f]{64}$ ]]
review_replay="$(runtime_call moonsleep-partner-desk.review.commit "${review_params}")"
jq -e --arg revision "${review_revision}" '.state=="review_replayed" and .created==false and .review.revision_sha256==$revision and .provider_write_authority==false' <<<"${review_replay}" >/dev/null
review_current="$(runtime_call moonsleep-partner-desk.review.current '{"workspace_key":"surewal-cleanroom"}')"
jq -e --arg revision "${review_revision}" '.state=="current_review" and .history_count==1 and .review.revision_sha256==$revision and (.projection.open_loops|length)==2 and (.projection.native_threads|length)==1 and .provider_write_authority==false' <<<"${review_current}" >/dev/null
review_workspaces="$(runtime_call moonsleep-partner-desk.review.workspaces '{}')"
jq -e --arg revision "${review_revision}" '.state=="review_workspace_index" and .workspace_count==1 and .workspaces[0].workspace_key=="surewal-cleanroom" and .workspaces[0].revision_sha256==$revision and .provider_write_authority==false' <<<"${review_workspaces}" >/dev/null
counts_after_review="$(runtime_counts)"
directory_after_review="$(sqlite_directory_counts)"
jq -e --argjson expected "$((EXPECTED_RECORD_COUNT + 1))" '.records==$expected and .receipts==$expected and .events==$expected and .queue==0 and .dispatch_receipts==0 and .adapter_instances==0' <<<"${counts_after_review}" >/dev/null

echo "[partner-cleanroom] serve the packaged Partner Desk UI through the Nex app mount"
ui_html="$(docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  exec curl -fsS -H "Authorization: Bearer ${token}" http://127.0.0.1:18789/app/moonsleep-partner-desk/
')"
grep -F '<title>MoonSleep Partner Desk</title>' <<<"${ui_html}" >/dev/null
ui_asset="$(grep -oE '\./assets/index-[A-Za-z0-9_-]+\.js' <<<"${ui_html}" | head -1)"
[[ -n "${ui_asset}" ]]
docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  exec curl -fsS -H "Authorization: Bearer ${token}" "http://127.0.0.1:18789/app/moonsleep-partner-desk/${1#./}" >/dev/null
' sh "${ui_asset}"

echo "[partner-cleanroom] restart and prove package and replay durability"
docker restart "${runtime_container}" >/dev/null
wait_for_runtime
jq -e '.status=="ok" and .provider_write_authority==false' <<<"$(runtime_call moonsleep-partner-desk.healthcheck '{}')" >/dev/null
jq -e '(.jobs|length)==1 and .jobs[0].status=="inactive"' <<<"$(runtime_call jobs.list '{}')" >/dev/null
jq -e '(.subscriptions|length)==2 and all(.subscriptions[]; .enabled==0)' <<<"$(runtime_call events.subscriptions.list '{}')" >/dev/null
account_contacts_after_restart="$(runtime_call contacts.list '{"platform":"alibaba","limit":100,"offset":0}')"
jq -e --arg connection_id "${CONNECTION_ID}" --arg entity_id "${account_entity_id}" '([.contacts[]|select(.space_id=="moonsleep-alibaba" and .contact_id==$connection_id and .observed_entity_id==$entity_id and .canonical_entity_id==$entity_id)]|length)==1' <<<"${account_contacts_after_restart}" >/dev/null
ingest_after_restart="$(docker exec "${runtime_container}" sh -c '
  token=$(cat /run/moonsleep-load-credentials/runtime-token)
  exec node /proof/ingest-jsonl-cleanroom.mjs /evidence/records-1.jsonl "$token"
')"
jq -e --argjson expected "${EXPECTED_RECORD_COUNT}" '.completed==0 and .skipped==$expected and .other==0' <<<"${ingest_after_restart}" >/dev/null
counts_after_restart="$(runtime_counts)"
directory_after_restart="$(sqlite_directory_counts)"
[[ "$(jq -S -c . <<<"${counts_after_review}")" = "$(jq -S -c . <<<"${counts_after_restart}")" ]]
[[ "$(jq -S -c . <<<"${directory_after_review}")" = "$(jq -S -c . <<<"${directory_after_restart}")" ]]
review_after_restart="$(runtime_call moonsleep-partner-desk.review.current '{"workspace_key":"surewal-cleanroom"}')"
jq -e --arg revision "${review_revision}" '.state=="current_review" and .review.revision_sha256==$revision and (.projection.open_loops|length)==2' <<<"${review_after_restart}" >/dev/null

postgres_image_id="$(docker image inspect "${POSTGRES_IMAGE}" --format '{{.Id}}')"
nex_image_id="$(docker image inspect "${NEX_IMAGE}" --format '{{.Id}}')"
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cleanup_resources
[[ -z "$(docker ps -a --filter "name=${network}" --format '{{.Names}}')" ]]
[[ -z "$(docker volume ls --filter "name=${network}" --format '{{.Name}}')" ]]
[[ -z "$(docker network ls --filter "name=${network}" --format '{{.Name}}')" ]]

jq -n --arg finished_at "${finished_at}" --arg source_revision "${source_revision}" --arg source_tree "${source_tree}" \
  --arg nex_revision "${nex_revision}" --arg nex_image_id "${nex_image_id}" --arg postgres_image_id "${postgres_image_id}" \
  --arg postgres_version "${postgres_version}" --arg adapter_sha256 "${adapter_sha256}" --arg app_sha256 "${app_sha256}" \
  --arg record_output_sha256 "${record_output_sha256}" --arg account_entity_id "${account_entity_id}" --arg surewal_entity_id "${surewal_entity_id}" --arg surewal_contact_id "${surewal_contact_id}" \
  --arg review_revision "${review_revision}" \
  --argjson record_count "${EXPECTED_RECORD_COUNT}" \
  --argjson initial_counts "${initial_counts}" --argjson seed_counts "${seed_counts}" --argjson terminal_counts "${counts_after_restart}" \
  --argjson directory_counts "${directory_after_restart}" --argjson conversation "${conversation_inspection}" \
  '{ok:true,finished_at:$finished_at,source:{revision:$source_revision,tree:$source_tree,clean:true},nex:{revision:$nex_revision,image_id:$nex_image_id,platform:"linux/amd64",storage_profile:"moonsleep-postgres-v1"},postgres:{image_id:$postgres_image_id,version:$postgres_version,platform:"linux/amd64"},packages:{alibaba_sha256:$adapter_sha256,partner_desk_sha256:$app_sha256,active_after_restart:true,ui_mount_served:true},connection:{connection_id:"moonsleep-alibaba",custom_setup_complete:true,automatic_activation:false,monitor_started:false,backfill_queued:false,provider_credentials_received:false},adapter:{output_sha256:$record_output_sha256,records:$record_count,first_and_second_output_identical:true,provider_credentials_mounted:false,provider_calls:0,provider_write_authority:false},identity:{account_entity_id:$account_entity_id,account_binding_preserved_after_setup:true,account_binding_preserved_after_restart:true,entity_id:$surewal_entity_id,contact_row_id:$surewal_contact_id,account_seed_first_created_entity:1,account_seed_replay_created_entity:0,first_created_entity:1,first_created_contact:1,second_created_entity:0,second_created_contact:0},conversation:$conversation,projection:{native_threads:1,reviewed_open_loops:2,review_queue:0},review_store:{revision_sha256:$review_revision,first_created:true,replay_created:false,current_after_restart:true,divergent_heads_auto_selected:false},work_boundary:{job_status:"inactive",subscription_count:2,subscription_enabled:false,queue_rows:0,dispatch_receipts:0,reply_authority:false},replay:{second_ingest_skipped:$record_count,restart_ingest_skipped:$record_count,postgres_counts_unchanged:true,directory_counts_unchanged:true},initial_counts:$initial_counts,seed_counts:$seed_counts,terminal_counts:$terminal_counts,directory_counts:$directory_counts,zero_residue:true}' > "${RECEIPT_PATH}"
chmod 0600 "${RECEIPT_PATH}"
trap - EXIT
rm -rf -- "${runner_temp}"
echo "[partner-cleanroom] PASS receipt=${RECEIPT_PATH}"
