import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import {
  commitCoverageProposal,
  commitReviewedCohort,
  getCurrentReview,
  inspectAlibabaConversation,
  inspectGmailConversation,
  listCoverageProposals,
  listSourceInbox,
  projectReviewedCohort,
  listReviewedWorkspaces,
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

function gmailFixture(
  id: string,
  timestamp: number,
  content: string,
  options: { direction?: "inbound" | "outbound"; account?: string; threadId?: string } = {},
) {
  const direction = options.direction ?? "inbound";
  const account = options.account ?? "tyler@intent-systems.com";
  return {
    id,
    record_id: `gmail:${id}`,
    platform: "gmail",
    sender_entity_id: direction === "outbound" ? "entity-moonsleep" : "entity-partner",
    receiver_entity_id: direction === "outbound" ? "entity-partner" : "entity-moonsleep",
    sender_contact_id: direction === "outbound" ? account : "partner@example.com",
    receiver_contact_id: direction === "outbound" ? "partner@example.com" : account,
    thread_id: options.threadId ?? "gmail-thread-1",
    timestamp,
    content,
    content_type: "text/markdown",
    received_at: timestamp + 10_000,
    request_id: "jobrun-original:bulk:0",
    attachments: [{ id: "gmail-attachment-1" }],
    payload: null,
    metadata: {
      message_id: id,
      thread_id: options.threadId ?? "gmail-thread-1",
      direction,
      body_text: content,
      subject: "Supplier follow-up",
      _daemon: { received_at_ms: timestamp + 20_000 },
    },
  };
}

function fixture(
  id: string,
  timestamp: number,
  content: string,
  options: { logicalRecordId?: string; messageId?: string; snapshotCapturedAt?: string } = {},
) {
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
      message_id: options.messageId ?? id,
      logical_record_id: options.logicalRecordId ?? `alibaba-primary:message:${id}`,
      revision_hash: createHash("sha256").update(content).digest("hex"),
      snapshot_captured_at: options.snapshotCapturedAt ?? new Date(timestamp).toISOString(),
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
    params: { connection_id: "tyler@intent-systems.com", provider_thread_id: "gmail-thread-1" },
    nex: { records: { list: async () => ({ payload: { records } }) } },
  } as never) as Record<string, unknown>;
  assert.equal(result.provider, "gmail");
  assert.equal(result.record_count, 1);
  assert.equal(result.attachment_row_count, 1);
  assert.equal(result.provider_content_returned, false);
  assert.equal(JSON.stringify(result).includes("Supplier follow-up"), false);
});

test("filters a shared Gmail thread to the exact observed mailbox connection", async () => {
  const records = [
    gmailFixture("gmail-tyler", 1_785_000_000_000, "Tyler copy"),
    gmailFixture("gmail-casey", 1_785_000_001_000, "Casey copy", { account: "casey@moonsleep.co" }),
  ];
  const result = await inspectGmailConversation({
    params: { connection_id: "tyler@intent-systems.com", provider_thread_id: "gmail-thread-1" },
    nex: { records: { list: async () => ({ payload: { records } }) } },
  } as never) as Record<string, unknown>;
  assert.equal(result.record_count, 1);
});

test("derives outbound Gmail connection ownership from the observed sender mailbox", async () => {
  const records = [gmailFixture("gmail-outbound", 1_785_000_000_000, "Outbound supplier note", { direction: "outbound" })];
  const result = await inspectGmailConversation({
    params: { connection_id: "tyler@intent-systems.com", provider_thread_id: "gmail-thread-1" },
    nex: { records: { list: async () => ({ payload: { records } }) } },
  } as never) as Record<string, unknown>;
  assert.equal(result.record_count, 1);
});

test("hashes the immutable Gmail source observation while ignoring only ingest-daemon provenance", async () => {
  const original = gmailFixture("gmail-revision", 1_785_000_000_000, "Supplier follow-up");
  const replay = structuredClone(original);
  replay.received_at += 99_000;
  replay.request_id = "jobrun-replay:bulk:4";
  replay.metadata._daemon.received_at_ms += 99_000;
  const changed = structuredClone(original);
  changed.content = "Supplier follow-up changed";
  changed.metadata.body_text = changed.content;

  async function revision(record: ReturnType<typeof gmailFixture>) {
    const result = await projectReviewedCohort({
      params: {
        record_ids: [record.id],
        identity_resolutions: [{ source_record_id: record.id, status: "confirmed", decision_origin: "operator_review", canonical_entity_id: "entity-borden", contact_id: "contact-borden" }],
        workspace_assertions: [{ source_record_id: record.id, category: "vendor", status: "confirmed", assertion_origin: "operator_review" }],
        open_loop_assertions: [{ open_loop_id: "loop-borden", canonical_entity_id: "entity-borden", primary_source_record_id: record.id, evidence_source_record_ids: [record.id], closure_source_record_ids: [], title: "Confirm schedule", summary: "Need the schedule", labels: ["schedule"], lifecycle: "waiting_on_partner", review_state: "confirmed", assertion_origin: "operator_review" }],
        source_coverage_assertions: [{ source_record_id: record.id, disposition: "open_loop_evidence", open_loop_ids: ["loop-borden"], assertion_origin: "operator_review" }],
      },
      nex: { records: { get: async () => ({ payload: { record } }) } },
    } as never) as Record<string, unknown>;
    return (((result.native_threads as Array<Record<string, unknown>>)[0]?.messages as Array<Record<string, unknown>>)[0]?.source_revision_sha256);
  }

  assert.equal(await revision(original), await revision(replay));
  assert.notEqual(await revision(original), await revision(changed));
});

test("fails closed when a Gmail record cannot prove its observed mailbox", async () => {
  const record = gmailFixture("gmail-bad-direction", 1_785_000_000_000, "Supplier follow-up");
  record.metadata.direction = "unknown" as never;
  await assert.rejects(
    inspectGmailConversation({
      params: { connection_id: "tyler@intent-systems.com", provider_thread_id: "gmail-thread-1" },
      nex: { records: { list: async () => ({ payload: { records: [record] } }) } },
    } as never),
    /observed mailbox/,
  );
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

function reviewContext(sourceInput: ReturnType<typeof fixture> | Array<ReturnType<typeof fixture>>) {
  const sourceRecords = Array.isArray(sourceInput) ? sourceInput : [sourceInput];
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
          const sourceRecord = sourceRecords.find((entry) => entry.id === id);
          if (sourceRecord) return { record: sourceRecord };
          const review = reviewRecords.find((entry) => entry.id === id);
          if (!review) throw new Error("record not found");
          return { record: review };
        },
        list: async ({ platform, thread_id }: { platform: string; thread_id?: string }) => ({
          records: [...sourceRecords, ...reviewRecords]
            .filter((entry) => entry.platform === platform && (!thread_id || entry.thread_id === thread_id)),
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

test("preserves reviewed coverage across exact-digest aliases without duplicating the current source row", async () => {
  const logicalRecordId = "alibaba-primary:message:reviewed-alias";
  const legacy = fixture("source-reviewed-legacy", 1_785_000_000_000, "Exact supplier wording", {
    logicalRecordId,
    messageId: "reviewed-alias",
    snapshotCapturedAt: "2026-07-20T12:00:00.000Z",
  });
  const current = fixture("source-reviewed-v2", 1_785_000_000_000, "Exact supplier wording", {
    logicalRecordId,
    messageId: "reviewed-alias",
    snapshotCapturedAt: "2026-07-27T12:00:00.000Z",
  });
  const memory = reviewContext([legacy, current]);
  await commitReviewedCohort({
    ...memory.ctx,
    params: reviewParams(legacy),
  } as never);

  const inbox = await listSourceInbox({
    ...memory.ctx,
    params: { provider: "alibaba", limit: 50, offset: 0 },
  } as never) as Record<string, unknown>;
  assert.equal(inbox.total_source_records, 1);
  assert.equal(inbox.total_source_revisions, 2);
  assert.deepEqual(inbox.coverage_counts, {
    unreviewed: 0,
    proposed: 0,
    proposal_conflict: 0,
    reviewed: 1,
  });
  const record = (inbox.records as Array<Record<string, unknown>>)[0];
  assert.equal(record.source_record_id, current.id);
  assert.equal(record.logical_record_id, logicalRecordId);
  assert.equal(record.coverage_state, "reviewed");
  assert.equal(inbox.raw_provider_payload_returned, false);
});

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
  assert.equal(((current.projection as Record<string, unknown>).open_loops as unknown[]).length, 1);

  const index = await listReviewedWorkspaces({ ...memory.ctx, params: {} } as never) as Record<string, unknown>;
  assert.equal(index.workspace_count, 1);
  assert.equal(((index.workspaces as Array<Record<string, unknown>>)[0]).workspace_key, "surewal-commercial");
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

function proposalParams(records: Array<ReturnType<typeof fixture>>, overrides: Record<string, unknown> = {}) {
  const [first, second] = records;
  return {
    workspace_key: "surewal-alibaba",
    proposed_canonical_entity_id: "entity-surewal",
    proposed_contact_id: "contact-surewal",
    partner_category: "vendor",
    record_ids: records.map((record) => record.id),
    open_loop_proposals: [{
      open_loop_id: "loop-surewal-production-date",
      canonical_entity_id: "entity-surewal",
      primary_source_record_id: first.id,
      evidence_source_record_ids: [first.id],
      closure_source_record_ids: [],
      title: "Confirm production completion date",
      summary: "The supplier asked MoonSleep to confirm the remaining production schedule.",
      labels: ["production"],
      lifecycle: "waiting_on_moonsleep",
      review_state: "proposed",
      assertion_origin: "model",
    }],
    source_coverage_proposals: [
      {
        source_record_id: first.id,
        disposition: "open_loop_evidence",
        open_loop_ids: ["loop-surewal-production-date"],
        assertion_origin: "model",
      },
      {
        source_record_id: second.id,
        disposition: "informational",
        open_loop_ids: [],
        assertion_origin: "model",
      },
    ],
    classifier_id: "codex-gpt-5.6-low",
    classifier_prompt_sha256: "a".repeat(64),
    proposal_note: "Bounded production-shaped classifier proof.",
    proposal_idempotency_key: "partner-proposal-surewal-0001",
    ...overrides,
  };
}

function proposalContext(sourceRecords: Array<ReturnType<typeof fixture>>) {
  const committedRecords: Array<Record<string, unknown>> = [...sourceRecords];
  let ingestCalls = 0;
  const ctx = {
    user: {
      userId: "entity-tyler",
      email: "tyler@example.com",
      displayName: "Tyler",
      role: "operator",
      accountId: "moonsleep",
    },
    app: { config: {}, id: "moonsleep-partner-desk", version: "0.2.0" },
    nex: {
      records: {
        get: async ({ id }: { id: string }) => {
          const record = committedRecords.find((entry) => entry.id === id);
          if (!record) throw new Error("record not found");
          return { record };
        },
        list: async ({
          platform,
          thread_id,
          limit = 1_000,
          offset = 0,
        }: {
          platform: string;
          thread_id?: string;
          limit?: number;
          offset?: number;
        }) => ({
          records: committedRecords
            .filter((entry) =>
              entry.platform === platform &&
              (!thread_id || entry.thread_id === thread_id)
            )
            .slice(offset, offset + limit),
        }),
      },
      record: {
        ingest: async ({ routing, payload }: { routing: Record<string, unknown>; payload: Record<string, unknown> }) => {
          ingestCalls += 1;
          committedRecords.push({
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
  return { ctx, committedRecords, ingestCalls: () => ingestCalls };
}

test("commits and replays an immutable proposal batch without promoting model output", async () => {
  const records = [
    fixture("source-proposal-1", 1_785_000_000_000, "Please confirm the production date"),
    fixture("source-proposal-2", 1_785_000_001_000, "Factory photos attached"),
  ];
  const memory = proposalContext(records);
  const params = proposalParams(records);
  const first = await commitCoverageProposal({ ...memory.ctx, params } as never) as Record<string, unknown>;
  assert.equal(first.state, "proposal_committed");
  assert.equal(first.created, true);
  assert.equal(first.model_output_operational_authority, false);
  assert.equal(first.provider_write_authority, false);
  assert.equal(memory.ingestCalls(), 1);

  const replay = await commitCoverageProposal({ ...memory.ctx, params } as never) as Record<string, unknown>;
  assert.equal(replay.state, "proposal_replayed");
  assert.equal(replay.created, false);
  assert.equal(memory.ingestCalls(), 1);

  const listed = await listCoverageProposals({ ...memory.ctx, params: {} } as never) as Record<string, unknown>;
  assert.equal(listed.proposal_batch_count, 1);
  assert.equal(listed.model_output_operational_authority, false);

  const inbox = await listSourceInbox({
    ...memory.ctx,
    params: { provider: "alibaba", limit: 50, offset: 0 },
  } as never) as Record<string, unknown>;
  assert.deepEqual(inbox.coverage_counts, {
    unreviewed: 0,
    proposed: 2,
    proposal_conflict: 0,
    reviewed: 0,
  });
  assert.equal((inbox.records as Array<Record<string, unknown>>)[0]?.coverage_state, "proposed");
  assert.equal(inbox.raw_provider_payload_returned, false);
});

test("collapses historical snapshots into one current source row and requires review of the current revision", async () => {
  const logicalRecordId = "alibaba-primary:message:shared-source-message";
  const older = fixture(
    "source-snapshot-older",
    1_785_000_000_000,
    "Original supplier wording",
    {
      logicalRecordId,
      messageId: "shared-source-message",
      snapshotCapturedAt: "2026-07-20T12:00:00.000Z",
    },
  );
  const current = fixture(
    "source-snapshot-current",
    1_785_000_000_000,
    "Current supplier wording",
    {
      logicalRecordId,
      messageId: "shared-source-message",
      snapshotCapturedAt: "2026-07-27T12:00:00.000Z",
    },
  );
  const memory = proposalContext([older, current]);
  await commitCoverageProposal({
    ...memory.ctx,
    params: {
      ...proposalParams([older, current]),
      record_ids: [older.id],
      open_loop_proposals: [],
      source_coverage_proposals: [{
        source_record_id: older.id,
        disposition: "informational",
        open_loop_ids: [],
        assertion_origin: "model",
      }],
      proposal_idempotency_key: "partner-proposal-superseded-revision-0001",
    },
  } as never);

  const inbox = await listSourceInbox({
    ...memory.ctx,
    params: { provider: "alibaba", limit: 50, offset: 0 },
  } as never) as Record<string, unknown>;
  assert.equal(inbox.total_source_records, 1);
  assert.equal(inbox.total_source_revisions, 2);
  assert.deepEqual(inbox.coverage_counts, {
    unreviewed: 1,
    proposed: 0,
    proposal_conflict: 0,
    reviewed: 0,
  });
  const row = (inbox.records as Array<Record<string, unknown>>)[0];
  assert.equal(row.source_record_id, current.id);
  assert.equal(row.logical_record_id, logicalRecordId);
  assert.equal(row.revision_count, 2);
  assert.equal(row.revision_observed_at, "2026-07-27T12:00:00.000Z");
  assert.equal(row.coverage_state, "unreviewed");
});

test("preserves proposal coverage across exact-digest aliases but never exposes duplicate source rows", async () => {
  const logicalRecordId = "alibaba-primary:message:proposed-alias";
  const legacy = fixture("source-proposed-legacy", 1_785_000_000_000, "Exact supplier wording", {
    logicalRecordId,
    messageId: "proposed-alias",
    snapshotCapturedAt: "2026-07-20T12:00:00.000Z",
  });
  const current = fixture("source-proposed-v2", 1_785_000_000_000, "Exact supplier wording", {
    logicalRecordId,
    messageId: "proposed-alias",
    snapshotCapturedAt: "2026-07-27T12:00:00.000Z",
  });
  const memory = proposalContext([legacy, current]);
  await commitCoverageProposal({
    ...memory.ctx,
    params: {
      ...proposalParams([legacy, legacy]),
      record_ids: [legacy.id],
      open_loop_proposals: [],
      source_coverage_proposals: [{
        source_record_id: legacy.id,
        disposition: "informational",
        open_loop_ids: [],
        assertion_origin: "model",
      }],
      proposal_idempotency_key: "partner-proposal-exact-alias-0001",
    },
  } as never);

  const inbox = await listSourceInbox({
    ...memory.ctx,
    params: { provider: "alibaba", limit: 50, offset: 0 },
  } as never) as Record<string, unknown>;
  assert.equal(inbox.total_source_records, 1);
  assert.equal(inbox.total_source_revisions, 2);
  assert.deepEqual(inbox.coverage_counts, {
    unreviewed: 0,
    proposed: 1,
    proposal_conflict: 0,
    reviewed: 0,
  });
  const record = (inbox.records as Array<Record<string, unknown>>)[0];
  assert.equal(record.source_record_id, current.id);
  assert.equal(record.coverage_state, "proposed");
  assert.equal((record.proposal_batches as unknown[]).length, 1);
  assert.equal(inbox.raw_provider_payload_returned, false);
});

test("fails closed when one logical message has competing heads or crosses native lineage", async () => {
  const logicalRecordId = "alibaba-primary:message:ambiguous-source-message";
  const first = fixture("source-ambiguous-1", 1_785_000_000_000, "First wording", {
    logicalRecordId,
    messageId: "ambiguous-source-message",
    snapshotCapturedAt: "2026-07-27T12:00:00.000Z",
  });
  const competing = fixture("source-ambiguous-2", 1_785_000_000_000, "Competing wording", {
    logicalRecordId,
      messageId: "ambiguous-source-message",
      snapshotCapturedAt: "2026-07-27T12:00:00.000Z",
  });
  await assert.rejects(
    listSourceInbox({
      ...proposalContext([first, competing]).ctx,
      params: { provider: "alibaba", limit: 50, offset: 0 },
    } as never),
    /source revision head is ambiguous/,
  );

  const foreignThread = {
    ...fixture("source-lineage-2", 1_785_000_000_000, "Later wording", {
      logicalRecordId,
      messageId: "ambiguous-source-message",
      snapshotCapturedAt: "2026-07-28T12:00:00.000Z",
    }),
    thread_id: "different-native-thread",
  };
  await assert.rejects(
    listSourceInbox({
      ...proposalContext([first, foreignThread]).ctx,
      params: { provider: "alibaba", limit: 50, offset: 0 },
    } as never),
    /source revision lineage is inconsistent/,
  );
});

test("surfaces overlapping proposal batches as a conflict instead of choosing one", async () => {
  const records = [
    fixture("source-proposal-conflict-1", 1_785_000_000_000, "Please confirm the production date"),
    fixture("source-proposal-conflict-2", 1_785_000_001_000, "Factory photos attached"),
  ];
  const memory = proposalContext(records);
  await commitCoverageProposal({
    ...memory.ctx,
    params: proposalParams(records),
  } as never);
  await commitCoverageProposal({
    ...memory.ctx,
    params: proposalParams(records, {
      proposal_idempotency_key: "partner-proposal-surewal-0002",
      proposal_note: "Independent second proposal for conflict proof.",
    }),
  } as never);
  const inbox = await listSourceInbox({
    ...memory.ctx,
    params: { provider: "alibaba", coverage_state: "proposal_conflict", limit: 50, offset: 0 },
  } as never) as Record<string, unknown>;
  assert.equal((inbox.coverage_counts as Record<string, unknown>).proposal_conflict, 2);
  assert.equal(inbox.filtered_source_records, 2);
  assert.equal((inbox.records as Array<Record<string, unknown>>).length, 2);
});

test("rejects proposal batches that omit source coverage or claim reviewed authority", async () => {
  const records = [
    fixture("source-proposal-invalid-1", 1_785_000_000_000, "Please confirm the production date"),
    fixture("source-proposal-invalid-2", 1_785_000_001_000, "Factory photos attached"),
  ];
  const memory = proposalContext(records);
  const missingCoverage = proposalParams(records);
  missingCoverage.source_coverage_proposals = missingCoverage.source_coverage_proposals.slice(0, 1);
  await assert.rejects(
    commitCoverageProposal({ ...memory.ctx, params: missingCoverage } as never),
    /exactly one coverage assertion/,
  );
  const promoted = proposalParams(records);
  promoted.open_loop_proposals[0].review_state = "confirmed";
  await assert.rejects(
    commitCoverageProposal({ ...memory.ctx, params: promoted } as never),
    /must remain proposed/,
  );
  assert.equal(memory.ingestCalls(), 0);
});

test("lists the exact production-shaped 7,992-record corpus through stable bounded pages", async () => {
  const records = Array.from({ length: 7_992 }, (_, index) =>
    fixture(
      `source-production-shaped-${String(index).padStart(5, "0")}`,
      1_785_000_000_000 + index,
      `Committed supplier message ${index}`,
    )
  );
  const memory = proposalContext(records);
  const cohort = records.slice(0, 50);
  await commitCoverageProposal({
    ...memory.ctx,
    params: {
      ...proposalParams(cohort),
      open_loop_proposals: [],
      source_coverage_proposals: cohort.map((record) => ({
        source_record_id: record.id,
        disposition: "informational",
        open_loop_ids: [],
        assertion_origin: "model",
      })),
      proposal_idempotency_key: "partner-proposal-production-shape-0001",
    },
  } as never);
  const firstPage = await listSourceInbox({
    ...memory.ctx,
    params: { provider: "alibaba", limit: 50, offset: 0 },
  } as never) as Record<string, unknown>;
  assert.equal(firstPage.total_source_records, 7_992);
  assert.equal(firstPage.total_source_revisions, 7_992);
  assert.equal((firstPage.records as unknown[]).length, 50);
  assert.deepEqual(firstPage.coverage_counts, {
    unreviewed: 7_942,
    proposed: 50,
    proposal_conflict: 0,
    reviewed: 0,
  });
  const lastPage = await listSourceInbox({
    ...memory.ctx,
    params: { provider: "alibaba", limit: 50, offset: 7_950 },
  } as never) as Record<string, unknown>;
  assert.equal((lastPage.records as unknown[]).length, 42);
  assert.equal(lastPage.offset, 7_950);
});
