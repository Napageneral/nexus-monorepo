import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { processCanonicalRecord } from "./processor.js";
import {
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
  it("materializes website-input runtime website_event payloads into session funnel facts", () => {
    const dataDir = createTempDataDir();

    withAttributionDb(dataDir, (db) => {
      upsertScope(db, {
        scopeId: "moon-one",
        label: "Moon One",
      });
      upsertBinding(db, {
        scopeId: "moon-one",
        role: "website",
        sourceType: "website_installation",
        websiteInstallationId: "site-1",
        platform: "website-input",
        label: "Website",
      });
    });

    const result = processCanonicalRecord({
      dataDir,
      record: {
        record_id: "site-1:evt-1",
        platform: "website-input",
        timestamp: Date.parse("2026-03-31T10:00:00.000Z"),
        metadata: {
          website_installation_id: "site-1",
          event_id: "evt-1",
          event_name: "page_view",
          website_event: {
            websiteInstallationId: "site-1",
            eventId: "evt-1",
            eventName: "page_view",
            capturedAt: Date.parse("2026-03-31T10:00:00.000Z"),
            consentState: "granted",
            sessionId: "sess-1",
            browserId: "browser-1",
            pageUrl: "https://moon.test/",
            pagePath: "/",
            host: "moon.test",
            referrer: "https://www.google.com/",
            utmSource: "facebook",
            utmMedium: "paid_social",
            fbclid: "fbclid-1",
            checkoutToken: "chk-1",
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
        sourceType: "website_installation",
        websiteInstallationId: "site-1",
        platform: "website-input",
        label: "Website",
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
        record_id: "website-input:site-1:evt-1",
        platform: "website-input",
        timestamp: Date.parse("2026-03-31T10:00:00.000Z"),
        metadata: {
          logical_row_id: "evt-1",
          website_installation_id: "site-1",
          row: {
            event_id: "evt-1",
            website_installation_id: "site-1",
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
      expect(outcomes[0]?.attribution?.sourceChannel).toBe("google_paid");
      expect(outcomes[0]?.attribution?.matchMethod).toBe("bridge_match");
    });
  });
});
