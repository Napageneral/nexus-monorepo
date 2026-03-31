import test from "node:test";
import assert from "node:assert/strict";
import { createWebsiteInputCore, WEBSITE_INPUT_EVENT_NAMES } from "./index.mjs";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test("website input core persists browser and session identity in granted mode", () => {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  const core = createWebsiteInputCore({
    website_installation_id: "install-123",
    consent_state: "granted",
    storage: localStorage,
    sessionStorage,
    location: { href: "https://example.com/pricing", pathname: "/pricing", host: "example.com" },
    document: { title: "Pricing", referrer: "https://google.com" },
    navigator: { userAgent: "Test Agent" },
    window: { innerWidth: 1280, innerHeight: 720 },
    randomUUID: () => "uuid-1",
    now: () => 1700000000000,
  });

  assert.equal(core.browser_id, "uuid-1");
  assert.equal(core.session_id, "uuid-1");

  const event = core.pageView({
    surface_id: "hero",
    surface_label: "Hero CTA",
    surface_category: "hero",
    target_type: "service",
    target_id: "consult",
    target_label: "Book consult",
  });

  assert.equal(event.website_installation_id, "install-123");
  assert.equal(event.browser_id, "uuid-1");
  assert.equal(event.session_id, "uuid-1");
  assert.equal(event.event_name, WEBSITE_INPUT_EVENT_NAMES.page_view);
  assert.equal(event.page_url, "https://example.com/pricing");
  assert.equal(event.page_path, "/pricing");
  assert.equal(event.host, "example.com");
  assert.equal(event.page_title, "Pricing");
  assert.equal(event.referrer, "https://google.com");
  assert.equal(event.user_agent, "Test Agent");
  assert.equal(event.viewport_width, 1280);
  assert.equal(event.viewport_height, 720);
  assert.equal(event.surface_id, "hero");
  assert.equal(event.target_label, "Book consult");
});

test("website input core degrades browser identity when consent is denied", () => {
  const core = createWebsiteInputCore({
    website_installation_id: "install-123",
    consent_state: "denied",
    randomUUID: () => "uuid-1",
  });

  const event = core.ctaClick({
    page_url: "https://example.com/",
    page_path: "/",
    host: "example.com",
  });

  assert.equal(event.browser_id, null);
  assert.equal(event.consent_state, "denied");
  assert.equal(event.event_name, "cta_click");
});

test("website input core rotates session and supports handoff bridge fields", () => {
  const sessionStorage = createMemoryStorage();
  const core = createWebsiteInputCore({
    website_installation_id: "install-123",
    consent_state: "granted",
    sessionStorage,
    randomUUID: (() => {
      const values = ["browser-1", "session-1", "session-2"];
      return () => values.shift();
    })(),
  });

  const before = core.snapshot();
  core.rotateSession();
  const after = core.snapshot();

  assert.equal(before.session_id, "session-1");
  assert.equal(after.session_id, "session-2");

  const bridgeEvent = core.handoffStart({
    page_url: "https://example.com/contact",
    page_path: "/contact",
    host: "example.com",
    bridge: {
      bridge_surface: "form",
      form_id: "contact-form",
      lead_external_id: "lead-77",
    },
  });

  assert.equal(bridgeEvent.bridge.bridge_surface, "form");
  assert.equal(bridgeEvent.bridge_surface, "form");
  assert.equal(bridgeEvent.bridge.form_id, "contact-form");
  assert.equal(bridgeEvent.form_id, "contact-form");
  assert.equal(bridgeEvent.bridge.lead_external_id, "lead-77");
});

test("website input core updates consent state for later events", () => {
  const localStorage = createMemoryStorage();
  const core = createWebsiteInputCore({
    website_installation_id: "install-123",
    consent_state: "unknown",
    storage: localStorage,
    randomUUID: () => "browser-1",
  });

  assert.equal(core.consent_state, "unknown");
  assert.equal(core.browser_id, null);

  core.setConsentState("granted");
  const event = core.contentView({
    page_url: "https://example.com/content",
    page_path: "/content",
    host: "example.com",
  });

  assert.equal(core.consent_state, "granted");
  assert.equal(core.browser_id, "browser-1");
  assert.equal(event.consent_state, "granted");
  assert.equal(event.browser_id, "browser-1");
});
