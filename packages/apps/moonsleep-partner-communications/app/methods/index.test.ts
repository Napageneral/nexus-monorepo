import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import { inspectAlibabaConversation, inspectGmailConversation, projectReviewedCohort } from "./index.ts";

function source(json: string) {
  return { provider_object_json: json, provider_object_sha256: createHash("sha256").update(json).digest("hex") };
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
