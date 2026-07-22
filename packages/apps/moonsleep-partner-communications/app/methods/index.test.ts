import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import {
  commitReviewedCohort,
  getCurrentReview,
  inspectAlibabaConversation,
  inspectGmailConversation,
  projectReviewedCohort,
} from "./index.ts";

function source(json: string) {
  return { provider_object_json: json, provider_object_sha256: createHash("sha256").update(json).digest("hex") };
}

function canonicalDigest(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

function gmailFixture(id: string, timestamp: number, content: string) {
  return {
    id,
    platform: "gmail",
    receiver_contact_id: "moonsleep-ops",
    thread_id: "gmail-thread-1",
    timestamp,
    content,
    attachments: [{ id: "gmail-attachment-1" }],
    payload: { provider_message_ref: id },
    metadata: {
      family: "message",
      source_connection_id: "gmail-tyler",
      message_id: id,
      revision_hash: createHash("sha256").update(content).digest("hex"),
      direction: "outbound",
    },
  };
}

function fixture(id: string, timestamp: number, content: string) {
  return {
    id,
    platform: "alibaba",
    receiver_contact_id: "moonsleep-alibaba",
    thread_id: "2215891521413-2216843498932#11011@icbu",
    timestamp,
    content,
    attachments: [],
    payload: source(JSON.stringify({ id })),
    metadata: {
      family: "message",
      source_connection_id: "alibaba-primary",
      message_id: id,
      revision_hash: createHash("sha256").update(content).digest("hex"),
      direction: "incoming",
    },
  };
}

test("inspects a complete native conversation without returning source content", async () => {
  const records = [fixture("source-1", 1_785_000_000_000, "MOQ question"), fixture("source-2", 1_785_000_001_000, "ETA reply")];
  const result = await inspectAlibabaConversation({
    params: { connection_id: "alibaba-primary", provider_thread_id: "2215891521413-2216843498932#11011@icbu" },
    nex: { records: { list: async () => ({ payload: { records } }) } },
  } as never) as Record<string, unknown>;
  assert.equal(result.record_count, 2);
  assert.equal(result.message_record_count, 2);
  assert.equal(result.provider_content_returned, false);
  assert.equal(JSON.stringify(result).includes("MOQ question"), false);
});

test("rejects a record outside the requested Alibaba source connection", async () => {
  const original = fixture("source-foreign", 1_785_000_000_000, "foreign");
  const foreign = { ...original, metadata: { ...original.metadata, source_connection_id: "alibaba-other" } };
  await assert.rejects(
    inspectAlibabaConversation({
      params: { connection_id: "alibaba-primary", provider_thread_id: "2215891521413-2216843498932#11011@icbu" },
      nex: { records: { list: async () => ({ payload: { records: [foreign] } }) } },
    } as never),
    /foreign connection/,
  );
});

test("inspects committed Gmail evidence through the shared native conversation boundary", async () => {
  const records = [gmailFixture("gmail-1", 1_785_000_000_000, "Supplier follow-up")];
  const result = await inspectGmailConversation({
    params: { connection_id: "gmail-tyler", provider_thread_id: "gmail-thread-1" },
    nex: { records: { list: async () => ({ payload: { records } }) } },
  } as never) as Record<string, unknown>;
  assert.equal(result.provider, "gmail");
  assert.equal(result.record_count, 1);
  assert.equal(result.attachment_row_count, 1);
  assert.equal(result.provider_content_returned, false);
  assert.equal(JSON.stringify(result).includes("Supplier follow-up"), false);
});

test("projects multiple independent reviewed loops over the same native conversation", async () => {
  const source1 = fixture("source-1", 1_785_000_000_000, "MOQ question");
  const source2 = fixture("source-2", 1_785_000_001_000, "ETA reply");
  const rows = new Map([[source1.id, source1], [source2.id, source2]]);
  const result = await projectReviewedCohort({
    params: {
      record_ids: [source1.id, source2.id],
      identity_resolutions: [source1, source2].map((record) => ({ source_record_id: record.id, status: "confirmed", decision_origin: "operator_review", canonical_entity_id: "entity-surewal", contact_id: "contact-surewal" })),
      workspace_assertions: [source1, source2].map((record) => ({ source_record_id: record.id, category: "vendor", status: "confirmed", assertion_origin: "operator_review" })),
      open_loop_assertions: [
        { open_loop_id: "loop-moq", canonical_entity_id: "entity-surewal", primary_source_record_id: source1.id, evidence_source_record_ids: [source1.id], closure_source_record_ids: [], title: "Confirm MOQ", summary: "Need the final MOQ", labels: ["commercial"], lifecycle: "waiting_on_partner", review_state: "confirmed", assertion_origin: "operator_review" },
        { open_loop_id: "loop-eta", canonical_entity_id: "entity-surewal", primary_source_record_id: source2.id, evidence_source_record_ids: [source2.id], closure_source_record_ids: [], title: "Confirm ETA", summary: "Need the shipment ETA", labels: ["shipment"], lifecycle: "waiting_on_moonsleep", review_state: "confirmed", assertion_origin: "operator_review" },
      ],
      source_coverage_assertions: [
        { source_record_id: source1.id, disposition: "open_loop_evidence", open_loop_ids: ["loop-moq"], assertion_origin: "operator_review" },
        { source_record_id: source2.id, disposition: "open_loop_evidence", open_loop_ids: ["loop-eta"], assertion_origin: "operator_review" },
      ],
    },
    nex: { records: { get: async ({ id }: { id: string }) => ({ payload: { record: rows.get(id) } }) } },
  } as never) as Record<string, unknown>;
  assert.equal((result.open_loops as unknown[]).length, 2);
  assert.equal((result.native_threads as unknown[]).length, 1);
  assert.equal((result.attention_queue as Array<{ open_loop_id: string }>)[0]?.open_loop_id, "loop-eta");
});

function reviewParams(sourceRecord: ReturnType<typeof fixture>, overrides: Record<string, unknown> = {}) {
  return {
    workspace_key: "surewal-commercial",
    canonical_entity_id: "entity-surewal",
    record_ids: [sourceRecord.id],
    identity_resolutions: [{
      source_record_id: sourceRecord.id,
      status: "confirmed",
      decision_origin: "operator_review",
      canonical_entity_id: "entity-surewal",
      contact_id: "contact-surewal",
    }],
    workspace_assertions: [{
      source_record_id: sourceRecord.id,
      category: "vendor",
      status: "confirmed",
      assertion_origin: "operator_review",
    }],
    open_loop_assertions: [{
      open_loop_id: "loop-moq",
      canonical_entity_id: "entity-surewal",
      primary_source_record_id: sourceRecord.id,
      evidence_source_record_ids: [sourceRecord.id],
      closure_source_record_ids: [],
      title: "Confirm MOQ",
      summary: "Need the final MOQ",
      labels: ["commercial"],
      lifecycle: "waiting_on_partner",
      review_state: "confirmed",
      assertion_origin: "operator_review",
    }],
    source_coverage_assertions: [{
      source_record_id: sourceRecord.id,
      disposition: "open_loop_evidence",
      open_loop_ids: ["loop-moq"],
      assertion_origin: "operator_review",
    }],
    review_idempotency_key: "review-surewal-moq-0001",
    previous_revision_sha256: null,
    ...overrides,
  };
}

function reviewContext(sourceRecord: ReturnType<typeof fixture>) {
  const reviewRecords: Array<Record<string, unknown>> = [];
  let ingestCalls = 0;
  const ctx = {
    user: {
      userId: "entity-tyler",
      email: "tyler@example.com",
      displayName: "Tyler",
      role: "operator",
      accountId: "moonsleep",
    },
    app: { config: {}, id: "moonsleep-partner-desk", version: "0.1.0" },
    nex: {
      records: {
        get: async ({ id }: { id: string }) => {
          if (id === sourceRecord.id) return { record: sourceRecord };
          const review = reviewRecords.find((entry) => entry.id === id);
          if (!review) throw new Error("record not found");
          return { record: review };
        },
        list: async ({ platform, thread_id }: { platform: string; thread_id: string }) => ({
          records: reviewRecords.filter((entry) => entry.platform === platform && entry.thread_id === thread_id),
        }),
      },
      record: {
        ingest: async ({ routing, payload }: { routing: Record<string, unknown>; payload: Record<string, unknown> }) => {
          ingestCalls += 1;
          reviewRecords.push({
            id: payload.external_record_id,
            platform: routing.platform,
            thread_id: routing.thread_id,
            timestamp: payload.timestamp,
            content: payload.content,
            payload: payload.payload,
            metadata: payload.metadata,
          });
          return { status: "completed" };
        },
      },
    },
  };
  return { ctx, reviewRecords, ingestCalls: () => ingestCalls };
}

test("commits an immutable reviewed workspace and replays the same operator request without duplication", async () => {
  const sourceRecord = fixture("source-review-1", 1_785_000_000_000, "MOQ question");
  const memory = reviewContext(sourceRecord);
  const params = reviewParams(sourceRecord);
  const first = await commitReviewedCohort({ ...memory.ctx, params } as never) as Record<string, unknown>;
  assert.equal(first.state, "review_committed");
  assert.equal(first.created, true);
  assert.equal(memory.reviewRecords.length, 1);
  assert.equal(memory.ingestCalls(), 1);

  const replay = await commitReviewedCohort({ ...memory.ctx, params } as never) as Record<string, unknown>;
  assert.equal(replay.state, "review_replayed");
  assert.equal(replay.created, false);
  assert.equal(memory.reviewRecords.length, 1);
  assert.equal(memory.ingestCalls(), 1);

  const current = await getCurrentReview({ ...memory.ctx, params: { workspace_key: "surewal-commercial" } } as never) as Record<string, unknown>;
  assert.equal(current.state, "current_review");
  assert.equal(current.history_count, 1);
  assert.equal((current.review as Record<string, unknown>).canonical_entity_id, "entity-surewal");
});

test("requires the exact current review head and exposes divergent revisions instead of choosing one", async () => {
  const sourceRecord = fixture("source-review-2", 1_785_000_000_000, "ETA question");
  const memory = reviewContext(sourceRecord);
  const first = await commitReviewedCohort({ ...memory.ctx, params: reviewParams(sourceRecord) } as never) as Record<string, unknown>;
  const firstRevision = (first.review as Record<string, unknown>).revision_sha256;

  await assert.rejects(
    commitReviewedCohort({
      ...memory.ctx,
      params: reviewParams(sourceRecord, {
        review_idempotency_key: "review-surewal-moq-stale",
        previous_revision_sha256: null,
      }),
    } as never),
    /previous revision does not match/,
  );

  const second = await commitReviewedCohort({
    ...memory.ctx,
    params: reviewParams(sourceRecord, {
      review_idempotency_key: "review-surewal-moq-0002",
      previous_revision_sha256: firstRevision,
      review_note: "Confirmed after supplier follow-up",
    }),
  } as never) as Record<string, unknown>;
  assert.equal(second.state, "review_committed");
  assert.equal(memory.reviewRecords.length, 2);

  const fork = structuredClone(memory.reviewRecords[1]);
  const forkPayload = fork.payload as Record<string, unknown>;
  forkPayload.review_idempotency_key = "review-surewal-fork-0001";
  forkPayload.reviewed_at = "2026-07-22T16:00:00.000Z";
  const request = {
    workspace_key: forkPayload.workspace_key,
    canonical_entity_id: forkPayload.canonical_entity_id,
    record_ids: forkPayload.record_ids,
    identity_resolutions: forkPayload.identity_resolutions,
    workspace_assertions: forkPayload.workspace_assertions,
    open_loop_assertions: forkPayload.open_loop_assertions,
    source_coverage_assertions: forkPayload.source_coverage_assertions,
    review_note: forkPayload.review_note,
  };
  forkPayload.request_body_sha256 = canonicalDigest({
    request,
    reviewer_id: forkPayload.reviewed_by_user_id,
    reviewer_email: forkPayload.reviewed_by_email,
  });
  delete forkPayload.revision_sha256;
  forkPayload.revision_sha256 = canonicalDigest(forkPayload);
  (fork.metadata as Record<string, unknown>).revision_hash = forkPayload.revision_sha256;
  fork.id = `partner-desk:review:${forkPayload.revision_sha256}`;
  memory.reviewRecords.push(fork);
  const conflicted = await getCurrentReview({ ...memory.ctx, params: { workspace_key: "surewal-commercial" } } as never) as Record<string, unknown>;
  assert.equal(conflicted.state, "review_conflict");
  assert.equal((conflicted.head_revisions as unknown[]).length, 2);
});
