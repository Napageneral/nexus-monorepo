#!/usr/bin/env bash
# Full-runtime proof for the Sequences app (build manual §4 T2), run on a lab host. The setup is
# packages/adapters/flexport/scripts/runtime-cleanroom-proof.sh's, which met every production
# difference once: production database roles and the migrator's canonical credential path, the
# candidate image digest, the production PostgreSQL image with initdb on a tmpfs and the vector,
# unaccent and pg_trgm extensions, Docker's default capabilities, and the lazy claims-owner check.
#
# Against the exact release archive and the live Nex image, on a private --internal network (no
# published ports, nothing reaches ops.moonsleep.co, drand or Klaviyo), it proves:
#   1. the install gate refuses the app while its schema is not migrated; then the roles SQL and the
#      app-store migrator (as nex_moonsleep_migrator, production role shapes) apply and verify 0001,
#      and the permission contract's grants apply;
#   2. the archive installs active: six jobs (sequences.agent inactive), one schedule, disabled;
#   3. sequences.runtime.configure plans and applies "armed", and a natural tick completes (no
#      manual invoke, NX-P8);
#   4. that first tick admits the probe step: a worker Run reads the engine's two Access rows with
#      credentials.resolve (fake values seeded here). Its outcome answers §8 R-2: a credentials
#      refusal means IAM stops a worker attempt; an unreachable ops host means the read passed;
#   5. a synthetic, hashes-only import previews and applies, and the next ticks accept the observe
#      steps (partial invokeMany batches, lookups by idempotency key; §8 R-4);
#   6. sequences.health, sequences.page.get and sequences.brief.get answer from the store.
# It writes a private JSON receipt. Every resource is named sequences-cleanroom-* and removed on exit.
#
# Inputs (environment):
#   NEX_RELEASE_IMAGE        the live MoonSleep Nex image (site-ctl nex release names its revision)
#   POSTGRES_RELEASE_IMAGE   the PostgreSQL 17 image production runs
#   SEQUENCES_ARTIFACT       dist/sequences-<version>.tar.gz (scripts/package-release.sh)
#   SEQUENCES_ROLES_SQL      moonsleep-v1 infra/postgres-permissions/provision_sequences_store_roles.sql
#   SEQUENCES_GRANTS_DIR     moonsleep-v1 infra/postgres-permissions/generated (operate/observe additive SQL)
#   SEQUENCES_BUNDLE         a synthetic import bundle (test/synthetic.ts syntheticBundle(), as JSON)
#   SEQUENCES_SOURCE         "<monorepo sha> <moonsleep-v1 sha>" for the receipt
#   CLEANROOM_RECEIPT_PATH   optional; default ${TMPDIR:-/tmp}/sequences-runtime-cleanroom-receipt.json
set -euo pipefail

NEX_IMAGE="${NEX_RELEASE_IMAGE:?set NEX_RELEASE_IMAGE to the exact Linux/AMD64 Nex release image}"
POSTGRES_IMAGE="${POSTGRES_RELEASE_IMAGE:?set POSTGRES_RELEASE_IMAGE to the exact Linux/AMD64 PostgreSQL 17 image}"
ARTIFACT="${SEQUENCES_ARTIFACT:?set SEQUENCES_ARTIFACT to the release archive}"
ROLES_SQL="${SEQUENCES_ROLES_SQL:?set SEQUENCES_ROLES_SQL}"
GRANTS_DIR="${SEQUENCES_GRANTS_DIR:?set SEQUENCES_GRANTS_DIR}"
BUNDLE="${SEQUENCES_BUNDLE:?set SEQUENCES_BUNDLE}"
SOURCE="${SEQUENCES_SOURCE:-unknown unknown}"
RECEIPT_PATH="${CLEANROOM_RECEIPT_PATH:-${TMPDIR:-/tmp}/sequences-runtime-cleanroom-receipt.json}"
TICK_WAIT_S="${SEQUENCES_TICK_WAIT_S:-240}"

fail() {
  echo "[cleanroom] FAIL: $*" >&2
  exit 1
}
note() { echo "[cleanroom] $*"; }

for command_name in docker jq openssl tar; do
  command -v "${command_name}" >/dev/null || fail "required command is unavailable: ${command_name}"
done
sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
size_of() { stat -c '%s' "$1" 2>/dev/null || stat -f '%z' "$1"; }

for file in "${ARTIFACT}" "${ROLES_SQL}" "${BUNDLE}" "${GRANTS_DIR}/operate_sequences_store.additive.sql" "${GRANTS_DIR}/observe_sequences_store.additive.sql"; do
  [[ -f "${file}" ]] || fail "missing input: ${file}"
done
docker info >/dev/null 2>&1 || fail "the Docker daemon is not reachable"
docker image inspect "${NEX_IMAGE}" >/dev/null 2>&1 || fail "NEX_RELEASE_IMAGE is not present locally: ${NEX_IMAGE}"
docker image inspect "${POSTGRES_IMAGE}" >/dev/null 2>&1 || fail "POSTGRES_RELEASE_IMAGE is not present locally: ${POSTGRES_IMAGE}"
nex_revision="$(docker image inspect "${NEX_IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "${nex_revision}" =~ ^[0-9a-f]{40}$ ]] || fail "NEX_RELEASE_IMAGE is missing an exact 40-hex revision label"
nex_manifest_digest="$(docker image inspect "${NEX_IMAGE}" --format '{{range .RepoDigests}}{{println .}}{{end}}' | sed -n 's/.*@//p' | head -1)"
[[ "${nex_manifest_digest}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "NEX_RELEASE_IMAGE has no registry manifest digest"

artifact_sha256="$(sha256_of "${ARTIFACT}")"
artifact_size="$(size_of "${ARTIFACT}")"
artifact_name="$(basename "${ARTIFACT}")"
work="$(mktemp -d "${TMPDIR:-/tmp}/sequences-cleanroom.XXXXXX")"
chmod 0755 "${work}"
mkdir -p "${work}/pkg" "${work}/inputs"
tar -xzf "${ARTIFACT}" -C "${work}/pkg"
chmod -R a+rX "${work}/pkg"
PACKAGE_VERSION="$(jq -er '.version' "${work}/pkg/app.nexus.json")"
[[ "$(jq -er '.id' "${work}/pkg/app.nexus.json")" == "sequences" ]] || fail "the archive is not the sequences app"
cp "${ARTIFACT}" "${work}/inputs/${artifact_name}"
cp "${BUNDLE}" "${work}/inputs/bundle.json"
chmod 0644 "${work}/inputs/"*

suffix="$$-$(openssl rand -hex 4)"
network="sequences-cleanroom-${suffix}"
postgres_container="${network}-postgres"
runtime_container="${network}-runtime"
state_volume="${network}-state"
credential_volume="${network}-credentials"
migrator_volume="${network}-migrator"
runtime_role="nex_moonsleep_runtime"
migrator_role="nex_moonsleep_migrator"
standby_role="nex_moonsleep_standby"
access_role="nex_runtime_operator"
owner_role="nex_runtime_schema_owner"
runtime_token="nex_rt_$(openssl rand -hex 24)"
export NEX_CLEANROOM_TOKEN="${runtime_token}"

cleanup() {
  docker rm -f "${runtime_container}" "${postgres_container}" >/dev/null 2>&1 || true
  docker volume rm -f "${state_volume}" "${credential_volume}" "${migrator_volume}" >/dev/null 2>&1 || true
  docker network rm "${network}" >/dev/null 2>&1 || true
  rm -rf -- "${work}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The token reaches each container command through its environment, and curl reads the header from a
# 0600 file the container shell writes in its /tmp tmpfs (flexport's pattern): never on a command line.
runtime_exec() { docker exec -e NEX_CLEANROOM_TOKEN "${runtime_container}" "$@"; }
runtime_curl() {
  runtime_exec sh -c '
    umask 077
    header="/tmp/.cleanroom-runtime-auth.$$"
    trap "rm -f \"${header}\"" EXIT
    printf "Authorization: Bearer %s\n" "${NEX_CLEANROOM_TOKEN}" > "${header}"
    curl -H "@${header}" "$@"
  ' sh "$@"
}
runtime_get() { runtime_curl -fsS "http://127.0.0.1:18789$1"; }
runtime_post() { runtime_curl -sS -H "Content-Type: application/json" --data "$2" "http://127.0.0.1:18789$1"; }
# call <method> <params json>: the runtime operation over HTTP; prints the whole answer.
call() { runtime_post "/runtime/operations/$1" "${2:-{\}}"; }
# payload <method> <params json>: the answer's payload, failing on ok:false.
payload() {
  local answer
  answer="$(call "$1" "${2:-{\}}")"
  jq -e '.ok == true' <<<"${answer}" >/dev/null || fail "$1 failed: $(head -c 600 <<<"${answer}")"
  jq -c '.payload' <<<"${answer}"
}

PG_BIN=/usr/lib/postgresql/17/bin
pg_psql() { docker exec -i "${postgres_container}" "${PG_BIN}/psql" -X -h /run/postgresql -U postgres "$@"; }
wait_for_postgres() {
  for _ in $(seq 1 90); do pg_psql -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 && return 0; sleep 1; done
  docker logs "${postgres_container}" >&2 || true
  fail "PostgreSQL did not become ready"
}
wait_for_runtime() {
  for _ in $(seq 1 120); do runtime_get /health >/dev/null 2>&1 && return 0; sleep 1; done
  docker logs "${runtime_container}" 2>&1 | tail -40 >&2 || true
  fail "the Nex runtime did not become healthy on 127.0.0.1:18789"
}

note "create isolated PostgreSQL 17 and Nex resources (${network})"
docker network create --internal "${network}" >/dev/null
docker volume create "${state_volume}" >/dev/null
docker volume create "${credential_volume}" >/dev/null
docker volume create "${migrator_volume}" >/dev/null
postgres_dsn="postgresql://${runtime_role}@postgres:5432/moonsleep_nex"

docker run --rm --platform linux/amd64 --network none --read-only --cpus 1 --memory 256m --pids-limit 64 --user 0:0 \
  --mount "type=volume,src=${state_volume},dst=/target" --entrypoint sh "${NEX_IMAGE}" \
  -c 'set -eu
      install -d -m 0700 -o nex-moonsleep -g nex-moonsleep /target/state
      printf "%s\n" "{" "  \"runtime\": {" "    \"port\": 18789," "    \"bind\": \"loopback\"," \
        "    \"auth\": {\"mode\": \"token\", \"token\": \"\${NEXUS_RUNTIME_TOKEN}\"}" "  }" "}" > /target/state/config.json
      chown nex-moonsleep:nex-moonsleep /target/state/config.json
      chmod 0600 /target/state/config.json'
docker run --rm --platform linux/amd64 --network none --read-only --cpus 1 --memory 256m --pids-limit 64 --user 0:0 \
  --env "POSTGRES_DSN=${postgres_dsn}" --env NEX_CLEANROOM_TOKEN \
  --mount "type=volume,src=${credential_volume},dst=/target" --entrypoint sh "${NEX_IMAGE}" \
  -c 'set -eu
      umask 077
      chmod 0750 /target
      printf "%s\n" "$POSTGRES_DSN" > /target/postgres-dsn
      printf "%s\n" "$NEX_CLEANROOM_TOKEN" > /target/runtime-token
      printf "%s\n" "owner:" "  name: Tyler" "assistant:" "  name: MoonSleep Ops" "operators:" "  - name: Casey" > /target/bootstrap-seed.yaml
      chown root:root /target/postgres-dsn /target/runtime-token /target/bootstrap-seed.yaml
      chmod 0400 /target/postgres-dsn /target/runtime-token /target/bootstrap-seed.yaml'

docker run -d --name "${postgres_container}" --platform linux/amd64 --network "${network}" --network-alias postgres \
  --cpus 1 --memory 1g --pids-limit 256 --security-opt no-new-privileges --user 1000:1000 \
  --tmpfs /cleanroom-pgdata:rw,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=2g \
  --tmpfs /run/postgresql:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0775 \
  --entrypoint sh "${POSTGRES_IMAGE}" \
  -c 'set -eu
      B=/usr/lib/postgresql/17/bin
      D=/cleanroom-pgdata/pgdata
      "$B/initdb" -D "$D" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
      printf "host all all all trust\n" >> "$D/pg_hba.conf"
      exec "$B/postgres" -D "$D" -c listen_addresses="*" -c unix_socket_directories=/run/postgresql' >/dev/null
wait_for_postgres
pg_psql -d postgres -v ON_ERROR_STOP=1 -qc 'CREATE DATABASE moonsleep_nex' >/dev/null
pg_psql -d moonsleep_nex -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null || fail "POSTGRES_RELEASE_IMAGE lacks an extension the Nex baseline needs"
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
CREATE ROLE ${standby_role} LOGIN;
GRANT ${owner_role} TO ${migrator_role};
GRANT ${access_role} TO ${runtime_role};
GRANT CONNECT, CREATE ON DATABASE moonsleep_nex TO ${owner_role};
GRANT CONNECT, CREATE ON DATABASE moonsleep_nex TO ${migrator_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${runtime_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${access_role};
GRANT CONNECT ON DATABASE moonsleep_nex TO ${standby_role};
ALTER DATABASE moonsleep_nex OWNER TO ${owner_role};
SQL

docker run --rm --platform linux/amd64 --network none --read-only --cpus 1 --memory 256m --pids-limit 64 --user 0:0 \
  --env "MIGRATOR_DSN=postgresql://${migrator_role}@postgres:5432/moonsleep_nex" \
  --mount "type=volume,src=${migrator_volume},dst=/target" --entrypoint sh "${NEX_IMAGE}" \
  -c 'set -eu; umask 077; printf "%s\n" "$MIGRATOR_DSN" > /target/postgres-migrator-dsn; chown root:root /target/postgres-migrator-dsn; chmod 0400 /target/postgres-migrator-dsn'

migrate_records() {
  docker run --rm --platform linux/amd64 --network "${network}" --read-only --cpus 1 --memory 1g --pids-limit 128 \
    --security-opt no-new-privileges --env NEXUS_RUNTIME_STORAGE_PROFILE=moonsleep-postgres-v1 --user 0:0 \
    --mount "type=volume,src=${migrator_volume},dst=/run/nex-credentials,readonly" \
    --env NEXUS_POSTGRES_CONNECTION_FILE=/run/nex-credentials/postgres-migrator-dsn \
    --env NEXUS_MOONSLEEP_PRODUCTION_CREDENTIALS=0 \
    --env "NEXUS_MIGRATION_CANDIDATE_SOURCE_REVISION=${nex_revision}" \
    --env "NEXUS_MIGRATION_CANDIDATE_IMAGE_MANIFEST_DIGEST=${nex_manifest_digest}" \
    --env "NEXUS_POSTGRES_RECORDS_RUNTIME_ROLE=${runtime_role}" --env "NEXUS_POSTGRES_RECORDS_ACCESS_ROLE=${access_role}" \
    --env "NEXUS_POSTGRES_RECORDS_OWNER_ROLE=${owner_role}" --env NEXUS_POSTGRES_RECORDS_SCHEMA=nex_runtime \
    --entrypoint node "${NEX_IMAGE}" /opt/nex/dist/postgres-record-store-migrate.js
}
migration_receipt="$(migrate_records)"
jq -e '.ok == true and .storage_profile == "moonsleep-postgres-v1"' <<<"${migration_receipt}" >/dev/null \
  || fail "the Nex record store migration failed: ${migration_receipt}"

docker run -d --name "${runtime_container}" --platform linux/amd64 --network "${network}" --read-only \
  --cpus 2 --memory 3g --pids-limit 512 --security-opt no-new-privileges \
  --mount "type=volume,src=${state_volume},dst=/var/lib/nex" \
  --mount "type=volume,src=${credential_volume},dst=/run/moonsleep-load-credentials,readonly" \
  --mount "type=bind,src=${work}/inputs,dst=/inputs,readonly" \
  --env NEXUS_MOONSLEEP_CLAIMS_OWNER_VERIFICATION=lazy \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=20042,gid=20042,mode=0700 \
  --tmpfs /run/nex-credentials:rw,nosuid,nodev,noexec,mode=0700 \
  "${NEX_IMAGE}" >/dev/null
wait_for_runtime

install_app() {
  local release_id operation_id upload body
  release_id="cleanroom-sequences-${artifact_sha256:0:16}-$1"
  operation_id="${release_id}-install"
  upload="$(runtime_curl -sS --fail-with-body -H "Content-Type: application/octet-stream" --data-binary "@/inputs/${artifact_name}" \
    "http://127.0.0.1:18789/api/operator/packages/upload?operation_id=${operation_id}&filename=${artifact_name}")" \
    || fail "package upload failed: ${upload:-no response}"
  jq -e --arg sha256 "${artifact_sha256}" '.ok == true and .staged_artifact.sha256 == $sha256' <<<"${upload}" >/dev/null \
    || fail "unexpected upload response: ${upload}"
  body="$(jq -nc --arg version "${PACKAGE_VERSION}" --arg release_id "${release_id}" --arg operation_id "${operation_id}" \
    --argjson staged "$(jq -c '.staged_artifact' <<<"${upload}")" \
    '{kind:"app",package_id:"sequences",version:$version,release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$staged.server_path,sha256:$staged.sha256,size_bytes:$staged.size_bytes}}')"
  runtime_curl -sS -w '\n%{http_code}' -H "Content-Type: application/json" --data "${body}" http://127.0.0.1:18789/api/operator/packages/install
}

note "1. the install gate refuses the app before its schema exists"
gate="$(install_app before)"
gate_status="$(tail -n1 <<<"${gate}")"
gate_body="$(sed '$d' <<<"${gate}")"
[[ "${gate_status}" != "200" ]] || jq -e '.ok != true or .status != "active"' <<<"${gate_body}" >/dev/null \
  || fail "the app installed before its schema was migrated: ${gate_body}"
note "   refused: HTTP ${gate_status} $(jq -c '{error: (.error // .code // .message)}' <<<"${gate_body}" 2>/dev/null | head -c 300)"

note "   roles, app-store migration as ${migrator_role}, contract grants"
pg_psql -d moonsleep_nex -v ON_ERROR_STOP=1 -q < "${ROLES_SQL}" >/dev/null || fail "the sequences roles SQL failed"
app_migration="$(docker run --rm --platform linux/amd64 --network "${network}" --read-only --cpus 1 --memory 1g --pids-limit 128 \
  --security-opt no-new-privileges --user 0:0 \
  --mount "type=volume,src=${migrator_volume},dst=/run/nex-credentials,readonly" \
  --mount "type=bind,src=${work}/pkg,dst=/pkg,readonly" \
  --env NEXUS_POSTGRES_MIGRATOR_CONNECTION_FILE=/run/nex-credentials/postgres-migrator-dsn \
  --entrypoint node "${NEX_IMAGE}" /opt/nex/dist/postgres-app-store-migrate.js --package-dir /pkg --json 2>&1)" \
  || fail "the app-store migration failed: $(head -c 1200 <<<"${app_migration}")"
note "   migrator: $(jq -c '{ok, applied: (.applied // .migrations_applied // null), current: (.current // null)}' <<<"${app_migration}" 2>/dev/null | head -c 300)"
for capability in operate_sequences_store observe_sequences_store; do
  pg_psql -d moonsleep_nex -v ON_ERROR_STOP=1 -q < "${GRANTS_DIR}/${capability}.additive.sql" >/dev/null || fail "${capability} grants failed"
done
schema_owner="$(pg_psql -d moonsleep_nex -Atqc "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'sequences'")"
[[ "${schema_owner}" == "sequences_owner" ]] || fail "schema sequences is owned by '${schema_owner}', not sequences_owner"

note "2. install the exact archive"
installed="$(install_app after)"
installed_status="$(tail -n1 <<<"${installed}")"
installed_body="$(sed '$d' <<<"${installed}")"
jq -e --arg version "${PACKAGE_VERSION}" '.ok == true and .package_id == "sequences" and .status == "active"' <<<"${installed_body}" >/dev/null \
  || fail "install failed (HTTP ${installed_status}): ${installed_body}"
jobs="$(payload jobs.list '{"limit":200}')"
ours="$(jq -c '[(.jobs // .items // .)[] | select(.name | startswith("sequences.")) | {name, status}] | sort_by(.name)' <<<"${jobs}")"
jq -e 'length == 6 and (map(select(.name == "sequences.agent" and .status != "active")) | length) == 1 and (map(select(.name != "sequences.agent" and .status == "active")) | length) == 5' <<<"${ours}" >/dev/null \
  || fail "unexpected sequences jobs: ${ours}"
schedules="$(payload schedules.list '{"limit":200}')"
tick_schedule="$(jq -c '[(.schedules // .items // .)[] | select(.name | startswith("sequences."))]' <<<"${schedules}")"
jq -e 'length == 1 and .[0].name == "sequences.tick" and (.[0].enabled == false or .[0].enabled == 0)' <<<"${tick_schedule}" >/dev/null \
  || fail "unexpected sequences schedules: ${tick_schedule}"

note "   seed the engine's two Access rows with fake values (vault)"
for account in ops-access-client-id ops-access-client-secret; do
  seeded="$(call credentials.create "$(jq -nc --arg account "${account}" --arg secret "fake-${account}-$(openssl rand -hex 8)" \
    '{service:"sequences",account:$account,type:"token",storageType:"vault",secret:$secret,label:"cleanroom fake"}')")"
  jq -e '.ok == true' <<<"${seeded}" >/dev/null || fail "credentials.create ${account} failed: $(head -c 600 <<<"${seeded}")"
done

note "3. plan and apply 'armed', then wait for a natural tick"
plan="$(payload sequences.runtime.configure '{"mode":"plan","target":"armed"}')"
plan_sha="$(jq -er '.data.plan_sha256' <<<"${plan}")"
applied="$(payload sequences.runtime.configure "$(jq -nc --arg sha "${plan_sha}" '{mode:"apply",target:"armed",expected_plan_sha256:$sha,confirmation:"CONFIGURE_SEQUENCES_RUNTIME"}')")"
jq -e '.ok == true and .data.state == "applied"' <<<"${applied}" >/dev/null || fail "configure apply failed: ${applied}"
health=""
for _ in $(seq 1 $((TICK_WAIT_S / 10))); do
  health="$(payload sequences.health '{}')"
  jq -e '.ticks >= 1' <<<"${health}" >/dev/null && break
  sleep 10
done
jq -e '.ticks >= 1 and .ok == true and .contract == "sequences_health_v1"' <<<"${health}" >/dev/null \
  || { docker logs "${runtime_container}" 2>&1 | tail -60 >&2; fail "no natural tick within ${TICK_WAIT_S} s: ${health}"; }
note "   tick: $(jq -c '{ticks, last_tick_at, tick_age_s}' <<<"${health}")"

note "4. the probe step's worker Run reads the Access rows (credentials.resolve)"
probe=""
for _ in $(seq 1 18); do
  health="$(payload sequences.health '{}')"
  probe="$(jq -c '.probe' <<<"${health}")"
  jq -e '.ops_reach_at != null' <<<"${probe}" >/dev/null && break
  sleep 10
done
# The probe is a system admission (no step instance): its Nex Run is found by its idempotency key.
probe_key="seq:_system:probe:$(jq -r '.last_slot' <<<"${probe}")"
probe_runs="$(payload jobs.runs.list "$(jq -nc --arg key "${probe_key}" '{idempotency_key:$key,limit:5}')")"
note "   probe key ${probe_key}: $(jq -c '[(.runs // .items // .)[] | {id, status, output: (.output // .result // .payload // null)}] | .[0]' <<<"${probe_runs}" | head -c 900)"
probe_run_id="$(jq -r '[(.runs // .items // .)[] | .id] | .[0] // empty' <<<"${probe_runs}")"
[[ -n "${probe_run_id}" ]] || fail "no Nex Run for ${probe_key}"
probe_run="$(payload jobs.runs.get "$(jq -nc --arg id "${probe_run_id}" '{id:$id}')")"
note "   probe run: $(jq -c '{status: (.run.status // .status), output: (.run.output // .output // .run.result // .result // null), error: (.run.error // .error // null)}' <<<"${probe_run}" | head -c 900)"
# The probe writes its outcome to the app's own event log (lib/run-step.ts runProbe): the ops read's code tells
# a credentials refusal (transient.credentials_unavailable) from an unreachable host (the read passed IAM).
probe_event="$(pg_psql -d moonsleep_nex -Atqc "SELECT detail::text FROM sequences.step_events WHERE event = 'probe' ORDER BY id LIMIT 1")"
note "   probe event: $(head -c 600 <<<"${probe_event}")"
r2="$(jq -r '.ops.code // (if .ops.ok == true then "ok" else "unknown" end)' <<<"${probe_event:-{\}}")"

note "5. a synthetic import: preview, apply, then the ticks accept the observe steps"
preview="$(runtime_exec sh -c 'umask 077; header=/tmp/.h.$$; trap "rm -f $header" EXIT; printf "Authorization: Bearer %s\n" "$NEX_CLEANROOM_TOKEN" > $header;
  node -e "const b=require(\"/inputs/bundle.json\"); process.stdout.write(JSON.stringify({bundle:b,mode:\"preview\",by:\"claude@cleanroom#t2\"}))" > /tmp/preview.json;
  curl -sS -H @$header -H "Content-Type: application/json" --data @/tmp/preview.json http://127.0.0.1:18789/runtime/operations/sequences.series.import')"
token="$(jq -er '.payload.apply.token' <<<"${preview}")" || fail "import preview gave no token: $(head -c 1200 <<<"${preview}")"
applied_import="$(runtime_exec sh -c 'umask 077; header=/tmp/.h.$$; trap "rm -f $header" EXIT; printf "Authorization: Bearer %s\n" "$NEX_CLEANROOM_TOKEN" > $header;
  node -e "const b=require(\"/inputs/bundle.json\"); process.stdout.write(JSON.stringify({bundle:b,mode:\"apply\",preview_token:process.argv[1],by:\"claude@cleanroom#t2\"}))" "$1" > /tmp/apply.json;
  curl -sS -H @$header -H "Content-Type: application/json" --data @/tmp/apply.json http://127.0.0.1:18789/runtime/operations/sequences.series.import' sh "${token}")"
jq -e '.ok == true and .payload.ok == true' <<<"${applied_import}" >/dev/null || fail "import apply failed: $(head -c 1200 <<<"${applied_import}")"
counts="$(jq -c '.payload.data.counts' <<<"${applied_import}")"
note "   imported: ${counts}"
accepted=""
for _ in $(seq 1 18); do
  accepted="$(pg_psql -d moonsleep_nex -Atqc "SELECT json_build_object('runs', count(*), 'accepted', count(*) FILTER (WHERE state IN ('accepted','claimed','finished')), 'accepting', count(*) FILTER (WHERE state = 'accepting'), 'cancelled', count(*) FILTER (WHERE state = 'cancelled'), 'phases', json_agg(DISTINCT phase)) FROM sequences.step_runs")"
  jq -e '.accepted >= 1' <<<"${accepted}" >/dev/null && break
  sleep 10
done
note "   step runs: ${accepted}"
if ! jq -e '.accepted >= 1 and .accepting == 0' <<<"${accepted}" >/dev/null; then
  pg_psql -d moonsleep_nex -Atqc "SELECT run_key || ' ' || state || ' ' || job_name || ' ' || left(detail::text, 300) FROM sequences.step_runs ORDER BY run_key" >&2 || true
  pg_psql -d moonsleep_nex -Atqc "SELECT at || ' ' || event || ' ' || left(detail::text, 300) FROM sequences.step_events ORDER BY id DESC LIMIT 12" >&2 || true
  fail "the tick accepted no step Runs (or left some accepting): ${accepted}"
fi

note "6. health, page and brief from the store"
health="$(payload sequences.health '{}')"
page="$(payload sequences.page.get '{"s":"review-giveaway-2026-10"}' 2>/dev/null || call sequences.page.get '{"s":"review-giveaway-2026-10"}')"
brief="$(payload sequences.brief.get '{"series":"review-giveaway-2026-10"}')"
jq -e '.ok == true and .contract == "sequences_page_v1" and (.steps | length) > 0' <<<"${page}" >/dev/null || fail "unexpected page: $(head -c 600 <<<"${page}")"
jq -e '.verdict.text | length > 0' <<<"${brief}" >/dev/null || fail "unexpected brief: $(head -c 600 <<<"${brief}")"
quarantined="$(jq -r '.quarantined' <<<"${health}")"

mkdir -p "$(dirname "${RECEIPT_PATH}")"
(
  umask 077
  jq -n --arg source "${SOURCE}" --arg nex_revision "${nex_revision}" --arg nex_manifest_digest "${nex_manifest_digest}" \
    --arg postgres_version "${postgres_version}" --arg version "${PACKAGE_VERSION}" --arg artifact_sha256 "${artifact_sha256}" \
    --argjson artifact_size "${artifact_size}" --arg gate_status "${gate_status}" --argjson jobs "${ours}" \
    --argjson schedule "${tick_schedule}" --argjson health "$(jq -c '{ticks, tick_age_s, probe, series, overdue, held, quarantined, open_alerts}' <<<"${health}")" \
    --arg r2 "${r2}" --argjson probe_run "${probe_run}" --argjson import_counts "${counts}" --argjson step_runs "${accepted}" \
    --arg page_verdict "$(jq -r '.verdict' <<<"${page}")" --arg brief_verdict "$(jq -r '.verdict.text' <<<"${brief}")" \
    '{contract:"nex_sequences_runtime_cleanroom_v1", source:$source, nex_revision:$nex_revision, nex_manifest_digest:$nex_manifest_digest,
      postgres_version:$postgres_version, package:{id:"sequences", version:$version, artifact_sha256:$artifact_sha256, artifact_size_bytes:$artifact_size},
      install_gate_before_migration:("refused HTTP " + $gate_status), install:"active", jobs:$jobs, schedule_before_configure:$schedule,
      natural_tick:true, health:$health, r2_worker_credentials_resolve:$r2, probe_run:$probe_run, import:$import_counts, step_runs:$step_runs,
      page_verdict:$page_verdict, brief_verdict:$brief_verdict,
      isolation:{docker_network:"internal", published_ports:false, host_network:false},
      authorities:{ops_api_called:false, klaviyo_called:false, production_runtime_touched:false, credential_values:"fake, never printed"}}' > "${RECEIPT_PATH}.tmp"
)
mv -f "${RECEIPT_PATH}.tmp" "${RECEIPT_PATH}"
echo "Sequences runtime cleanroom PASS"
echo "receipt=${RECEIPT_PATH}"
echo "receipt_sha256=$(sha256_of "${RECEIPT_PATH}")"
echo "r2_worker_credentials_resolve=${r2} quarantined=${quarantined}"
