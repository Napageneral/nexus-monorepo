#!/usr/bin/env node

import { parseArgs } from "node:util";
import { executePartnerShadowAdapter } from "../src/bounded-shadow-execution-adapter.ts";

const { values } = parseArgs({
  options: {
    request: { type: "string" },
    postgres_url_file: { type: "string" },
    postgres_schema: { type: "string" },
    shadow_memory: { type: "string" },
    receipt: { type: "string" },
    psql: { type: "string", default: "psql" },
  },
  strict: true,
});

for (const field of [
  "request",
  "postgres_url_file",
  "postgres_schema",
  "shadow_memory",
  "receipt",
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
  shadowMemoryPath: values.shadow_memory!,
  receiptPath: values.receipt!,
  expectedOwnerUid: 0,
  psqlCommand: values.psql,
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
