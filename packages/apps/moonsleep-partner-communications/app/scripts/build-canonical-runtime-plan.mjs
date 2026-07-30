#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  canonicalJson,
  loadCanonicalPartnerManifest,
} from "../src/canonical-prep.ts";
import { buildCanonicalPartnerRuntimePlan } from "../src/canonical-runtime.ts";
import { prepareLegacyPartnerMigration } from "../src/legacy-migration.ts";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    fixture: { type: "string" },
    bindings: { type: "string" },
    out: { type: "string" },
  },
  strict: true,
});

if (!values.manifest || !values.fixture || !values.bindings || !values.out) {
  throw new Error("--manifest, --fixture, --bindings, and --out are required");
}

const manifest = loadCanonicalPartnerManifest(resolve(values.manifest));
const fixture = JSON.parse(readFileSync(resolve(values.fixture), "utf8"));
const migration = prepareLegacyPartnerMigration(manifest, fixture);
const sourceRevisionBindings = JSON.parse(
  readFileSync(resolve(values.bindings), "utf8"),
);
const plan = buildCanonicalPartnerRuntimePlan({
  manifest,
  migration,
  sourceRevisionBindings,
});

writeFileSync(resolve(values.out), `${canonicalJson(plan)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    operation: "build_partner_canonical_runtime_plan",
    migration_id: plan.migration_id,
    fact_count: plan.fact_plans.length,
    observation_candidate_count: plan.observation_plans.length,
    set_profile_count: new Set(
      plan.observation_plans.map((observation) => observation.set_profile_id),
    ).size,
    provider_write_authority: plan.authority.provider_write,
    identity_merge_authority: plan.authority.identity_merge,
    external_domain_write_authority: plan.authority.external_domain_write,
    draft_or_send_authority: plan.authority.draft_or_send,
    canonical_promotion_authority: plan.authority.canonical_promotion,
  })}\n`,
);
