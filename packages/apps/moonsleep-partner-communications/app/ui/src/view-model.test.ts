import assert from "node:assert/strict";
import { test } from "vitest";
import { compactDate, lifecycleLabel, queueSections } from "./view-model.js";

test("preserves independent queue facets instead of collapsing loop lifecycle", () => {
  const attention = { open_loop_id: "eta", lifecycle: "waiting_on_moonsleep" };
  const partner = { open_loop_id: "moq", lifecycle: "waiting_on_partner" };
  const sections = queueSections({ attention_queue: [attention], waiting_on_partner: [partner], reviewed_loops: [attention, partner] });
  assert.deepEqual(sections.map((section) => [section.id, section.loops.length]), [
    ["attention", 1],
    ["partner", 1],
    ["reviewed", 2],
  ]);
});

test("renders lifecycle and review dates in operator language", () => {
  assert.equal(lifecycleLabel("waiting_on_moonsleep"), "MoonSleep action");
  assert.equal(compactDate("2026-07-22T15:00:00.000Z"), "Jul 22, 2026");
  assert.equal(compactDate(undefined), "No follow-up date");
});
