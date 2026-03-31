import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  findEvent,
  findInstallationById,
  findInstallationBySenderEntityId,
  insertInstallation,
  listEvents,
  listInstallations,
  normalizeEventInput,
  openWebsiteInputDb,
  updateInstallation,
  upsertEvent,
} from "./store.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "website-input-"));
}

test("openWebsiteInputDb initializes the schema and stores installations", () => {
  const dataDir = makeTempDir();
  try {
    const db = openWebsiteInputDb(dataDir);
    try {
      const now = Date.now();
      const installationId = randomUUID();
      insertInstallation(db, {
        id: installationId,
        accountId: "acct_1",
        label: "Alpha",
        siteOrigin: "https://example.com",
        status: "active",
        senderEntityId: "ent_sender_1",
        createdByEntityId: "ent_1",
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        collectorBaseUrl: "http://127.0.0.1:18789",
        metadata: { source: "test" },
      });

      const installation = findInstallationById(db, installationId);
      assert.ok(installation);
      assert.equal(installation?.label, "Alpha");
      assert.equal(installation?.senderEntityId, "ent_sender_1");
      assert.equal(listInstallations(db, { accountId: "acct_1" }).length, 1);
      assert.equal(findInstallationBySenderEntityId(db, "ent_sender_1")?.id, installationId);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("updateInstallation persists collector base url changes", () => {
  const dataDir = makeTempDir();
  try {
    const db = openWebsiteInputDb(dataDir);
    try {
      const now = Date.now();
      const installationId = randomUUID();
      insertInstallation(db, {
        id: installationId,
        accountId: "acct_1",
        label: "Alpha",
        siteOrigin: "https://example.com",
        status: "active",
        senderEntityId: "ent_sender_1",
        createdByEntityId: "ent_1",
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        collectorBaseUrl: "http://127.0.0.1:18789",
      });

      updateInstallation(db, installationId, {
        collectorBaseUrl: "https://runtime.example.com",
      });

      const installation = findInstallationById(db, installationId);
      assert.equal(installation?.collectorBaseUrl, "https://runtime.example.com");
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("upsertEvent dedupes by installation id and event id", () => {
  const dataDir = makeTempDir();
  try {
    const db = openWebsiteInputDb(dataDir);
    try {
      const now = Date.now();
      const installationId = randomUUID();
      insertInstallation(db, {
        id: installationId,
        accountId: "acct_1",
        label: null,
        siteOrigin: null,
        status: "active",
        senderEntityId: "ent_sender_1",
        createdByEntityId: "ent_1",
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        collectorBaseUrl: "http://127.0.0.1:18789",
      });

      upsertEvent(db, {
        websiteInstallationId: installationId,
        eventId: "evt_1",
        capturedAt: now,
        receivedAt: now,
        consentState: "granted",
        eventName: "page_view",
        browserId: "browser_1",
        sessionId: "session_1",
        pageUrl: "https://example.com/landing",
        pagePath: "/landing",
        host: "example.com",
        referrer: null,
        eventSourceUrl: null,
        pageTitle: "Landing",
        userAgent: null,
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
        gclid: null,
        gbraid: null,
        wbraid: null,
        ttclid: null,
        ttp: null,
        msclkid: null,
        surfaceId: "hero-cta",
        surfaceLabel: "Hero CTA",
        surfaceCategory: "hero",
        targetType: "service",
        targetId: "consult",
        targetLabel: "Consult",
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
        metadata: { source: "first" },
      });

      upsertEvent(db, {
        websiteInstallationId: installationId,
        eventId: "evt_1",
        capturedAt: now + 1,
        receivedAt: now + 1,
        consentState: "granted",
        eventName: "cta_click",
        browserId: "browser_1",
        sessionId: "session_1",
        pageUrl: "https://example.com/landing",
        pagePath: "/landing",
        host: "example.com",
        referrer: null,
        eventSourceUrl: null,
        pageTitle: "Landing Updated",
        userAgent: null,
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
        gclid: null,
        gbraid: null,
        wbraid: null,
        ttclid: null,
        ttp: null,
        msclkid: null,
        surfaceId: "hero-cta",
        surfaceLabel: "Hero CTA",
        surfaceCategory: "hero",
        targetType: "service",
        targetId: "consult",
        targetLabel: "Consult",
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
        metadata: { source: "second" },
      });

      const event = findEvent(db, installationId, "evt_1");
      assert.ok(event);
      assert.equal(event?.eventName, "cta_click");
      assert.equal(event?.pageTitle, "Landing Updated");
      assert.equal(listEvents(db, { websiteInstallationId: installationId }).length, 1);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("normalizeEventInput accepts nested bridge fields from browser helpers", () => {
  const event = normalizeEventInput({
    website_installation_id: "install_1",
    event_id: "evt_bridge",
    captured_at: 1700000000000,
    consent_state: "granted",
    event_name: "handoff_start",
    browser_id: "browser_1",
    session_id: "session_1",
    page_url: "https://example.com/contact",
    page_path: "/contact",
    host: "example.com",
    bridge: {
      bridge_surface: "form",
      handoff_id: "handoff_1",
      form_id: "form_1",
      lead_external_id: "lead_1",
    },
  });

  assert.equal(event.bridgeSurface, "form");
  assert.equal(event.handoffId, "handoff_1");
  assert.equal(event.formId, "form_1");
  assert.equal(event.leadExternalId, "lead_1");
});
