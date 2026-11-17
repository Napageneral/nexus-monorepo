import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function containsProhibitedField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProhibitedField);
  if (!value || typeof value !== "object") return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.some(
    ([field, nested]) => field === "kind" || containsProhibitedField(nested),
  );
}

function build(root: string, outputName: string): string {
  const output = join(root, outputName);
  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      new URL("../scripts/build-synthetic-surewal-records.mjs", import.meta.url)
        .pathname,
      "--fixture",
      new URL(
        "../fixtures/canonical/surewal-cross-channel-golden.v1.json",
        import.meta.url,
      ).pathname,
      "--out",
      output,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  return readFileSync(output, "utf8");
}

test("synthetic Surewal records are exact, provider-free, and replay-stable", () => {
  const root = mkdtempSync(join(tmpdir(), "partner-surewal-records-"));
  try {
    const first = build(root, "first.jsonl");
    const second = build(root, "second.jsonl");
    assert.equal(first, second);
    const records = first.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(records.length, 6);
    assert.equal(
      records.filter((record) => record.routing.platform === "alibaba").length,
      5,
    );
    assert.equal(
      records.filter((record) => record.routing.platform === "gmail").length,
      1,
    );
    assert.equal(new Set(records.map((record) => record.payload.external_record_id)).size, 6);
    assert.ok(
      records.every(
        (record) =>
          record.operation === "record.ingest" &&
          record.payload.metadata.synthetic_cleanroom === true &&
          record.payload.metadata.provider_read_authority === true &&
          record.payload.metadata.provider_write_authority === false &&
          record.payload.metadata.source_mutation_authority === false &&
          record.payload.metadata.financial_authority === false &&
          /^[0-9a-f]{64}$/.test(
            record.payload.payload.provider_object_sha256,
          ) &&
          !containsProhibitedField(record),
      ),
    );
    const runtimeDerivedIdentityFields = [
      "sender_entity_id",
      "receiver_entity_id",
      "sender_contact_id",
      "receiver_contact_id",
      "space_id",
      "container_kind",
      "container_id",
      "sender_name",
    ];
    assert.ok(
      records.every((record) => {
        const sourceRevisionPayload =
          record.payload.metadata.source_revision_payload;
        return (
          sourceRevisionPayload.external_record_id ===
            record.payload.external_record_id &&
          sourceRevisionPayload.provider_message_id ===
            record.payload.metadata.provider_message_id &&
          sourceRevisionPayload.provider_thread_id ===
            record.payload.metadata.provider_thread_id &&
          sourceRevisionPayload.source_revision_sha256 ===
            record.payload.metadata.source_revision_sha256 &&
          sourceRevisionPayload.source_run_receipt_ref ===
            record.payload.metadata.source_run_receipt_ref &&
          sourceRevisionPayload.provider_object_sha256 ===
            record.payload.payload.provider_object_sha256 &&
          runtimeDerivedIdentityFields.every(
            (field) => !(field in sourceRevisionPayload),
          )
        );
      }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
