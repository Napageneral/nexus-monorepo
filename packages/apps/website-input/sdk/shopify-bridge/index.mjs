import { buildHiddenFieldBridgePayload, normalizeBridgeFields } from "../bridge/index.mjs";

const SHOPIFY_PREFIX = "wi_";

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

export function buildShopifyCheckoutAttributes(input = {}, options = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const prefix =
    typeof options.prefix === "string" && options.prefix.trim().length > 0
      ? options.prefix.trim()
      : SHOPIFY_PREFIX;
  const bridge = normalizeBridgeFields(source.bridge ?? source);
  const payload = cleanObject({
    website_installation_id: optionalText(
      source.website_installation_id ?? source.websiteInstallationId,
    ),
    browser_id: optionalText(source.browser_id ?? source.browserId),
    session_id: optionalText(source.session_id ?? source.sessionId),
    event_id: optionalText(source.event_id ?? source.eventId),
    utm_source: optionalText(source.utm_source ?? source.utmSource),
    utm_medium: optionalText(source.utm_medium ?? source.utmMedium),
    utm_campaign: optionalText(source.utm_campaign ?? source.utmCampaign),
    gclid: optionalText(source.gclid),
    fbclid: optionalText(source.fbclid),
    ttclid: optionalText(source.ttclid),
    ...bridge,
  });

  return {
    ...Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [prefix + key, value]),
    ),
    ...buildHiddenFieldBridgePayload(bridge, { prefix }),
  };
}

export function parseShopifyCheckoutAttributes(attributes = {}, options = {}) {
  const source = attributes && typeof attributes === "object" && !Array.isArray(attributes) ? attributes : {};
  const prefix =
    typeof options.prefix === "string" && options.prefix.trim().length > 0
      ? options.prefix.trim()
      : SHOPIFY_PREFIX;
  const read = (key) => optionalText(source[prefix + key]);
  const bridge = normalizeBridgeFields({
    bridge_surface: read("bridge_surface"),
    handoff_id: read("handoff_id"),
    checkout_token: read("checkout_token"),
    checkout_key: read("checkout_key"),
    checkout_id: read("checkout_id"),
    cart_token: read("cart_token"),
    form_id: read("form_id"),
    form_submission_id: read("form_submission_id"),
    booking_id: read("booking_id"),
    booking_slot_id: read("booking_slot_id"),
    lead_external_id: read("lead_external_id"),
  });

  return cleanObject({
    website_installation_id: read("website_installation_id"),
    browser_id: read("browser_id"),
    session_id: read("session_id"),
    event_id: read("event_id"),
    utm_source: read("utm_source"),
    utm_medium: read("utm_medium"),
    utm_campaign: read("utm_campaign"),
    gclid: read("gclid"),
    fbclid: read("fbclid"),
    ttclid: read("ttclid"),
    ...bridge,
    bridge,
  });
}
