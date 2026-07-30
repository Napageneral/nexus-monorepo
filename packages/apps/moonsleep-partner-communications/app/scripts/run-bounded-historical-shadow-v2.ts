#!/usr/bin/env node

import { parseArgs } from "node:util";
import { executePartnerShadowV2Adapter } from "../src/bounded-shadow-v2-execution-adapter.ts";

const { values } = parseArgs({
  options: {
    request: { type: "string" },
    postgres_url_file: { type: "string" },
    postgres_schema: { type: "string" },
    canonical_manifest: { type: "string" },
    shadow_memory: { type: "string" },
    receipt: { type: "string" },
    runtime_module_root: { type: "string" },
    resume: { type: "boolean", default: false },
  },
  strict: true,
});

for (const field of [
  "request",
  "postgres_url_file",
  "postgres_schema",
  "canonical_manifest",
  "shadow_memory",
  "receipt",
  "runtime_module_root",
] as const) {
  if (!values[field]) {
    throw new Error(`--${field} is required`);
  }
}
if (typeof process.getuid !== "function" || process.getuid() !== 0) {
  throw new Error("Partner historical shadow V2 must run as root");
}

const receipt = await executePartnerShadowV2Adapter({
  requestPath: values.request!,
  postgresUrlFile: values.postgres_url_file!,
  postgresSchema: values.postgres_schema!,
  canonicalManifestPath: values.canonical_manifest!,
  shadowMemoryPath: values.shadow_memory!,
  receiptPath: values.receipt!,
  expectedOwnerUid: 0,
  runtimeModuleRoot: values.runtime_module_root!,
  resume: values.resume!,
});
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    cohort_id: receipt.cohort_id,
    receipt_sha256: receipt.receipt_sha256,
    member_count: receipt.member_count,
    completed_count: receipt.completed_count,
    dead_letter_count: receipt.dead_letter_count,
    review_required_count: receipt.review_required_count,
    resume_count: receipt.resume_count,
    replay_stable: receipt.replay_stable,
  })}\n`,
);
