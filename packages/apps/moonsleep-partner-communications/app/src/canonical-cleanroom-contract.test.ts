import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const harness = readFileSync(
  new URL("../scripts/test-canonical-surewal-postgres-cleanroom.sh", import.meta.url),
  "utf8",
);

const runtimeCall = harness.slice(
  harness.indexOf("runtime_call()"),
  harness.indexOf("prove_joined_evidence()"),
);
const diagnosticContract = harness.slice(
  harness.indexOf("set -Eeuo pipefail"),
  harness.indexOf("ROOT_DIR="),
);
const expectedChecks = [
  "01_source_exact",
  "02_postgres_17",
  "03_postgres_migration",
  "04_runtime_health",
  "05_app_install",
  "06_five_fact_profiles",
  "07_three_observation_profiles",
  "08_three_set_profiles",
  "09_job_inactive",
  "10_subscriptions_disabled",
  "11_zero_provider_adapter_state",
  "12_identity_first_observation",
  "13_identity_replay",
  "14_six_records_ingested",
  "15_record_replay_zero_duplicate",
  "16_postgres_revision_binding",
  "17_runtime_plan_exact",
  "18_facts_sets_candidates_first_apply",
  "19_core_storage_counts",
  "20_full_replay_zero_duplicate",
  "21_joined_pg_memory_stale_head_outbox_zero_authority",
  "22_restart_durability",
] as const;

function captureRuntimeCallParams(args: string[]): Buffer {
  const result = spawnSync(
    "bash",
    [
      "-c",
      `
        set -eu
        runtime_container=fixture-runtime
        runtime_uid=20042
        runtime_gid=20042
        docker() {
          last=""
          for argument in "$@"; do
            last="$argument"
          done
          printf %s "$last"
        }
        ${runtimeCall}
        runtime_call "$@"
      `,
      "runtime-call-contract",
      ...args,
    ],
    { encoding: "buffer" },
  );
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  return result.stdout;
}

test("bootstraps the state volume with the image-discovered serving identity", () => {
  assert.match(
    harness,
    /runtime_passwd="\$\(docker run[\s\S]*getent "\$\{NEX_IMAGE\}" passwd nex-moonsleep\)"/,
  );
  assert.match(
    harness,
    /state_volume_bootstrap="\$\(docker run[\s\S]*sh "\$\{runtime_uid\}" "\$\{runtime_gid\}"\)"/,
  );
  assert.match(
    harness,
    /install -d -m 0700 -o "\$runtime_uid" -g "\$runtime_gid" \\\n\s+\/target\/state \/target\/state\/data/,
  );
  assert.doesNotMatch(
    harness,
    /install -d[^\n]*-o 20042|-g 20042[^\n]*\/target\/state/,
  );
});

test("keeps the bootstrap isolated and the serving root filesystem read-only", () => {
  assert.match(
    harness,
    /state_volume_bootstrap="\$\(docker run --rm --platform linux\/amd64 \\\n\s+--network none --read-only --security-opt no-new-privileges \\\n\s+--user 0:0 --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE/,
  );
  assert.match(
    harness,
    /--mount "type=volume,src=\$\{state_volume\},dst=\/target" \\\n\s+--entrypoint sh/,
  );
  assert.match(
    harness,
    /docker run -d --name "\$\{runtime_container\}" --platform linux\/amd64 \\\n\s+--network "\$\{network\}" --read-only --security-opt no-new-privileges \\\n\s+--cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID/,
  );
});

test("leaves canonical config creation to the immutable runtime entrypoint", () => {
  assert.match(harness, /test ! -e \/target\/state\/config\.json/);
  assert.match(harness, /test ! -L \/target\/state\/config\.json/);
  assert.match(harness, /config_precreated\\":false/);
  const bootstrap = harness.slice(
    harness.indexOf("state_volume_bootstrap="),
    harness.indexOf("docker run --rm --platform linux/amd64 --network none --read-only --user 0:0"),
  );
  assert.doesNotMatch(bootstrap, /config\.json["']?\s*(?:>|>>)|printf[\s\S]*config\.json/);
});

test("binds the bootstrap receipt into the terminal cleanroom receipt", () => {
  assert.match(
    harness,
    /--argjson state_volume_bootstrap "\$\{state_volume_bootstrap\}"/,
  );
  assert.match(harness, /state_volume_bootstrap:\$state_volume_bootstrap/);
  assert.match(
    harness,
    /\.uid == \$uid and \.gid == \$gid and[\s\S]*\.config_precreated == false/,
  );
});

test("drops to the discovered serving identity before invoking the Nex CLI", () => {
  assert.match(
    runtimeCall,
    /token=\$\(cat \/run\/moonsleep-load-credentials\/runtime-token\)[\s\S]*export NEXUS_RUNTIME_TOKEN="\$token"[\s\S]*exec setpriv/,
  );
  assert.match(
    runtimeCall,
    /exec setpriv \\\n\s+--reuid="\$runtime_uid" --regid="\$runtime_gid" --clear-groups --no-new-privs \\\n\s+\/opt\/nex\/nexus\.mjs runtime call/,
  );
  assert.match(
    runtimeCall,
    /' sh "\$\{runtime_uid\}" "\$\{runtime_gid\}" "\$\{method\}" "\$\{params\}"/,
  );
  assert.doesNotMatch(
    runtimeCall,
    /token=\$\(cat[\s\S]*\n\s*exec \/opt\/nex\/nexus\.mjs/,
  );
  assert.doesNotMatch(runtimeCall, /--token(?:=|\s)/);
  assert.doesNotMatch(runtimeCall, /--url(?:=|\s)/);
  assert.doesNotMatch(runtimeCall, /env\s+NEXUS_RUNTIME_TOKEN=/);
  assert.doesNotMatch(runtimeCall, /(?:echo|printf)\s+["']?\$token/);
  assert.doesNotMatch(runtimeCall, /set\s+-[^\\n]*x/);
});

test("preserves runtime call parameter bytes for omitted, empty-object, and nonempty JSON", () => {
  assert.deepEqual(captureRuntimeCallParams(["healthcheck"]), Buffer.from([0x7b, 0x7d]));
  assert.deepEqual(captureRuntimeCallParams(["healthcheck", "{}"]), Buffer.from([0x7b, 0x7d]));
  const nonempty = '{"supplier":"Surewal","amount":22834.95}';
  assert.deepEqual(captureRuntimeCallParams(["contacts.observe", nonempty]), Buffer.from(nonempty));
  assert.doesNotMatch(runtimeCall, /\$\{2:-\{\}\}/);
});

test("emits sanitized failure diagnostics without secrets, arguments, environment, or payloads", () => {
  assert.match(diagnosticContract, /^set -Eeuo pipefail/m);
  assert.match(diagnosticContract, /trap diagnostic_failure ERR/);
  assert.doesNotMatch(diagnosticContract, /BASH_COMMAND/);
  assert.doesNotMatch(diagnosticContract, /(?:printenv|set\s+-[^\\n]*x)/);
  assert.doesNotMatch(
    diagnosticContract,
    /(?:runtime_token|postgres_dsn|record_payload|NEXUS_RUNTIME_TOKEN)/,
  );

  const secret = "nex_rt_secret_must_not_appear";
  const payload = '{"private_record":"must_not_appear"}';
  const result = spawnSync(
    "bash",
    [
      "-c",
      `
        ${diagnosticContract}
        begin_check "21_joined_pg_memory_stale_head_outbox_zero_authority" \
          "memory" "prove_joined_evidence_cas_outbox"
        export NEXUS_RUNTIME_TOKEN="$1"
        private_record_payload="$2"
        false
      `,
      "diagnostic-contract",
      secret,
      payload,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    "[partner-canonical] phase stage=21_joined_pg_memory_stale_head_outbox_zero_authority command_class=memory command_name=prove_joined_evidence_cas_outbox\n",
  );
  assert.match(
    result.stderr,
    /^\[partner-canonical\] failure stage=21_joined_pg_memory_stale_head_outbox_zero_authority line=[0-9]+ command_class=memory command_name=prove_joined_evidence_cas_outbox exit=1\n$/,
  );
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /must_not_appear|private_record/);
});

test("places one safe breadcrumb before every exact 22-check phase", () => {
  const breadcrumbs = [
    ...harness.matchAll(
      /^begin_check "([^"]+)" "([a-z0-9_]+)" "([a-z0-9_]+)"$/gm,
    ),
  ].map((match) => ({
    check: match[1],
    commandClass: match[2],
    commandName: match[3],
    index: match.index,
  }));
  const passes = [...harness.matchAll(/^pass_check "([^"]+)"$/gm)].map((match) => ({
    check: match[1],
    index: match.index,
  }));

  assert.deepEqual(
    breadcrumbs.map((item) => item.check),
    expectedChecks,
  );
  assert.deepEqual(
    passes.map((item) => item.check),
    expectedChecks,
  );
  assert.equal(new Set(breadcrumbs.map((item) => item.check)).size, 22);

  for (const [index, breadcrumb] of breadcrumbs.entries()) {
    const pass = passes[index];
    assert.equal(breadcrumb.check, pass.check);
    assert.ok(breadcrumb.index < pass.index);
    const phaseBody = harness.slice(breadcrumb.index, pass.index);
    assert.match(
      phaseBody,
      /(?:\bjq\b|\bcmp\b|\[\[|\bruntime_call\b|\bdocker\b|\bnode\b|\binstall_app\b|\bwait_for_|\bpostgres_counts\b|\bmemory_counts\b|\bprove_joined_evidence\b)/,
    );
    assert.match(breadcrumb.commandClass, /^[a-z0-9_]+$/);
    assert.match(breadcrumb.commandName, /^[a-z0-9_]+$/);
  }
});

test("stages the root-custodied token before running joined memory proof as the serving identity", () => {
  const joinedProof = harness.slice(
    harness.indexOf("prove_joined_evidence()"),
    harness.indexOf("wait_for_postgres()"),
  );
  assert.match(
    joinedProof,
    /cp \/run\/moonsleep-load-credentials\/runtime-token "\$\{staged_dir\}\/runtime-token"/,
  );
  assert.match(
    joinedProof,
    /chown -R "\$\{runtime_uid\}:\$\{runtime_gid\}" "\$\{staged_dir\}"/,
  );
  assert.ok(
    joinedProof.indexOf('chmod 0400 "${staged_dir}/runtime-token"') <
      joinedProof.indexOf(
        'chown -R "${runtime_uid}:${runtime_gid}" "${staged_dir}"',
      ),
  );
  assert.match(
    joinedProof,
    /exec setpriv \\\n\s+--reuid="\$runtime_uid" --regid="\$runtime_gid" --clear-groups --no-new-privs \\\n\s+sh -c/,
  );
  assert.match(
    joinedProof,
    /node \/proof\/prove-canonical-joined-evidence\.mjs[\s\S]*--token_file "\$\{staged_dir\}\/runtime-token"/,
  );
  assert.doesNotMatch(
    harness,
    /docker exec "\$\{runtime_container\}" node \\\n\s+\/proof\/prove-canonical-joined-evidence\.mjs/,
  );
});
