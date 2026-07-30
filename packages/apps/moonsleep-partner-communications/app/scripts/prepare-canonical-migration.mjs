#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  canonicalJson,
  loadCanonicalPartnerManifest,
} from "../src/canonical-prep.ts";
import { prepareLegacyPartnerMigration } from "../src/legacy-migration.ts";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    fixture: { type: "string" },
    out: { type: "string" },
  },
  strict: true,
});

if (!values.manifest || !values.fixture || !values.out) {
  throw new Error("--manifest, --fixture, and --out are required");
}

const manifestPath = resolve(values.manifest);
const fixturePath = resolve(values.fixture);
const outputPath = resolve(values.out);
const manifest = loadCanonicalPartnerManifest(manifestPath);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const plan = prepareLegacyPartnerMigration(manifest, fixture);
writeFileSync(outputPath, `${canonicalJson(plan)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
process.stdout.write(`${JSON.stringify({
  ok: true,
  operation: "prepare_partner_canonical_migration",
  migration_id: plan.migration_id,
  fact_count: plan.facts.length,
  observation_candidate_count: plan.observation_candidates.length,
  plan_sha256: plan.plan_sha256,
  provider_write_authority: plan.authority.provider_write,
  external_domain_write_authority: plan.authority.external_domain_write,
})}\n`);
