import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteBinding,
  getLedgerOutcome,
  isoDay,
  listBindings,
  listLedgerOutcomes,
  openAttributionDb,
  readFunnel,
  readLedgerSummary,
  readSummary,
  readPipelineStatus,
  replaceConversionBridges,
  replaceDailyFunnelMarts,
  replaceDailySourceMarts,
  replaceOutcomeAttributions,
  replaceSessionSourceFacts,
  startOfDayMs,
  upsertAdFact,
  upsertBinding,
  upsertBusinessOutcome,
  upsertScope,
  upsertWebEvent,
} from "./store.js";

const tempDirs: string[] = [];

function createTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attribution-store-"));
  tempDirs.push(dir);
  return dir;
}

function createLegacyV1Db(dataDir: string): void {
  const db = new DatabaseSync(path.join(dataDir, "attribution.db"));
  try {
    db.exec(`
CREATE TABLE attribution_scopes (
  scope_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE attribution_bindings (
  binding_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  role TEXT NOT NULL,
  connection_id TEXT,
  platform TEXT,
  label TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_attribution_bindings_scope_role ON attribution_bindings(scope_id, role, updated_at DESC);
CREATE INDEX idx_attribution_bindings_connection ON attribution_bindings(connection_id, role);
CREATE TABLE attribution_web_events (
  scope_id TEXT NOT NULL,
  website_installation_id TEXT NOT NULL,
  logical_row_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  session_id TEXT,
  browser_id TEXT,
  consent_state TEXT,
  page_url TEXT,
  page_path TEXT,
  host TEXT,
  referrer TEXT,
  event_source_url TEXT,
  source_channel TEXT,
  source_confidence TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  gclid TEXT,
  gbraid TEXT,
  wbraid TEXT,
  ttclid TEXT,
  ttp TEXT,
  msclkid TEXT,
  bridge_surface TEXT,
  handoff_id TEXT,
  checkout_token TEXT,
  checkout_key TEXT,
  checkout_id TEXT,
  cart_token TEXT,
  form_id TEXT,
  form_submission_id TEXT,
  booking_id TEXT,
  booking_slot_id TEXT,
  lead_external_id TEXT,
  row_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, website_installation_id, logical_row_id)
);
CREATE INDEX idx_attribution_web_events_scope_capture ON attribution_web_events(scope_id, captured_at DESC);
CREATE INDEX idx_attribution_web_events_scope_session ON attribution_web_events(scope_id, session_id, captured_at DESC);
CREATE INDEX idx_attribution_web_events_scope_handoff ON attribution_web_events(scope_id, handoff_id);
CREATE TABLE attribution_session_source_facts (
  scope_id TEXT NOT NULL,
  website_installation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  page_views INTEGER NOT NULL,
  content_views INTEGER NOT NULL,
  cta_clicks INTEGER NOT NULL,
  handoff_starts INTEGER NOT NULL,
  handoff_confirmed INTEGER NOT NULL,
  product_views INTEGER NOT NULL,
  cart_adds INTEGER NOT NULL,
  checkout_starts INTEGER NOT NULL,
  checkout_completes INTEGER NOT NULL,
  form_starts INTEGER NOT NULL,
  form_submits INTEGER NOT NULL,
  bookings_completed INTEGER NOT NULL,
  source_channel TEXT NOT NULL,
  source_confidence TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, website_installation_id, session_id)
);
CREATE INDEX idx_attribution_session_source_scope_first_seen ON attribution_session_source_facts(scope_id, first_seen_at DESC);
CREATE TABLE attribution_conversion_bridges (
  scope_id TEXT NOT NULL,
  bridge_key TEXT NOT NULL,
  website_installation_id TEXT,
  session_id TEXT,
  bridge_surface TEXT,
  handoff_id TEXT,
  checkout_token TEXT,
  checkout_key TEXT,
  checkout_id TEXT,
  cart_token TEXT,
  form_id TEXT,
  form_submission_id TEXT,
  booking_id TEXT,
  booking_slot_id TEXT,
  lead_external_id TEXT,
  event_id TEXT,
  source_channel TEXT,
  source_confidence TEXT,
  evidence_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, bridge_key)
);
CREATE INDEX idx_attribution_conversion_bridges_scope_session ON attribution_conversion_bridges(scope_id, session_id);
PRAGMA user_version = 1;
`);
  } finally {
    db.close();
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("derived table replacement helpers", () => {
  it("keeps the latest duplicate rows without failing on primary key conflicts", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);

    try {
      replaceSessionSourceFacts(db, "scope-1", [
        {
          scopeId: "scope-1",
          webInstallationId: "site-1",
          sessionId: "sess-1",
          firstSeenAt: 1,
          lastSeenAt: 2,
          eventCount: 1,
          pageViews: 1,
          contentViews: 0,
          ctaClicks: 0,
          handoffStarts: 0,
          handoffConfirmed: 0,
          productViews: 0,
          cartAdds: 0,
          checkoutStarts: 0,
          checkoutCompletes: 0,
          formStarts: 0,
          formSubmits: 0,
          bookingsCompleted: 0,
          sourceChannel: "direct_or_unknown",
          sourceConfidence: "unknown",
          evidence: { step: 1 },
          updatedAt: 10,
        },
        {
          scopeId: "scope-1",
          webInstallationId: "site-1",
          sessionId: "sess-1",
          firstSeenAt: 1,
          lastSeenAt: 4,
          eventCount: 2,
          pageViews: 2,
          contentViews: 1,
          ctaClicks: 1,
          handoffStarts: 0,
          handoffConfirmed: 0,
          productViews: 0,
          cartAdds: 0,
          checkoutStarts: 0,
          checkoutCompletes: 0,
          formStarts: 0,
          formSubmits: 0,
          bookingsCompleted: 0,
          sourceChannel: "google_paid",
          sourceConfidence: "high",
          evidence: { step: 2 },
          updatedAt: 11,
        },
      ]);

      replaceConversionBridges(db, "scope-1", [
        {
          scopeId: "scope-1",
          bridgeKey: "bridge-1",
          webInstallationId: "site-1",
          sessionId: "sess-1",
          bridgeSurface: "checkout",
          handoffId: null,
          checkoutToken: "chk-1",
          checkoutKey: null,
          checkoutId: null,
          cartToken: null,
          formId: null,
          formSubmissionId: null,
          bookingId: null,
          bookingSlotId: null,
          leadExternalId: null,
          eventId: "evt-1",
          sourceChannel: "direct_or_unknown",
          sourceConfidence: "unknown",
          evidence: { step: 1 },
          occurredAt: 10,
          updatedAt: 10,
        },
        {
          scopeId: "scope-1",
          bridgeKey: "bridge-1",
          webInstallationId: "site-1",
          sessionId: "sess-1",
          bridgeSurface: "checkout",
          handoffId: null,
          checkoutToken: "chk-2",
          checkoutKey: null,
          checkoutId: null,
          cartToken: null,
          formId: null,
          formSubmissionId: null,
          bookingId: null,
          bookingSlotId: null,
          leadExternalId: null,
          eventId: "evt-2",
          sourceChannel: "meta_paid",
          sourceConfidence: "medium",
          evidence: { step: 2 },
          occurredAt: 11,
          updatedAt: 11,
        },
      ]);

      replaceOutcomeAttributions(db, "scope-1", [
        {
          scopeId: "scope-1",
          outcomeId: "outcome-1",
          sourceChannel: "google_paid",
          sourceConfidence: "high",
          matchMethod: "session_match",
          paidPlatform: "google-ads",
          sessionId: "sess-1",
          evidence: { step: 1 },
          unresolvedReason: null,
          updatedAt: 10,
        },
        {
          scopeId: "scope-1",
          outcomeId: "outcome-1",
          sourceChannel: "meta_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "meta-ads",
          sessionId: "sess-1",
          evidence: { step: 2 },
          unresolvedReason: null,
          updatedAt: 11,
        },
      ]);

      replaceDailySourceMarts(db, "scope-1", [
        {
          scopeId: "scope-1",
          date: "2026-03-31",
          sourceChannel: "meta_paid",
          spend: 10,
          impressions: 100,
          clicks: 5,
          landingPageViews: 2,
          purchases: 1,
          purchaseValue: 50,
          outcomes: 1,
          grossRevenue: 50,
        },
        {
          scopeId: "scope-1",
          date: "2026-03-31",
          sourceChannel: "meta_paid",
          spend: 12,
          impressions: 120,
          clicks: 6,
          landingPageViews: 3,
          purchases: 2,
          purchaseValue: 75,
          outcomes: 2,
          grossRevenue: 75,
        },
      ]);

      replaceDailyFunnelMarts(db, "scope-1", [
        {
          scopeId: "scope-1",
          date: "2026-03-31",
          sourceChannel: "meta_paid",
          sessions: 1,
          pageViews: 2,
          contentViews: 0,
          ctaClicks: 0,
          handoffStarts: 0,
          handoffConfirmed: 0,
          productViews: 0,
          cartAdds: 0,
          checkoutStarts: 0,
          checkoutCompletes: 0,
          formStarts: 0,
          formSubmits: 0,
          bookingsCompleted: 0,
          outcomes: 1,
          grossRevenue: 50,
        },
        {
          scopeId: "scope-1",
          date: "2026-03-31",
          sourceChannel: "meta_paid",
          sessions: 2,
          pageViews: 3,
          contentViews: 1,
          ctaClicks: 1,
          handoffStarts: 1,
          handoffConfirmed: 0,
          productViews: 0,
          cartAdds: 0,
          checkoutStarts: 0,
          checkoutCompletes: 0,
          formStarts: 0,
          formSubmits: 0,
          bookingsCompleted: 0,
          outcomes: 2,
          grossRevenue: 75,
        },
      ]);

      const sessionRow = db
        .prepare(
          "SELECT last_seen_at, event_count, source_channel FROM attribution_session_source_facts WHERE scope_id = ? AND web_installation_id = ? AND session_id = ?",
        )
        .get("scope-1", "site-1", "sess-1") as Record<string, unknown>;
      expect(sessionRow.last_seen_at).toBe(4);
      expect(sessionRow.event_count).toBe(2);
      expect(sessionRow.source_channel).toBe("google_paid");

      const bridgeRow = db
        .prepare(
          "SELECT checkout_token, event_id, source_channel FROM attribution_conversion_bridges WHERE scope_id = ? AND bridge_key = ?",
        )
        .get("scope-1", "bridge-1") as Record<string, unknown>;
      expect(bridgeRow.checkout_token).toBe("chk-2");
      expect(bridgeRow.event_id).toBe("evt-2");
      expect(bridgeRow.source_channel).toBe("meta_paid");

      const attributionRow = db
        .prepare(
          "SELECT source_channel, match_method, paid_platform, updated_at FROM attribution_outcome_attributions WHERE scope_id = ? AND outcome_id = ?",
        )
        .get("scope-1", "outcome-1") as Record<string, unknown>;
      expect(attributionRow.source_channel).toBe("meta_paid");
      expect(attributionRow.match_method).toBe("bridge_match");
      expect(attributionRow.paid_platform).toBe("meta-ads");
      expect(attributionRow.updated_at).toBe(11);

      const sourceMartRow = db
        .prepare(
          "SELECT spend, impressions, clicks, gross_revenue FROM attribution_daily_source_marts WHERE scope_id = ? AND date = ? AND source_channel = ?",
        )
        .get("scope-1", "2026-03-31", "meta_paid") as Record<string, unknown>;
      expect(sourceMartRow.spend).toBe(12);
      expect(sourceMartRow.impressions).toBe(120);
      expect(sourceMartRow.clicks).toBe(6);
      expect(sourceMartRow.gross_revenue).toBe(75);

      const funnelMartRow = db
        .prepare(
          "SELECT sessions, page_views, cta_clicks, gross_revenue FROM attribution_daily_funnel_marts WHERE scope_id = ? AND date = ? AND source_channel = ?",
        )
        .get("scope-1", "2026-03-31", "meta_paid") as Record<string, unknown>;
      expect(funnelMartRow.sessions).toBe(2);
      expect(funnelMartRow.page_views).toBe(3);
      expect(funnelMartRow.cta_clicks).toBe(1);
      expect(funnelMartRow.gross_revenue).toBe(75);
    } finally {
      db.close();
    }
  });

  it("reports outcome row counts separately from backend entity attribution counts", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);

    try {
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:1001",
        sourceRecordId: "record-order-1001",
        connectionId: "shopify-primary",
        backendEntityId: "order-1001",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: 10,
        currency: "USD",
        grossValue: 120,
        netValue: 120,
        customerId: "customer-1",
        customerEmail: "customer@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-1",
        cartToken: "cart-1",
        bridgeAttributes: {},
        row: { id: "order:1001" },
        updatedAt: 10,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "line_item:1001:1",
        sourceRecordId: "record-line-item-1001-1",
        connectionId: "shopify-primary",
        backendEntityId: "order-1001",
        outcomeType: "line_item",
        outcomeStatus: "paid",
        occurredAt: 11,
        currency: "USD",
        grossValue: 60,
        netValue: 60,
        customerId: "customer-1",
        customerEmail: "customer@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-1",
        cartToken: "cart-1",
        bridgeAttributes: {},
        row: { id: "line_item:1001:1" },
        updatedAt: 11,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "customer:2002",
        sourceRecordId: "record-customer-2002",
        connectionId: "shopify-primary",
        backendEntityId: "customer-2002",
        outcomeType: "customer",
        outcomeStatus: "created",
        occurredAt: 12,
        currency: "USD",
        grossValue: 0,
        netValue: 0,
        customerId: "customer-2002",
        customerEmail: "other@example.com",
        sessionId: null,
        checkoutToken: null,
        cartToken: null,
        bridgeAttributes: {},
        row: { id: "customer:2002" },
        updatedAt: 12,
      });

      replaceOutcomeAttributions(db, "scope-1", [
        {
          scopeId: "scope-1",
          outcomeId: "order-1001",
          sourceChannel: "meta_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "meta-ads",
          sessionId: "sess-1",
          evidence: { step: 1 },
          unresolvedReason: null,
          updatedAt: 20,
        },
        {
          scopeId: "scope-1",
          outcomeId: "customer-2002",
          sourceChannel: "direct_or_unknown",
          sourceConfidence: "unknown",
          matchMethod: "no_match",
          paidPlatform: null,
          sessionId: null,
          evidence: { step: 2 },
          unresolvedReason: "no_bridge_or_session_evidence",
          updatedAt: 21,
        },
      ]);

      const pipeline = readPipelineStatus(db, "scope-1") as {
        counts: Record<string, unknown>;
      };
      expect(pipeline.counts).toMatchObject({
        business_outcomes: 3,
        business_outcome_rows: 3,
        business_outcome_entities: 2,
        outcome_attributions: 2,
        outcome_attribution_entities: 2,
        resolved_outcome_entities: 1,
        unresolved_outcome_entities: 1,
      });
    } finally {
      db.close();
    }
  });

  it("builds compare-window KPI packaging and an attribution strip from existing marts", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);
    const dayMs = 24 * 60 * 60 * 1000;
    const today = isoDay(Date.now());
    const twoDaysAgo = isoDay(Date.now() - 2 * dayMs);
    const eightDaysAgo = isoDay(Date.now() - 8 * dayMs);

    try {
      replaceDailySourceMarts(db, "scope-1", [
        {
          scopeId: "scope-1",
          date: today,
          sourceChannel: "meta_paid",
          spend: 10,
          impressions: 100,
          clicks: 20,
          landingPageViews: 5,
          purchases: 2,
          purchaseValue: 50,
          outcomes: 1,
          grossRevenue: 100,
        },
        {
          scopeId: "scope-1",
          date: twoDaysAgo,
          sourceChannel: "meta_paid",
          spend: 5,
          impressions: 60,
          clicks: 10,
          landingPageViews: 3,
          purchases: 1,
          purchaseValue: 25,
          outcomes: 1,
          grossRevenue: 50,
        },
        {
          scopeId: "scope-1",
          date: today,
          sourceChannel: "google_paid",
          spend: 2,
          impressions: 30,
          clicks: 4,
          landingPageViews: 2,
          purchases: 0,
          purchaseValue: 0,
          outcomes: 0,
          grossRevenue: 20,
        },
        {
          scopeId: "scope-1",
          date: eightDaysAgo,
          sourceChannel: "meta_paid",
          spend: 8,
          impressions: 80,
          clicks: 12,
          landingPageViews: 4,
          purchases: 1,
          purchaseValue: 40,
          outcomes: 1,
          grossRevenue: 80,
        },
      ]);

      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order-current-1",
        sourceRecordId: "order-current-1",
        connectionId: "shopify-primary",
        backendEntityId: "order-current-1",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: Date.now(),
        currency: "USD",
        grossValue: 100,
        netValue: 100,
        customerId: "customer-1",
        customerEmail: "customer-1@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-1",
        cartToken: "cart-1",
        bridgeAttributes: {},
        row: { id: "order-current-1" },
        updatedAt: 100,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order-current-2",
        sourceRecordId: "order-current-2",
        connectionId: "shopify-primary",
        backendEntityId: "order-current-2",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: Date.now() - dayMs,
        currency: "USD",
        grossValue: 50,
        netValue: 50,
        customerId: "customer-2",
        customerEmail: "customer-2@example.com",
        sessionId: "sess-2",
        checkoutToken: "chk-2",
        cartToken: "cart-2",
        bridgeAttributes: {},
        row: { id: "order-current-2" },
        updatedAt: 101,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order-previous-1",
        sourceRecordId: "order-previous-1",
        connectionId: "shopify-primary",
        backendEntityId: "order-previous-1",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: Date.now() - 8 * dayMs,
        currency: "USD",
        grossValue: 80,
        netValue: 80,
        customerId: "customer-3",
        customerEmail: "customer-3@example.com",
        sessionId: "sess-3",
        checkoutToken: "chk-3",
        cartToken: "cart-3",
        bridgeAttributes: {},
        row: { id: "order-previous-1" },
        updatedAt: 102,
      });

      replaceOutcomeAttributions(db, "scope-1", [
        {
          scopeId: "scope-1",
          outcomeId: "order-current-1",
          sourceChannel: "meta_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "meta-ads",
          sessionId: "sess-1",
          evidence: { step: 1 },
          unresolvedReason: null,
          updatedAt: 200,
        },
        {
          scopeId: "scope-1",
          outcomeId: "order-current-2",
          sourceChannel: "direct_or_unknown",
          sourceConfidence: "unknown",
          matchMethod: "unresolved",
          paidPlatform: null,
          sessionId: null,
          evidence: {},
          unresolvedReason: "no_bridge_or_session_evidence",
          updatedAt: 201,
        },
        {
          scopeId: "scope-1",
          outcomeId: "order-previous-1",
          sourceChannel: "google_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "google-ads",
          sessionId: "sess-3",
          evidence: { step: 2 },
          unresolvedReason: null,
          updatedAt: 202,
        },
      ]);

      const summary = readSummary(db, "scope-1", 7) as {
        totals: Record<string, unknown>;
        compare_totals: Record<string, unknown>;
        kpis: Record<string, Record<string, unknown>>;
        attribution_strip: Record<string, unknown>;
        compare_attribution_strip: Record<string, unknown>;
        channel_groups: Array<Record<string, unknown>>;
        source_breakdown: Array<Record<string, unknown>>;
        channel_trajectory: Array<Record<string, unknown>>;
        top_channels: Array<Record<string, unknown>>;
      };

      expect(summary.totals).toMatchObject({
        spend: 17,
        impressions: 190,
        clicks: 34,
        landing_page_views: 10,
        purchases: 3,
        purchase_value: 75,
        outcomes: 2,
        gross_revenue: 170,
      });
      expect(summary.compare_totals).toMatchObject({
        spend: 8,
        impressions: 80,
        clicks: 12,
        landing_page_views: 4,
        purchases: 1,
        purchase_value: 40,
        outcomes: 1,
        gross_revenue: 80,
      });
      expect(summary.kpis.spend).toMatchObject({
        value: 17,
        previous: 8,
        formatter: "money",
      });
      expect(summary.kpis.match_rate).toMatchObject({
        value: 0.5,
        previous: 1,
        formatter: "percent",
      });
      expect(summary.attribution_strip).toMatchObject({
        total_primary_outcomes: 2,
        resolved_primary_outcomes: 1,
        unresolved_primary_outcomes: 1,
        direct_or_unknown_primary_outcomes: 1,
        paid_primary_outcomes: 1,
        coverage_rate: 0.5,
      });
      expect(summary.compare_attribution_strip).toMatchObject({
        total_primary_outcomes: 1,
        resolved_primary_outcomes: 1,
        unresolved_primary_outcomes: 0,
        paid_primary_outcomes: 1,
        coverage_rate: 1,
      });
      expect(summary.top_channels[0]).toMatchObject({
        source_channel: "meta_paid",
        spend: 15,
        clicks: 30,
        outcomes: 2,
        gross_revenue: 150,
      });
      expect(summary.channel_groups[0]).toMatchObject({
        channel_family: "paid",
        totals: {
          spend: 17,
          clicks: 34,
          outcomes: 2,
          gross_revenue: 170,
        },
        compare_totals: {
          spend: 8,
          clicks: 12,
          outcomes: 1,
          gross_revenue: 80,
        },
      });
      expect(summary.source_breakdown[0]).toMatchObject({
        source_channel: "meta_paid",
        channel_family: "paid",
      });
      expect(summary.channel_trajectory).toContainEqual(
        expect.objectContaining({
          date: today,
          channel_family: "paid",
          spend: 12,
          gross_revenue: 120,
        }),
      );
    } finally {
      db.close();
    }
  });

  it("reports freshness timestamps alongside pipeline counts", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);
    const now = Date.now();

    try {
      upsertAdFact(db, {
        scopeId: "scope-1",
        platform: "meta-ads",
        family: "campaign_daily",
        logicalRowId: "cmp-1:today",
        sourceRecordId: "meta:cmp-1:today",
        connectionId: "meta-primary",
        revisionHash: "rev-1",
        accountId: "act-1",
        campaignId: "cmp-1",
        campaignName: "Campaign 1",
        adGroupId: null,
        adGroupName: null,
        adId: null,
        adName: null,
        date: isoDay(now),
        hour: null,
        granularity: "daily",
        sourceChannel: "meta_paid",
        spend: 10,
        impressions: 100,
        clicks: 20,
        landingPageViews: 5,
        purchases: 1,
        purchaseValue: 50,
        row: {},
        derived: {},
        updatedAt: 300,
      });
      upsertWebEvent(db, {
        scopeId: "scope-1",
        webInstallationId: "site-1",
        logicalRowId: "evt-1",
        sourceRecordId: "web:evt-1",
        eventId: "evt-1",
        eventName: "page_view",
        capturedAt: 400,
        sessionId: "sess-1",
        browserId: "browser-1",
        consentState: "granted",
        pageUrl: "https://example.com",
        pagePath: "/",
        host: "example.com",
        referrer: null,
        eventSourceUrl: "https://example.com",
        sourceChannel: "meta_paid",
        sourceConfidence: "high",
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "launch",
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
        bridgeSurface: null,
        handoffId: null,
        checkoutToken: null,
        checkoutKey: null,
        checkoutId: null,
        cartToken: null,
        formId: null,
        formSubmissionId: null,
        bookingId: null,
        bookingSlotId: null,
        leadExternalId: null,
        row: {},
        updatedAt: 401,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order-1",
        sourceRecordId: "order-1",
        connectionId: "shopify-primary",
        backendEntityId: "order-1",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: 500,
        currency: "USD",
        grossValue: 100,
        netValue: 100,
        customerId: "customer-1",
        customerEmail: "customer-1@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-1",
        cartToken: "cart-1",
        bridgeAttributes: {},
        row: {},
        updatedAt: 550,
      });
      replaceOutcomeAttributions(db, "scope-1", [
        {
          scopeId: "scope-1",
          outcomeId: "order-1",
          sourceChannel: "meta_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "meta-ads",
          sessionId: "sess-1",
          evidence: {},
          unresolvedReason: null,
          updatedAt: 600,
        },
      ]);

      const pipeline = readPipelineStatus(db, "scope-1") as {
        freshness: Record<string, unknown>;
      };
      expect(pipeline.freshness).toMatchObject({
        latest_ad_fact_at: 300,
        latest_web_event_at: 400,
        latest_backend_outcome_at: 500,
        latest_backend_write_at: 550,
        latest_attribution_decision_at: 600,
      });
    } finally {
      db.close();
    }
  });

  it("builds grouped summary reads with compare KPIs, attribution strip, and live activity", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);
    const now = Date.now();
    const currentDate = isoDay(now);
    const yesterdayDate = isoDay(now - 24 * 60 * 60 * 1000);
    const compareDate = isoDay(now - 8 * 24 * 60 * 60 * 1000);
    const liveTs = now - 5 * 60 * 1000;
    const compareTs = Date.parse(`${compareDate}T12:00:00.000Z`);

    try {
      replaceDailySourceMarts(db, "scope-1", [
        {
          scopeId: "scope-1",
          date: currentDate,
          sourceChannel: "meta_paid",
          spend: 100,
          impressions: 1000,
          clicks: 50,
          landingPageViews: 30,
          purchases: 3,
          purchaseValue: 600,
          outcomes: 3,
          grossRevenue: 600,
        },
        {
          scopeId: "scope-1",
          date: yesterdayDate,
          sourceChannel: "meta_paid",
          spend: 20,
          impressions: 200,
          clicks: 10,
          landingPageViews: 6,
          purchases: 1,
          purchaseValue: 120,
          outcomes: 1,
          grossRevenue: 120,
        },
        {
          scopeId: "scope-1",
          date: currentDate,
          sourceChannel: "google_paid",
          spend: 50,
          impressions: 500,
          clicks: 25,
          landingPageViews: 14,
          purchases: 2,
          purchaseValue: 260,
          outcomes: 2,
          grossRevenue: 260,
        },
        {
          scopeId: "scope-1",
          date: compareDate,
          sourceChannel: "meta_paid",
          spend: 60,
          impressions: 600,
          clicks: 30,
          landingPageViews: 18,
          purchases: 2,
          purchaseValue: 300,
          outcomes: 2,
          grossRevenue: 300,
        },
      ]);

      upsertAdFact(db, {
        scopeId: "scope-1",
        sourceRecordId: "meta:fact:1",
        platform: "meta-ads",
        connectionId: "meta-primary",
        family: "campaign_daily",
        logicalRowId: "meta-row-1",
        revisionHash: "rev-1",
        accountId: "acct-1",
        campaignId: "camp-1",
        campaignName: "MoonSleep Prospecting",
        adGroupId: null,
        adGroupName: null,
        adId: null,
        adName: null,
        date: currentDate,
        hour: null,
        granularity: "daily",
        sourceChannel: "meta_paid",
        spend: 100,
        impressions: 1000,
        clicks: 50,
        landingPageViews: 30,
        purchases: 3,
        purchaseValue: 600,
        row: {},
        derived: {},
        updatedAt: liveTs,
      });

      upsertWebEvent(db, {
        scopeId: "scope-1",
        sourceRecordId: "web:product:1",
        logicalRowId: "web:product:1",
        webInstallationId: "site-1",
        eventId: "evt-product",
        eventName: "product_view",
        capturedAt: liveTs,
        sessionId: "sess-1",
        browserId: "browser-1",
        consentState: "granted",
        pageUrl: "https://example.com/moonspoon",
        pagePath: "/moonspoon",
        host: "example.com",
        referrer: null,
        eventSourceUrl: "https://example.com/moonspoon",
        sourceChannel: "meta_paid",
        sourceConfidence: "high",
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "prospecting",
        utmContent: null,
        utmTerm: null,
        fbclid: "fbclid-1",
        fbc: null,
        fbp: null,
        gclid: null,
        gbraid: null,
        wbraid: null,
        ttclid: null,
        ttp: null,
        msclkid: null,
        bridgeSurface: null,
        handoffId: null,
        checkoutToken: null,
        checkoutKey: null,
        checkoutId: null,
        cartToken: null,
        formId: null,
        formSubmissionId: null,
        bookingId: null,
        bookingSlotId: null,
        leadExternalId: null,
        row: {},
        updatedAt: liveTs,
      });
      upsertWebEvent(db, {
        scopeId: "scope-1",
        sourceRecordId: "web:cta:1",
        logicalRowId: "web:cta:1",
        webInstallationId: "site-1",
        eventId: "evt-cta",
        eventName: "cta_click",
        capturedAt: liveTs + 1000,
        sessionId: "sess-1",
        browserId: "browser-1",
        consentState: "granted",
        pageUrl: "https://example.com/moonspoon",
        pagePath: "/moonspoon",
        host: "example.com",
        referrer: null,
        eventSourceUrl: "https://example.com/moonspoon",
        sourceChannel: "meta_paid",
        sourceConfidence: "high",
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "prospecting",
        utmContent: null,
        utmTerm: null,
        fbclid: "fbclid-1",
        fbc: null,
        fbp: null,
        gclid: null,
        gbraid: null,
        wbraid: null,
        ttclid: null,
        ttp: null,
        msclkid: null,
        bridgeSurface: "checkout",
        handoffId: "handoff-1",
        checkoutToken: null,
        checkoutKey: null,
        checkoutId: null,
        cartToken: null,
        formId: null,
        formSubmissionId: null,
        bookingId: null,
        bookingSlotId: null,
        leadExternalId: null,
        row: {},
        updatedAt: liveTs + 1000,
      });
      upsertWebEvent(db, {
        scopeId: "scope-1",
        sourceRecordId: "web:handoff:1",
        logicalRowId: "web:handoff:1",
        webInstallationId: "site-1",
        eventId: "evt-handoff",
        eventName: "handoff_confirmed",
        capturedAt: liveTs + 2000,
        sessionId: "sess-1",
        browserId: "browser-1",
        consentState: "granted",
        pageUrl: "https://example.com/moonspoon",
        pagePath: "/moonspoon",
        host: "example.com",
        referrer: null,
        eventSourceUrl: "https://example.com/moonspoon",
        sourceChannel: "meta_paid",
        sourceConfidence: "high",
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "prospecting",
        utmContent: null,
        utmTerm: null,
        fbclid: "fbclid-1",
        fbc: null,
        fbp: null,
        gclid: null,
        gbraid: null,
        wbraid: null,
        ttclid: null,
        ttp: null,
        msclkid: null,
        bridgeSurface: "checkout",
        handoffId: "handoff-1",
        checkoutToken: "chk-1",
        checkoutKey: null,
        checkoutId: null,
        cartToken: null,
        formId: null,
        formSubmissionId: null,
        bookingId: null,
        bookingSlotId: null,
        leadExternalId: null,
        row: {},
        updatedAt: liveTs + 2000,
      });

      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:1",
        sourceRecordId: "shopify:order:1",
        connectionId: "shopify-primary",
        backendEntityId: "order-1",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: liveTs + 3000,
        currency: "USD",
        grossValue: 229,
        netValue: 229,
        customerId: "cust-1",
        customerEmail: "a@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-1",
        cartToken: null,
        bridgeAttributes: {},
        row: {},
        updatedAt: liveTs + 3000,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:2",
        sourceRecordId: "shopify:order:2",
        connectionId: "shopify-primary",
        backendEntityId: "order-2",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: liveTs + 4000,
        currency: "USD",
        grossValue: 199,
        netValue: 199,
        customerId: "cust-2",
        customerEmail: "b@example.com",
        sessionId: null,
        checkoutToken: null,
        cartToken: null,
        bridgeAttributes: {},
        row: {},
        updatedAt: liveTs + 4000,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:compare",
        sourceRecordId: "shopify:order:compare",
        connectionId: "shopify-primary",
        backendEntityId: "order-compare",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: compareTs,
        currency: "USD",
        grossValue: 99,
        netValue: 99,
        customerId: "cust-3",
        customerEmail: "c@example.com",
        sessionId: "sess-compare",
        checkoutToken: "chk-compare",
        cartToken: null,
        bridgeAttributes: {},
        row: {},
        updatedAt: compareTs,
      });

      replaceOutcomeAttributions(db, "scope-1", [
        {
          scopeId: "scope-1",
          outcomeId: "order-1",
          sourceChannel: "meta_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "meta-ads",
          sessionId: "sess-1",
          evidence: {},
          unresolvedReason: null,
          updatedAt: liveTs + 3000,
        },
        {
          scopeId: "scope-1",
          outcomeId: "order-2",
          sourceChannel: "direct_or_unknown",
          sourceConfidence: "unknown",
          matchMethod: "no_match",
          paidPlatform: null,
          sessionId: null,
          evidence: {},
          unresolvedReason: "no_bridge_or_session_evidence",
          updatedAt: liveTs + 4000,
        },
        {
          scopeId: "scope-1",
          outcomeId: "order-compare",
          sourceChannel: "google_paid",
          sourceConfidence: "high",
          matchMethod: "session_match",
          paidPlatform: "google-ads",
          sessionId: "sess-compare",
          evidence: {},
          unresolvedReason: null,
          updatedAt: compareTs,
        },
      ]);

      const summary = readSummary(db, "scope-1", 7) as Record<string, unknown>;
      const totals = summary.totals as Record<string, unknown>;
      const kpis = summary.kpis as Record<string, Record<string, unknown>>;
      const strip = summary.attribution_strip as Record<string, unknown>;
      const activity = summary.latest_activity as Record<string, unknown>;
      const liveFunnel = summary.live_funnel as Record<string, unknown>;
      const topChannels = summary.top_channels as Array<Record<string, unknown>>;
      const channelGroups = summary.channel_groups as Array<Record<string, unknown>>;
      const sourceBreakdown = summary.source_breakdown as Array<Record<string, unknown>>;
      const sourceTrajectory = summary.source_trajectory as Array<Record<string, unknown>>;

      expect(totals).toMatchObject({
        spend: 170,
        clicks: 85,
        gross_revenue: 980,
      });
      expect((summary.compare_totals as Record<string, unknown>).spend).toBe(60);
      expect(kpis.spend?.value).toBe(170);
      expect(kpis.spend?.previous).toBe(60);
      expect(kpis.roas?.value).toBeCloseTo(980 / 170, 6);
      expect(kpis.match_rate?.value).toBeCloseTo(0.5, 6);
      expect(strip).toMatchObject({
        total_primary_outcomes: 2,
        resolved_primary_outcomes: 1,
        unresolved_primary_outcomes: 1,
        coverage_rate: 0.5,
      });
      expect(activity.latest_ad_fact_at).toBe(liveTs);
      expect(activity.last_handoff_confirmed_at).toBe(liveTs + 2000);
      expect(activity.latest_backend_outcome_at).toBe(liveTs + 4000);
      expect((liveFunnel.windows as Array<Record<string, unknown>>)[0]).toMatchObject({
        window: "15m",
        product_views: 1,
        cta_clicks: 1,
        handoff_confirmed: 1,
      });
      expect(topChannels).toHaveLength(2);
      expect(topChannels[0]).toMatchObject({
        source_channel: "meta_paid",
        spend: 120,
        gross_revenue: 720,
      });
      expect(topChannels[1]).toMatchObject({
        source_channel: "google_paid",
        spend: 50,
        gross_revenue: 260,
      });
      expect(channelGroups[0]).toMatchObject({
        channel_family: "paid",
      });
      expect(sourceBreakdown[0]).toMatchObject({
        source_channel: "meta_paid",
        channel_family: "paid",
      });
      expect(sourceTrajectory.some((row) => row.source_channel === "meta_paid")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("builds a primary-outcome ledger with review filters and scope-correct inspector reads", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);
    const now = Date.now();

    try {
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:1001",
        sourceRecordId: "shopify:order:1001",
        connectionId: "shopify-primary",
        backendEntityId: "order-1001",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: now - 1000,
        currency: "USD",
        grossValue: 229,
        netValue: 229,
        customerId: "cust-1",
        customerEmail: "a@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-1",
        cartToken: "cart-1",
        bridgeAttributes: {},
        row: { order_number: "#1001", name: "#1001" },
        updatedAt: now - 1000,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "line_item:1001:1",
        sourceRecordId: "shopify:line_item:1001:1",
        connectionId: "shopify-primary",
        backendEntityId: "order-1001",
        outcomeType: "line_item",
        outcomeStatus: null,
        occurredAt: now - 900,
        currency: "USD",
        grossValue: 229,
        netValue: 229,
        customerId: "cust-1",
        customerEmail: "a@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-1",
        cartToken: "cart-1",
        bridgeAttributes: {},
        row: { title: "MoonSpoon" },
        updatedAt: now - 900,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:1002",
        sourceRecordId: "shopify:order:1002",
        connectionId: "shopify-primary",
        backendEntityId: "order-1002",
        outcomeType: "order",
        outcomeStatus: "pending",
        occurredAt: now - 800,
        currency: "USD",
        grossValue: 0,
        netValue: 0,
        customerId: "cust-2",
        customerEmail: "b@example.com",
        sessionId: null,
        checkoutToken: null,
        cartToken: null,
        bridgeAttributes: {},
        row: { order_number: "#1002", name: "#1002" },
        updatedAt: now - 800,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:1003",
        sourceRecordId: "shopify:order:1003",
        connectionId: "shopify-primary",
        backendEntityId: "order-1003",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: now - 700,
        currency: "USD",
        grossValue: 199,
        netValue: 199,
        customerId: "cust-3",
        customerEmail: "c@example.com",
        sessionId: "sess-3",
        checkoutToken: "chk-3",
        cartToken: "cart-3",
        bridgeAttributes: {},
        row: { order_number: "#1003", name: "#1003" },
        updatedAt: now - 700,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "customer:2001",
        sourceRecordId: "shopify:customer:2001",
        connectionId: "shopify-primary",
        backendEntityId: "customer-2001",
        outcomeType: "customer",
        outcomeStatus: "created",
        occurredAt: now - 600,
        currency: null,
        grossValue: 0,
        netValue: 0,
        customerId: "customer-2001",
        customerEmail: "noise@example.com",
        sessionId: null,
        checkoutToken: null,
        cartToken: null,
        bridgeAttributes: {},
        row: { display_name: "Noise Customer" },
        updatedAt: now - 600,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-2",
        platform: "shopify",
        logicalRowId: "order:1001",
        sourceRecordId: "shopify:order:1001:scope-2",
        connectionId: "shopify-secondary",
        backendEntityId: "order-1001",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: now - 500,
        currency: "USD",
        grossValue: 999,
        netValue: 999,
        customerId: "cust-other",
        customerEmail: "other@example.com",
        sessionId: "sess-other",
        checkoutToken: "chk-other",
        cartToken: "cart-other",
        bridgeAttributes: {},
        row: { order_number: "#other" },
        updatedAt: now - 500,
      });

      replaceOutcomeAttributions(db, "scope-1", [
        {
          scopeId: "scope-1",
          outcomeId: "order-1001",
          sourceChannel: "google_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "google-ads",
          sessionId: "sess-1",
          evidence: { gclid: "gclid-1", session_id: "sess-1" },
          unresolvedReason: null,
          updatedAt: now - 400,
        },
        {
          scopeId: "scope-1",
          outcomeId: "order-1002",
          sourceChannel: "direct_or_unknown",
          sourceConfidence: "unknown",
          matchMethod: "unresolved",
          paidPlatform: null,
          sessionId: null,
          evidence: {},
          unresolvedReason: "no_bridge_or_session_evidence",
          updatedAt: now - 300,
        },
        {
          scopeId: "scope-1",
          outcomeId: "order-1003",
          sourceChannel: "google_paid",
          sourceConfidence: "medium",
          matchMethod: "session_match",
          paidPlatform: "google-ads",
          sessionId: "sess-3",
          evidence: { utm_source: "google", utm_medium: "paid_search", session_id: "sess-3" },
          unresolvedReason: null,
          updatedAt: now - 200,
        },
      ]);
      replaceOutcomeAttributions(db, "scope-2", [
        {
          scopeId: "scope-2",
          outcomeId: "order-1001",
          sourceChannel: "meta_paid",
          sourceConfidence: "high",
          matchMethod: "bridge_match",
          paidPlatform: "meta-ads",
          sessionId: "sess-other",
          evidence: { fbclid: "fbclid-1", session_id: "sess-other" },
          unresolvedReason: null,
          updatedAt: now - 100,
        },
      ]);

      const ledger = listLedgerOutcomes(db, {
        scopeId: "scope-1",
        days: 30,
        limit: 20,
        offset: 0,
      });
      expect(ledger.total).toBe(3);
      expect(ledger.rows).toHaveLength(3);
      expect(ledger.rows.map((row) => row.backendEntityId)).toEqual([
        "order-1003",
        "order-1002",
        "order-1001",
      ]);
      expect(ledger.rows[2]).toMatchObject({
        backendEntityId: "order-1001",
        outcomeType: "order",
        rowCount: 2,
        paid: true,
        exactPaidId: true,
        utmOnly: false,
        unresolved: false,
        needsReview: false,
      });
      expect(ledger.summary).toMatchObject({
        totalPrimaryOutcomes: 3,
        resolvedPrimaryOutcomes: 2,
        unresolvedPrimaryOutcomes: 1,
        reviewPrimaryOutcomes: 2,
        weakMatchPrimaryOutcomes: 0,
        paidPrimaryOutcomes: 2,
        exactPaidIdPrimaryOutcomes: 1,
        utmOnlyPrimaryOutcomes: 1,
      });

      const reviewOnly = listLedgerOutcomes(db, {
        scopeId: "scope-1",
        days: 30,
        reviewOnly: true,
      });
      expect(reviewOnly.rows.map((row) => row.backendEntityId)).toEqual(["order-1003", "order-1002"]);

      const exactPaidOnly = listLedgerOutcomes(db, {
        scopeId: "scope-1",
        days: 30,
        exactPaidIdOnly: true,
      });
      expect(exactPaidOnly.rows.map((row) => row.backendEntityId)).toEqual(["order-1001"]);

      const utmOnly = listLedgerOutcomes(db, {
        scopeId: "scope-1",
        days: 30,
        utmOnly: true,
      });
      expect(utmOnly.rows.map((row) => row.backendEntityId)).toEqual(["order-1003"]);

      const summary = readLedgerSummary(db, {
        scopeId: "scope-1",
        days: 30,
      });
      expect(summary.summary.reviewPrimaryOutcomes).toBe(2);

      const scopedOutcome = getLedgerOutcome(db, {
        scopeId: "scope-1",
        outcomeId: "order-1001",
      });
      expect(scopedOutcome).toMatchObject({
        scopeId: "scope-1",
        backendEntityId: "order-1001",
        customerEmail: "a@example.com",
        grossValue: 229,
      });
    } finally {
      db.close();
    }
  });

  it("keeps landing-site backfills reviewable and ignores device cookies as exact paid ids", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);
    const now = Date.now();

    try {
      upsertScope(db, {
        scopeId: "scope-1",
        label: "Moon One",
      });

      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:landing-1",
        sourceRecordId: "shopify:order:landing-1",
        connectionId: "shopify-main",
        backendEntityId: "order-landing-1",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: now - 2000,
        currency: "USD",
        grossValue: 199,
        netValue: 199,
        customerId: "cust-landing",
        customerEmail: "landing@example.com",
        sessionId: null,
        checkoutToken: null,
        cartToken: null,
        bridgeAttributes: {},
        row: { order_number: "#landing" },
        updatedAt: now - 2000,
      });

      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order:session-1",
        sourceRecordId: "shopify:order:session-1",
        connectionId: "shopify-main",
        backendEntityId: "order-session-1",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: now - 1000,
        currency: "USD",
        grossValue: 149,
        netValue: 149,
        customerId: "cust-session",
        customerEmail: "session@example.com",
        sessionId: "sess-cookie",
        checkoutToken: null,
        cartToken: null,
        bridgeAttributes: {},
        row: { order_number: "#session" },
        updatedAt: now - 1000,
      });

      replaceOutcomeAttributions(db, "scope-1", [
        {
          scopeId: "scope-1",
          outcomeId: "order-landing-1",
          sourceChannel: "search_paid",
          sourceConfidence: "high",
          matchMethod: "landing_site_params",
          paidPlatform: "google-ads",
          sessionId: null,
          evidence: {
            gclid: "gclid-landing-1",
            utm_source: "google",
            utm_medium: "paid_search",
            landing_site: "/cart/c/cart-1?gclid=gclid-landing-1&utm_source=google&utm_medium=paid_search",
          },
          unresolvedReason: null,
          updatedAt: now - 900,
        },
        {
          scopeId: "scope-1",
          outcomeId: "order-session-1",
          sourceChannel: "meta_paid",
          sourceConfidence: "high",
          matchMethod: "session_match",
          paidPlatform: "meta-ads",
          sessionId: "sess-cookie",
          evidence: {
            fbp: "fb.1.123456",
            session_id: "sess-cookie",
          },
          unresolvedReason: null,
          updatedAt: now - 800,
        },
      ]);

      const ledger = listLedgerOutcomes(db, {
        scopeId: "scope-1",
        days: 30,
        limit: 20,
        offset: 0,
      });

      const landingRow = ledger.rows.find((row) => row.backendEntityId === "order-landing-1");
      expect(landingRow).toMatchObject({
        exactPaidId: true,
        weakMatch: true,
        needsReview: true,
        utmOnly: false,
      });

      const sessionRow = ledger.rows.find((row) => row.backendEntityId === "order-session-1");
      expect(sessionRow).toMatchObject({
        exactPaidId: false,
        weakMatch: true,
        needsReview: true,
      });

      expect(ledger.summary).toMatchObject({
        totalPrimaryOutcomes: 2,
        reviewPrimaryOutcomes: 2,
        weakMatchPrimaryOutcomes: 2,
        exactPaidIdPrimaryOutcomes: 1,
      });
    } finally {
      db.close();
    }
  });

  it("builds live funnel windows and latest activity from recent website events", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);
    const now = Date.now();

    try {
      replaceDailyFunnelMarts(db, "scope-1", [
        {
          scopeId: "scope-1",
          date: isoDay(startOfDayMs(now)),
          sourceChannel: "meta_paid",
          sessions: 12,
          pageViews: 18,
          contentViews: 0,
          ctaClicks: 6,
          handoffStarts: 4,
          handoffConfirmed: 3,
          productViews: 11,
          cartAdds: 0,
          checkoutStarts: 0,
          checkoutCompletes: 0,
          formStarts: 0,
          formSubmits: 0,
          bookingsCompleted: 0,
          outcomes: 2,
          grossRevenue: 458,
        },
      ]);

      upsertWebEvent(db, {
        scopeId: "scope-1",
        webInstallationId: "site-1",
        logicalRowId: "evt-1",
        sourceRecordId: "web:evt-1",
        eventId: "evt-1",
        eventName: "product_view",
        capturedAt: now - 10 * 60 * 1000,
        sessionId: "sess-1",
        browserId: "browser-1",
        consentState: "granted",
        pageUrl: "https://example.com",
        pagePath: "/",
        host: "example.com",
        referrer: null,
        eventSourceUrl: "https://example.com",
        sourceChannel: "meta_paid",
        sourceConfidence: "high",
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "launch",
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
        bridgeSurface: null,
        handoffId: null,
        checkoutToken: null,
        checkoutKey: null,
        checkoutId: null,
        cartToken: null,
        formId: null,
        formSubmissionId: null,
        bookingId: null,
        bookingSlotId: null,
        leadExternalId: null,
        row: {},
        updatedAt: now - 10 * 60 * 1000,
      });
      upsertWebEvent(db, {
        scopeId: "scope-1",
        webInstallationId: "site-1",
        logicalRowId: "evt-2",
        sourceRecordId: "web:evt-2",
        eventId: "evt-2",
        eventName: "cta_click",
        capturedAt: now - 8 * 60 * 1000,
        sessionId: "sess-1",
        browserId: "browser-1",
        consentState: "granted",
        pageUrl: "https://example.com",
        pagePath: "/",
        host: "example.com",
        referrer: null,
        eventSourceUrl: "https://example.com",
        sourceChannel: "meta_paid",
        sourceConfidence: "high",
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "launch",
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
        bridgeSurface: null,
        handoffId: null,
        checkoutToken: null,
        checkoutKey: null,
        checkoutId: null,
        cartToken: null,
        formId: null,
        formSubmissionId: null,
        bookingId: null,
        bookingSlotId: null,
        leadExternalId: null,
        row: {},
        updatedAt: now - 8 * 60 * 1000,
      });
      upsertWebEvent(db, {
        scopeId: "scope-1",
        webInstallationId: "site-1",
        logicalRowId: "evt-3",
        sourceRecordId: "web:evt-3",
        eventId: "evt-3",
        eventName: "handoff_start",
        capturedAt: now - 6 * 60 * 1000,
        sessionId: "sess-1",
        browserId: "browser-1",
        consentState: "granted",
        pageUrl: "https://example.com",
        pagePath: "/",
        host: "example.com",
        referrer: null,
        eventSourceUrl: "https://example.com",
        sourceChannel: "meta_paid",
        sourceConfidence: "high",
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "launch",
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
        bridgeSurface: null,
        handoffId: null,
        checkoutToken: null,
        checkoutKey: null,
        checkoutId: null,
        cartToken: null,
        formId: null,
        formSubmissionId: null,
        bookingId: null,
        bookingSlotId: null,
        leadExternalId: null,
        row: {},
        updatedAt: now - 6 * 60 * 1000,
      });
      upsertBusinessOutcome(db, {
        scopeId: "scope-1",
        platform: "shopify",
        logicalRowId: "order-live-1",
        sourceRecordId: "order-live-1",
        connectionId: "shopify-primary",
        backendEntityId: "order-live-1",
        outcomeType: "order",
        outcomeStatus: "paid",
        occurredAt: now - 4 * 60 * 1000,
        currency: "USD",
        grossValue: 229,
        netValue: 180,
        customerId: "customer-live-1",
        customerEmail: "customer-live-1@example.com",
        sessionId: "sess-1",
        checkoutToken: "chk-live-1",
        cartToken: "cart-live-1",
        bridgeAttributes: {},
        row: { id: "order-live-1" },
        updatedAt: now - 4 * 60 * 1000,
      });

      const funnel = readFunnel(db, "scope-1", 1) as {
        live_funnel: {
          status: string;
          windows: Array<Record<string, unknown>>;
          latest: Record<string, unknown>;
        };
      };

      expect(funnel.live_funnel.status).toBe("ok");
      expect(funnel.live_funnel.windows[0]).toMatchObject({
        window: "15m",
        product_views: 1,
        cta_clicks: 1,
        handoff_starts: 1,
        handoff_confirmed: 0,
        outcomes: 1,
      });
      expect(typeof funnel.live_funnel.latest.last_event_at).toBe("number");
      expect(typeof funnel.live_funnel.latest.last_outcome_at).toBe("number");
    } finally {
      db.close();
    }
  });

  it("deletes one binding by binding id without disturbing the others", () => {
    const dataDir = createTempDataDir();
    const db = openAttributionDb(dataDir);

    try {
      upsertScope(db, {
        scopeId: "scope-1",
        label: "Scope 1",
      });

      const websiteBinding = upsertBinding(db, {
        scopeId: "scope-1",
        role: "website",
        sourceType: "adapter_connection",
        connectionId: "web-journey-primary",
        platform: "web-journey",
        label: "Website",
        metadata: { web_installation_id: "site-1" },
      });
      const backendBinding = upsertBinding(db, {
        scopeId: "scope-1",
        role: "backend",
        sourceType: "adapter_connection",
        connectionId: "shopify-primary",
        platform: "shopify",
        label: "Backend",
        metadata: {},
      });

      const deleted = deleteBinding(db, websiteBinding.bindingId);
      expect(deleted?.bindingId).toBe(websiteBinding.bindingId);
      expect(deleteBinding(db, websiteBinding.bindingId)).toBeNull();

      const remaining = listBindings(db, { scopeId: "scope-1" });
      expect(remaining.map((binding) => binding.bindingId)).toEqual([
        backendBinding.bindingId,
      ]);
    } finally {
      db.close();
    }
  });

  it("migrates a legacy v1 database even when the old index names already exist", () => {
    const dataDir = createTempDataDir();
    createLegacyV1Db(dataDir);

    const db = openAttributionDb(dataDir);
    try {
      const userVersion = db.prepare("PRAGMA user_version").get() as { user_version: number };
      expect(userVersion.user_version).toBe(2);
      const indexNames = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'attribution_bindings' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      expect(indexNames.map((row) => row.name)).toContain("idx_attribution_bindings_scope_role");
      expect(indexNames.map((row) => row.name)).toContain("idx_attribution_bindings_connection");
    } finally {
      db.close();
    }
  });
});
