#!/usr/bin/env bash
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cleanroom="$(mktemp -d "${TMPDIR:-/tmp}/partner-canonical-prep.XXXXXX")"
cleanup() {
  rm -rf -- "$cleanroom"
}
trap cleanup EXIT

mkdir -p \
  "$cleanroom/app/contracts" \
  "$cleanroom/app/fixtures/canonical" \
  "$cleanroom/app/scripts" \
  "$cleanroom/app/src"

cp "$app_dir/contracts/partner-canonical-profiles.v1.json" "$cleanroom/app/contracts/"
cp "$app_dir/fixtures/canonical/surewal-cross-channel-golden.v1.json" "$cleanroom/app/fixtures/canonical/"
cp "$app_dir/scripts/prepare-canonical-migration.mjs" "$cleanroom/app/scripts/"
cp "$app_dir/src/"*.ts "$cleanroom/app/src/"

chmod -R u=rwX,go= "$cleanroom"
cd "$cleanroom/app"

node --test --experimental-strip-types src/*.test.ts

node --experimental-strip-types scripts/prepare-canonical-migration.mjs \
  --manifest contracts/partner-canonical-profiles.v1.json \
  --fixture fixtures/canonical/surewal-cross-channel-golden.v1.json \
  --out "$cleanroom/plan-first.json" \
  > "$cleanroom/receipt-first.json"

node --experimental-strip-types scripts/prepare-canonical-migration.mjs \
  --manifest contracts/partner-canonical-profiles.v1.json \
  --fixture fixtures/canonical/surewal-cross-channel-golden.v1.json \
  --out "$cleanroom/plan-replay.json" \
  > "$cleanroom/receipt-replay.json"

cmp "$cleanroom/plan-first.json" "$cleanroom/plan-replay.json"
cmp "$cleanroom/receipt-first.json" "$cleanroom/receipt-replay.json"

if grep -R -n -E '"kind"[[:space:]]*:' \
  contracts fixtures scripts src; then
  echo "prohibited generic schema field found" >&2
  exit 1
fi

node - "$cleanroom/plan-first.json" "$cleanroom/receipt-first.json" <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const planPath = process.argv[2];
const receiptPath = process.argv[3];
const planBytes = fs.readFileSync(planPath);
const plan = JSON.parse(planBytes);
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
if (plan.facts.length !== 26) throw new Error("cleanroom fact count mismatch");
if (plan.observation_candidates.length !== 9) {
  throw new Error("cleanroom observation count mismatch");
}
if (
  plan.authority.provider_write !== false ||
  plan.authority.identity_merge !== false ||
  plan.authority.external_domain_write !== false ||
  plan.authority.draft_or_send !== false
) {
  throw new Error("cleanroom authority ceiling mismatch");
}
if (receipt.plan_sha256 !== plan.plan_sha256) {
  throw new Error("cleanroom receipt does not bind the plan");
}
process.stdout.write(`${JSON.stringify({
  ok: true,
  proof: "partner-canonical-prep-cleanroom-v1",
  replay_equal: true,
  source_record_count: plan.extraction_source_set.member_count,
  fact_count: plan.facts.length,
  observation_candidate_count: plan.observation_candidates.length,
  plan_sha256: plan.plan_sha256,
  plan_file_sha256: crypto.createHash("sha256").update(planBytes).digest("hex"),
  provider_write_authority: plan.authority.provider_write,
  identity_merge_authority: plan.authority.identity_merge,
  external_domain_write_authority: plan.authority.external_domain_write,
  draft_or_send_authority: plan.authority.draft_or_send
})}\n`);
NODE
