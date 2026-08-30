#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UMBRELLA_ROOT="$(cd "${ROOT_DIR}/../../../.." && pwd)"
NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
POSTGRES_IMAGE="${POSTGRES_RELEASE_IMAGE:?set POSTGRES_RELEASE_IMAGE to the exact Linux/AMD64 PostgreSQL 17 image}"
RECEIPT_PATH="${CLEANROOM_RECEIPT_PATH:-/private/tmp/moonsleep-shopify-full-postgres-cleanroom-receipt.json}"
ADAPTER_ROOT="${UMBRELLA_ROOT}/packages/adapters/shopify"
ADAPTER_VERSION="$(jq -r '.version' "${ADAPTER_ROOT}/adapter.nexus.json")"
APP_VERSION="$(jq -r '.version' "${ROOT_DIR}/app.nexus.json")"

source_revision="$(git -C "${UMBRELLA_ROOT}" rev-parse HEAD)"
source_tree="$(git -C "${UMBRELLA_ROOT}" rev-parse 'HEAD^{tree}')"
[[ -z "$(git -C "${UMBRELLA_ROOT}" status --porcelain=v1 --untracked-files=all)" ]] || {
  echo "cleanroom source worktree must be clean" >&2
  exit 1
}

SHOP_DOMAIN="moonsleepco.myshopify.com"
CONNECTION_ID="shopify-primary"
SYNTHETIC_RECORD_CONNECTION_ID="moonsleepco.myshopify.com"
for command_name in docker jq openssl shasum; do
  command -v "${command_name}" >/dev/null || {
    echo "required command is unavailable: ${command_name}" >&2
    exit 1
  }
done

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
[[ "${nex_revision}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Nex image is missing an exact 40-hex revision label" >&2
  exit 1
}

suffix="${PPID}-$$"
network="nex-shopify-cleanroom-${suffix}"
postgres_container="${network}-postgres"
runtime_container="${network}-runtime"
postgres_volume="${network}-postgres"
state_volume="${network}-state"
credential_volume="${network}-credentials"
migrator_credential_volume="${network}-migrator-credentials"
runtime_role="nex_moonsleep_runtime"
migrator_role="nex_moonsleep_migrator"
runner_temp="$(mktemp -d /private/tmp/nex-shopify-full-postgres.XXXXXX)"
chmod 0700 "${runner_temp}"

cleanup_resources() {
  docker rm -f "${runtime_container}" "${postgres_container}" >/dev/null 2>&1 || true
  docker volume rm -f "${postgres_volume}" "${state_volume}" "${credential_volume}" "${migrator_credential_volume}" >/dev/null 2>&1 || true
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
  local method="$1"
  local params="{}"
  if [[ $# -ge 2 ]]; then
    params="$2"
  fi
  docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec /opt/nex/nexus.mjs runtime call "$1" \
      --params "$2" \
      --json \
      --url ws://127.0.0.1:18789 \
      --token "$token"
  ' sh "${method}" "${params}"
}

runtime_call_verbose() {
  local method="$1"
  local params="{}"
  if [[ $# -ge 2 ]]; then
    params="$2"
  fi
  docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec /opt/nex/nexus.mjs runtime call "$1" \
      --params "$2" \
      --json \
      --url ws://127.0.0.1:18789 \
      --token "$token"
  ' sh "${method}" "${params}"
}

package_get() {
  local package_class="$1"
  local package_id="$2"
  docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec curl -sS \
      -H "Authorization: Bearer ${token}" \
      "http://127.0.0.1:18789/api/operator/packages/$1/$2"
  ' sh "${package_class}" "${package_id}"
}

install_package() {
  local package_class="$1"
  local package_id="$2"
  local release_id="$3"
  local version="$4"
  local source_server_path="$5"
  local host_path="$6"
  local sha256 size_bytes operation_id staged_server_path body response
  sha256="$(shasum -a 256 "${host_path}" | awk '{print $1}')"
  size_bytes="$(stat -f '%z' "${host_path}")"
  operation_id="${release_id}-install"
  staged_server_path="/var/lib/nex/state/packages/staging/${operation_id}/artifact.tar.gz"
  docker exec --user 20042:20042 "${runtime_container}" sh -c '
    set -eu
    install -d -m 0700 "$(dirname "$2")"
    cp "$1" "$2"
    chmod 0600 "$2"
  ' sh "${source_server_path}" "${staged_server_path}"
  body="$(jq -nc \
    --arg package_class "${package_class}" \
    --arg package_id "${package_id}" \
    --arg version "${version}" \
    --arg release_id "${release_id}" \
    --arg operation_id "${operation_id}" \
    --arg server_path "${staged_server_path}" \
    --arg sha256 "${sha256}" \
    --argjson size_bytes "${size_bytes}" \
    '{kind:$package_class,package_id:$package_id,version:$version,release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$server_path,sha256:$sha256,size_bytes:$size_bytes}}')"
  response="$(docker exec "${runtime_container}" sh -c '
    token=$(cat /run/moonsleep-load-credentials/runtime-token)
    exec curl -sS \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      --data "$1" \
      http://127.0.0.1:18789/api/operator/packages/install
  ' sh "${body}")"
  if ! jq -e --arg package_id "${package_id}" '
    .ok == true and .package_id == $package_id and .status == "active"
  ' <<<"${response}" >/dev/null; then
    printf 'package install failed for %s: %s\n' "${package_id}" "${response}" >&2
    return 1
  fi
}

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
  local attempt ready_marker=0 started_at
  started_at="$(docker inspect --format '{{.State.StartedAt}}' "${runtime_container}")"
  for attempt in $(seq 1 90); do
    if docker logs --since "${started_at}" "${runtime_container}" 2>&1 \
      | grep -F 'runtime started (no adapter monitors started)' >/dev/null; then
      ready_marker=1
      break
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "${runtime_container}")" != "true" ]]; then
      docker logs "${runtime_container}" >&2 || true
      return 1
    fi
    sleep 1
  done
  if [[ "${ready_marker}" != "1" ]]; then
    docker logs "${runtime_container}" >&2 || true
    return 1
  fi
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

postgres_json() {
  local query="$1"
  docker exec -u postgres "${postgres_container}" \
    psql -X -d moonsleep_nex -Atqc "${query}"
}

runtime_counts() {
  postgres_json "
    SELECT json_build_object(
      'records', (SELECT COUNT(*) FROM nex_runtime_immutable_records_v1.records),
      'ingest_receipts', (SELECT COUNT(*) FROM nex_runtime_immutable_records_v1.record_ingest_receipts),
      'legacy_records', (SELECT COUNT(*) FROM nex_runtime.records),
      'legacy_receipts', (SELECT COUNT(*) FROM nex_runtime.record_ingest_receipts),
      'events', (SELECT COUNT(*) FROM nex_runtime.durable_events),
      'entities', (SELECT COUNT(*) FROM nex_runtime.entities),
      'contacts', (SELECT COUNT(*) FROM nex_runtime.contacts),
      'observations', (SELECT COUNT(*) FROM nex_runtime.contact_observations),
      'tags', (SELECT COUNT(*) FROM nex_runtime.entity_tags),
      'queue_rows', (SELECT COUNT(*) FROM nex_runtime.job_queue),
      'active_queue_rows', (SELECT COUNT(*) FROM nex_runtime.job_queue WHERE queue_status IN ('queued', 'leased')),
      'dispatch_receipts', (SELECT COUNT(*) FROM nex_runtime.event_dispatch_receipts),
      'adapter_instances', (SELECT COUNT(*) FROM nex_runtime.adapter_instances),
      'commerce_orders', (SELECT COUNT(*) FROM nex_runtime.commerce_orders),
      'commerce_order_revisions', (SELECT COUNT(*) FROM nex_runtime.commerce_order_revisions),
      'commerce_line_items', (SELECT COUNT(*) FROM nex_runtime.commerce_line_items),
      'commerce_line_item_revisions', (SELECT COUNT(*) FROM nex_runtime.commerce_line_item_revisions),
      'customer_facets', (SELECT COUNT(*) FROM nex_runtime.core_graph_facet_attachments WHERE definition_id = 'moonsleep.customer.v1' AND lifecycle_state = 'active'),
      'accepted_observation_compatibility_receipts', (SELECT COUNT(*) FROM nex_runtime.core_graph_accepted_observation_receipts)
    )"
}

build_record_params() {
  local family="$1"
  case "${family}" in
    customer)
      local provider='{"id":"gid://shopify/Customer/900719925474099312345","displayName":"Synthetic Customer","firstName":"Synthetic","lastName":"Customer","email":"synthetic@example.invalid","addresses":[]}'
      jq -nc --arg provider "${provider}" '{
        routing:{adapter:"shopify",platform:"shopify",connection_id:"moonsleepco.myshopify.com",sender_id:"moonsleepco.myshopify.com",sender_name:"Shopify",receiver_id:"moonsleepco.myshopify.com",space_id:"moonsleepco.myshopify.com",container_kind:"group",container_id:"customer",thread_id:"moonsleepco.myshopify.com:customer:900719925474099312345"},
        payload:{external_record_id:"customer:900719925474099312345",timestamp:1784640000000,content:"customer Synthetic Customer",content_type:"text",payload:{provider_object_json:$provider,provider_object_sha256:"54f0be03d3397a358786086ec37b985d840a3d3ef23d7251958013e58cc989ae"},metadata:{source_record_type:"shopify.customer",connection_id:"moonsleepco.myshopify.com",adapter_id:"shopify",family:"customer",logical_row_id:"moonsleepco.myshopify.com:900719925474099312345",revision_hash:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",provider_ids:{customer_id:"900719925474099312345",customer_gid:"gid://shopify/Customer/900719925474099312345"},row:{email:"synthetic@example.invalid",phone:"",addresses:[],last_name:"Customer",first_name:"Synthetic",customer_id:"900719925474099312345",shop_domain:"moonsleepco.myshopify.com",customer_gid:"gid://shopify/Customer/900719925474099312345",display_name:"Synthetic Customer",addresses_complete:true},source_request:{path:"/admin/api/2026-01/customers.json",method:"GET"}}}
      }'
      ;;
    order)
      local provider='{"id":900719925474099312346,"name":"#SYNTH-1","customer":{"id":900719925474099312345},"billing_address":{"address1":"1 Synthetic Way","city":"Austin","zip":"78701"},"shipping_address":{"address1":"2 Replay Road","city":"Austin","zip":"78702"},"total_price":"199.00"}'
      local provider_sha256
      provider_sha256="$(printf '%s' "${provider}" | shasum -a 256 | awk '{print $1}')"
      jq -nc --arg provider "${provider}" --arg provider_sha256 "${provider_sha256}" '{
        routing:{adapter:"shopify",platform:"shopify",connection_id:"moonsleepco.myshopify.com",sender_id:"moonsleepco.myshopify.com",sender_name:"Shopify",receiver_id:"moonsleepco.myshopify.com",space_id:"moonsleepco.myshopify.com",container_kind:"group",container_id:"order",thread_id:"moonsleepco.myshopify.com:order:900719925474099312346"},
        payload:{external_record_id:"order:900719925474099312346",timestamp:1784640001000,content:"order #SYNTH-1 total=199.00",content_type:"text",payload:{provider_object_json:$provider,provider_object_sha256:$provider_sha256},metadata:{source_record_type:"shopify.order",connection_id:"moonsleepco.myshopify.com",adapter_id:"shopify",family:"order",logical_row_id:"moonsleepco.myshopify.com:900719925474099312346",revision_hash:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",provider_ids:{shop_domain:"moonsleepco.myshopify.com",order_id:"900719925474099312346",customer_id:"900719925474099312345"},row:{name:"#SYNTH-1",currency:"USD",order_id:"900719925474099312346",shop_domain:"moonsleepco.myshopify.com",subtotal_price:"199.00",total_price:"199.00",financial_status:"paid",fulfillment_status:"unfulfilled",customer_id:"900719925474099312345",billing_address:{zip:"78701",city:"Austin",address1:"1 Synthetic Way"},shipping_address:{zip:"78702",city:"Austin",address1:"2 Replay Road"}},source_request:{path:"/admin/api/2026-01/orders.json",method:"GET"}}}
      }'
      ;;
    line_item)
      local provider='{"id":900719925474099312347,"product_id":900719925474099312348,"variant_id":900719925474099312349,"quantity":1,"sku":"SYNTHETIC-SKU","title":"Synthetic Product","price":"199.00"}'
      local provider_sha256
      provider_sha256="$(printf '%s' "${provider}" | shasum -a 256 | awk '{print $1}')"
      jq -nc --arg provider "${provider}" --arg provider_sha256 "${provider_sha256}" '{
        routing:{adapter:"shopify",platform:"shopify",connection_id:"moonsleepco.myshopify.com",sender_id:"moonsleepco.myshopify.com",sender_name:"Shopify",receiver_id:"moonsleepco.myshopify.com",space_id:"moonsleepco.myshopify.com",container_kind:"group",container_id:"line_item",thread_id:"moonsleepco.myshopify.com:order:900719925474099312346"},
        payload:{external_record_id:"line_item:900719925474099312346:900719925474099312347",timestamp:1784640002000,content:"line_item order=#SYNTH-1 quantity=1 price=199.00",content_type:"text",payload:{provider_object_json:$provider,provider_object_sha256:$provider_sha256},metadata:{source_record_type:"shopify.line_item",connection_id:"moonsleepco.myshopify.com",adapter_id:"shopify",family:"line_item",logical_row_id:"moonsleepco.myshopify.com:900719925474099312346:900719925474099312347",revision_hash:"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",provider_ids:{shop_domain:"moonsleepco.myshopify.com",order_id:"900719925474099312346",line_item_id:"900719925474099312347",product_id:"900719925474099312348",variant_id:"900719925474099312349"},row:{sku:"SYNTHETIC-SKU",price:"199.00",title:"Synthetic Product",order_id:"900719925474099312346",quantity:1,shop_domain:"moonsleepco.myshopify.com",line_item_id:"900719925474099312347",product_id:"900719925474099312348",variant_id:"900719925474099312349"},source_request:{path:"/admin/api/2026-01/orders.json",method:"GET"}}}
      }'
      ;;
    *)
      echo "unknown synthetic family: ${family}" >&2
      return 1
      ;;
  esac
}

echo "[cleanroom] package exact Linux/AMD64 adapter and app artifacts"
if [[ "${CLEANROOM_SKIP_PACKAGE_BUILD:-0}" != "1" ]]; then
  NEX_RELEASE_IMAGE="${NEX_IMAGE}" \
    "${UMBRELLA_ROOT}/packages/adapters/shopify/scripts/test-package-release-linux-amd64.sh"
  NEX_RELEASE_IMAGE="${NEX_IMAGE}" \
    "${ROOT_DIR}/scripts/test-package-release-linux-amd64.sh"
fi

adapter_artifact="${ADAPTER_ROOT}/dist/shopify-${ADAPTER_VERSION}.tar.gz"
app_artifact="${ROOT_DIR}/dist/moonsleep-commerce-${APP_VERSION}.tar.gz"
[[ -f "${adapter_artifact}" && -f "${app_artifact}" ]]
adapter_sha256="$(shasum -a 256 "${adapter_artifact}" | awk '{print $1}')"
app_sha256="$(shasum -a 256 "${app_artifact}" | awk '{print $1}')"

echo "[cleanroom] create isolated PostgreSQL 17 and Nex resources"
docker network create --internal "${network}" >/dev/null
docker volume create "${postgres_volume}" >/dev/null
docker volume create "${state_volume}" >/dev/null
docker volume create "${credential_volume}" >/dev/null
docker volume create "${migrator_credential_volume}" >/dev/null

runtime_token="nex_rt_$(openssl rand -hex 24)"
postgres_dsn="postgresql://${runtime_role}@postgres:5432/moonsleep_nex"
migrator_postgres_dsn="postgresql://${migrator_role}@postgres:5432/moonsleep_nex"

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

docker run --rm \
  --platform linux/amd64 \
  --network none \
  --read-only \
  --user 0:0 \
  --env "MIGRATOR_POSTGRES_DSN=${migrator_postgres_dsn}" \
  --mount "type=volume,src=${migrator_credential_volume},dst=/target" \
  --entrypoint sh \
  "${NEX_IMAGE}" \
  -c 'set -eu
      umask 077
      chmod 0700 /target
      printf "%s\n" "$MIGRATOR_POSTGRES_DSN" > /target/postgres-migrator-dsn
      chown root:root /target/postgres-migrator-dsn
      chmod 0400 /target/postgres-migrator-dsn'

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
[[ "${postgres_version}" == 17.* ]] || {
  echo "expected PostgreSQL 17, got ${postgres_version}" >&2
  exit 1
}

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
  --env NEXUS_MOONSLEEP_PRODUCTION_CREDENTIALS=0 \
  --env NEXUS_RUNTIME_STORAGE_PROFILE=moonsleep-postgres-v1 \
  --env NEXUS_POSTGRES_CONNECTION_FILE=/run/nex-credentials/postgres-migrator-dsn \
  --env "NEXUS_POSTGRES_RECORDS_RUNTIME_ROLE=${runtime_role}" \
  --env NEXUS_POSTGRES_RECORDS_SCHEMA=nex_runtime \
  --mount "type=volume,src=${migrator_credential_volume},dst=/run/nex-credentials,readonly" \
  --entrypoint node \
  "${NEX_IMAGE}" \
  /opt/nex/dist/postgres-record-store-migrate.js)"
jq -e '.ok == true and .storage_profile == "moonsleep-postgres-v1"' <<<"${migration_receipt}" >/dev/null

docker run -d \
  --name "${runtime_container}" \
  --platform linux/amd64 \
  --network "${network}" \
  --privileged \
  --cgroupns=private \
  --read-only \
  --security-opt no-new-privileges \
  --env NEXUS_WORKER_PROCESSES=1 \
  --env NEXUS_WORKER_CGROUP_ROOT=/sys/fs/cgroup/nex-job-attempts \
  --mount "type=volume,src=${state_volume},dst=/var/lib/nex" \
  --mount "type=volume,src=${credential_volume},dst=/run/moonsleep-load-credentials,readonly" \
  --mount "type=bind,src=$(dirname "${adapter_artifact}"),dst=/artifacts/adapter,readonly" \
  --mount "type=bind,src=$(dirname "${app_artifact}"),dst=/artifacts/app,readonly" \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
  --tmpfs /run/nex-credentials:rw,nosuid,nodev,noexec,mode=0700 \
  "${NEX_IMAGE}" >/dev/null
wait_for_runtime

# A fresh database starts with the legacy Commerce source-record foreign keys.
# This cleanroom proves the post-cutover immutable-Record projector, so prepare
# the same two FK targets that the governed immutable-Record promotion operator
# establishes before any projection is attempted.
docker exec -i "${postgres_container}" psql -X -U postgres -d moonsleep_nex -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
ALTER TABLE nex_runtime.commerce_order_revisions
  DROP CONSTRAINT commerce_order_revisions_source_record_id_fkey;
ALTER TABLE nex_runtime.commerce_order_revisions
  ADD CONSTRAINT commerce_order_revisions_source_record_id_fkey
  FOREIGN KEY (source_record_id)
  REFERENCES nex_runtime_immutable_records_v1.records(id)
  ON DELETE RESTRICT;
ALTER TABLE nex_runtime.commerce_line_item_revisions
  DROP CONSTRAINT commerce_line_item_revisions_source_record_id_fkey;
ALTER TABLE nex_runtime.commerce_line_item_revisions
  ADD CONSTRAINT commerce_line_item_revisions_source_record_id_fkey
  FOREIGN KEY (source_record_id)
  REFERENCES nex_runtime_immutable_records_v1.records(id)
  ON DELETE RESTRICT;
SQL

echo "[cleanroom] install exact adapter and app while every trigger stays dormant"
install_package adapter shopify "cleanroom-shopify-${adapter_sha256:0:16}" \
  "${ADAPTER_VERSION}" "/artifacts/adapter/shopify-${ADAPTER_VERSION}.tar.gz" "${adapter_artifact}"
install_package app moonsleep-commerce "cleanroom-commerce-${app_sha256:0:16}" \
  "${APP_VERSION}" "/artifacts/app/moonsleep-commerce-${APP_VERSION}.tar.gz" "${app_artifact}"

adapter_state="$(package_get adapter shopify)"
app_state="$(package_get app moonsleep-commerce)"
jq -e --arg version "${ADAPTER_VERSION}" '.status == "active" and .active_version == $version' <<<"${adapter_state}" >/dev/null
jq -e --arg version "${APP_VERSION}" '.status == "active" and .active_version == $version' <<<"${app_state}" >/dev/null

health_before="$(runtime_call moonsleep-commerce.healthcheck '{}')"
jq -e '
  .status == "ok" and
  .projectors.shopify_customer_identity == "dormant_ready_full_postgres_activation_gates" and
  .projectors.shopify_order_commerce == "available_event_projector" and
  .provider_write_authority == false
' <<<"${health_before}" >/dev/null

jobs_before="$(runtime_call jobs.list '{}')"
subscriptions_before="$(runtime_call events.subscriptions.list '{}')"
schedules_before="$(runtime_call schedules.list '{}')"
jq -e '
  (.jobs | length) == 15 and
  ([.jobs[] | select(.name == "moonsleep-commerce.shopify-customer-identity" or .name == "moonsleep-commerce.shopify-order-commerce")] | length) == 2 and
  all(.jobs[] | select(.name == "moonsleep-commerce.shopify-customer-identity" or .name == "moonsleep-commerce.shopify-order-commerce"); .status == "inactive") and
  ([.jobs[] | select(.name | startswith("moonsleep-commerce.shopify-source."))] | length) == 12 and
  ([.jobs[] | select(.name == "moonsleep-commerce.shopify-paid-order-effects" and .status == "active" and .lane_id == "adapter_io" and .execution_profile_revision_id == "job_profile_bulk_compute_r1")] | length) == 1 and
  all(.jobs[] | select(.name | startswith("moonsleep-commerce.shopify-source.")); .status == "active" and (.config_json | fromjson | has("connection_id") | not))
' <<<"${jobs_before}" >/dev/null
jq -e '
  (.subscriptions | length) == 3 and
  ([.subscriptions[].match_json] | sort) == [
    "{\"platform\":\"shopify\",\"container_id\":\"customer\"}",
    "{\"platform\":\"shopify\",\"container_id\":\"line_item\"}",
    "{\"platform\":\"shopify\",\"container_id\":\"order\"}"
  ] and
  all(.subscriptions[]; .event_type == "record.ingested" and .enabled == 0)
' <<<"${subscriptions_before}" >/dev/null
jq -e '
  (.schedules | length) == 12 and
  all(.schedules[]; .enabled == 0 and .timezone == "UTC" and (.name | startswith("moonsleep-commerce.shopify-source.")))
' <<<"${schedules_before}" >/dev/null

schedule_plan_params="$(jq -nc --arg connection_id "${CONNECTION_ID}" '{mode:"plan",connection_id:$connection_id,enabled_families:[]}')"
schedule_plan="$(runtime_call moonsleep-commerce.shopify-source.configure-schedules "${schedule_plan_params}")"
jq -e '
  .state == "planned" and .connection_id == "shopify-primary" and
  (.enabled_families | length) == 0 and (.schedules | length) == 12 and
  all(.schedules[]; .enabled == false and .timezone == "UTC") and
  (.plan_sha256 | test("^[0-9a-f]{64}$")) and .provider_write_authority == false
' <<<"${schedule_plan}" >/dev/null
[[ "$(jq -S -c . <<<"$(runtime_call jobs.list '{}')")" == "$(jq -S -c . <<<"${jobs_before}")" ]]
[[ "$(jq -S -c . <<<"$(runtime_call schedules.list '{}')")" == "$(jq -S -c . <<<"${schedules_before}")" ]]

echo "[cleanroom] register the canonical authority-free Customer Facet Definition"
customer_facet_configuration_id="configuration:moonsleep.customer.v1"
customer_facet_actor_id="entity_moonsleep_ops"
customer_facet_policy_ref="policy:moonsleep.customer.facet.v1"
customer_facet_reason="Register the canonical MoonSleep Customer Facet Definition."
customer_facet_configuration_json="$(jq -S -nc \
  --arg id "${customer_facet_configuration_id}" \
  --arg actor "${customer_facet_actor_id}" \
  --arg policy "${customer_facet_policy_ref}" \
  --arg reason "${customer_facet_reason}" \
  '{id:$id,actor_entity_id:$actor,policy_ref:$policy,reason:$reason}')"
customer_facet_configuration_sha256="$(printf '%s' "${customer_facet_configuration_json}" | shasum -a 256 | awk '{print $1}')"
customer_facet_configuration_params="$(jq -nc \
  --arg actor "${customer_facet_actor_id}" \
  --arg policy "${customer_facet_policy_ref}" \
  --arg reason "${customer_facet_reason}" \
  --arg receipt_id "${customer_facet_configuration_id}" \
  --arg receipt_sha256 "${customer_facet_configuration_sha256}" \
  '{actor_entity_id:$actor,policy_ref:$policy,reason:$reason,configuration_receipt_id:$receipt_id,configuration_receipt_sha256:$receipt_sha256,idempotency_key:"moonsleep.customer.v1:configuration:register"}')"
customer_facet_configuration_first="$(runtime_call graph.configurations.register "${customer_facet_configuration_params}")"
customer_facet_configuration_second="$(runtime_call graph.configurations.register "${customer_facet_configuration_params}")"
jq -e '.configuration_receipt_id == "configuration:moonsleep.customer.v1" and .replayed == false and .action_authority == false' <<<"${customer_facet_configuration_first}" >/dev/null
jq -e '.configuration_receipt_id == "configuration:moonsleep.customer.v1" and .replayed == true and .action_authority == false' <<<"${customer_facet_configuration_second}" >/dev/null

customer_facet_source_manifest_json="$(jq -S -nc '{contract_id:"moonsleep.customer.facet-definition.v1",canonical_spec:"docs/specs/core-real-world-graph-runtime.md",source_spec:"docs/specs/identity/shopify-customer-universal-contact-materialization.md",definition_id:"moonsleep.customer.v1",definition_version:1}')"
customer_facet_source_manifest_sha256="$(printf '%s' "${customer_facet_source_manifest_json}" | shasum -a 256 | awk '{print $1}')"
customer_facet_registration_id="facet-registration:moonsleep.customer.v1:1"
customer_facet_registration_json="$(jq -S -nc \
  --arg id "${customer_facet_registration_id}" \
  --arg source_manifest_sha256 "${customer_facet_source_manifest_sha256}" \
  --arg configuration_receipt_id "${customer_facet_configuration_id}" \
  '{id:$id,facet_definition_id:"moonsleep.customer.v1",definition_version:1,source_manifest_sha256:$source_manifest_sha256,configuration_receipt_id:$configuration_receipt_id}')"
customer_facet_registration_sha256="$(printf '%s' "${customer_facet_registration_json}" | shasum -a 256 | awk '{print $1}')"
customer_facet_definition_params="$(jq -nc \
  --arg actor "${customer_facet_actor_id}" \
  --arg policy "${customer_facet_policy_ref}" \
  --arg reason "${customer_facet_reason}" \
  --arg configuration_receipt_id "${customer_facet_configuration_id}" \
  --arg configuration_receipt_sha256 "${customer_facet_configuration_sha256}" \
  --arg source_manifest_sha256 "${customer_facet_source_manifest_sha256}" \
  --arg registration_receipt_id "${customer_facet_registration_id}" \
  --arg registration_receipt_sha256 "${customer_facet_registration_sha256}" \
  '{id:"moonsleep.customer.v1",definition_version:1,predecessor_definition_version:null,name:"MoonSleep Customer",domain_scope:"moonsleep",compatible_subject_classes:["nex.entity"],attachment_cardinality:"optional_one",attachment_slots:["customer"],attribute_contract:[],relationship_contract:[],validation_contract:{required_basis_type:"accepted_observation",required_privacy_class:"restricted",basis_observation_ref_required:true},renderer_contract:{profile_label:"Customer",workspace_ref:"moonsleep.organizations"},authority_contract:{action_authority:false,provider_mutation_authority:false,resource_mutation_authority:false,implicit_creation_authority:false},migration_contract:{},owner_package:"moonsleep",source_manifest_sha256:$source_manifest_sha256,basis:{basis_type:"governed_configuration",actor_entity_id:$actor,policy_ref:$policy,reason:$reason,configuration_receipt_id:$configuration_receipt_id,configuration_receipt_sha256:$configuration_receipt_sha256},registration_receipt_id:$registration_receipt_id,registration_receipt_sha256:$registration_receipt_sha256,idempotency_key:"moonsleep.customer.v1:definition:register"}')"
customer_facet_definition_first="$(runtime_call facets.definitions.create "${customer_facet_definition_params}")"
customer_facet_definition_second="$(runtime_call facets.definitions.create "${customer_facet_definition_params}")"
jq -e '.definition.id == "moonsleep.customer.v1" and .definition.definition_version == 1 and .replayed == false and .action_authority == false' <<<"${customer_facet_definition_first}" >/dev/null
jq -e '.definition.id == "moonsleep.customer.v1" and .definition.definition_version == 1 and .replayed == true and .action_authority == false' <<<"${customer_facet_definition_second}" >/dev/null

initial_counts="$(runtime_counts)"
jq -e '
  .records == 0 and .ingest_receipts == 0 and
  .legacy_records == 0 and .legacy_receipts == 0 and .events == 0 and
  .entities == 4 and .contacts == 0 and .observations == 0 and
  .queue_rows == 0 and .active_queue_rows == 0 and
  .dispatch_receipts == 0 and .adapter_instances == 0 and
  .commerce_orders == 0 and .commerce_order_revisions == 0 and
  .commerce_line_items == 0 and .commerce_line_item_revisions == 0 and
  .customer_facets == 0 and .accepted_observation_compatibility_receipts == 0
' <<<"${initial_counts}" >/dev/null

seed_params="$(jq -nc --arg shop_domain "${SHOP_DOMAIN}" --arg connection_id "${CONNECTION_ID}" '{shop_domain:$shop_domain,connection_id:$connection_id}')"
seed_first="$(runtime_call moonsleep-commerce.shopify-source.seed-identities "${seed_params}")"
seed_second="$(runtime_call moonsleep-commerce.shopify-source.seed-identities "${seed_params}")"
jq -e '.identities_observed == 2 and .created_entities == 2 and .created_contacts == 2 and .replayed == 0 and .provider_write_authority == false' <<<"${seed_first}" >/dev/null
jq -e '.identities_observed == 2 and .created_entities == 0 and .created_contacts == 0 and .replayed == 2 and .provider_write_authority == false' <<<"${seed_second}" >/dev/null
seed_contract_sha256="$(jq -r '.source_identity_contract_sha256' <<<"${seed_first}")"
[[ "${seed_contract_sha256}" == "$(jq -r '.source_identity_contract_sha256' <<<"${seed_second}")" ]]

echo "[cleanroom] enable the two native event projectors"
projection_plan="$(runtime_call moonsleep-commerce.shopify-projections.configure '{"mode":"plan","enabled_projections":["customer_identity","order_commerce"]}')"
projection_plan_sha256="$(jq -er '
  select(.state == "planned" and .enabled_projections == ["customer_identity","order_commerce"])
  | .plan_sha256
  | select(test("^[0-9a-f]{64}$"))
' <<<"${projection_plan}")"
projection_apply_params="$(jq -nc \
  --arg plan_sha256 "${projection_plan_sha256}" \
  '{mode:"apply",enabled_projections:["customer_identity","order_commerce"],expected_plan_sha256:$plan_sha256,confirmation:"CONFIGURE_MOONSLEEP_SHOPIFY_PROJECTIONS"}')"
projection_apply="$(runtime_call moonsleep-commerce.shopify-projections.configure "${projection_apply_params}")"
jq -e --arg plan_sha256 "${projection_plan_sha256}" '
  .state == "applied" and .plan_sha256 == $plan_sha256 and
  .enabled_projections == ["customer_identity","order_commerce"]
' <<<"${projection_apply}" >/dev/null

echo "[cleanroom] commit exact customer, order, and line-item immutable Records"
customer_params="$(build_record_params customer)"
order_params="$(build_record_params order)"
line_params="$(build_record_params line_item)"

customer_ingest_first="$(runtime_call record.ingest "${customer_params}")"
order_ingest_first="$(runtime_call record.ingest "${order_params}")"
line_ingest_first="$(runtime_call record.ingest "${line_params}")"
jq -e '.ok == true and .status == "completed"' <<<"${customer_ingest_first}" >/dev/null
jq -e '.ok == true and .status == "completed"' <<<"${order_ingest_first}" >/dev/null
jq -e '.ok == true and .status == "completed"' <<<"${line_ingest_first}" >/dev/null

echo "[cleanroom] immutable Records committed; wait for native event projectors"
CUSTOMER_SOURCE_ID="$(postgres_json "SELECT id FROM nex_runtime_immutable_records_v1.records WHERE source_record_type = 'shopify.customer' LIMIT 1")"
ORDER_SOURCE_ID="$(postgres_json "SELECT id FROM nex_runtime_immutable_records_v1.records WHERE source_record_type = 'shopify.order' LIMIT 1")"
LINE_SOURCE_ID="$(postgres_json "SELECT id FROM nex_runtime_immutable_records_v1.records WHERE source_record_type = 'shopify.line_item' LIMIT 1")"
cohort_params="$(jq -nc --arg id "${CUSTOMER_SOURCE_ID}" '{record_ids:[$id]}')"

order_gid="gid://shopify/Order/900719925474099312346"
billing_sha256="$(printf '%s' '{"address1":"1 Synthetic Way","city":"Austin","zip":"78701"}' | shasum -a 256 | awk '{print $1}')"
shipping_sha256="$(printf '%s' '{"address1":"2 Replay Road","city":"Austin","zip":"78702"}' | shasum -a 256 | awk '{print $1}')"
commerce_order_params="$(jq -nc --arg shop "${SHOP_DOMAIN}" --arg order "${order_gid}" '{platform:"shopify",space_id:$shop,order_id:$order}')"
commerce_order_read='{"found":false,"order":null,"revision":null,"line_items":[]}'
for _ in $(seq 1 60); do
  commerce_order_read="$(runtime_call commerce.orders.get "${commerce_order_params}")"
  if jq -e '.found == true and (.line_items | length) == 1' <<<"${commerce_order_read}" >/dev/null; then
    break
  fi
  sleep 1
done
if ! jq -e \
  --arg order "${order_gid}" \
  --arg billing_sha256 "${billing_sha256}" \
  --arg shipping_sha256 "${shipping_sha256}" '
  .found == true and .order.order_id == $order and
  .revision.customer_contact_id != null and .revision.customer_entity_id != null and
  .revision.currency == "USD" and .revision.total_price == "199.00" and
  .revision.billing_address_sha256 == $billing_sha256 and
  .revision.shipping_address_sha256 == $shipping_sha256 and
  (.line_items | length) == 1 and
  .line_items[0].line_item.line_item_id == "gid://shopify/LineItem/900719925474099312347" and
  .line_items[0].revision.sku == "SYNTHETIC-SKU" and
  .line_items[0].revision.price == "199.00" and
  .line_items[0].revision.currency == "USD"
' <<<"${commerce_order_read}" >/dev/null; then
  printf 'canonical Commerce Order read failed: %s\n' "$(jq -c . <<<"${commerce_order_read}")" >&2
  exit 1
fi
echo "[cleanroom] canonical Commerce Order read verified"

customer_entity_id="$(jq -r '.revision.customer_entity_id' <<<"${commerce_order_read}")"
customer_facet_read="$(runtime_call facets.attachments.list "$(jq -nc --arg entity_id "${customer_entity_id}" '{subject_class:"nex.entity",subject_id:$entity_id,facet_definition_id:"moonsleep.customer.v1",lifecycle_state:"active",limit:2}')")"
customer_observation_head_key="moonsleep.commerce:shopify-customer:${SHOP_DOMAIN}:gid://shopify/Customer/900719925474099312345"
customer_observation_head="$(runtime_call memory.evidence.observations.head.get "$(jq -nc --arg head_key "${customer_observation_head_key}" '{headKey:$head_key}')")"
customer_episodes="$(runtime_call memory.evidence.episodes.list '{"limit":10,"offset":0}')"
customer_facts="$(runtime_call memory.evidence.facts.list '{"profileId":"commerce.customer.reference_fact.v1","profileVersion":"1.0.0","limit":10,"offset":0}')"
jq -e --arg entity_id "${customer_entity_id}" '
  .items[0] as $facet |
  (.items | length) == 1 and .next_cursor == null and
  $facet.facet_definition_id == "moonsleep.customer.v1" and
  $facet.definition_version == 1 and
  $facet.subject_class == "nex.entity" and $facet.subject_id == $entity_id and
  $facet.domain_scope == "moonsleep" and $facet.attachment_slot == "customer" and
  $facet.instance_key == null and $facet.lifecycle_state == "active" and
  $facet.privacy_class == "restricted" and
  $facet.basis.basis_type == "accepted_observation" and
  (
    ($facet.observation_refs | index($facet.basis.observation_id)) != null or
    (
      ($facet.observation_refs | length) == 0 and
      ($facet.redacted_fields | index("observation_refs")) != null
    )
  ) and
  $facet.values == {} and $facet.relationships == [] and .action_authority == false
' <<<"${customer_facet_read}" >/dev/null
echo "[cleanroom] Customer Facet read verified"
customer_observation_id="$(jq -r '.items[0].basis.observation_id' <<<"${customer_facet_read}")"
jq -e --arg observation_id "${customer_observation_id}" '
  .item.head_element_id == $observation_id and .item.observation.id == $observation_id and
  .item.observation.profile_id == "commerce.customer.current.v1" and
  .item.observation.profile_version == "1.0.0" and
  .item.observation.metadata.typed_payload.customer_ref == "gid://shopify/Customer/900719925474099312345" and
  .item.observation.metadata.typed_payload.current_state == "customer" and
  .item.observation.metadata.typed_payload.review_state == "source_anchored"
' <<<"${customer_observation_head}" >/dev/null
jq -e --arg record_id "${CUSTOMER_SOURCE_ID}" '
  (.items | length) == 1 and
  .items[0].source_record_refs == [{record_id:$record_id,payload_sha256:.items[0].source_record_refs[0].payload_sha256}]
' <<<"${customer_episodes}" >/dev/null
jq -e '
  (.items | length) == 1 and
  .items[0].profile_id == "commerce.customer.reference_fact.v1" and
  .items[0].profile_version == "1.0.0" and
  .items[0].metadata.typed_payload.customer_ref == "gid://shopify/Customer/900719925474099312345" and
  .items[0].metadata.typed_payload.identity_state == "source_anchored"
' <<<"${customer_facts}" >/dev/null
echo "[cleanroom] customer semantic evidence read verified"

cohort_params="$(jq -nc --arg id "${CUSTOMER_SOURCE_ID}" '{record_ids:[$id]}')"
cohort_first="$(runtime_call moonsleep-commerce.shopify-customers.project-cohort "${cohort_params}")"
cohort_second="$(runtime_call moonsleep-commerce.shopify-customers.project-cohort "${cohort_params}")"
echo "[cleanroom] cohort first $(jq -c '{state,records_projected,created_entities,created_contacts,replayed,result:{customer_observation_outcome:.results[0].customer_observation_outcome,customer_facet_outcome:.results[0].customer_facet_outcome},provider_write_authority}' <<<"${cohort_first}")"
echo "[cleanroom] cohort second $(jq -c '{state,records_projected,created_entities,created_contacts,replayed,result:{customer_observation_outcome:.results[0].customer_observation_outcome,customer_facet_outcome:.results[0].customer_facet_outcome},provider_write_authority}' <<<"${cohort_second}")"
jq -e '.state == "succeeded" and .records_projected == 1 and .created_entities == 0 and .created_contacts == 0 and .replayed == 1 and .results[0].customer_observation_outcome == "adopted_existing" and .results[0].customer_facet_outcome == "adopted_existing" and .provider_write_authority == false' <<<"${cohort_first}" >/dev/null
jq -e '.state == "succeeded" and .records_projected == 1 and .created_entities == 0 and .created_contacts == 0 and .replayed == 1 and .results[0].customer_observation_outcome == "adopted_existing" and .results[0].customer_facet_outcome == "adopted_existing" and .provider_write_authority == false' <<<"${cohort_second}" >/dev/null
echo "[cleanroom] direct customer cohort replay verified"

customer_ingest_second="$(runtime_call record.ingest "${customer_params}")"
order_ingest_second="$(runtime_call record.ingest "${order_params}")"
line_ingest_second="$(runtime_call record.ingest "${line_params}")"
jq -e '.ok == true and .status == "skipped"' <<<"${customer_ingest_second}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${order_ingest_second}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${line_ingest_second}" >/dev/null
echo "[cleanroom] immutable Record replay verified"

counts_before_restart="$(runtime_counts)"
echo "[cleanroom] pre-restart counts $(jq -c . <<<"${counts_before_restart}")"
jq -e '
  .records == 3 and .ingest_receipts == 6 and
  .legacy_records == 0 and .legacy_receipts == 0 and .events == 3 and
  .entities == 7 and .contacts == 4 and .observations == 4 and .tags == 11 and
  .queue_rows == 3 and .active_queue_rows == 0 and
  .dispatch_receipts == 3 and .adapter_instances == 0 and
  .commerce_orders == 1 and .commerce_order_revisions == 1 and
  .commerce_line_items == 1 and .commerce_line_item_revisions == 1 and
  .customer_facets == 1 and .accepted_observation_compatibility_receipts == 0
' <<<"${counts_before_restart}" >/dev/null
echo "[cleanroom] pre-restart cardinality verified"

record_contract="$(postgres_json "
  SELECT COALESCE(json_agg(row_to_json(contract_row) ORDER BY contract_row.family), '[]'::JSON)
  FROM (
    SELECT
      records.payload_json::JSONB#>>'{source_metadata,payload_metadata,family}' AS family,
      records.id AS record_id,
      records.platform,
      records.payload_sha256,
      records.payload_json::JSONB#>>'{source_metadata,provider_payload,provider_object_sha256}' AS provider_object_sha256
    FROM nex_runtime_immutable_records_v1.records records
  ) contract_row")"
jq -e '
  length == 3 and
  all(.[];
    .platform == "shopify" and
    (.record_id | test("^record_[0-9a-f]{64}$")) and
    (.payload_sha256 | test("^[0-9a-f]{64}$")) and
    (.provider_object_sha256 | test("^[0-9a-f]{64}$"))
  )
' <<<"${record_contract}" >/dev/null
echo "[cleanroom] immutable Record contract verified"

while IFS=$'\t' read -r family provider_json declared_sha256; do
  actual_sha256="$(printf '%s' "${provider_json}" | shasum -a 256 | awk '{print $1}')"
  [[ "${actual_sha256}" == "${declared_sha256}" ]] || {
    echo "provider payload digest mismatch for ${family}" >&2
    exit 1
  }
done < <(docker exec -u postgres "${postgres_container}" psql -X -d moonsleep_nex -AtF $'\t' -c \
  "SELECT payload_json::JSONB#>>'{source_metadata,payload_metadata,family}', payload_json::JSONB#>>'{source_metadata,provider_payload,provider_object_json}', payload_json::JSONB#>>'{source_metadata,provider_payload,provider_object_sha256}' FROM nex_runtime_immutable_records_v1.records ORDER BY payload_json::JSONB#>>'{source_metadata,payload_metadata,family}'")

customer_record_id="$(postgres_json "SELECT id FROM nex_runtime_immutable_records_v1.records WHERE source_record_type = 'shopify.customer' LIMIT 1")"
[[ "${customer_record_id}" == "${CUSTOMER_SOURCE_ID}" ]]
event_customer_read="$(runtime_call records.get "$(jq -nc --arg id "${customer_record_id}" '{id:$id}')")"
jq -e --arg id "${CUSTOMER_SOURCE_ID}" '.record.id == $id' <<<"${event_customer_read}" >/dev/null

echo "[cleanroom] restart and prove durable package, record, identity, and active projector state"
docker restart "${runtime_container}" >/dev/null
wait_for_runtime
docker logs --since 30s "${runtime_container}" 2>&1 | grep -F 'runtime started (no adapter monitors started)' >/dev/null

adapter_state_after="$(package_get adapter shopify)"
app_state_after="$(package_get app moonsleep-commerce)"
health_after="$(runtime_call moonsleep-commerce.healthcheck '{}')"
jobs_after="$(runtime_call jobs.list '{}')"
subscriptions_after="$(runtime_call events.subscriptions.list '{}')"
schedules_after="$(runtime_call schedules.list '{}')"
jq -e --arg version "${ADAPTER_VERSION}" '.status == "active" and .active_version == $version' <<<"${adapter_state_after}" >/dev/null
jq -e --arg version "${APP_VERSION}" '.status == "active" and .active_version == $version' <<<"${app_state_after}" >/dev/null
jq -e '.status == "ok" and .provider_write_authority == false' <<<"${health_after}" >/dev/null
jq -e '
  (.jobs | length) == 15 and
  all(.jobs[] | select(.name == "moonsleep-commerce.shopify-customer-identity" or .name == "moonsleep-commerce.shopify-order-commerce"); .status == "active") and
  all(.jobs[] | select(.name | startswith("moonsleep-commerce.shopify-source.")); .status == "active")
' <<<"${jobs_after}" >/dev/null
jq -e '
  (.subscriptions | length) == 3 and
  ([.subscriptions[].match_json] | sort) == [
    "{\"platform\":\"shopify\",\"container_id\":\"customer\"}",
    "{\"platform\":\"shopify\",\"container_id\":\"line_item\"}",
    "{\"platform\":\"shopify\",\"container_id\":\"order\"}"
  ] and
  all(.subscriptions[]; .enabled == 1)
' <<<"${subscriptions_after}" >/dev/null
jq -e '(.schedules | length) == 12 and all(.schedules[]; .enabled == 0 and .timezone == "UTC")' <<<"${schedules_after}" >/dev/null

customer_ingest_after_restart="$(runtime_call record.ingest "${customer_params}")"
order_ingest_after_restart="$(runtime_call record.ingest "${order_params}")"
line_ingest_after_restart="$(runtime_call record.ingest "${line_params}")"
cohort_after_restart="$(runtime_call moonsleep-commerce.shopify-customers.project-cohort "${cohort_params}")"
jq -e '.ok == true and .status == "skipped"' <<<"${customer_ingest_after_restart}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${order_ingest_after_restart}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${line_ingest_after_restart}" >/dev/null
jq -e '.state == "succeeded" and .created_entities == 0 and .created_contacts == 0 and .replayed == 1 and .results[0].customer_observation_outcome == "adopted_existing" and .results[0].customer_facet_outcome == "adopted_existing"' <<<"${cohort_after_restart}" >/dev/null

counts_after_restart="$(runtime_counts)"
jq -e --argjson before "${counts_before_restart}" '
  .records == $before.records and
  .ingest_receipts == ($before.ingest_receipts + 3) and
  .legacy_records == 0 and .legacy_receipts == 0 and .events == $before.events and
  .entities == $before.entities and .contacts == $before.contacts and
  .observations == $before.observations and .tags == $before.tags and
  .queue_rows == $before.queue_rows and .active_queue_rows == 0 and
  .dispatch_receipts == $before.dispatch_receipts and
  .adapter_instances == $before.adapter_instances and
  .commerce_orders == $before.commerce_orders and
  .commerce_order_revisions == $before.commerce_order_revisions and
  .commerce_line_items == $before.commerce_line_items and
  .commerce_line_item_revisions == $before.commerce_line_item_revisions and
  .customer_facets == $before.customer_facets and
  .accepted_observation_compatibility_receipts == 0
' <<<"${counts_after_restart}" >/dev/null

echo "[cleanroom] invoke the paid-order Job and prove four reserve-only Effects"
paid_order_effects_job_id="$(jq -er '
  .jobs[]
  | select(
      .name == "moonsleep-commerce.shopify-paid-order-effects" and
      .status == "active" and
      .execution_profile_revision_id == "job_profile_bulk_compute_r1" and
      .runtime_method_allowlist == "[\"jobs.effects.perform\"]"
    )
  | .id
' <<<"${jobs_after}")"
paid_order_effects_input="$(jq -nc \
  --arg customer_record_id "${CUSTOMER_SOURCE_ID}" \
  --arg order_record_id "${ORDER_SOURCE_ID}" \
  --arg line_record_id "${LINE_SOURCE_ID}" \
  '{contract_id:"moonsleep-commerce.shopify-paid-order-effects-input.v1",work_root_id:"shopify:orders-paid:cleanroom-webhook-receipt",shopify_order_id:"900719925474099312346",observation_receipt_id:("channelobs_" + ("1" * 32)),projection_work_id:("channelprojection_" + ("2" * 32)),source_run_id:"jobrun_cleanroom_source",projector_run_ids:["jobrun_cleanroom_projector"],record_ids:[$order_record_id,$line_record_id,$customer_record_id]}')"
paid_order_invoke_params="$(jq -nc \
  --arg job_id "${paid_order_effects_job_id}" \
  --argjson input "${paid_order_effects_input}" \
  '{job_id:$job_id,input:$input,trigger_source:"cleanroom.shopify.orders_paid",idempotency_key:"shopify:orders-paid:cleanroom-webhook-receipt",max_attempts:3}')"
paid_order_prior_idempotency_readback="$(postgres_json "
  SELECT COALESCE(json_agg(row_to_json(candidate)), '[]'::JSON)
  FROM (
    SELECT reservation.idempotency_key, reservation.job_definition_id,
           reservation.request_fingerprint, reservation.status,
           reservation.first_run_id, reservation.active_run_id, reservation.latest_run_id,
           run.trigger_source, run.status AS run_status, run.input_json
    FROM nex_runtime.job_idempotency AS reservation
    LEFT JOIN nex_runtime.job_runs AS run ON run.id = reservation.latest_run_id
    WHERE reservation.idempotency_key = 'shopify:orders-paid:cleanroom-webhook-receipt'
  ) AS candidate
")"
if [[ "${paid_order_prior_idempotency_readback}" != "[]" ]]; then
  printf 'paid-order idempotency key was claimed before explicit invocation: %s\n' \
    "${paid_order_prior_idempotency_readback}" >&2
fi
if ! paid_order_invocation="$(runtime_call jobs.invoke "${paid_order_invoke_params}")"; then
  paid_order_idempotency_readback="$(postgres_json "
    SELECT COALESCE(json_agg(row_to_json(candidate)), '[]'::JSON)
    FROM (
      SELECT reservation.idempotency_key, reservation.job_definition_id,
             reservation.request_fingerprint, reservation.status,
             reservation.first_run_id, reservation.active_run_id, reservation.latest_run_id,
             run.trigger_source, run.status AS run_status, run.input_json
      FROM nex_runtime.job_idempotency AS reservation
      LEFT JOIN nex_runtime.job_runs AS run ON run.id = reservation.latest_run_id
      WHERE reservation.idempotency_key = 'shopify:orders-paid:cleanroom-webhook-receipt'
    ) AS candidate
  ")"
  printf 'paid-order idempotency readback: %s\n' "${paid_order_idempotency_readback}" >&2
  exit 1
fi
paid_order_run_id="$(jq -er '.run.id' <<<"${paid_order_invocation}")"
paid_order_run='{}'
for _ in $(seq 1 90); do
  paid_order_run="$(runtime_call jobs.runs.get "$(jq -nc --arg id "${paid_order_run_id}" '{id:$id}')")"
  paid_order_run_status="$(jq -r '.run.status // ""' <<<"${paid_order_run}")"
  if [[ "${paid_order_run_status}" == "completed" ]]; then
    break
  fi
  if [[ "${paid_order_run_status}" == "failed" || "${paid_order_run_status}" == "cancelled" || "${paid_order_run_status}" == "quarantined" ]]; then
    printf 'paid-order Effects Run failed: %s\n' "$(jq -c . <<<"${paid_order_run}")" >&2
    exit 1
  fi
  sleep 1
done
if [[ "$(jq -r '.run.status // ""' <<<"${paid_order_run}")" != "completed" ]]; then
  printf 'paid-order Effects Run did not complete: %s\n' "$(jq -c . <<<"${paid_order_run}")" >&2
  docker logs "${runtime_container}" >&2 || true
  exit 1
fi
paid_order_output="$(jq -er '.run | select(.status == "completed") | .output_json | fromjson' <<<"${paid_order_run}")"
jq -e '
  .contract_id == "moonsleep-commerce.shopify-paid-order-effects-result.v1" and
  .work_root_id == "shopify:orders-paid:cleanroom-webhook-receipt" and
  .provider_write_authority == false and .provider_write_count == 0 and
  (.effects | length) == 4 and
  ([.effects[].provider] | sort) == ["google_ads","meta","pinterest","tiktok"] and
  all(.effects[];
    .status == "reserved" and
    (.effect_id | test("^effect_shopify_paid_[0-9a-f]{32}$")) and
    (.receipt_id | test("^effectreceipt_[0-9a-f]{32}$")) and
    (.receipt_sha256 | test("^[0-9a-f]{64}$"))
  )
' <<<"${paid_order_output}" >/dev/null
paid_order_effect_readback="$(postgres_json "
  SELECT json_build_object(
    'effects', (SELECT COUNT(*) FROM nex_runtime.job_effects WHERE job_run_id = '${paid_order_run_id}'),
    'reserved', (SELECT COUNT(*) FROM nex_runtime.job_effects WHERE job_run_id = '${paid_order_run_id}' AND status = 'reserved'),
    'receipts', (
      SELECT COUNT(*)
        FROM nex_runtime.job_effect_transition_receipts receipt
        JOIN nex_runtime.job_effects effect ON effect.id = receipt.effect_id
       WHERE effect.job_run_id = '${paid_order_run_id}'
    )
  )")"
jq -e '.effects == 4 and .reserved == 4 and .receipts == 4' <<<"${paid_order_effect_readback}" >/dev/null
paid_order_replay="$(runtime_call jobs.invoke "${paid_order_invoke_params}")"
jq -e --arg run_id "${paid_order_run_id}" '.run.id == $run_id and .run.status == "completed"' <<<"${paid_order_replay}" >/dev/null
echo "[cleanroom] paid-order Effect reservations and replay verified"
[[ -z "$(git -C "${UMBRELLA_ROOT}" status --porcelain=v1 --untracked-files=all)" ]] || {
  echo "cleanroom changed the source worktree" >&2
  exit 1
}

postgres_image_id="$(docker image inspect "${POSTGRES_IMAGE}" --format '{{.Id}}')"
nex_image_id="$(docker image inspect "${NEX_IMAGE}" --format '{{.Id}}')"
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cleanup_resources
[[ -z "$(docker ps -a --filter "name=${network}" --format '{{.Names}}')" ]]
[[ -z "$(docker volume ls --filter "name=${network}" --format '{{.Name}}')" ]]
[[ -z "$(docker network ls --filter "name=${network}" --format '{{.Name}}')" ]]

jq -n \
  --arg finished_at "${finished_at}" \
  --arg source_revision "${source_revision}" \
  --arg source_tree "${source_tree}" \
  --arg nex_revision "${nex_revision}" \
  --arg nex_image "${NEX_IMAGE}" \
  --arg nex_image_id "${nex_image_id}" \
  --arg postgres_image "${POSTGRES_IMAGE}" \
  --arg postgres_image_id "${postgres_image_id}" \
  --arg postgres_version "${postgres_version}" \
  --arg adapter_sha256 "${adapter_sha256}" \
  --arg app_sha256 "${app_sha256}" \
  --arg seed_contract_sha256 "${seed_contract_sha256}" \
  --arg paid_order_run_id "${paid_order_run_id}" \
  --argjson initial_counts "${initial_counts}" \
  --argjson terminal_counts "${counts_after_restart}" \
  --argjson record_contract "${record_contract}" \
  --argjson paid_order_effect_readback "${paid_order_effect_readback}" \
  '{
    ok:true,
    finished_at:$finished_at,
    source:{revision:$source_revision,tree:$source_tree,clean_before_and_after:true},
    nex:{revision:$nex_revision,image:$nex_image,image_id:$nex_image_id,platform:"linux/amd64",storage_profile:"moonsleep-postgres-v1"},
    postgres:{image:$postgres_image,image_id:$postgres_image_id,version:$postgres_version,platform:"linux/amd64"},
    packages:{shopify_adapter_sha256:$adapter_sha256,moonsleep_commerce_sha256:$app_sha256,active_after_restart:true},
    source_identity:{contract_sha256:$seed_contract_sha256,first_create_count:2,second_create_count:0,second_replay_count:2},
    synthetic_ingest:{families:["customer","line_item","order"],exact_payload_sha256_verified:true,first_commit_count:3,replay_status:"skipped",pre_restart_ingest_receipts:6,post_restart_ingest_receipts:9,record_contract:$record_contract},
    customer_projection:{path:"record.ingested event",orders:0,line_items:0,customer_facets:1,canonical_contact_link:true},
    commerce_projection:{path:"record.ingested event",orders:1,line_items:1,canonical_customer_link:true,address_snapshots_sha256_bound:true},
    paid_order_effects:{run_id:$paid_order_run_id,status:"completed",providers:["google_ads","meta","pinterest","tiktok"],mode:"reserve_only",replay_same_run:true,durable_readback:$paid_order_effect_readback,provider_credentials_mounted:false,provider_calls:0,provider_write_authority:false},
    work_boundary:{projector_job_count:2,projector_job_status:"active",source_job_count:12,source_job_status:"active_for_explicit_invocation",paid_order_effects_job_count:1,paid_order_effects_mode:"reserve_only",source_schedule_count:12,source_schedules_enabled:0,source_schedule_plan_only:true,subscription_count:3,subscription_scope:"exact_record_family",subscription_enabled:true,queue_rows:3,active_queue_rows:0,dispatch_receipts:3,provider_credentials_mounted:false,provider_calls:0,provider_read_authority:false,provider_write_authority:false},
    restart:{app_rehydrated:true,adapter_active:true,record_replay_idempotent:true,identity_replay_idempotent:true,commerce_replay_idempotent:true},
    initial_counts:$initial_counts,
    terminal_counts:$terminal_counts,
    zero_residue:true
  }' > "${RECEIPT_PATH}"
chmod 0600 "${RECEIPT_PATH}"
trap - EXIT
rm -rf -- "${runner_temp}"

echo "[cleanroom] PASS receipt=${RECEIPT_PATH}"
