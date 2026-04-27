import test from "node:test";
import assert from "node:assert/strict";
import {
  BRIDGE_FIELD_KEYS,
  buildHiddenFieldBridgePayload,
  mergeBridgeIntoEvent,
  normalizeBridgeFields,
  parseHiddenFieldBridgePayload,
} from "./index.mjs";

test("normalizeBridgeFields keeps only explicit canonical bridge fields", () => {
  const normalized = normalizeBridgeFields({
    bridge_surface: "booking",
    booking_id: "booking_1",
    lead_external_id: "lead_1",
    ignored: "nope",
  });

  assert.deepEqual(normalized, {
    bridge_surface: "booking",
    booking_id: "booking_1",
    lead_external_id: "lead_1",
  });
  assert.equal(BRIDGE_FIELD_KEYS.includes("booking_id"), true);
});

test("mergeBridgeIntoEvent and hidden-field payloads preserve explicit fields", () => {
  const merged = mergeBridgeIntoEvent(
    { event_name: "handoff_start", session_id: "session_1" },
    {
      bridge_surface: "form",
      handoff_id: "handoff_1",
      form_id: "form_1",
    },
  );

  assert.equal(merged.bridge_surface, "form");
  assert.equal(merged.bridge.form_id, "form_1");

  const payload = buildHiddenFieldBridgePayload(merged.bridge, { prefix: "bridge_" });
  assert.deepEqual(payload, {
    bridge_bridge_surface: "form",
    bridge_handoff_id: "handoff_1",
    bridge_form_id: "form_1",
  });

  assert.deepEqual(parseHiddenFieldBridgePayload(payload, { prefix: "bridge_" }), {
    bridge_surface: "form",
    handoff_id: "handoff_1",
    form_id: "form_1",
  });
});
