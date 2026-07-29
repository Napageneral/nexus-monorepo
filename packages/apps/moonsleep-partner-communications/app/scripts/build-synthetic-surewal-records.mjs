#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { canonicalJson } from "../src/canonical-prep.ts";

const { values } = parseArgs({
  options: {
    fixture: { type: "string" },
    out: { type: "string" },
  },
  strict: true,
});

if (!values.fixture || !values.out) {
  throw new Error("--fixture and --out are required");
}

const fixturePath = resolve(values.fixture);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
if (!Array.isArray(fixture.records) || fixture.records.length !== 6) {
  throw new Error("synthetic Surewal fixture must contain exactly six records");
}

const lines = fixture.records.map((record, index) => {
  const providerObjectJson = canonicalJson(record);
  const providerObjectSha256 = createHash("sha256")
    .update(providerObjectJson)
    .digest("hex");
  const observedAt = Date.parse(record.observed_at);
  if (!Number.isSafeInteger(observedAt)) {
    throw new Error(`record ${index} has an invalid observed_at`);
  }
  return canonicalJson({
    operation: "record.ingest",
    routing: {
      adapter:
        record.provider === "gmail"
          ? "gog"
          : record.source_revision_ref.adapter_package_id,
      platform: record.provider,
      connection_id: record.connection_id,
      sender_id:
        record.direction === "inbound"
          ? "surewal-rebecca-fixture"
          : record.connection_id,
      sender_name:
        record.direction === "inbound" ? "Surewal Rebecca" : "MoonSleep Ops",
      receiver_id:
        record.direction === "inbound"
          ? record.connection_id
          : "surewal-rebecca-fixture",
      receiver_name:
        record.direction === "inbound" ? "MoonSleep Ops" : "Surewal Rebecca",
      container_kind: "group",
      container_id: record.provider_thread_id,
      thread_id: record.provider_thread_id,
      thread_name: "Surewal cross-channel synthetic cohort",
      metadata: {
        direction: record.direction,
        synthetic_cleanroom: true,
      },
    },
    payload: {
      external_record_id: record.source_record_id,
      timestamp: observedAt,
      content: record.summary,
      content_type: "text",
      payload: {
        provider_object_json: providerObjectJson,
        provider_object_sha256: providerObjectSha256,
      },
      metadata: {
        family: "message",
        provider_message_id: record.provider_message_id,
        provider_thread_id: record.provider_thread_id,
        source_revision_sha256: record.source_revision_sha256,
        source_run_receipt_ref: record.source_revision_ref.source_run_receipt_ref,
        provider_read_authority: true,
        provider_write_authority: false,
        source_mutation_authority: false,
        financial_authority: false,
        synthetic_cleanroom: true,
      },
    },
  });
});

writeFileSync(resolve(values.out), `${lines.join("\n")}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    operation: "build_synthetic_surewal_records",
    record_count: lines.length,
    alibaba_record_count: fixture.records.filter((record) => record.provider === "alibaba")
      .length,
    gmail_record_count: fixture.records.filter((record) => record.provider === "gmail")
      .length,
    provider_calls: 0,
    provider_write_authority: false,
  })}\n`,
);
