#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const EXPECTED_RECORD_COUNT = 6;

function requireObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function requireNonEmptyString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

export function resolveCanonicalRecordRowBindings(fixture, recordsSnapshot) {
  const fixtureObject = requireObject(fixture, "fixture must be an object");
  if (
    !Array.isArray(fixtureObject.records) ||
    fixtureObject.records.length !== EXPECTED_RECORD_COUNT
  ) {
    throw new Error("fixture must contain exactly six records");
  }

  const expectedSourceRecordIds = fixtureObject.records.map((record) =>
    requireNonEmptyString(
      requireObject(record, "fixture record must be an object").source_record_id,
      "fixture source_record_id must be a non-empty string",
    ),
  );
  if (new Set(expectedSourceRecordIds).size !== EXPECTED_RECORD_COUNT) {
    throw new Error("fixture source_record_id values must be unique");
  }

  const snapshotObject = requireObject(
    recordsSnapshot,
    "records.list snapshot must be an object",
  );
  if (
    !Array.isArray(snapshotObject.records) ||
    snapshotObject.records.length !== EXPECTED_RECORD_COUNT
  ) {
    throw new Error("records.list snapshot must contain exactly six records");
  }

  const returnedRows = snapshotObject.records.map((record) => {
    const row = requireObject(record, "records.list row must be an object");
    const metadata = requireObject(
      row.metadata,
      "records.list row metadata must be an object",
    );
    return {
      record_id: requireNonEmptyString(
        row.id,
        "records.list row id must be a non-empty string",
      ),
      source_record_id: requireNonEmptyString(
        metadata.external_record_id,
        "records.list metadata.external_record_id must be a non-empty string",
      ),
    };
  });

  const rowsBySourceRecordId = new Map();
  for (const row of returnedRows) {
    const matches = rowsBySourceRecordId.get(row.source_record_id) ?? [];
    matches.push(row);
    rowsBySourceRecordId.set(row.source_record_id, matches);
  }

  const bindings = expectedSourceRecordIds.map((sourceRecordId) => {
    const matches = rowsBySourceRecordId.get(sourceRecordId) ?? [];
    if (matches.length === 0) {
      throw new Error("records.list snapshot is missing an expected source record");
    }
    if (matches.length !== 1) {
      throw new Error("records.list snapshot has an ambiguous source record mapping");
    }
    return {
      source_record_id: sourceRecordId,
      record_id: matches[0].record_id,
    };
  });

  if (new Set(bindings.map((binding) => binding.record_id)).size !== EXPECTED_RECORD_COUNT) {
    throw new Error("records.list snapshot maps multiple source records to one row id");
  }

  const expectedSourceRecordIdSet = new Set(expectedSourceRecordIds);
  if (
    returnedRows.some(
      (row) => !expectedSourceRecordIdSet.has(row.source_record_id),
    )
  ) {
    throw new Error("records.list snapshot contains an unexpected source record");
  }

  return bindings.sort((left, right) =>
    left.source_record_id.localeCompare(right.source_record_id),
  );
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON`, { cause: error });
  }
}

function runCli() {
  const { values } = parseArgs({
    options: {
      fixture: { type: "string" },
      records_snapshot: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });
  if (!values.fixture || !values.records_snapshot || !values.out) {
    throw new Error("--fixture, --records_snapshot, and --out are required");
  }

  const bindings = resolveCanonicalRecordRowBindings(
    readJson(values.fixture, "fixture"),
    readJson(values.records_snapshot, "records.list snapshot"),
  );
  writeFileSync(resolve(values.out), `${JSON.stringify(bindings)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      operation: "resolve_canonical_record_row_bindings",
      binding_count: bindings.length,
      unique_source_record_count: new Set(
        bindings.map((binding) => binding.source_record_id),
      ).size,
      unique_record_row_count: new Set(
        bindings.map((binding) => binding.record_id),
      ).size,
      provider_calls: 0,
      provider_write_authority: false,
    })}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
