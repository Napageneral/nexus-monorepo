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
CUSTOMER_SOURCE_ID="shopify:shopify-primary:customer:900719925474099312345:synthetic-revision-1"
ORDER_SOURCE_ID="shopify:shopify-primary:order:900719925474099312346:synthetic-revision-1"
LINE_SOURCE_ID="shopify:shopify-primary:line_item:900719925474099312346:900719925474099312347:synthetic-revision-1"

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
runtime_role="nex_moonsleep_runtime"
migrator_role="nex_moonsleep_migrator"
runner_temp="$(mktemp -d /private/tmp/nex-shopify-full-postgres.XXXXXX)"
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
  ' sh "${method}" "${params}" 2>/dev/null
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

postgres_json() {
  local query="$1"
  docker exec -u postgres "${postgres_container}" \
    psql -X -d moonsleep_nex -Atqc "${query}"
}

runtime_counts() {
  postgres_json "
    SELECT json_build_object(
      'records', (SELECT COUNT(*) FROM nex_runtime.records),
      'receipts', (SELECT COUNT(*) FROM nex_runtime.record_ingest_receipts),
      'events', (SELECT COUNT(*) FROM nex_runtime.durable_events),
      'entities', (SELECT COUNT(*) FROM nex_runtime.entities),
      'contacts', (SELECT COUNT(*) FROM nex_runtime.contacts),
      'observations', (SELECT COUNT(*) FROM nex_runtime.contact_observations),
      'tags', (SELECT COUNT(*) FROM nex_runtime.entity_tags),
      'queue', (SELECT COUNT(*) FROM nex_runtime.job_queue),
      'dispatch_receipts', (SELECT COUNT(*) FROM nex_runtime.event_dispatch_receipts),
      'adapter_instances', (SELECT COUNT(*) FROM nex_runtime.adapter_instances),
      'commerce_orders', (SELECT COUNT(*) FROM nex_runtime.commerce_orders),
      'commerce_order_revisions', (SELECT COUNT(*) FROM nex_runtime.commerce_order_revisions),
      'commerce_line_items', (SELECT COUNT(*) FROM nex_runtime.commerce_line_items),
      'commerce_line_item_revisions', (SELECT COUNT(*) FROM nex_runtime.commerce_line_item_revisions)
    )"
}

build_record_params() {
  local family="$1"
  case "${family}" in
    customer)
      local provider='{"id":"gid://shopify/Customer/900719925474099312345","displayName":"Synthetic Customer","firstName":"Synthetic","lastName":"Customer","email":"synthetic@example.invalid","addresses":[]}'
      jq -nc --arg provider "${provider}" '{
        routing:{adapter:"shopify",platform:"shopify",connection_id:"shopify-primary",sender_id:"moonsleepco.myshopify.com",sender_name:"Shopify",receiver_id:"shopify-primary",space_id:"moonsleepco.myshopify.com",container_kind:"group",container_id:"customer",thread_id:"moonsleepco.myshopify.com:customer:900719925474099312345"},
        payload:{external_record_id:"shopify:shopify-primary:customer:900719925474099312345:synthetic-revision-1",timestamp:1784640000000,content:"customer Synthetic Customer",content_type:"text",payload:{provider_object_json:$provider,provider_object_sha256:"54f0be03d3397a358786086ec37b985d840a3d3ef23d7251958013e58cc989ae"},metadata:{connection_id:"shopify-primary",adapter_id:"shopify",family:"customer",logical_row_id:"moonsleepco.myshopify.com:900719925474099312345",revision_hash:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",provider_ids:{customer_id:"900719925474099312345",customer_gid:"gid://shopify/Customer/900719925474099312345"},row:{email:"synthetic@example.invalid",phone:"",addresses:[],last_name:"Customer",first_name:"Synthetic",customer_id:"900719925474099312345",shop_domain:"moonsleepco.myshopify.com",customer_gid:"gid://shopify/Customer/900719925474099312345",display_name:"Synthetic Customer",addresses_complete:true},source_request:{path:"/admin/api/2026-01/customers.json",method:"GET"}}}
      }'
      ;;
    order)
      local provider='{"id":900719925474099312346,"name":"#SYNTH-1","customer":{"id":900719925474099312345},"billing_address":{"address1":"1 Synthetic Way","city":"Austin","zip":"78701"},"shipping_address":{"address1":"2 Replay Road","city":"Austin","zip":"78702"},"total_price":"199.00"}'
      local provider_sha256
      provider_sha256="$(printf '%s' "${provider}" | shasum -a 256 | awk '{print $1}')"
      jq -nc --arg provider "${provider}" --arg provider_sha256 "${provider_sha256}" '{
        routing:{adapter:"shopify",platform:"shopify",connection_id:"shopify-primary",sender_id:"moonsleepco.myshopify.com",sender_name:"Shopify",receiver_id:"shopify-primary",space_id:"moonsleepco.myshopify.com",container_kind:"group",container_id:"order",thread_id:"moonsleepco.myshopify.com:order:900719925474099312346"},
        payload:{external_record_id:"shopify:shopify-primary:order:900719925474099312346:synthetic-revision-1",timestamp:1784640001000,content:"order #SYNTH-1 total=199.00",content_type:"text",payload:{provider_object_json:$provider,provider_object_sha256:$provider_sha256},metadata:{connection_id:"shopify-primary",adapter_id:"shopify",family:"order",logical_row_id:"moonsleepco.myshopify.com:900719925474099312346",revision_hash:"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",provider_ids:{shop_domain:"moonsleepco.myshopify.com",order_id:"900719925474099312346",customer_id:"900719925474099312345"},row:{name:"#SYNTH-1",currency:"USD",order_id:"900719925474099312346",shop_domain:"moonsleepco.myshopify.com",subtotal_price:"199.00",total_price:"199.00",financial_status:"paid",fulfillment_status:"unfulfilled",customer_id:"900719925474099312345",billing_address:{zip:"78701",city:"Austin",address1:"1 Synthetic Way"},shipping_address:{zip:"78702",city:"Austin",address1:"2 Replay Road"}},source_request:{path:"/admin/api/2026-01/orders.json",method:"GET"}}}
      }'
      ;;
    line_item)
      local provider='{"id":900719925474099312347,"product_id":900719925474099312348,"variant_id":900719925474099312349,"quantity":1,"sku":"SYNTHETIC-SKU","title":"Synthetic Product","price":"199.00"}'
      local provider_sha256
      provider_sha256="$(printf '%s' "${provider}" | shasum -a 256 | awk '{print $1}')"
      jq -nc --arg provider "${provider}" --arg provider_sha256 "${provider_sha256}" '{
        routing:{adapter:"shopify",platform:"shopify",connection_id:"shopify-primary",sender_id:"moonsleepco.myshopify.com",sender_name:"Shopify",receiver_id:"shopify-primary",space_id:"moonsleepco.myshopify.com",container_kind:"group",container_id:"line_item",thread_id:"moonsleepco.myshopify.com:order:900719925474099312346"},
        payload:{external_record_id:"shopify:shopify-primary:line_item:900719925474099312346:900719925474099312347:synthetic-revision-1",timestamp:1784640002000,content:"line_item order=#SYNTH-1 quantity=1 price=199.00",content_type:"text",payload:{provider_object_json:$provider,provider_object_sha256:$provider_sha256},metadata:{connection_id:"shopify-primary",adapter_id:"shopify",family:"line_item",logical_row_id:"moonsleepco.myshopify.com:900719925474099312346:900719925474099312347",revision_hash:"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",provider_ids:{shop_domain:"moonsleepco.myshopify.com",order_id:"900719925474099312346",line_item_id:"900719925474099312347",product_id:"900719925474099312348",variant_id:"900719925474099312349"},row:{sku:"SYNTHETIC-SKU",price:"199.00",title:"Synthetic Product",order_id:"900719925474099312346",quantity:1,shop_domain:"moonsleepco.myshopify.com",line_item_id:"900719925474099312347",product_id:"900719925474099312348",variant_id:"900719925474099312349"},source_request:{path:"/admin/api/2026-01/orders.json",method:"GET"}}}
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
  --mount "type=bind,src=$(dirname "${adapter_artifact}"),dst=/artifacts/adapter,readonly" \
  --mount "type=bind,src=$(dirname "${app_artifact}"),dst=/artifacts/app,readonly" \
  --mount "type=bind,src=${ROOT_DIR}/scripts,dst=/proof-scripts,readonly" \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
  --tmpfs /run/nex-credentials:rw,nosuid,nodev,noexec,mode=0700 \
  "${NEX_IMAGE}" >/dev/null
wait_for_runtime

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
  .projectors.shopify_order_commerce == "dormant_bounded_checkpointed_batches" and
  .provider_write_authority == false
' <<<"${health_before}" >/dev/null

jobs_before="$(runtime_call jobs.list '{}')"
subscriptions_before="$(runtime_call events.subscriptions.list '{}')"
jq -e '
  (.jobs | length) == 2 and
  ([.jobs[].name] | sort) == ["moonsleep-commerce.shopify-customer-identity","moonsleep-commerce.shopify-order-commerce"] and
  all(.jobs[]; .status == "inactive")
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

initial_counts="$(runtime_counts)"
jq -e '
  .records == 0 and .receipts == 0 and .events == 0 and
  .entities == 3 and .contacts == 0 and .observations == 0 and
  .queue == 0 and .dispatch_receipts == 0 and .adapter_instances == 0 and
  .commerce_orders == 0 and .commerce_order_revisions == 0 and
  .commerce_line_items == 0 and .commerce_line_item_revisions == 0
' <<<"${initial_counts}" >/dev/null

seed_params="$(jq -nc --arg shop_domain "${SHOP_DOMAIN}" --arg connection_id "${CONNECTION_ID}" '{shop_domain:$shop_domain,connection_id:$connection_id}')"
seed_first="$(runtime_call moonsleep-commerce.shopify-source.seed-identities "${seed_params}")"
seed_second="$(runtime_call moonsleep-commerce.shopify-source.seed-identities "${seed_params}")"
jq -e '.identities_observed == 2 and .created_entities == 2 and .created_contacts == 2 and .replayed == 0 and .provider_write_authority == false' <<<"${seed_first}" >/dev/null
jq -e '.identities_observed == 2 and .created_entities == 0 and .created_contacts == 0 and .replayed == 2 and .provider_write_authority == false' <<<"${seed_second}" >/dev/null
seed_contract_sha256="$(jq -r '.source_identity_contract_sha256' <<<"${seed_first}")"
[[ "${seed_contract_sha256}" == "$(jq -r '.source_identity_contract_sha256' <<<"${seed_second}")" ]]

echo "[cleanroom] commit exact customer, order, and line-item revisions"
customer_params="$(build_record_params customer)"
order_params="$(build_record_params order)"
line_params="$(build_record_params line_item)"

customer_ingest_first="$(runtime_call record.ingest "${customer_params}")"
order_ingest_first="$(runtime_call record.ingest "${order_params}")"
line_ingest_first="$(runtime_call record.ingest "${line_params}")"
jq -e '.ok == true and .status == "completed"' <<<"${customer_ingest_first}" >/dev/null
jq -e '.ok == true and .status == "completed"' <<<"${order_ingest_first}" >/dev/null
jq -e '.ok == true and .status == "completed"' <<<"${line_ingest_first}" >/dev/null

echo "[cleanroom] run the bounded checkpointed projector twice through public HTTP"
docker exec --user 20042:20042 "${runtime_container}" sh -c '
  set -eu
  umask 077
  mkdir -p /var/lib/nex/state/projection-proof
  chmod 0700 /var/lib/nex/state/projection-proof
  printf "%s\n" "$1" > /var/lib/nex/state/projection-proof/runtime-token
  printf "%s\n" \
    "some avg10=0.00 avg60=0.00 avg300=0.00 total=0" \
    "full avg10=0.00 avg60=0.00 avg300=0.00 total=0" \
    > /var/lib/nex/state/projection-proof/io-pressure
  chmod 0600 /var/lib/nex/state/projection-proof/runtime-token \
    /var/lib/nex/state/projection-proof/io-pressure
' sh "${runtime_token}"

projection_manifest_result="$(docker exec --user 20042:20042 "${runtime_container}" \
  python3 /proof-scripts/shopify_customer_projection_runner.py \
  --runtime-url "http://127.0.0.1:18789" \
  --runtime-token-file /var/lib/nex/state/projection-proof/runtime-token \
  --build-manifest \
  --shop-domain "${SHOP_DOMAIN}" \
  --connection-id "${CONNECTION_ID}" \
  --manifest /var/lib/nex/state/projection-proof/manifest.json \
  --io-pressure-file /var/lib/nex/state/projection-proof/io-pressure)"
jq -e --arg id "${CUSTOMER_SOURCE_ID}" '
  .ok == true and .record_count == 1 and
  .first_record_id == $id and .last_record_id == $id and
  (.manifest_sha256 | test("^[0-9a-f]{64}$")) and
  .provider_write_authority == false
' <<<"${projection_manifest_result}" >/dev/null
projection_manifest_sha256="$(jq -r '.manifest_sha256' <<<"${projection_manifest_result}")"

projection_first="$(docker exec --user 20042:20042 "${runtime_container}" \
  python3 /proof-scripts/shopify_customer_projection_runner.py \
  --runtime-url "http://127.0.0.1:18789" \
  --runtime-token-file /var/lib/nex/state/projection-proof/runtime-token \
  --manifest /var/lib/nex/state/projection-proof/manifest.json \
  --manifest-sha256 "${projection_manifest_sha256}" \
  --checkpoint /var/lib/nex/state/projection-proof/first.json \
  --batch-size 1 \
  --sleep-ms 0 \
  --io-pressure-file /var/lib/nex/state/projection-proof/io-pressure)"
projection_second="$(docker exec --user 20042:20042 "${runtime_container}" \
  python3 /proof-scripts/shopify_customer_projection_runner.py \
  --runtime-url "http://127.0.0.1:18789" \
  --runtime-token-file /var/lib/nex/state/projection-proof/runtime-token \
  --manifest /var/lib/nex/state/projection-proof/manifest.json \
  --manifest-sha256 "${projection_manifest_sha256}" \
  --checkpoint /var/lib/nex/state/projection-proof/second.json \
  --batch-size 1 \
  --sleep-ms 0 \
  --io-pressure-file /var/lib/nex/state/projection-proof/io-pressure)"
jq -e '.ok == true and .completed == true and .batch_count == 1 and .totals.created_entities == 1 and .totals.created_contacts == 1 and .totals.replayed == 0' <<<"${projection_first}" >/dev/null
jq -e '.ok == true and .completed == true and .batch_count == 1 and .totals.created_entities == 0 and .totals.created_contacts == 0 and .totals.replayed == 1' <<<"${projection_second}" >/dev/null

commerce_manifest_result="$(docker exec --user 20042:20042 "${runtime_container}" \
  python3 /proof-scripts/shopify_commerce_projection_runner.py \
  --runtime-url "http://127.0.0.1:18789" \
  --runtime-token-file /var/lib/nex/state/projection-proof/runtime-token \
  --build-manifest \
  --shop-domain "${SHOP_DOMAIN}" \
  --connection-id "${CONNECTION_ID}" \
  --manifest /var/lib/nex/state/projection-proof/commerce-manifest.json \
  --io-pressure-file /var/lib/nex/state/projection-proof/io-pressure)"
jq -e '
  .ok == true and .record_count == 2 and
  (.manifest_sha256 | test("^[0-9a-f]{64}$")) and
  .provider_read_authority == false and .provider_write_authority == false
' <<<"${commerce_manifest_result}" >/dev/null
commerce_manifest_sha256="$(jq -r '.manifest_sha256' <<<"${commerce_manifest_result}")"

commerce_first="$(docker exec --user 20042:20042 "${runtime_container}" \
  python3 /proof-scripts/shopify_commerce_projection_runner.py \
  --runtime-url "http://127.0.0.1:18789" \
  --runtime-token-file /var/lib/nex/state/projection-proof/runtime-token \
  --manifest /var/lib/nex/state/projection-proof/commerce-manifest.json \
  --manifest-sha256 "${commerce_manifest_sha256}" \
  --checkpoint /var/lib/nex/state/projection-proof/commerce-first.json \
  --batch-size 2 --max-batches 1 --sleep-ms 0 \
  --io-pressure-file /var/lib/nex/state/projection-proof/io-pressure)"
commerce_second="$(docker exec --user 20042:20042 "${runtime_container}" \
  python3 /proof-scripts/shopify_commerce_projection_runner.py \
  --runtime-url "http://127.0.0.1:18789" \
  --runtime-token-file /var/lib/nex/state/projection-proof/runtime-token \
  --manifest /var/lib/nex/state/projection-proof/commerce-manifest.json \
  --manifest-sha256 "${commerce_manifest_sha256}" \
  --checkpoint /var/lib/nex/state/projection-proof/commerce-second.json \
  --batch-size 2 --max-batches 1 --sleep-ms 0 \
  --io-pressure-file /var/lib/nex/state/projection-proof/io-pressure)"
jq -e '
  .ok == true and .completed == true and .batch_count == 1 and
  .totals.records_projected == 2 and .totals.orders_projected == 1 and
  .totals.line_items_projected == 1 and .totals.created == 2 and .totals.replayed == 0
' <<<"${commerce_first}" >/dev/null
jq -e '
  .ok == true and .completed == true and .batch_count == 1 and
  .totals.records_projected == 2 and .totals.created == 0 and .totals.replayed == 2
' <<<"${commerce_second}" >/dev/null

order_gid="gid://shopify/Order/900719925474099312346"
billing_sha256="$(printf '%s' '{"address1":"1 Synthetic Way","city":"Austin","zip":"78701"}' | shasum -a 256 | awk '{print $1}')"
shipping_sha256="$(printf '%s' '{"address1":"2 Replay Road","city":"Austin","zip":"78702"}' | shasum -a 256 | awk '{print $1}')"
commerce_order_read="$(runtime_call commerce.orders.get "$(jq -nc --arg shop "${SHOP_DOMAIN}" --arg order "${order_gid}" '{platform:"shopify",space_id:$shop,order_id:$order}')")"
jq -e \
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
' <<<"${commerce_order_read}" >/dev/null

cohort_params="$(jq -nc --arg id "${CUSTOMER_SOURCE_ID}" '{record_ids:[$id]}')"
cohort_first="$(runtime_call moonsleep-commerce.shopify-customers.project-cohort "${cohort_params}")"
cohort_second="$(runtime_call moonsleep-commerce.shopify-customers.project-cohort "${cohort_params}")"
jq -e '.state == "succeeded" and .records_projected == 1 and .created_entities == 0 and .created_contacts == 0 and .replayed == 1 and .provider_write_authority == false' <<<"${cohort_first}" >/dev/null
jq -e '.state == "succeeded" and .records_projected == 1 and .created_entities == 0 and .created_contacts == 0 and .replayed == 1 and .provider_write_authority == false' <<<"${cohort_second}" >/dev/null

customer_ingest_second="$(runtime_call record.ingest "${customer_params}")"
order_ingest_second="$(runtime_call record.ingest "${order_params}")"
line_ingest_second="$(runtime_call record.ingest "${line_params}")"
jq -e '.ok == true and .status == "skipped"' <<<"${customer_ingest_second}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${order_ingest_second}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${line_ingest_second}" >/dev/null

counts_before_restart="$(runtime_counts)"
jq -e '
  .records == 3 and .receipts == 3 and .events == 3 and
  .entities == 6 and .contacts == 3 and .observations == 3 and .tags == 11 and
  .queue == 0 and .dispatch_receipts == 0 and .adapter_instances == 0 and
  .commerce_orders == 1 and .commerce_order_revisions == 1 and
  .commerce_line_items == 1 and .commerce_line_item_revisions == 1
' <<<"${counts_before_restart}" >/dev/null

event_contract="$(postgres_json "
  SELECT COALESCE(json_agg(row_to_json(contract_row) ORDER BY contract_row.family), '[]'::JSON)
  FROM (
    SELECT
      records.metadata->>'family' AS family,
      events.record_id AS event_record_id,
      events.properties_json->>'platform' AS platform,
      records.id AS readable_record_id,
      records.payload->>'provider_object_sha256' AS provider_object_sha256
    FROM nex_runtime.records records
    JOIN nex_runtime.durable_events events ON events.record_id = records.id
  ) contract_row")"
jq -e '
  length == 3 and
  all(.[];
    .platform == "shopify" and
    .event_record_id == .readable_record_id and
    (.provider_object_sha256 | test("^[0-9a-f]{64}$"))
  )
' <<<"${event_contract}" >/dev/null

while IFS=$'\t' read -r family provider_json declared_sha256; do
  actual_sha256="$(printf '%s' "${provider_json}" | shasum -a 256 | awk '{print $1}')"
  [[ "${actual_sha256}" == "${declared_sha256}" ]] || {
    echo "provider payload digest mismatch for ${family}" >&2
    exit 1
  }
done < <(docker exec -u postgres "${postgres_container}" psql -X -d moonsleep_nex -AtF $'\t' -c \
  "SELECT metadata->>'family', payload->>'provider_object_json', payload->>'provider_object_sha256' FROM nex_runtime.records ORDER BY metadata->>'family'")

event_customer_id="$(postgres_json "SELECT record_id FROM nex_runtime.durable_events WHERE properties_json->>'container_id' = 'customer' LIMIT 1")"
[[ "${event_customer_id}" == "${CUSTOMER_SOURCE_ID}" ]]
event_customer_read="$(runtime_call records.get "$(jq -nc --arg id "${event_customer_id}" '{id:$id}')")"
jq -e --arg id "${CUSTOMER_SOURCE_ID}" '.record.id == $id' <<<"${event_customer_read}" >/dev/null

echo "[cleanroom] restart and prove durable package, record, identity, and dormant-work state"
docker restart "${runtime_container}" >/dev/null
wait_for_runtime
docker logs --since 30s "${runtime_container}" 2>&1 | grep -F 'runtime started (no adapter monitors started)' >/dev/null

adapter_state_after="$(package_get adapter shopify)"
app_state_after="$(package_get app moonsleep-commerce)"
health_after="$(runtime_call moonsleep-commerce.healthcheck '{}')"
jobs_after="$(runtime_call jobs.list '{}')"
subscriptions_after="$(runtime_call events.subscriptions.list '{}')"
jq -e --arg version "${ADAPTER_VERSION}" '.status == "active" and .active_version == $version' <<<"${adapter_state_after}" >/dev/null
jq -e --arg version "${APP_VERSION}" '.status == "active" and .active_version == $version' <<<"${app_state_after}" >/dev/null
jq -e '.status == "ok" and .provider_write_authority == false' <<<"${health_after}" >/dev/null
jq -e '(.jobs | length) == 2 and all(.jobs[]; .status == "inactive")' <<<"${jobs_after}" >/dev/null
jq -e '
  (.subscriptions | length) == 3 and
  ([.subscriptions[].match_json] | sort) == [
    "{\"platform\":\"shopify\",\"container_id\":\"customer\"}",
    "{\"platform\":\"shopify\",\"container_id\":\"line_item\"}",
    "{\"platform\":\"shopify\",\"container_id\":\"order\"}"
  ] and
  all(.subscriptions[]; .enabled == 0)
' <<<"${subscriptions_after}" >/dev/null

customer_ingest_after_restart="$(runtime_call record.ingest "${customer_params}")"
order_ingest_after_restart="$(runtime_call record.ingest "${order_params}")"
line_ingest_after_restart="$(runtime_call record.ingest "${line_params}")"
cohort_after_restart="$(runtime_call moonsleep-commerce.shopify-customers.project-cohort "${cohort_params}")"
commerce_replay_after_restart="$(docker exec --user 20042:20042 "${runtime_container}" \
  python3 /proof-scripts/shopify_commerce_projection_runner.py \
  --runtime-url "http://127.0.0.1:18789" \
  --runtime-token-file /var/lib/nex/state/projection-proof/runtime-token \
  --manifest /var/lib/nex/state/projection-proof/commerce-manifest.json \
  --manifest-sha256 "${commerce_manifest_sha256}" \
  --checkpoint /var/lib/nex/state/projection-proof/commerce-restart-replay.json \
  --batch-size 2 --max-batches 1 --sleep-ms 0 \
  --io-pressure-file /var/lib/nex/state/projection-proof/io-pressure)"
jq -e '.ok == true and .status == "skipped"' <<<"${customer_ingest_after_restart}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${order_ingest_after_restart}" >/dev/null
jq -e '.ok == true and .status == "skipped"' <<<"${line_ingest_after_restart}" >/dev/null
jq -e '.state == "succeeded" and .created_entities == 0 and .created_contacts == 0 and .replayed == 1' <<<"${cohort_after_restart}" >/dev/null
jq -e '.ok == true and .completed == true and .totals.created == 0 and .totals.replayed == 2' <<<"${commerce_replay_after_restart}" >/dev/null

counts_after_restart="$(runtime_counts)"
[[ "$(jq -S -c . <<<"${counts_before_restart}")" == "$(jq -S -c . <<<"${counts_after_restart}")" ]]
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
  --argjson initial_counts "${initial_counts}" \
  --argjson terminal_counts "${counts_after_restart}" \
  --argjson event_contract "${event_contract}" \
  '{
    ok:true,
    finished_at:$finished_at,
    source:{revision:$source_revision,tree:$source_tree,clean_before_and_after:true},
    nex:{revision:$nex_revision,image:$nex_image,image_id:$nex_image_id,platform:"linux/amd64",storage_profile:"moonsleep-postgres-v1"},
    postgres:{image:$postgres_image,image_id:$postgres_image_id,version:$postgres_version,platform:"linux/amd64"},
    packages:{shopify_adapter_sha256:$adapter_sha256,moonsleep_commerce_sha256:$app_sha256,active_after_restart:true},
    source_identity:{contract_sha256:$seed_contract_sha256,first_create_count:2,second_create_count:0,second_replay_count:2},
    synthetic_ingest:{families:["customer","line_item","order"],exact_payload_sha256_verified:true,first_commit_count:3,replay_status:"skipped",event_contract:$event_contract},
    customer_projection:{runner:"bounded_checkpointed_http",batch_limit:250,first_created_entities:1,first_created_contacts:1,replay_created_entities:0,replay_created_contacts:0,replay_observations:1},
    commerce_projection:{runner:"bounded_checkpointed_http",batch_limit:50,default_batch_size:25,default_batches_per_invocation:1,orders:1,line_items:1,first_created:2,replay_created:0,replay_observations:2,canonical_customer_link:true,address_snapshots_sha256_bound:true},
    work_boundary:{job_count:2,job_status:"inactive",subscription_count:3,subscription_scope:"exact_record_family",subscription_enabled:false,queue_rows:0,dispatch_receipts:0,provider_credentials_mounted:false,provider_calls:0,provider_read_authority:false,provider_write_authority:false},
    restart:{app_rehydrated:true,adapter_active:true,record_replay_idempotent:true,identity_replay_idempotent:true,commerce_replay_idempotent:true},
    initial_counts:$initial_counts,
    terminal_counts:$terminal_counts,
    zero_residue:true
  }' > "${RECEIPT_PATH}"
chmod 0600 "${RECEIPT_PATH}"
trap - EXIT
rm -rf -- "${runner_temp}"

echo "[cleanroom] PASS receipt=${RECEIPT_PATH}"
