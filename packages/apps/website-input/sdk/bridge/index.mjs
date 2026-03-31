const BRIDGE_FIELD_KEYS = Object.freeze([
  "bridge_surface",
  "handoff_id",
  "checkout_token",
  "checkout_key",
  "checkout_id",
  "cart_token",
  "form_id",
  "form_submission_id",
  "booking_id",
  "booking_slot_id",
  "lead_external_id",
]);

function optionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}

export function normalizeBridgeFields(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return cleanObject({
    bridge_surface: optionalText(source.bridge_surface ?? source.bridgeSurface),
    handoff_id: optionalText(source.handoff_id ?? source.handoffId),
    checkout_token: optionalText(source.checkout_token ?? source.checkoutToken),
    checkout_key: optionalText(source.checkout_key ?? source.checkoutKey),
    checkout_id: optionalText(source.checkout_id ?? source.checkoutId),
    cart_token: optionalText(source.cart_token ?? source.cartToken),
    form_id: optionalText(source.form_id ?? source.formId),
    form_submission_id: optionalText(source.form_submission_id ?? source.formSubmissionId),
    booking_id: optionalText(source.booking_id ?? source.bookingId),
    booking_slot_id: optionalText(source.booking_slot_id ?? source.bookingSlotId),
    lead_external_id: optionalText(source.lead_external_id ?? source.leadExternalId),
  });
}

export function mergeBridgeIntoEvent(event = {}, bridge = {}) {
  const normalizedBridge = normalizeBridgeFields(bridge);
  return {
    ...event,
    ...normalizedBridge,
    bridge: normalizedBridge,
  };
}

export function buildHiddenFieldBridgePayload(bridge = {}, options = {}) {
  const normalizedBridge = normalizeBridgeFields(bridge);
  const prefix =
    typeof options.prefix === "string" && options.prefix.trim().length > 0
      ? options.prefix.trim()
      : "wi_";
  return Object.fromEntries(
    BRIDGE_FIELD_KEYS
      .filter((key) => typeof normalizedBridge[key] === "string")
      .map((key) => [prefix + key, normalizedBridge[key]]),
  );
}

export { BRIDGE_FIELD_KEYS };
