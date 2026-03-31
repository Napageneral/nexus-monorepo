import { describe, expect, it, vi } from "vitest";
import { createBrowserWebsiteInputTracker } from "./index.js";
import type { BrowserEnvironment, CollectorBatchRequest, WebsiteInputSender } from "./types.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function makeEnvironment(): BrowserEnvironment {
  return {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    location: {
      href: "https://example.com/landing?utm_source=meta&fbclid=fb-123&gclid=g-123",
      pathname: "/landing",
      search: "?utm_source=meta&fbclid=fb-123&gclid=g-123",
      host: "example.com",
    },
    document: {
      referrer: "https://facebook.com/",
      title: "Landing Page",
      cookie: "_fbp=fbp-cookie; _ttp=ttp-cookie",
    },
    navigator: {
      userAgent: "Vitest Browser",
    },
    innerWidth: 1440,
    innerHeight: 900,
  };
}

describe("BrowserWebsiteInputTracker", () => {
  it("captures browser-plus-session identity and attribution evidence in standard mode", async () => {
    const sent: CollectorBatchRequest[] = [];
    const sender: WebsiteInputSender = {
      send(batch) {
        sent.push(batch);
      },
    };

    const tracker = createBrowserWebsiteInputTracker({
      websiteInstallationId: "site-123",
      collectorUrl: "https://collector.example.com/events",
      consentState: "granted",
      environment: makeEnvironment(),
      sender,
      now: () => new Date("2026-03-31T10:00:00.000Z"),
      randomId: () => "fixedid",
    });

    const event = await tracker.trackCtaClick({
      surface_id: "hero-primary",
      surface_label: "Book consult",
      surface_category: "hero",
      target_type: "booking",
      target_label: "Consult booking",
    });

    expect(event.browser_id).toBe("wb_1774951200000_fixedid");
    expect(event.session_id).toBe("ws_1774951200000_fixedid");
    expect(event.utm_source).toBe("meta");
    expect(event.fbclid).toBe("fb-123");
    expect(event.gclid).toBe("g-123");
    expect(event.fbp).toBe("fbp-cookie");
    expect(event.ttp).toBe("ttp-cookie");
    expect(event.event_name).toBe("cta_click");
    expect(sent[0]).toMatchObject({
      website_installation_id: "site-123",
      events: [
        {
          event_name: "cta_click",
          surface_id: "hero-primary",
        },
      ],
    });
  });

  it("uses degraded mode without a browser id or cookie-derived values", async () => {
    const sender = {
      send: vi.fn(),
    };
    const tracker = createBrowserWebsiteInputTracker({
      websiteInstallationId: "site-123",
      collectorUrl: "https://collector.example.com/events",
      consentState: "denied",
      environment: makeEnvironment(),
      sender,
      now: () => new Date("2026-03-31T10:00:00.000Z"),
      randomId: () => "fixedid",
    });

    const event = await tracker.trackPageView();

    expect(event.browser_id).toBeNull();
    expect(event.fbp).toBeUndefined();
    expect(event.ttp).toBeUndefined();
    expect(event.session_id).toBe("ws_1774951200000_fixedid");
  });
});
