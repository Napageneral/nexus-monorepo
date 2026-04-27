import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { processCanonicalRecord } from "./processor.js";
import {
  readSummary,
  listBusinessOutcomes,
  readFunnel,
  upsertBinding,
  upsertScope,
  withAttributionDb,
} from "../storage/store.js";

const tempDirs: string[] = [];

function createTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attribution-app-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("processCanonicalRecord", () => {
  it("materializes web-journey rows into session funnel facts", () => {
    const dataDir = createTempDataDir();

    withAttributionDb(dataDir, (db) => {
      upsertScope(db, {
        scopeId: "moon-one",
        label: "Moon One",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "website",
        sourceType: "adapter_connection",
        connectionId: "conn-web",
        platform: "web-journey",
        label: "Web Journey",
      });
    });

    const result = processCanonicalRecord({
      dataDir,
        record: {
          record_id: "site-1:evt-1",
          platform: "web-journey",
          receiver_contact_id: "conn-web",
          timestamp: Date.parse("2026-03-31T10:00:00.000Z"),
          metadata: {
            event_id: "evt-1",
            event_name: "page_view",
            connection_id: "conn-web",
            row: {
              web_installation_id: "site-1",
              event_id: "evt-1",
              event_name: "page_view",
              captured_at: Date.parse("2026-03-31T10:00:00.000Z"),
              consent_state: "granted",
              session_id: "sess-1",
              browser_id: "browser-1",
              page_url: "https://moon.test/",
              page_path: "/",
              host: "moon.test",
              referrer: "https://www.google.com/",
              utm_source: "facebook",
              utm_medium: "paid_social",
              fbclid: "fbclid-1",
              checkout_token: "chk-1",
            },
          },
        },
    });

    expect(result.ok).toBe(true);
    expect(result.processed_scopes).toBe(1);

    withAttributionDb(dataDir, (db) => {
      const funnel = readFunnel(db, "moon-one", 30);
      expect(Array.isArray(funnel.rows)).toBe(true);
      expect(funnel.rows).toHaveLength(1);
      expect(funnel.rows[0]?.source_channel).toBe("meta_paid");
      expect(funnel.rows[0]?.sessions).toBe(1);
      expect(funnel.rows[0]?.page_views).toBe(1);
    });
  });

  it("can persist raw website events without recomputing scope projections immediately", () => {
    const dataDir = createTempDataDir();

    withAttributionDb(dataDir, (db) => {
      upsertScope(db, {
        scopeId: "moon-one",
        label: "Moon One",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "website",
        sourceType: "adapter_connection",
        connectionId: "conn-web",
        platform: "web-journey",
        label: "Web Journey",
      });
    });

    const result = processCanonicalRecord({
      dataDir,
      recomputeScopes: false,
        record: {
          record_id: "site-1:evt-raw",
          platform: "web-journey",
          receiver_contact_id: "conn-web",
          timestamp: Date.parse("2026-03-31T10:00:00.000Z"),
          metadata: {
            connection_id: "conn-web",
            logical_row_id: "evt-raw",
            row: {
              web_installation_id: "site-1",
              event_id: "evt-raw",
              event_name: "page_view",
            captured_at: "2026-03-31T10:00:00.000Z",
            session_id: "sess-raw",
            utm_source: "google",
            utm_medium: "paid_search",
            gclid: "gclid-raw",
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.processed_scopes).toBe(1);
    expect(Array.isArray(result.scopes)).toBe(true);
    expect(result.scopes).toHaveLength(0);

    withAttributionDb(dataDir, (db) => {
      const funnel = readFunnel(db, "moon-one", 30);
      expect(Array.isArray(funnel.rows)).toBe(true);
      expect(funnel.rows).toHaveLength(0);
    });
  });

  it("materializes generic backend outcomes from non-shopify backend rows", () => {
    const dataDir = createTempDataDir();

    withAttributionDb(dataDir, (db) => {
      upsertScope(db, {
        scopeId: "moon-one",
        label: "Moon One",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "website",
        sourceType: "adapter_connection",
        connectionId: "conn-web",
        platform: "web-journey",
        label: "Web Journey",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "backend",
        sourceType: "adapter_connection",
        connectionId: "conn-emr",
        platform: "patient-now-emr",
        label: "PatientNow",
      });
    });

    processCanonicalRecord({
      dataDir,
        record: {
          record_id: "web-journey:site-1:evt-1",
          platform: "web-journey",
          receiver_contact_id: "conn-web",
          timestamp: Date.parse("2026-03-31T10:00:00.000Z"),
          metadata: {
            logical_row_id: "evt-1",
            connection_id: "conn-web",
            row: {
              event_id: "evt-1",
              web_installation_id: "site-1",
              event_name: "form_submit",
            captured_at: "2026-03-31T10:00:00.000Z",
            session_id: "sess-1",
            gclid: "gclid-1",
            form_submission_id: "form-1",
          },
        },
      },
    });

    const outcomeResult = processCanonicalRecord({
      dataDir,
      record: {
        record_id: "patient-now-emr:conn-emr:lead:lead-1:r1",
        platform: "patient-now-emr",
        receiver_id: "conn-emr",
        container_id: "lead",
        timestamp: Date.parse("2026-03-31T10:02:00.000Z"),
        metadata: {
          connection_id: "conn-emr",
          logical_row_id: "lead-1",
          row: {
            backend_entity_id: "lead-1",
            outcome_type: "lead",
            outcome_status: "qualified",
            occurred_at: "2026-03-31T10:02:00.000Z",
            gross_value: "125.50",
            currency: "USD",
            email: "patient@example.com",
          },
          bridge_attributes: {
            session_id: "sess-1",
            form_submission_id: "form-1",
            gclid: "gclid-1",
          },
        },
      },
    });

    expect(outcomeResult.ok).toBe(true);
    expect(outcomeResult.processed_scopes).toBe(1);

    withAttributionDb(dataDir, (db) => {
      const outcomes = listBusinessOutcomes(db, { scopeId: "moon-one", limit: 10 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.platform).toBe("patient-now-emr");
      expect(outcomes[0]?.backendEntityId).toBe("lead-1");
      expect(outcomes[0]?.outcomeType).toBe("lead");
      expect(outcomes[0]?.grossValue).toBe(125.5);
      expect(outcomes[0]?.attribution?.sourceChannel).toBe("search_paid");
      expect(outcomes[0]?.attribution?.matchMethod).toBe("bridge_form_submission");
    });
  });

  it("backfills source evidence from website URLs and keeps the earliest equal-confidence session source", () => {
    const dataDir = createTempDataDir();

    withAttributionDb(dataDir, (db) => {
      upsertScope(db, {
        scopeId: "moon-one",
        label: "Moon One",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "website",
        sourceType: "adapter_connection",
        connectionId: "conn-web",
        platform: "web-journey",
        label: "Web Journey",
      });
    });

    processCanonicalRecord({
      dataDir,
      recomputeScopes: false,
      record: {
        record_id: "site-1:evt-1",
        platform: "web-journey",
        receiver_contact_id: "conn-web",
        timestamp: Date.parse("2026-03-31T10:00:00.000Z"),
        metadata: {
          connection_id: "conn-web",
          row: {
            web_installation_id: "site-1",
            event_id: "evt-1",
            event_name: "product_view",
            captured_at: "2026-03-31T10:00:00.000Z",
            session_id: "sess-url",
            page_url: "https://moon.test/moonspoon?utm_source=tiktok&utm_medium=bio&utm_campaign=organic_social",
          },
        },
      },
    });

    processCanonicalRecord({
      dataDir,
      recomputeScopes: true,
      skipProcessedCheck: true,
      record: {
        record_id: "site-1:evt-2",
        platform: "web-journey",
        receiver_contact_id: "conn-web",
        timestamp: Date.parse("2026-03-31T10:05:00.000Z"),
        metadata: {
          connection_id: "conn-web",
          row: {
            web_installation_id: "site-1",
            event_id: "evt-2",
            event_name: "cta_click",
            captured_at: "2026-03-31T10:05:00.000Z",
            session_id: "sess-url",
            page_url: "https://moon.test/?utm_source=google&utm_medium=paid_search",
          },
        },
      },
    });

    withAttributionDb(dataDir, (db) => {
      const funnel = readFunnel(db, "moon-one", 30);
      expect(funnel.rows).toHaveLength(1);
      expect(funnel.rows[0]?.source_channel).toBe("tiktok_organic_social");
      expect(funnel.rows[0]?.product_views).toBe(1);
      expect(funnel.rows[0]?.cta_clicks).toBe(1);
    });
  });

  it("matches Shopify orders by landing-site checkout key and note attributes", () => {
    const dataDir = createTempDataDir();

    withAttributionDb(dataDir, (db) => {
      upsertScope(db, {
        scopeId: "moon-one",
        label: "Moon One",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "website",
        sourceType: "adapter_connection",
        connectionId: "conn-web",
        platform: "web-journey",
        label: "Web Journey",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "backend",
        sourceType: "adapter_connection",
        connectionId: "conn-shop",
        platform: "shopify",
        label: "Shopify",
      });
    });

    processCanonicalRecord({
      dataDir,
      record: {
        record_id: "site-1:evt-checkout",
        platform: "web-journey",
        receiver_contact_id: "conn-web",
        timestamp: Date.parse("2026-03-31T10:00:00.000Z"),
        metadata: {
          connection_id: "conn-web",
          row: {
            web_installation_id: "site-1",
            event_id: "evt-checkout",
            event_name: "checkout_created",
            captured_at: "2026-03-31T10:00:00.000Z",
            session_id: "sess-shop",
            checkout_key: "checkout-key-1",
            cart_token: "cart-1",
            page_url: "https://www.moonsleep.co/moonspoon?gclid=gclid-landing-1&utm_source=google&utm_medium=paid_search",
          },
        },
      },
    });

    const outcomeResult = processCanonicalRecord({
      dataDir,
      record: {
        record_id: "shopify:order:1",
        platform: "shopify",
        receiver_id: "conn-shop",
        container_id: "order",
        timestamp: Date.parse("2026-03-31T10:10:00.000Z"),
        metadata: {
          connection_id: "conn-shop",
          logical_row_id: "order-1",
          row: {
            order_id: "order-1",
            financial_status: "paid",
            processed_at: "2026-03-31T10:10:00.000Z",
            total_price: "229.00",
            currency: "USD",
            landing_site: "/cart/c/cart-1?channel=headless-storefronts&key=checkout-key-1",
            note_attributes: {
              ms_session_id: "sess-shop",
              ms_event_source_url:
                "https://www.moonsleep.co/moonspoon?gclid=gclid-landing-1&utm_source=google&utm_medium=paid_search",
            },
          },
        },
      },
    });

    expect(outcomeResult.ok).toBe(true);

    withAttributionDb(dataDir, (db) => {
      const outcomes = listBusinessOutcomes(db, { scopeId: "moon-one", limit: 10 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.attribution?.sourceChannel).toBe("search_paid");
      expect(outcomes[0]?.attribution?.matchMethod).toBe("bridge_cart_token");
      expect(outcomes[0]?.attribution?.sourceConfidence).toBe("high");
    });
  });

  it("builds paid summary totals from one canonical ad family per platform day", () => {
    const dataDir = createTempDataDir();

    withAttributionDb(dataDir, (db) => {
      upsertScope(db, {
        scopeId: "moon-one",
        label: "Moon One",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "acquisition",
        sourceType: "adapter_connection",
        connectionId: "conn-meta",
        platform: "meta-ads",
        label: "Meta",
      });
    });

    processCanonicalRecord({
      dataDir,
      recomputeScopes: false,
      record: {
        record_id: "meta:campaign:2026-03-31",
        platform: "meta-ads",
        receiver_id: "conn-meta",
        container_id: "campaign_daily",
        timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
        metadata: {
          logical_row_id: "campaign:2026-03-31",
          row: {
            date_start: "2026-03-31",
            campaign_id: "cmp-1",
            campaign_name: "Campaign",
          },
          derived: {
            spend: 10,
            impressions: 100,
            clicks: 20,
            landing_page_views: 5,
            purchases: 2,
            purchase_value: 50,
          },
        },
      },
    });

    processCanonicalRecord({
      dataDir,
      recomputeScopes: false,
      record: {
        record_id: "meta:adset:2026-03-31",
        platform: "meta-ads",
        receiver_id: "conn-meta",
        container_id: "adset_daily",
        timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
        metadata: {
          logical_row_id: "adset:2026-03-31",
          row: {
            date_start: "2026-03-31",
            campaign_id: "cmp-1",
            adset_id: "adset-1",
          },
          derived: {
            spend: 10,
            impressions: 100,
            clicks: 20,
            landing_page_views: 5,
            purchases: 2,
            purchase_value: 50,
          },
        },
      },
    });

    processCanonicalRecord({
      dataDir,
      recomputeScopes: false,
      record: {
        record_id: "meta:ad:2026-03-31",
        platform: "meta-ads",
        receiver_id: "conn-meta",
        container_id: "ad_daily",
        timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
        metadata: {
          logical_row_id: "ad:2026-03-31",
          row: {
            date_start: "2026-03-31",
            campaign_id: "cmp-1",
            adset_id: "adset-1",
            ad_id: "ad-1",
          },
          derived: {
            spend: 10,
            impressions: 100,
            clicks: 20,
            landing_page_views: 5,
            purchases: 2,
            purchase_value: 50,
          },
        },
      },
    });

    processCanonicalRecord({
      dataDir,
      recomputeScopes: false,
      record: {
        record_id: "meta:hour:2026-03-31T12",
        platform: "meta-ads",
        receiver_id: "conn-meta",
        container_id: "account_hourly",
        timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
        metadata: {
          logical_row_id: "hour:2026-03-31T12",
          row: {
            date_start: "2026-03-31",
            hour: "12",
          },
          derived: {
            spend: 10,
            impressions: 100,
            clicks: 20,
            landing_page_views: 5,
            purchases: 2,
            purchase_value: 50,
          },
        },
      },
    });

    processCanonicalRecord({
      dataDir,
      recomputeScopes: true,
      skipProcessedCheck: true,
      record: {
        record_id: "meta:campaign:2026-03-31",
        platform: "meta-ads",
        receiver_id: "conn-meta",
        container_id: "campaign_daily",
        timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
        metadata: {
          logical_row_id: "campaign:2026-03-31",
          row: {
            date_start: "2026-03-31",
            campaign_id: "cmp-1",
          },
          derived: {
            spend: 10,
            impressions: 100,
            clicks: 20,
            landing_page_views: 5,
            purchases: 2,
            purchase_value: 50,
          },
        },
      },
    });

    withAttributionDb(dataDir, (db) => {
      const summary = readSummary(db, "moon-one", 30);
      expect(summary.totals).toMatchObject({
        spend: 10,
        impressions: 100,
        clicks: 20,
        landing_page_views: 5,
        purchases: 2,
        purchase_value: 50,
      });
    });
  });
});
