#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    plan: { type: "string" },
    token_file: { type: "string" },
    out: { type: "string" },
    url: { type: "string", default: "http://127.0.0.1:18789" },
  },
  strict: true,
});

if (!values.plan || !values.token_file || !values.out) {
  throw new Error("--plan, --token_file, and --out are required");
}

const plan = JSON.parse(readFileSync(resolve(values.plan), "utf8"));
const token = readFileSync(resolve(values.token_file), "utf8").trim();
if (!token) throw new Error("runtime token is empty");
if (
  plan.authority?.provider_write !== false ||
  plan.authority?.identity_merge !== false ||
  plan.authority?.external_domain_write !== false ||
  plan.authority?.draft_or_send !== false ||
  plan.authority?.canonical_promotion !== false
) {
  throw new Error("runtime plan authority ceiling is invalid");
}

async function call(operation, params) {
  const response = await fetch(
    `${values.url.replace(/\/+$/, "")}/runtime/operations/${operation}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(params),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const error = result?.error && typeof result.error === "object" ? result.error : {};
    throw new Error(
      `${operation} failed with HTTP ${response.status}: ${String(error.code ?? "unknown").slice(0, 128)}: ${String(error.message ?? "unavailable").slice(0, 512)}`,
    );
  }
  return result.payload ?? result;
}

const factsByCandidate = new Map();
let factCreated = 0;
let factReused = 0;
for (const factPlan of plan.fact_plans) {
  const payload = await call(
    "memory.evidence.facts.create",
    factPlan.create_params,
  );
  const factId = payload?.item?.fact?.id;
  if (typeof factId !== "string" || !factId) {
    throw new Error(`fact response is invalid: ${factPlan.candidate_fact_id}`);
  }
  factsByCandidate.set(factPlan.candidate_fact_id, factId);
  if (payload.reused === true) factReused += 1;
  else factCreated += 1;
}

let setsCreated = 0;
let setsReused = 0;
let candidatesCreated = 0;
let candidatesReused = 0;
const setProfileCounts = new Map();
for (const observationPlan of plan.observation_plans) {
  const factIds = observationPlan.candidate_fact_ids.map((candidateFactId) => {
    const factId = factsByCandidate.get(candidateFactId);
    if (!factId) throw new Error(`candidate fact was not created: ${candidateFactId}`);
    return factId;
  });
  const setPayload = await call(
    "memory.sets.create",
    observationPlan.set_create_params,
  );
  const setId = setPayload?.set?.id;
  if (typeof setId !== "string" || !setId) {
    throw new Error(`set response is invalid: ${observationPlan.candidate_id}`);
  }
  if (setPayload.reused === true) {
    setsReused += 1;
    const membersPayload = await call("memory.sets.members.list", { setId });
    const memberIds = (membersPayload.members ?? [])
      .map((member) => member.memberId ?? member.member_id)
      .sort();
    if (JSON.stringify(memberIds) !== JSON.stringify([...factIds].sort())) {
      throw new Error(`replayed set membership drifted: ${observationPlan.candidate_id}`);
    }
  } else {
    setsCreated += 1;
    for (const [position, factId] of factIds.entries()) {
      await call("memory.sets.members.add", {
        setId,
        memberType: "element",
        memberId: factId,
        position,
      });
    }
    await call("memory.sets.seal", {
      setId,
      sealedBy: `job:${observationPlan.stage_params.resolverId}`,
    });
  }
  const candidatePayload = await call(
    "memory.evidence.observations.candidates.stage",
    {
      ...observationPlan.stage_params,
      inputSetId: setId,
      factDispositions: factIds.map((factElementId) => ({
        factElementId,
        disposition: "supports",
      })),
    },
  );
  const candidateId = candidatePayload?.item?.candidate?.id;
  if (typeof candidateId !== "string" || !candidateId) {
    throw new Error(`candidate response is invalid: ${observationPlan.candidate_id}`);
  }
  if (candidatePayload.reused === true) candidatesReused += 1;
  else candidatesCreated += 1;
  setProfileCounts.set(
    observationPlan.set_profile_id,
    (setProfileCounts.get(observationPlan.set_profile_id) ?? 0) + 1,
  );
}

const receipt = {
  ok: true,
  operation: "apply_partner_canonical_runtime_plan_dormant",
  migration_id: plan.migration_id,
  source_manifest_sha256: plan.source_manifest_sha256,
  fact_count: plan.fact_plans.length,
  fact_created: factCreated,
  fact_reused: factReused,
  set_count: plan.observation_plans.length,
  set_created: setsCreated,
  set_reused: setsReused,
  observation_candidate_count: plan.observation_plans.length,
  observation_candidate_created: candidatesCreated,
  observation_candidate_reused: candidatesReused,
  set_profile_counts: Object.fromEntries(
    [...setProfileCounts.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  ),
  canonical_promotion_count: 0,
  projection_event_count: 0,
  provider_calls: 0,
  provider_write_authority: false,
  identity_merge_authority: false,
  external_domain_write_authority: false,
  draft_or_send_authority: false,
  canonical_promotion_authority: false,
};

writeFileSync(resolve(values.out), `${JSON.stringify(receipt)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
process.stdout.write(`${JSON.stringify(receipt)}\n`);
