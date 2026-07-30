import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, test } from "vitest";
import { initializeDatabase } from "../../../../../nex/src/storage/migrations/initialize.ts";
import {
  runPartnerBoundedHistoricalShadow,
  type PartnerShadowCohortRequest,
  type PartnerShadowProjection,
  type PartnerShadowRevisionRow,
  type PartnerShadowRevisionStore,
} from "./bounded-historical-shadow.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function projection(
  overrides: Partial<PartnerShadowProjection> = {},
): PartnerShadowProjection {
  return {
    coverage_disposition: "open_loop_evidence",
    reviewed_open_loop_ids: ["loop-opaque-one"],
    superseded_source_revision_refs: [],
    proposal_conflict_count: 0,
    missing_reason: null,
    ...overrides,
  };
}

function revision(label: string, connectionId = "alibaba-connection-opaque"): PartnerShadowRevisionRow {
  return {
    id: `revision-${label}`,
    record_row_id: `record-${label}`,
    payload_sha256: digest(`payload-${label}`),
    connection_id: connectionId,
    platform: "alibaba",
    source_record_type: "alibaba_message",
    source_timestamp: 1_785_000_000_000,
    observed_at: 1_785_000_001_000,
    authority_declaration_json: JSON.stringify({
      provider_read_authority: true,
      provider_write_authority: false,
      source_mutation_authority: false,
      financial_mutation_authority: false,
    }),
  };
}

function request(labels: string[]): PartnerShadowCohortRequest {
  return {
    cohort_id: "PD-10-OPAQUE-0001",
    connection_id: "alibaba-connection-opaque",
    source_read_receipt_sha256: digest("read receipt"),
    execution_mode: "isolated_shadow_memory",
    members: labels.map((label) => ({
      record_row_id: `record-${label}`,
      revision_id: `revision-${label}`,
      payload_sha256: digest(`payload-${label}`),
      source_logical_record_ref: `source-${label}`,
      source_revision_sha256: digest(`source-revision-${label}`),
      old_projection: projection(),
      candidate_projection:
        label === "b"
          ? projection({
              coverage_disposition: "needs_review",
              missing_reason: "review_required",
            })
          : projection(),
    })),
  };
}

function store(
  labels: string[],
  connectionOverrides: Record<string, string> = {},
): PartnerShadowRevisionStore {
  const rows = new Map(
    labels.map((label) => [
      `revision-${label}`,
      revision(label, connectionOverrides[label]),
    ]),
  );
  return {
    async getRecordRevision(id) {
      return rows.get(id) ?? null;
    },
  };
}

let memoryDb: DatabaseSync;

beforeEach(() => {
  memoryDb = new DatabaseSync(":memory:");
  memoryDb.exec("PRAGMA foreign_keys = ON");
  initializeDatabase("memory", memoryDb);
});

afterEach(() => {
  memoryDb.close();
});

test("runs an exact bounded Partner cohort twice with sealed sets, CAS heads, and isolated outbox", async () => {
  const result = await runPartnerBoundedHistoricalShadow({
    revisionStore: store(["a", "b", "c"]),
    shadowMemoryDb: memoryDb,
    request: request(["c", "a", "b"]),
  });

  assert.equal(result.member_count, 3);
  assert.equal(result.comparison_count, 3);
  assert.equal(result.review_required_count, 1);
  assert.deepEqual(result.first_pass, {
    facts_created: 3,
    facts_reused: 0,
    sets_created: 3,
    sets_reused: 0,
    members_created: 3,
    members_reused: 0,
    seals_created: 3,
    seals_reused: 0,
    observations_created: 3,
    observations_reused: 0,
    observation_ids: result.first_pass.observation_ids,
    outbox_count: 3,
  });
  assert.deepEqual(result.second_pass, {
    facts_created: 0,
    facts_reused: 3,
    sets_created: 0,
    sets_reused: 3,
    members_created: 0,
    members_reused: 3,
    seals_created: 0,
    seals_reused: 3,
    observations_created: 0,
    observations_reused: 3,
    observation_ids: result.first_pass.observation_ids,
    outbox_count: 3,
    outbox_additions: 0,
  });
  assert.equal(result.replay_stable, true);
  assert.deepEqual(result.authority, {
    provider_calls: 0,
    model_calls: 0,
    provider_write_authority: false,
    identity_merge_authority: false,
    draft_or_send_authority: false,
    canonical_promotion_authority: false,
    active_projection_writes: 0,
    isolated_shadow_outbox_deliveries: 3,
  });
  const delivered = memoryDb
    .prepare(
      `SELECT status, COUNT(*) AS count
         FROM projection_outbox
        GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0]!.status, "delivered");
  assert.equal(Number(delivered[0]!.count), 3);
  assert.equal(
    Number(
      (
        memoryDb
          .prepare(
            `SELECT COUNT(*) AS count
               FROM canonical_observation_heads
              WHERE head_key NOT LIKE 'shadow:partner:pd10:%'`,
          )
          .get() as { count: number }
      ).count,
    ),
    0,
  );
  const durable = JSON.stringify(result);
  assert.doesNotMatch(durable, /record-a|revision-a|alibaba-connection-opaque/);
  assert.doesNotMatch(durable, /"kind"\s*:/);
  assert.match(result.receipt_sha256, /^[0-9a-f]{64}$/);
});

test("selects and receipts the same exact cohort independent of input order", async () => {
  const first = await runPartnerBoundedHistoricalShadow({
    revisionStore: store(["a", "b"]),
    shadowMemoryDb: memoryDb,
    request: request(["b", "a"]),
  });
  const secondDb = new DatabaseSync(":memory:");
  secondDb.exec("PRAGMA foreign_keys = ON");
  initializeDatabase("memory", secondDb);
  try {
    const second = await runPartnerBoundedHistoricalShadow({
      revisionStore: store(["a", "b"]),
      shadowMemoryDb: secondDb,
      request: request(["a", "b"]),
    });
    assert.equal(second.exact_revision_set_sha256, first.exact_revision_set_sha256);
    assert.deepEqual(second.comparisons, first.comparisons);
    assert.equal(second.review_required_count, first.review_required_count);
  } finally {
    secondDb.close();
  }
});

test("fails closed on mixed connections, tuple drift, and unsafe source authority", async () => {
  await assert.rejects(
    runPartnerBoundedHistoricalShadow({
      revisionStore: store(["a", "b"], { b: "other-connection" }),
      shadowMemoryDb: memoryDb,
      request: request(["a", "b"]),
    }),
    /one exact source connection/,
  );
  const drift = request(["a"]);
  drift.members[0]!.payload_sha256 = digest("drift");
  await assert.rejects(
    runPartnerBoundedHistoricalShadow({
      revisionStore: store(["a"]),
      shadowMemoryDb: memoryDb,
      request: drift,
    }),
    /exact source revision tuple mismatch/,
  );
  const unsafeRow = revision("a");
  unsafeRow.authority_declaration_json = JSON.stringify({
    provider_write_authority: true,
    source_mutation_authority: false,
    financial_mutation_authority: false,
  });
  await assert.rejects(
    runPartnerBoundedHistoricalShadow({
      revisionStore: {
        async getRecordRevision() {
          return unsafeRow;
        },
      },
      shadowMemoryDb: memoryDb,
      request: request(["a"]),
    }),
    /provider_write_authority must remain false/,
  );
});

test("rejects unbounded, duplicate, non-opaque, and raw-address cohort inputs", async () => {
  await assert.rejects(
    runPartnerBoundedHistoricalShadow({
      revisionStore: store(["a"]),
      shadowMemoryDb: memoryDb,
      request: request([]),
    }),
    /requires 1-5 members/,
  );
  const duplicate = request(["a", "a"]);
  await assert.rejects(
    runPartnerBoundedHistoricalShadow({
      revisionStore: store(["a"]),
      shadowMemoryDb: memoryDb,
      request: duplicate,
    }),
    /duplicate exact revision tuples/,
  );
  const rawAddress = request(["a"]);
  rawAddress.members[0]!.source_logical_record_ref = "person@example.com";
  await assert.rejects(
    runPartnerBoundedHistoricalShadow({
      revisionStore: store(["a"]),
      shadowMemoryDb: memoryDb,
      request: rawAddress,
    }),
    /must be an opaque reference/,
  );
  await assert.rejects(
    runPartnerBoundedHistoricalShadow({
      revisionStore: store(["a", "b", "c", "d", "e", "f"]),
      shadowMemoryDb: memoryDb,
      request: request(["a", "b", "c", "d", "e", "f"]),
    }),
    /requires 1-5 members/,
  );
});
