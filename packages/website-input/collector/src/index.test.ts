import { describe, expect, it, vi } from "vitest";
import {
  acceptWebsiteEventBatch,
  buildWebsiteRecordIngestEnvelope,
  validateCollectorBatch,
} from "./index.js";

const event = {
  event_id: "evt_123",
  captured_at: "2026-03-31T10:00:00.000Z",
  event_name: "cta_click",
  consent_state: "granted",
  session_id: "session-1",
  page_url: "https://example.com/landing",
  page_path: "/landing",
  host: "example.com",
  browser_id: "browser-1",
  surface_id: "hero-primary",
  surface_label: "Book consult",
};

describe("website-input-collector", () => {
  it("validates and accepts a canonical collector batch", async () => {
    const ingest = vi.fn(async () => undefined);
    const accepted = await acceptWebsiteEventBatch(
      {
        website_installation_id: "site-1",
        events: [event],
      },
      {
        now: () => new Date("2026-03-31T12:00:00.000Z"),
        ingest,
      },
    );

    expect(accepted[0]).toMatchObject({
      website_installation_id: "site-1",
      dedupe_key: "site-1:evt_123",
      event,
    });
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it("maps a website event into canonical record.ingest envelope shape", () => {
    const envelope = buildWebsiteRecordIngestEnvelope(event, "site-1");
    expect(envelope).toMatchObject({
      routing: {
        adapter: "website-input",
        platform: "website-input",
        connection_id: "site-1",
        sender_id: "browser-1",
        thread_id: "session-1",
      },
      payload: {
        external_record_id: "site-1:evt_123",
        content: "Book consult",
      },
    });
  });

  it("rejects invalid batches", () => {
    const validated = validateCollectorBatch({
      website_installation_id: "site-1",
      events: [{ event_name: "bad_event" }],
    });
    expect(validated.ok).toBe(false);
  });
});
