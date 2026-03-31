const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_BROWSER_STORAGE_KEY = "website-input.browser_id";
const DEFAULT_SESSION_STORAGE_KEY = "website-input.session_id";
const DEFAULT_SESSION_STARTED_STORAGE_KEY = "website-input.session_started_at";
const DEFAULT_SESSION_ACTIVITY_STORAGE_KEY = "website-input.session_last_activity_at";

export const WEBSITE_INPUT_CONSENT_STATES = Object.freeze({
  granted: "granted",
  denied: "denied",
  unknown: "unknown",
});

export const WEBSITE_INPUT_EVENT_NAMES = Object.freeze({
  page_view: "page_view",
  content_view: "content_view",
  cta_click: "cta_click",
  handoff_start: "handoff_start",
  handoff_confirmed: "handoff_confirmed",
  handoff_unconfirmed: "handoff_unconfirmed",
  form_view: "form_view",
  form_start: "form_start",
  form_submit: "form_submit",
  booking_start: "booking_start",
  booking_complete: "booking_complete",
  product_view: "product_view",
  cart_add: "cart_add",
  checkout_start: "checkout_start",
  checkout_created: "checkout_created",
  checkout_complete: "checkout_complete",
});

function requireText(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function optionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRandomUUID(override) {
  if (typeof override === "function") {
    return override();
  }
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `wi-${stamp}`;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function readStorageValue(storage, key) {
  if (!storage || typeof storage.getItem !== "function") {
    return null;
  }
  const value = storage.getItem(key);
  return typeof value === "string" && value.trim() ? value : null;
}

function writeStorageValue(storage, key, value) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  storage.setItem(key, value);
}

function removeStorageValue(storage, key) {
  if (!storage || typeof storage.removeItem !== "function") {
    return;
  }
  storage.removeItem(key);
}

function readLocationSnapshot(input) {
  const location = input?.location ?? globalThis.location ?? null;
  const documentRef = input?.document ?? globalThis.document ?? null;
  const navigatorRef = input?.navigator ?? globalThis.navigator ?? null;
  const windowRef = input?.window ?? globalThis.window ?? null;

  const href = optionalText(location?.href) ?? null;
  const pathName = optionalText(location?.pathname) ?? (href ? new URL(href).pathname : null);
  const host = optionalText(location?.host) ?? (href ? new URL(href).host : null);
  const title = optionalText(documentRef?.title) ?? null;
  const referrer = optionalText(documentRef?.referrer) ?? null;
  const eventSourceUrl = href;
  const userAgent = optionalText(navigatorRef?.userAgent) ?? null;
  const viewportWidth = optionalFiniteNumber(windowRef?.innerWidth);
  const viewportHeight = optionalFiniteNumber(windowRef?.innerHeight);

  return {
    page_url: href,
    page_path: pathName,
    host,
    page_title: title,
    referrer,
    event_source_url: eventSourceUrl,
    user_agent: userAgent,
    viewport_width: viewportWidth,
    viewport_height: viewportHeight,
  };
}

function normalizeConsentState(value) {
  if (value === "granted" || value === "denied" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function normalizeEventName(value) {
  const eventName = optionalText(value);
  if (!eventName) {
    throw new Error("event_name is required");
  }
  if (!Object.prototype.hasOwnProperty.call(WEBSITE_INPUT_EVENT_NAMES, eventName)) {
    throw new Error(`unsupported event_name: ${eventName}`);
  }
  return eventName;
}

function normalizeBridge(bridge) {
  if (!bridge || typeof bridge !== "object" || Array.isArray(bridge)) {
    return null;
  }
  const source = bridge;
  return compactObject({
    bridge_surface: optionalText(source.bridge_surface),
    handoff_id: optionalText(source.handoff_id),
    checkout_token: optionalText(source.checkout_token),
    checkout_key: optionalText(source.checkout_key),
    checkout_id: optionalText(source.checkout_id),
    cart_token: optionalText(source.cart_token),
    form_id: optionalText(source.form_id),
    form_submission_id: optionalText(source.form_submission_id),
    booking_id: optionalText(source.booking_id),
    booking_slot_id: optionalText(source.booking_slot_id),
    lead_external_id: optionalText(source.lead_external_id),
  });
}

function normalizeDescriptor(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const source = input;
  return compactObject({
    surface_id: optionalText(source.surface_id),
    surface_label: optionalText(source.surface_label),
    surface_category: optionalText(source.surface_category),
    target_type: optionalText(source.target_type),
    target_id: optionalText(source.target_id),
    target_label: optionalText(source.target_label),
  });
}

function normalizeAttribution(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const source = input;
  return compactObject({
    utm_source: optionalText(source.utm_source),
    utm_medium: optionalText(source.utm_medium),
    utm_campaign: optionalText(source.utm_campaign),
    utm_content: optionalText(source.utm_content),
    utm_term: optionalText(source.utm_term),
    fbclid: optionalText(source.fbclid),
    fbc: optionalText(source.fbc),
    fbp: optionalText(source.fbp),
    gclid: optionalText(source.gclid),
    gbraid: optionalText(source.gbraid),
    wbraid: optionalText(source.wbraid),
    ttclid: optionalText(source.ttclid),
    ttp: optionalText(source.ttp),
    msclkid: optionalText(source.msclkid),
  });
}

function createBrowserId(options) {
  const consentState = normalizeConsentState(options.consent_state);
  if (consentState !== "granted") {
    return null;
  }
  const existing = readStorageValue(options.storage, options.browser_storage_key);
  if (existing) {
    return existing;
  }
  const browserId = getRandomUUID(options.randomUUID);
  writeStorageValue(options.storage, options.browser_storage_key, browserId);
  return browserId;
}

function createSessionState(options) {
  const now = options.now ?? (() => Date.now());
  const sessionStorage = options.sessionStorage;
  const sessionStorageKey = options.session_storage_key ?? DEFAULT_SESSION_STORAGE_KEY;
  const sessionStartedStorageKey =
    options.session_started_storage_key ?? DEFAULT_SESSION_STARTED_STORAGE_KEY;
  const sessionActivityStorageKey =
    options.session_activity_storage_key ?? DEFAULT_SESSION_ACTIVITY_STORAGE_KEY;
  const existingSessionId = readStorageValue(sessionStorage, sessionStorageKey);
  const storedStartedAt = readStorageValue(sessionStorage, sessionStartedStorageKey);
  const storedActivityAt = readStorageValue(sessionStorage, sessionActivityStorageKey);
  const parsedStartedAt =
    typeof storedStartedAt === "string" && storedStartedAt.trim()
      ? Number.parseInt(storedStartedAt, 10)
      : Number.NaN;
  const parsedActivityAt =
    typeof storedActivityAt === "string" && storedActivityAt.trim()
      ? Number.parseInt(storedActivityAt, 10)
      : Number.NaN;
  const existingStartedAt = Number.isFinite(parsedStartedAt)
    ? parsedStartedAt
    : typeof options.sessionStartedAt === "number"
      ? options.sessionStartedAt
      : null;
  const existingActivityAt = Number.isFinite(parsedActivityAt)
    ? parsedActivityAt
    : existingStartedAt;
  const currentTime = now();
  const sessionTimeoutMs =
    typeof options.session_timeout_ms === "number" && Number.isFinite(options.session_timeout_ms)
      ? options.session_timeout_ms
      : DEFAULT_SESSION_TIMEOUT_MS;

  if (existingSessionId) {
    const startedAt = existingStartedAt ?? currentTime;
    const lastActivityAt = existingActivityAt ?? startedAt;
    const expired = currentTime - lastActivityAt > sessionTimeoutMs;
    if (!expired) {
      return {
        session_id: existingSessionId,
        session_started_at: startedAt,
        session_last_activity_at: lastActivityAt,
      };
    }
  }

  const sessionId = getRandomUUID(options.randomUUID);
  writeStorageValue(sessionStorage, sessionStorageKey, sessionId);
  writeStorageValue(sessionStorage, sessionStartedStorageKey, String(currentTime));
  writeStorageValue(sessionStorage, sessionActivityStorageKey, String(currentTime));
  return {
    session_id: sessionId,
    session_started_at: currentTime,
    session_last_activity_at: currentTime,
  };
}

export function createWebsiteInputCore(options) {
  const websiteInstallationId = requireText(options.website_installation_id, "website_installation_id");
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const sessionTimeoutMs = typeof options.session_timeout_ms === "number" ? options.session_timeout_ms : DEFAULT_SESSION_TIMEOUT_MS;
  const browserStorageKey = options.browser_storage_key ?? DEFAULT_BROWSER_STORAGE_KEY;
  const sessionStorageKey = options.session_storage_key ?? DEFAULT_SESSION_STORAGE_KEY;
  const sessionStartedStorageKey =
    options.session_started_storage_key ?? DEFAULT_SESSION_STARTED_STORAGE_KEY;
  const sessionActivityStorageKey =
    options.session_activity_storage_key ?? DEFAULT_SESSION_ACTIVITY_STORAGE_KEY;
  let currentConsentState = normalizeConsentState(options.consent_state);
  let browserId = createBrowserId({
    consent_state: currentConsentState,
    storage: options.storage ?? globalThis.localStorage ?? null,
    browser_storage_key: browserStorageKey,
    randomUUID: options.randomUUID,
  });
  let sessionState = createSessionState({
    now,
    randomUUID: options.randomUUID,
    sessionStorage: options.sessionStorage ?? globalThis.sessionStorage ?? null,
    session_storage_key: sessionStorageKey,
    session_started_storage_key: sessionStartedStorageKey,
    session_timeout_ms: sessionTimeoutMs,
  });

  function persistSessionState() {
    writeStorageValue(
      options.sessionStorage ?? globalThis.sessionStorage ?? null,
      sessionStorageKey,
      sessionState.session_id,
    );
    writeStorageValue(
      options.sessionStorage ?? globalThis.sessionStorage ?? null,
      sessionStartedStorageKey,
      String(sessionState.session_started_at),
    );
    writeStorageValue(
      options.sessionStorage ?? globalThis.sessionStorage ?? null,
      sessionActivityStorageKey,
      String(sessionState.session_last_activity_at),
    );
  }

  function refreshSessionIfExpired(currentTime) {
    if (currentTime - sessionState.session_last_activity_at <= sessionTimeoutMs) {
      return;
    }
    sessionState = {
      session_id: getRandomUUID(options.randomUUID),
      session_started_at: currentTime,
      session_last_activity_at: currentTime,
    };
    persistSessionState();
  }

  function captureEvent(input) {
    const locationSnapshot = readLocationSnapshot(options);
    const consentState = normalizeConsentState(input?.consent_state ?? currentConsentState);
    const capturedAt = typeof input?.captured_at === "number" ? input.captured_at : now();
    refreshSessionIfExpired(capturedAt);
    const effectiveBrowserId = consentState === "granted" ? browserId : null;
    const eventName = normalizeEventName(input?.event_name);
    const normalizedBridge = normalizeBridge(input?.bridge);
    sessionState = {
      ...sessionState,
      session_last_activity_at: capturedAt,
    };
    persistSessionState();
    const event = compactObject({
      website_installation_id: websiteInstallationId,
      event_id: optionalText(input?.event_id) ?? getRandomUUID(options.randomUUID),
      captured_at: capturedAt,
      event_name: eventName,
      consent_state: consentState,
      browser_id: effectiveBrowserId,
      session_id: sessionState.session_id,
      page_url: optionalText(input?.page_url) ?? locationSnapshot.page_url,
      page_path: optionalText(input?.page_path) ?? locationSnapshot.page_path,
      host: optionalText(input?.host) ?? locationSnapshot.host,
      page_title: optionalText(input?.page_title) ?? locationSnapshot.page_title,
      referrer: optionalText(input?.referrer) ?? locationSnapshot.referrer,
      event_source_url: optionalText(input?.event_source_url) ?? locationSnapshot.event_source_url,
      user_agent: optionalText(input?.user_agent) ?? locationSnapshot.user_agent,
      viewport_width: optionalFiniteNumber(input?.viewport_width) ?? locationSnapshot.viewport_width,
      viewport_height: optionalFiniteNumber(input?.viewport_height) ?? locationSnapshot.viewport_height,
      ...normalizeAttribution(input),
      ...normalizeDescriptor(input),
      ...(normalizedBridge ?? {}),
      bridge: normalizedBridge,
      metadata: input?.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : undefined,
    });
    return event;
  }

  function rotateSession() {
    const rotatedAt = now();
    sessionState = {
      session_id: getRandomUUID(options.randomUUID),
      session_started_at: rotatedAt,
      session_last_activity_at: rotatedAt,
    };
    persistSessionState();
    return snapshot(currentConsentState);
  }

  function setConsentState(nextConsentState) {
    const consentState = normalizeConsentState(nextConsentState);
    currentConsentState = consentState;
    if (consentState === "granted" && !browserId) {
      browserId = createBrowserId({
        consent_state: consentState,
        storage: options.storage ?? globalThis.localStorage ?? null,
        browser_storage_key: browserStorageKey,
        randomUUID: options.randomUUID,
      });
    } else if (consentState !== "granted") {
      browserId = null;
      removeStorageValue(options.storage ?? globalThis.localStorage ?? null, browserStorageKey);
    }
    return snapshot(consentState);
  }

  function snapshot(consentState = currentConsentState) {
    return {
      website_installation_id: websiteInstallationId,
      browser_id: consentState === "granted" ? browserId : null,
      session_id: sessionState.session_id,
      session_started_at: sessionState.session_started_at,
      session_last_activity_at: sessionState.session_last_activity_at,
      consent_state: consentState,
    };
  }

  function buildEventHelper(eventName) {
    return (input = {}) => captureEvent({ ...input, event_name: eventName });
  }

  return {
    website_installation_id: websiteInstallationId,
    get browser_id() {
      return browserId;
    },
    get session_id() {
      return sessionState.session_id;
    },
    get consent_state() {
      return currentConsentState;
    },
    snapshot,
    setConsentState,
    rotateSession,
    captureEvent,
    pageView: buildEventHelper("page_view"),
    contentView: buildEventHelper("content_view"),
    ctaClick: buildEventHelper("cta_click"),
    handoffStart: buildEventHelper("handoff_start"),
    handoffConfirmed: buildEventHelper("handoff_confirmed"),
    handoffUnconfirmed: buildEventHelper("handoff_unconfirmed"),
    formView: buildEventHelper("form_view"),
    formStart: buildEventHelper("form_start"),
    formSubmit: buildEventHelper("form_submit"),
    bookingStart: buildEventHelper("booking_start"),
    bookingComplete: buildEventHelper("booking_complete"),
    productView: buildEventHelper("product_view"),
    cartAdd: buildEventHelper("cart_add"),
    checkoutStart: buildEventHelper("checkout_start"),
    checkoutCreated: buildEventHelper("checkout_created"),
    checkoutComplete: buildEventHelper("checkout_complete"),
  };
}
