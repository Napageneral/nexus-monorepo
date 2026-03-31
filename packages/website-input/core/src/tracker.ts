import {
  captureAttributionSnapshot,
} from "./evidence.js";
import {
  createBrowserId,
  createSessionId,
  getOrCreateStoredId,
  storageKey,
} from "./ids.js";
import type {
  BrowserEnvironment,
  BrowserTrackerConfig,
  CanonicalEventName,
  CollectorBatchRequest,
  ConsentState,
  TrackEventInput,
  WebsiteEvent,
  WebsiteInputSender,
} from "./types.js";

function resolveEnvironment(explicit?: BrowserEnvironment): BrowserEnvironment {
  if (explicit) {
    return explicit;
  }
  if (typeof window === "undefined" || typeof location === "undefined") {
    throw new Error("browser environment is required");
  }
  return {
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    location: window.location,
    document: typeof document === "undefined" ? undefined : document,
    navigator: typeof navigator === "undefined" ? undefined : navigator,
    fetch: typeof fetch === "function" ? fetch : undefined,
    innerWidth: typeof window.innerWidth === "number" ? window.innerWidth : undefined,
    innerHeight: typeof window.innerHeight === "number" ? window.innerHeight : undefined,
  };
}

function resolveConsentState(value: BrowserTrackerConfig["consentState"]): ConsentState {
  if (typeof value === "function") {
    return value();
  }
  return value ?? "unknown";
}

function createDefaultSender(
  env: BrowserEnvironment,
  collectorUrl: string,
): WebsiteInputSender {
  return {
    async send(batch: CollectorBatchRequest): Promise<void> {
      const body = JSON.stringify(batch);
      const sendBeacon = env.navigator?.sendBeacon;
      if (sendBeacon) {
        sendBeacon(collectorUrl, body);
        return;
      }
      if (!env.fetch) {
        throw new Error("fetch is unavailable and navigator.sendBeacon is not supported");
      }
      await env.fetch(collectorUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body,
        keepalive: true,
      });
    },
  };
}

function defaultEventContent(input: TrackEventInput): Record<string, unknown> | undefined {
  return input.metadata_json;
}

function eventId(now: Date, randomId?: () => string): string {
  const suffix = randomId ? randomId() : Math.random().toString(36).slice(2, 10);
  return `evt_${now.getTime()}_${suffix}`;
}

export class BrowserWebsiteInputTracker {
  private readonly config: BrowserTrackerConfig;
  private readonly env: BrowserEnvironment;
  private readonly sender: WebsiteInputSender;

  constructor(config: BrowserTrackerConfig) {
    this.config = config;
    this.env = resolveEnvironment(config.environment);
    this.sender = config.sender ?? createDefaultSender(this.env, config.collectorUrl);
  }

  getBrowserId(): string | null {
    const consentState = resolveConsentState(this.config.consentState);
    if (consentState !== "granted") {
      return null;
    }
    return getOrCreateStoredId(
      this.env.localStorage,
      storageKey(this.config.storagePrefix, "browser_id"),
      () => createBrowserId((this.config.now ?? (() => new Date()))(), this.config.randomId),
    );
  }

  getSessionId(): string {
    return getOrCreateStoredId(
      this.env.sessionStorage,
      storageKey(this.config.storagePrefix, "session_id"),
      () => createSessionId((this.config.now ?? (() => new Date()))(), this.config.randomId),
    );
  }

  async track(input: TrackEventInput): Promise<WebsiteEvent> {
    const now = (this.config.now ?? (() => new Date()))();
    const consentState = resolveConsentState(this.config.consentState);
    const snapshot = captureAttributionSnapshot(
      this.env,
      consentState,
      now,
      this.config.storagePrefix,
    );
    const browserId = this.getBrowserId();
    const sessionId = this.getSessionId();
    const pageUrl = this.env.location.href;
    const event: WebsiteEvent = {
      event_id: eventId(now, this.config.randomId),
      captured_at: now.toISOString(),
      event_name: input.event_name,
      consent_state: consentState,
      session_id: sessionId,
      page_url: pageUrl,
      page_path: this.env.location.pathname + (this.env.location.search || ""),
      host: this.env.location.host,
      browser_id: browserId,
      referrer: this.env.document?.referrer?.trim() || snapshot.referrer,
      event_source_url: snapshot.event_source_url || pageUrl,
      page_title: this.env.document?.title?.trim() || undefined,
      user_agent: this.env.navigator?.userAgent?.trim() || undefined,
      viewport_width: this.env.innerWidth,
      viewport_height: this.env.innerHeight,
      utm_source: snapshot.utm_source,
      utm_medium: snapshot.utm_medium,
      utm_campaign: snapshot.utm_campaign,
      utm_content: snapshot.utm_content,
      utm_term: snapshot.utm_term,
      fbclid: snapshot.fbclid,
      fbc: snapshot.fbc,
      fbp: snapshot.fbp,
      gclid: snapshot.gclid,
      gbraid: snapshot.gbraid,
      wbraid: snapshot.wbraid,
      ttclid: snapshot.ttclid,
      ttp: snapshot.ttp,
      msclkid: snapshot.msclkid,
      surface_id: input.surface_id,
      surface_label: input.surface_label,
      surface_category: input.surface_category,
      target_type: input.target_type,
      target_id: input.target_id,
      target_label: input.target_label,
      bridge_surface: input.bridge_surface,
      handoff_id: input.handoff_id,
      checkout_token: input.checkout_token,
      checkout_key: input.checkout_key,
      checkout_id: input.checkout_id,
      cart_token: input.cart_token,
      form_id: input.form_id,
      form_submission_id: input.form_submission_id,
      booking_id: input.booking_id,
      booking_slot_id: input.booking_slot_id,
      lead_external_id: input.lead_external_id,
      product_id: input.product_id,
      variant_id: input.variant_id,
      quantity: input.quantity,
      metadata_json: {
        ...(defaultEventContent(input) ?? {}),
        ...(this.config.deploymentVersion
          ? { deployment_version: this.config.deploymentVersion }
          : {}),
      },
    };

    await this.sender.send({
      website_installation_id: this.config.websiteInstallationId,
      events: [event],
    });
    return event;
  }

  trackPageView(input: Omit<TrackEventInput, "event_name"> = {}): Promise<WebsiteEvent> {
    return this.track({ ...input, event_name: "page_view" });
  }

  trackContentView(input: Omit<TrackEventInput, "event_name">): Promise<WebsiteEvent> {
    return this.track({ ...input, event_name: "content_view" });
  }

  trackCtaClick(input: Omit<TrackEventInput, "event_name">): Promise<WebsiteEvent> {
    return this.track({ ...input, event_name: "cta_click" });
  }

  trackHandoffStart(input: Omit<TrackEventInput, "event_name">): Promise<WebsiteEvent> {
    return this.track({ ...input, event_name: "handoff_start" });
  }

  trackHandoffConfirmed(input: Omit<TrackEventInput, "event_name">): Promise<WebsiteEvent> {
    return this.track({ ...input, event_name: "handoff_confirmed" });
  }

  trackHandoffUnconfirmed(input: Omit<TrackEventInput, "event_name">): Promise<WebsiteEvent> {
    return this.track({ ...input, event_name: "handoff_unconfirmed" });
  }
}

export function createBrowserWebsiteInputTracker(
  config: BrowserTrackerConfig,
): BrowserWebsiteInputTracker {
  return new BrowserWebsiteInputTracker(config);
}

export function isCanonicalEventName(value: string): value is CanonicalEventName {
  return [
    "page_view",
    "content_view",
    "cta_click",
    "handoff_start",
    "handoff_confirmed",
    "handoff_unconfirmed",
    "form_view",
    "form_start",
    "form_submit",
    "booking_start",
    "booking_complete",
    "product_view",
    "cart_add",
    "checkout_start",
    "checkout_created",
    "checkout_complete",
  ].includes(value);
}
