import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { projectPartnerWorkspace, type CommunicationRecord } from "./projection.ts";
import {
  SUREWAL_MESSAGE_RECORDS,
  SUREWAL_PROVIDER_THREAD_ID,
  surewalReviewedBaseline,
} from "./surewal-baseline.ts";

function record(source_record_id: string, index: number): CommunicationRecord {
  const providerMessageId = source_record_id.split(":")[3] ?? "";
  return {
    source_record_id,
    source_revision_sha256: createHash("sha256").update(source_record_id).digest("hex"),
    provider: "alibaba",
    connection_id: "moonsleep-alibaba",
    provider_thread_id: SUREWAL_PROVIDER_THREAD_ID,
    provider_message_id: providerMessageId,
    observed_at: new Date(Date.UTC(2026, 6, 15, 0, index)).toISOString(),
    direction: "inbound",
    summary: `Reviewed source evidence ${providerMessageId}`,
    attachment_count: 0,
  };
}

test("Surewal baseline projects independent open loops over one native conversation", () => {
  const records = surewalReviewedBaseline.record_ids.map(record);
  const projection = projectPartnerWorkspace({
    records,
    identity_resolutions: [...surewalReviewedBaseline.identity_resolutions],
    workspace_assertions: [...surewalReviewedBaseline.workspace_assertions],
    open_loop_assertions: [...surewalReviewedBaseline.open_loop_assertions],
    source_coverage_assertions: [...surewalReviewedBaseline.source_coverage_assertions],
  });

  assert.equal(records.length, 22);
  assert.equal(projection.native_threads.length, 1);
  assert.equal(projection.reviewed_loops.length, 13);
  assert.equal(projection.open_loops.length, 11);
  assert.equal(projection.attention_queue.length, 5);
  assert.equal(projection.waiting_on_partner.length, 6);
  assert.equal(projection.review_queue.length, 0);
  assert.deepEqual(
    projection.reviewed_loops.filter((loop) => loop.lifecycle === "resolved").map((loop) => loop.open_loop_id).sort(),
    ["surewal-batch4-redirect", "surewal-batch6-quantity-lock"],
  );
});

test("one Surewal message can update multiple loops without duplicating provider evidence", () => {
  const sharedRecord = SUREWAL_MESSAGE_RECORDS.star_and_mini_followup;
  const coverage = surewalReviewedBaseline.source_coverage_assertions.find((entry) => entry.source_record_id === sharedRecord);
  assert.deepEqual(coverage?.open_loop_ids, ["surewal-mini-moon-pricing", "surewal-star-plush-feedback"]);
  assert.equal(new Set(surewalReviewedBaseline.record_ids).size, surewalReviewedBaseline.record_ids.length);
});

test("baseline authority remains review-only and contains no prohibited schema field", () => {
  assert.match(surewalReviewedBaseline.review_note, /no reply, payment, purchase-order, shipment, or inventory authority/);
  assert.equal(JSON.stringify(surewalReviewedBaseline).includes('"kind"'), false);
  assert.equal(surewalReviewedBaseline.previous_revision_sha256, null);
});
