import { WEB_JOURNEY_EVENT_NAMES } from "../core/index.mjs";

const DEFAULT_GTM_EVENT_MAP = Object.freeze({
  gtm_js: "page_view",
  page_view: "page_view",
  virtual_pageview: "page_view",
  history_change: "page_view",
  content_view: "content_view",
  view_item: "product_view",
  select_content: "cta_click",
  click: "cta_click",
  cta_click: "cta_click",
  generate_lead: "form_submit",
  form_start: "form_start",
  form_submit: "form_submit",
  begin_checkout: "checkout_start",
  checkout_created: "checkout_created",
  purchase: "checkout_complete",
});

function optionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickCanonicalEventName(rawName, eventMap) {
  const eventName = optionalText(rawName);
  if (!eventName) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(WEB_JOURNEY_EVENT_NAMES, eventName)) {
    return eventName;
  }
  return eventMap[eventName] ?? DEFAULT_GTM_EVENT_MAP[eventName] ?? null;
}

function pickValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildGtmDescriptor(raw) {
  return {
    surface_id: pickValue(raw, ["surface_id", "element_id", "trigger_id"]),
    surface_label: pickValue(raw, ["surface_label", "click_text", "element_text", "page_title"]),
    surface_category: pickValue(raw, ["surface_category", "trigger_category"]) ?? null,
    target_type: pickValue(raw, ["target_type", "object_type"]),
    target_id: pickValue(raw, ["target_id", "item_id", "checkout_id", "form_id", "booking_id"]),
    target_label: pickValue(raw, ["target_label", "item_name", "page_title", "form_name"]),
  };
}

function buildGtmAttribution(raw) {
  return {
    utm_source: pickValue(raw, ["utm_source"]),
    utm_medium: pickValue(raw, ["utm_medium"]),
    utm_campaign: pickValue(raw, ["utm_campaign"]),
    utm_content: pickValue(raw, ["utm_content"]),
    utm_term: pickValue(raw, ["utm_term"]),
    fbclid: pickValue(raw, ["fbclid"]),
    fbc: pickValue(raw, ["fbc"]),
    fbp: pickValue(raw, ["fbp"]),
    gclid: pickValue(raw, ["gclid"]),
    gbraid: pickValue(raw, ["gbraid"]),
    wbraid: pickValue(raw, ["wbraid"]),
    ttclid: pickValue(raw, ["ttclid"]),
    ttp: pickValue(raw, ["ttp"]),
    msclkid: pickValue(raw, ["msclkid"]),
  };
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}

export function mapGtmDataLayerEvent(rawEvent, options = {}) {
  const eventMap = options.eventMap ?? {};
  const rawName = pickValue(rawEvent, ["event_name", "event", "gtm_event"]);
  const eventName = pickCanonicalEventName(rawName, eventMap);
  if (!eventName) {
    return null;
  }

  const pageUrl = pickValue(rawEvent, ["page_url", "page_location", "location"]);
  const pagePath = pickValue(rawEvent, ["page_path", "page_pathname", "pathname"]);
  const host = pickValue(rawEvent, ["host", "page_host"]);
  const descriptor = buildGtmDescriptor(rawEvent);
  const attribution = buildGtmAttribution(rawEvent);
  const bridge = cleanObject({
    bridge_surface: pickValue(rawEvent, ["bridge_surface"]),
    handoff_id: pickValue(rawEvent, ["handoff_id"]),
    checkout_token: pickValue(rawEvent, ["checkout_token"]),
    checkout_key: pickValue(rawEvent, ["checkout_key"]),
    checkout_id: pickValue(rawEvent, ["checkout_id"]),
    cart_token: pickValue(rawEvent, ["cart_token"]),
    form_id: pickValue(rawEvent, ["form_id"]),
    form_submission_id: pickValue(rawEvent, ["form_submission_id"]),
    booking_id: pickValue(rawEvent, ["booking_id"]),
    booking_slot_id: pickValue(rawEvent, ["booking_slot_id"]),
    lead_external_id: pickValue(rawEvent, ["lead_external_id"]),
  });

  return cleanObject({
    event_name: eventName,
    consent_state: rawEvent?.consent_state ?? options.consent_state ?? "unknown",
    page_url: pageUrl,
    page_path: pagePath,
    host,
    page_title: pickValue(rawEvent, ["page_title", "title"]),
    referrer: pickValue(rawEvent, ["referrer", "page_referrer"]),
    event_source_url: pickValue(rawEvent, ["event_source_url", "page_location", "location"]),
    user_agent: pickValue(rawEvent, ["user_agent"]),
    viewport_width: normalizeNumber(rawEvent?.viewport_width),
    viewport_height: normalizeNumber(rawEvent?.viewport_height),
    ...attribution,
    ...descriptor,
    ...bridge,
    bridge,
    metadata: cleanObject({
      gtm_event_name: rawName,
      data_layer_name: pickValue(rawEvent, ["data_layer_name"]),
      container_id: pickValue(rawEvent, ["container_id"]),
    }),
  });
}

export function createGtmWebJourneyMapper(options = {}) {
  const mapEvent = (rawEvent) => mapGtmDataLayerEvent(rawEvent, options);
  return {
    mapEvent,
    mapBatch(rawEvents) {
      return rawEvents.map((rawEvent) => mapEvent(rawEvent)).filter(Boolean);
    },
  };
}
