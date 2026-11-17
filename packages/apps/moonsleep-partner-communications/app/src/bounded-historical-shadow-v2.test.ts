import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, test } from "vitest";
import { initializeDatabase } from "../../../../../nex/src/storage/migrations/initialize.ts";
import {
  runPartnerBoundedHistoricalShadowV2,
  type PartnerShadowIdentityReceiptRow,
  type PartnerShadowV2Request,
  type PartnerShadowV2Store,
} from "./bounded-historical-shadow-v2.ts";
import type {
  PartnerShadowProjection,
  PartnerShadowRevisionRow,
} from "./bounded-historical-shadow.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function projection(
  overrides: Partial<PartnerShadowProjection> = {},
): PartnerShadowProjection {
  return {
    coverage_disposition: "open_loop_evidence",
    reviewed_open_loop_ids: ["loop-reviewed-one"],
    superseded_source_revision_refs: [],
    proposal_conflict_count: 0,
    missing_reason: null,
    ...overrides,
  };
}

function revision(label: string): PartnerShadowRevisionRow {
  return {
    id: `revision-${label}`,
    record_row_id: `record-${label}`,
    payload_sha256: digest(`payload-${label}`),
    connection_id: "partner-connection-opaque",
    platform: label === "gmail" ? "gmail" : "alibaba",
    source_record_type:
      label === "gmail" ? "gmail_message" : "alibaba_message",
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

function identityReceipt(label: string): PartnerShadowIdentityReceiptRow {
  return {
    id: `identity-receipt-${label}`,
    source_revision_id: `revision-${label}`,
    connection_id: "partner-connection-opaque",
    identity_contract_version: "nex-ingress-identity-v1",
    identity_result_digest: digest(`identity-result-${label}`),
    status: "applied",
    parties: [
      {
        party_ordinal: 0,
        contact_observation_id: `contact-observation-${label}`,
        observed_entity_id: `entity-observed-${label}`,
        canonical_entity_id_at_commit: "entity-surewal-reviewed",
      },
    ],
  };
}

function request(labels: string[]): PartnerShadowV2Request {
  return {
    cohort_id: "PD-11-OPAQUE-0001",
    connection_id: "partner-connection-opaque",
    source_read_receipt_sha256: digest("source-read-receipt"),
    current_projection_read_receipt_sha256: digest(
      "current-projection-read-receipt",
    ),
    execution_mode: "isolated_shadow_memory",
    members: labels.map((label) => ({
      record_row_id: `record-${label}`,
      revision_id: `revision-${label}`,
      payload_sha256: digest(`payload-${label}`),
      source_logical_record_ref: `source-${label}`,
      source_revision_sha256: digest(`source-revision-${label}`),
      identity_receipt_id: `identity-receipt-${label}`,
      identity_contract_version: "nex-ingress-identity-v1",
      identity_result_digest: digest(`identity-result-${label}`),
      identity_party_ordinal: 0,
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
  missingIdentityLabels: string[] = [],
): PartnerShadowV2Store {
  const revisions = new Map(
    labels.map((label) => [`revision-${label}`, revision(label)]),
  );
  const identities = new Map(
    labels
      .filter((label) => !missingIdentityLabels.includes(label))
      .map((label) => [
        `identity-receipt-${label}`,
        identityReceipt(label),
      ]),
  );
  return {
    async getRecordRevision(id) {
      return revisions.get(id) ?? null;
    },
    async getIdentityReceipt(id) {
      return identities.get(id) ?? null;
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

test("resumes an interrupted Gmail and Alibaba cohort without duplicate facts, observations, or comparisons", async () => {
  const input = request(["b", "gmail", "a"]);
  await assert.rejects(
    runPartnerBoundedHistoricalShadowV2({
      store: store(["a", "b", "gmail"]),
      shadowMemoryDb: memoryDb,
      request: input,
      interruptAfterTerminalMembers: 1,
    }),
    /synthetic Partner shadow interruption/,
  );
  assert.equal(
    Number(
      (
        memoryDb
          .prepare(
            `SELECT COUNT(*) AS count
               FROM partner_shadow_member_progress`,
          )
          .get() as { count: number }
      ).count,
    ),
    1,
  );

  const resumed = await runPartnerBoundedHistoricalShadowV2({
    store: store(["a", "b", "gmail"]),
    shadowMemoryDb: memoryDb,
    request: input,
  });
  assert.equal(resumed.member_count, 3);
  assert.equal(resumed.completed_count, 3);
  assert.equal(resumed.dead_letter_count, 0);
  assert.equal(resumed.comparison_count, 3);
  assert.equal(resumed.review_required_count, 1);
  assert.equal(resumed.resume_count, 1);
  assert.equal(resumed.replay_stable, true);
  assert.deepEqual(resumed.authority, {
    provider_calls: 0,
    model_calls: 0,
    provider_write_authority: false,
    identity_merge_authority: false,
    draft_or_send_authority: false,
    canonical_promotion_authority: false,
    production_projection_authority: false,
    active_projection_writes: 0,
  });
  assert.equal(
    Number(
      (
        memoryDb
          .prepare(
            `SELECT COUNT(*) AS count
               FROM elements
              WHERE profile_id = 'moonsleep.partner.source-coverage.v1'`,
          )
          .get() as { count: number }
      ).count,
    ),
    3,
  );
  assert.equal(
    Number(
      (
        memoryDb
          .prepare(
            `SELECT COUNT(*) AS count
               FROM element_entities
              WHERE entity_id = 'entity-surewal-reviewed'`,
          )
          .get() as { count: number }
      ).count,
    ),
    6,
  );

  const replay = await runPartnerBoundedHistoricalShadowV2({
    store: store(["a", "b", "gmail"]),
    shadowMemoryDb: memoryDb,
    request: input,
  });
  assert.deepEqual(replay, resumed);
  assert.equal(
    Number(
      (
        memoryDb
          .prepare(
            `SELECT COUNT(*) AS count
               FROM partner_shadow_comparison_ledger`,
          )
          .get() as { count: number }
      ).count,
    ),
    3,
  );
  assert.doesNotMatch(
    JSON.stringify(replay),
    /record-a|revision-a|contact-observation-a/,
  );
  assert.doesNotMatch(JSON.stringify(replay), /"kind"\s*:/);
});

test("dead-letters a missing reviewed identity receipt once while completing valid members", async () => {
  const input = request(["a", "b"]);
  const first = await runPartnerBoundedHistoricalShadowV2({
    store: store(["a", "b"], ["b"]),
    shadowMemoryDb: memoryDb,
    request: input,
  });
  assert.equal(first.completed_count, 1);
  assert.equal(first.dead_letter_count, 1);
  assert.equal(first.comparison_count, 1);
  const deadLetter = memoryDb
    .prepare(
      `SELECT error_code, attempt_count
         FROM partner_shadow_dead_letters`,
    )
    .get() as { error_code: string; attempt_count: number };
  assert.equal(deadLetter.error_code, "identity_receipt_absent");
  assert.equal(deadLetter.attempt_count, 1);

  const replay = await runPartnerBoundedHistoricalShadowV2({
    store: store(["a", "b"], ["b"]),
    shadowMemoryDb: memoryDb,
    request: input,
  });
  assert.deepEqual(replay, first);
  assert.equal(
    Number(
      (
        memoryDb
          .prepare(
            `SELECT COUNT(*) AS count
               FROM partner_shadow_dead_letters`,
          )
          .get() as { count: number }
      ).count,
    ),
    1,
  );
});

test("rejects a changed resume request and exact identity receipt drift", async () => {
  const input = request(["a", "b"]);
  await assert.rejects(
    runPartnerBoundedHistoricalShadowV2({
      store: store(["a", "b"]),
      shadowMemoryDb: memoryDb,
      request: input,
      interruptAfterTerminalMembers: 1,
    }),
    /synthetic Partner shadow interruption/,
  );
  const changed = structuredClone(input);
  changed.current_projection_read_receipt_sha256 = digest("changed");
  await assert.rejects(
    runPartnerBoundedHistoricalShadowV2({
      store: store(["a", "b"]),
      shadowMemoryDb: memoryDb,
      request: changed,
    }),
    /replay changed the exact request/,
  );

  const driftDb = new DatabaseSync(":memory:");
  driftDb.exec("PRAGMA foreign_keys = ON");
  initializeDatabase("memory", driftDb);
  const driftStore = store(["a"]);
  const drifted = identityReceipt("a");
  drifted.identity_result_digest = digest("drifted-result");
  driftStore.getIdentityReceipt = async () => drifted;
  try {
    const receipt = await runPartnerBoundedHistoricalShadowV2({
      store: driftStore,
      shadowMemoryDb: driftDb,
      request: request(["a"]),
    });
    assert.equal(receipt.completed_count, 0);
    assert.equal(receipt.dead_letter_count, 1);
    const error = driftDb
      .prepare(`SELECT error_code FROM partner_shadow_dead_letters`)
      .get() as { error_code: string };
    assert.equal(error.error_code, "identity_receipt_binding_mismatch");
  } finally {
    driftDb.close();
  }
});
