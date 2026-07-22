import assert from "node:assert/strict";
import test from "node:test";
import {
  projectPartnerWorkspace,
  type CommunicationRecord,
  type IdentityResolution,
  type OpenLoopAssertion,
  type SourceCoverageAssertion,
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

function workspace(source_record_id: string): WorkspaceAssertion {
  return {
    source_record_id,
    category: "vendor",
    status: "confirmed",
    assertion_origin: "operator_review",
  };
}

function coverage(
  source_record_id: string,
  open_loop_ids: string[] = [],
): SourceCoverageAssertion {
  return {
    source_record_id,
    disposition: open_loop_ids.length > 0 ? "open_loop_evidence" : "informational",
    open_loop_ids,
    assertion_origin: "operator_review",
  };
}

function loop(
  open_loop_id: string,
  evidence_source_record_ids: string[],
  lifecycle: OpenLoopAssertion["lifecycle"] = "waiting_on_moonsleep",
): OpenLoopAssertion {
  return {
    open_loop_id,
    canonical_entity_id: "entity-surewal",
    primary_source_record_id: evidence_source_record_ids[0]!,
    evidence_source_record_ids,
    closure_source_record_ids: [],
    title: `Loop ${open_loop_id}`,
    summary: "An independently tracked supplier question.",
    labels: ["product-spec"],
    lifecycle,
    review_state: "confirmed",
    assertion_origin: "operator_review",
    owner: "tyler",
  };
}

function project(input: {
  records: CommunicationRecord[];
  loops?: OpenLoopAssertion[];
  coverage?: SourceCoverageAssertion[];
  identities?: IdentityResolution[];
  workspaces?: WorkspaceAssertion[];
}) {
  return projectPartnerWorkspace({
    records: input.records,
    identity_resolutions:
      input.identities ?? input.records.map((row) => identity(row.source_record_id)),
    workspace_assertions:
      input.workspaces ?? input.records.map((row) => workspace(row.source_record_id)),
    open_loop_assertions: input.loops ?? [],
    source_coverage_assertions:
      input.coverage ?? input.records.map((row) => coverage(row.source_record_id)),
  });
}

test("one Alibaba conversation can carry many independently actionable open loops", () => {
  const records = [
    record("msg-compressor", "alibaba", "surewal-main", "2026-07-01T09:00:00.000Z", "inbound"),
    record("msg-mini-moon", "alibaba", "surewal-main", "2026-07-01T09:01:00.000Z", "inbound"),
    record("msg-batch-four", "alibaba", "surewal-main", "2026-07-01T09:02:00.000Z", "inbound"),
  ];
  const loops = [
    loop("loop-compressor", ["msg-compressor"]),
    loop("loop-mini-moon", ["msg-mini-moon"]),
    loop("loop-batch-four", ["msg-batch-four"], "waiting_on_partner"),
  ];
  const projection = project({
    records,
    loops,
    coverage: records.map((row, index) => coverage(row.source_record_id, [loops[index]!.open_loop_id])),
  });

  assert.equal(projection.native_threads.length, 1);
  assert.equal(projection.native_threads[0]?.open_loop_ids.length, 3);
  assert.deepEqual(projection.attention_queue.map((row) => row.open_loop_id), [
    "loop-compressor",
    "loop-mini-moon",
  ]);
  assert.deepEqual(projection.waiting_on_partner.map((row) => row.open_loop_id), [
    "loop-batch-four",
  ]);
});

test("one message may update multiple open loops without duplicating the source record", () => {
  const records = [
    record("msg-one-reply", "alibaba", "surewal-main", "2026-07-02T09:00:00.000Z", "inbound"),
  ];
  const loops = [
    loop("loop-material", ["msg-one-reply"]),
    loop("loop-pricing", ["msg-one-reply"]),
  ];
  const projection = project({
    records,
    loops,
    coverage: [coverage("msg-one-reply", ["loop-material", "loop-pricing"])],
  });

  assert.equal(projection.native_threads[0]?.messages.length, 1);
  assert.deepEqual(projection.native_threads[0]?.open_loop_ids, ["loop-material", "loop-pricing"]);
});

test("a reviewed loop may span Gmail and Alibaba while native threads remain separate", () => {
  const records = [
    record("msg-alibaba", "alibaba", "surewal-main", "2026-07-03T09:00:00.000Z", "inbound"),
    record("msg-gmail", "gmail", "shipment-email", "2026-07-03T10:00:00.000Z", "outbound"),
  ];
  const crossChannelLoop = loop("loop-shipment-schedule", ["msg-alibaba", "msg-gmail"], "waiting_on_partner");
  const projection = project({
    records,
    loops: [crossChannelLoop],
    coverage: records.map((row) => coverage(row.source_record_id, [crossChannelLoop.open_loop_id])),
  });

  assert.equal(projection.native_threads.length, 2);
  assert.equal(projection.open_loops[0]?.native_thread_keys.length, 2);
  assert.deepEqual(
    projection.native_threads.map((thread) => thread.provider).sort(),
    ["alibaba", "gmail"],
  );
});

test("model proposals stay in review and never enter the operational queue", () => {
  const records = [
    record("msg-model", "alibaba", "surewal-main", "2026-07-04T09:00:00.000Z", "inbound"),
  ];
  const proposed = {
    ...loop("loop-model", ["msg-model"]),
    review_state: "proposed" as const,
    assertion_origin: "model" as const,
  };
  const projection = project({
    records,
    loops: [proposed],
    coverage: [
      {
        source_record_id: "msg-model",
        disposition: "needs_review",
        open_loop_ids: [],
        assertion_origin: "model",
      },
    ],
  });

  assert.equal(projection.open_loops.length, 0);
  assert.equal(projection.attention_queue.length, 0);
  assert.deepEqual(projection.review_queue, [
    { subject_id: "loop-model", subject_type: "open_loop", reason: "open_loop_unconfirmed" },
    { subject_id: "msg-model", subject_type: "source_record", reason: "source_coverage_unconfirmed" },
  ]);
});

test("resolved loops require exact closure evidence from the same partner", () => {
  const records = [
    record("msg-question", "alibaba", "surewal-main", "2026-07-05T09:00:00.000Z", "outbound"),
    record("msg-answer", "alibaba", "surewal-main", "2026-07-05T10:00:00.000Z", "inbound"),
  ];
  const resolved = {
    ...loop("loop-resolved", ["msg-question", "msg-answer"], "resolved"),
    closure_source_record_ids: ["msg-answer"],
  };
  const projection = project({
    records,
    loops: [resolved],
    coverage: records.map((row) => coverage(row.source_record_id, [resolved.open_loop_id])),
  });
  assert.equal(projection.open_loops.length, 0);
  assert.equal(projection.reviewed_loops.length, 1);
  assert.deepEqual(projection.reviewed_loops[0]?.closure_source_record_ids, ["msg-answer"]);
  assert.equal(projection.native_threads[0]?.open_loop_ids.length, 1);

  assert.throws(
    () => project({ records, loops: [loop("loop-no-proof", ["msg-question"], "resolved")] }),
    /requires exact closure evidence/,
  );
});

test("every projected source record requires an explicit coverage disposition", () => {
  const records = [
    record("msg-covered", "alibaba", "surewal-main", "2026-07-06T09:00:00.000Z", "inbound"),
    record("msg-unclassified", "alibaba", "surewal-main", "2026-07-06T09:01:00.000Z", "inbound"),
  ];
  const projection = project({
    records,
    coverage: [coverage("msg-covered")],
  });
  assert.equal(projection.native_threads[0]?.unclassified_record_count, 1);
  assert.deepEqual(projection.review_queue, [
    {
      subject_id: "msg-unclassified",
      subject_type: "source_record",
      reason: "source_coverage_unconfirmed",
    },
  ]);
});

test("reviewed loops cannot claim evidence without reciprocal reviewed coverage", () => {
  const records = [
    record("msg-evidence", "alibaba", "surewal-main", "2026-07-06T10:00:00.000Z", "inbound"),
  ];
  assert.throws(
    () => project({
      records,
      loops: [loop("loop-uncovered", ["msg-evidence"])],
      coverage: [coverage("msg-evidence")],
    }),
    /lacks matching source coverage/,
  );
});

test("identity and relationship classification remain reviewed Nex boundaries", () => {
  const records = [
    record("msg-identity", "alibaba", "surewal-main", "2026-07-07T09:00:00.000Z", "inbound"),
    record("msg-category", "gmail", "gmail-thread", "2026-07-07T09:01:00.000Z", "inbound"),
  ];
  const projection = project({
    records,
    identities: [
      {
        source_record_id: "msg-identity",
        status: "probable",
        decision_origin: "model_proposal",
        canonical_entity_id: "entity-surewal",
      },
      identity("msg-category"),
    ],
    workspaces: [
      workspace("msg-identity"),
      {
        source_record_id: "msg-category",
        category: "vendor",
        status: "confirmed",
        assertion_origin: "model",
      },
    ],
  });

  assert.equal(projection.native_threads.length, 0);
  assert.deepEqual(projection.review_queue, [
    { subject_id: "msg-category", subject_type: "source_record", reason: "workspace_classification_unconfirmed" },
    { subject_id: "msg-identity", subject_type: "source_record", reason: "identity_model_only" },
  ]);
});

test("open-loop evidence cannot cross canonical partner entities", () => {
  const records = [
    record("msg-surewal", "alibaba", "surewal-main", "2026-07-08T09:00:00.000Z", "inbound"),
    record("msg-other", "gmail", "other-partner", "2026-07-08T09:01:00.000Z", "inbound"),
  ];
  assert.throws(
    () => project({
      records,
      loops: [loop("loop-cross-entity", ["msg-surewal", "msg-other"])],
      identities: [
        identity("msg-surewal"),
        { ...identity("msg-other"), canonical_entity_id: "entity-other" },
      ],
    }),
    /crosses canonical entities/,
  );
});
