#!/usr/bin/env node

import { parseArgs } from "node:util";
import { executePartnerShadowAdapter } from "../src/bounded-shadow-execution-adapter.ts";

const { values } = parseArgs({
  options: {
    request: { type: "string" },
    postgres_url_file: { type: "string" },
    postgres_schema: { type: "string" },
    canonical_manifest: { type: "string" },
    shadow_memory: { type: "string" },
    receipt: { type: "string" },
    runtime_module_root: { type: "string" },
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
  if (!values[field]) throw new Error(`--${field} is required`);
}
if (typeof process.getuid !== "function" || process.getuid() !== 0) {
  throw new Error("Partner PD-10 execution adapter must run as root");
}

const receipt = await executePartnerShadowAdapter({
  requestPath: values.request!,
  postgresUrlFile: values.postgres_url_file!,
  postgresSchema: values.postgres_schema!,
  canonicalManifestPath: values.canonical_manifest!,
  shadowMemoryPath: values.shadow_memory!,
  receiptPath: values.receipt!,
  expectedOwnerUid: 0,
  runtimeModuleRoot: values.runtime_module_root!,
});
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    cohort_id: receipt.cohort_id,
    receipt_sha256: receipt.receipt_sha256,
    member_count: receipt.member_count,
    review_required_count: receipt.review_required_count,
    replay_stable: receipt.replay_stable,
  })}\n`,
);
