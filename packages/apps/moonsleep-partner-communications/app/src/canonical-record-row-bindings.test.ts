import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCanonicalRecordRowBindings } from "../scripts/resolve-canonical-record-row-bindings.mjs";

function fixture(count = 6): Record<string, unknown> {
  return {
    records: Array.from({ length: count }, (_, index) => ({
      source_record_id: `surewal:source:${index + 1}`,
    })),
  };
}

function snapshot(count = 6): Record<string, unknown> {
  return {
    records: Array.from({ length: count }, (_, index) => ({
      id: `record-row-${index + 1}`,
      metadata: {
        external_record_id: `surewal:source:${index + 1}`,
      },
    })),
    limit: 7,
    offset: 0,
  };
}

test("resolves exactly six source anchors to six unique internal record row ids", () => {
  const result = resolveCanonicalRecordRowBindings(fixture(), snapshot());
  assert.deepEqual(
    result,
    Array.from({ length: 6 }, (_, index) => ({
      source_record_id: `surewal:source:${index + 1}`,
      record_id: `record-row-${index + 1}`,
    })),
  );
});

test("rejects a missing expected source anchor", () => {
  const recordsSnapshot = snapshot() as { records: Array<Record<string, unknown>> };
  recordsSnapshot.records[5].metadata = {
    external_record_id: "surewal:source:unexpected",
  };
  assert.throws(
    () => resolveCanonicalRecordRowBindings(fixture(), recordsSnapshot),
    /missing an expected source record/,
  );
});

test("rejects duplicate fixture source anchors", () => {
  const inputFixture = fixture() as { records: Array<Record<string, unknown>> };
  inputFixture.records[5].source_record_id = "surewal:source:1";
  assert.throws(
    () => resolveCanonicalRecordRowBindings(inputFixture, snapshot()),
    /source_record_id values must be unique/,
  );
});

test("rejects an ambiguous source anchor returned by records.list", () => {
  const recordsSnapshot = snapshot() as { records: Array<Record<string, unknown>> };
  recordsSnapshot.records[5].metadata = {
    external_record_id: "surewal:source:1",
  };
  assert.throws(
    () => resolveCanonicalRecordRowBindings(fixture(), recordsSnapshot),
    /ambiguous source record mapping/,
  );
});

test("rejects two source anchors mapped to one internal record row id", () => {
  const recordsSnapshot = snapshot() as { records: Array<Record<string, unknown>> };
  recordsSnapshot.records[5].id = "record-row-1";
  assert.throws(
    () => resolveCanonicalRecordRowBindings(fixture(), recordsSnapshot),
    /multiple source records to one row id/,
  );
});

test("rejects fixture or snapshot counts other than exactly six", () => {
  assert.throws(
    () => resolveCanonicalRecordRowBindings(fixture(5), snapshot()),
    /fixture must contain exactly six records/,
  );
  assert.throws(
    () => resolveCanonicalRecordRowBindings(fixture(), snapshot(7)),
    /records.list snapshot must contain exactly six records/,
  );
});
