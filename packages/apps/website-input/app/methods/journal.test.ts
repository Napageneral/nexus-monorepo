import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWebsiteExternalRecordId,
  buildWebsiteRecordIngestEnvelope,
  websiteEventFromRuntimeRecord,
  WEBSITE_INPUT_RECORD_PLATFORM,
} from "./journal.ts";

test("buildWebsiteRecordIngestEnvelope maps canonical website events onto record.ingest", () => {
  const envelope = buildWebsiteRecordIngestEnvelope({
    websiteInstallationId: "install_1",
    eventId: "evt_1",
    capturedAt: 1700000000000,
    receivedAt: 1700000001000,
    consentState: "granted",
    eventName: "cta_click",
    browserId: "browser_1",
    sessionId: "session_1",
    pageUrl: "https://example.com/pricing",
    pagePath: "/pricing",
    host: "example.com",
    referrer: "https://google.com",
    eventSourceUrl: null,
    pageTitle: "Pricing",
    userAgent: "Test Agent",
    viewportWidth: 1280,
    viewportHeight: 720,
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "spring",
    utmContent: null,
    utmTerm: null,
    fbclid: null,
    fbc: null,
    fbp: null,
    gclid: "gclid_1",
    gbraid: null,
    wbraid: null,
    ttclid: null,
    ttp: null,
    msclkid: null,
    surfaceId: "hero_primary",
    surfaceLabel: "Hero CTA",
    surfaceCategory: "hero",
    targetType: "service",
    targetId: "consult",
    targetLabel: "Book consult",
    bridgeSurface: "form",
    handoffId: "handoff_1",
    checkoutToken: null,
    checkoutKey: null,
    checkoutId: null,
    cartToken: null,
    formId: "form_1",
    formSubmissionId: null,
    bookingId: null,
    bookingSlotId: null,
    leadExternalId: null,
    metadata: { sample: true },
  });

  assert.equal(envelope.routing.platform, WEBSITE_INPUT_RECORD_PLATFORM);
  assert.equal(envelope.routing.connection_id, "install_1");
  assert.equal(envelope.routing.sender_id, "browser:browser_1");
  assert.equal(envelope.routing.thread_id, "session_1");
  assert.equal(envelope.payload.external_record_id, "install_1:evt_1");
  assert.equal(envelope.payload.content_type, "text");
  assert.equal(
    (envelope.payload.metadata.website_event as Record<string, unknown>).eventName,
    "cta_click",
  );
});

test("websiteEventFromRuntimeRecord reconstructs canonical events from records rows", () => {
  const record = {
    id: buildWebsiteExternalRecordId("install_1", "evt_1"),
    record_id: `${WEBSITE_INPUT_RECORD_PLATFORM}:${buildWebsiteExternalRecordId("install_1", "evt_1")}`,
    timestamp: 1700000000000,
    received_at: 1700000001000,
    metadata: {
      website_installation_id: "install_1",
      website_event: {
        websiteInstallationId: "install_1",
        eventId: "evt_1",
        capturedAt: 1700000000000,
        receivedAt: 1700000001000,
        consentState: "granted",
        eventName: "handoff_start",
        browserId: "browser_1",
        sessionId: "session_1",
        pageUrl: "https://example.com/book",
        pagePath: "/book",
        host: "example.com",
        bridgeSurface: "form",
        handoffId: "handoff_1",
        formId: "form_1",
      },
    },
  };

  const event = websiteEventFromRuntimeRecord(record);
  assert.ok(event);
  assert.equal(event?.id, "install_1:evt_1");
  assert.equal(event?.websiteInstallationId, "install_1");
  assert.equal(event?.eventId, "evt_1");
  assert.equal(event?.eventName, "handoff_start");
  assert.equal(event?.bridgeSurface, "form");
  assert.equal(event?.formId, "form_1");
});
