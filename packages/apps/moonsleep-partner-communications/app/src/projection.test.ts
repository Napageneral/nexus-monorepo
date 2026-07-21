import assert from "node:assert/strict";
import test from "node:test";
import {
  projectPartnerWorkspace,
  type CommunicationRecord,
  type IdentityResolution,
  type WorkspaceAssertion,
} from "./projection.ts";

const digest = "a".repeat(64);

function record(
  source_record_id: string,
  provider: "gmail" | "alibaba",
  provider_thread_id: string,
  observed_at: string,
  direction: "inbound" | "outbound",
): CommunicationRecord {
  return {
    source_record_id,
    source_revision_sha256: digest,
    provider,
    connection_id: provider === "gmail" ? "gmail-tyler" : "alibaba-primary",
    provider_thread_id,
    provider_message_id: `${source_record_id}-message`,
    observed_at,
    direction,
    summary: `${provider} evidence`,
    attachment_count: 0,
  };
}

function identity(source_record_id: string): IdentityResolution {
  return {
    source_record_id,
    status: "confirmed",
    decision_origin: "operator_review",
    canonical_entity_id: "entity-surewal",
    contact_id: "contact-rebecca-liu",
  };
}

function assertion(source_record_id: string): WorkspaceAssertion {
  return {
    source_record_id,
    category: "vendor",
    status: "confirmed",
    assertion_origin: "operator_review",
  };
}

test("one reviewed partner timeline preserves separate Gmail and Alibaba threads", () => {
  const records = [
    record("record-gmail-1", "gmail", "gmail-thread-1", "2026-07-21T10:00:00.000Z", "inbound"),
    record("record-alibaba-1", "alibaba", "alibaba-thread-7", "2026-07-21T10:05:00.000Z", "inbound"),
  ];
  const projection = projectPartnerWorkspace({
    records,
    identity_resolutions: records.map((row) => identity(row.source_record_id)),
    workspace_assertions: records.map((row) => assertion(row.source_record_id)),
  });
  assert.equal(projection.entity_timelines.length, 1);
  assert.equal(projection.entity_timelines[0]?.messages.length, 2);
  assert.equal(projection.native_threads.length, 2);
  assert.deepEqual(
    projection.native_threads.map((thread) => thread.provider).sort(),
    ["alibaba", "gmail"],
  );
});

test("awaiting MoonSleep is deterministic and oldest unanswered comes first", () => {
  const records = [
    record("record-a-1", "gmail", "thread-a", "2026-07-21T09:00:00.000Z", "outbound"),
    record("record-a-2", "gmail", "thread-a", "2026-07-21T09:30:00.000Z", "inbound"),
    record("record-a-3", "gmail", "thread-a", "2026-07-21T09:45:00.000Z", "inbound"),
    record("record-b-1", "alibaba", "thread-b", "2026-07-21T10:00:00.000Z", "inbound"),
    record("record-c-1", "alibaba", "thread-c", "2026-07-21T10:10:00.000Z", "inbound"),
    record("record-c-2", "alibaba", "thread-c", "2026-07-21T10:20:00.000Z", "outbound"),
  ];
  const projection = projectPartnerWorkspace({
    records,
    identity_resolutions: records.map((row) => identity(row.source_record_id)),
    workspace_assertions: records.map((row) => assertion(row.source_record_id)),
  });
  assert.deepEqual(
    projection.awaiting_moonsleep.map((thread) => thread.provider_thread_id),
    ["thread-a", "thread-b"],
  );
  assert.equal(projection.awaiting_moonsleep[0]?.oldest_unanswered_at, "2026-07-21T09:30:00.000Z");
  assert.equal(
    projection.native_threads.find((thread) => thread.provider_thread_id === "thread-c")?.response_state,
    "awaiting_partner",
  );
});

test("model-only identity and classification proposals remain in review", () => {
  const records = [
    record("record-model-identity", "gmail", "thread-a", "2026-07-21T09:00:00.000Z", "inbound"),
    record("record-model-category", "alibaba", "thread-b", "2026-07-21T09:01:00.000Z", "inbound"),
  ];
  const projection = projectPartnerWorkspace({
    records,
    identity_resolutions: [
      {
        source_record_id: "record-model-identity",
        status: "probable",
        decision_origin: "model_proposal",
        canonical_entity_id: "entity-surewal",
      },
      identity("record-model-category"),
    ],
    workspace_assertions: [
      assertion("record-model-identity"),
      {
        source_record_id: "record-model-category",
        category: "vendor",
        status: "confirmed",
        assertion_origin: "model",
      },
    ],
  });
  assert.equal(projection.native_threads.length, 0);
  assert.deepEqual(projection.review_queue, [
    { source_record_id: "record-model-category", reason: "workspace_classification_unconfirmed" },
    { source_record_id: "record-model-identity", reason: "identity_model_only" },
  ]);
});

test("one native thread cannot silently resolve to multiple canonical entities", () => {
  const records = [
    record("record-1", "gmail", "thread-a", "2026-07-21T09:00:00.000Z", "inbound"),
    record("record-2", "gmail", "thread-a", "2026-07-21T09:01:00.000Z", "outbound"),
  ];
  assert.throws(
    () =>
      projectPartnerWorkspace({
        records,
        identity_resolutions: [
          identity("record-1"),
          {
            ...identity("record-2"),
            canonical_entity_id: "entity-different",
          },
        ],
        workspace_assertions: records.map((row) => assertion(row.source_record_id)),
      }),
    /multiple entities/,
  );
});
