import { randomUUID } from "node:crypto";
import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  deleteInstallation,
  findInstallationById,
  findInstallationBySenderEntityId,
  insertInstallation,
  insertToken,
  listInstallations,
  listTokens,
  openWebSignalsDb,
  type WebSignalsInstallationRecord,
  type WebSignalsTokenRecord,
  updateInstallation,
  updateTokenRevocation,
} from "./store.ts";

const WEB_SIGNALS_PLATFORM = "web-journey";
const WEB_SIGNALS_AUTH_METHOD_ID = "web_installation";
const WEB_SIGNALS_SENDER_SCOPES = [
  "core.apps.web-signals.web-journey.collect.write",
  "core.apps.web-signals.web-journey.collect.batch.write",
  "core.adapter.serve.admin",
  "core.adapter.serve.write",
] as const;

type RuntimeRow = Record<string, unknown>;

type WebJourneyEventRecord = {
  id: string;
  webInstallationId: string;
  eventId: string;
  capturedAt: number;
  receivedAt: number;
  consentState: "granted" | "denied" | "unknown";
  eventName: string;
  browserId: string | null;
  sessionId: string;
  pageUrl: string;
  pagePath: string;
  host: string;
  referrer: string | null;
  eventSourceUrl: string | null;
  pageTitle: string | null;
  userAgent: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  ttclid: string | null;
  ttp: string | null;
  msclkid: string | null;
  surfaceId: string | null;
  surfaceLabel: string | null;
  surfaceCategory: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  bridgeSurface: string | null;
  handoffId: string | null;
  checkoutToken: string | null;
  checkoutKey: string | null;
  checkoutId: string | null;
  cartToken: string | null;
  formId: string | null;
  formSubmissionId: string | null;
  bookingId: string | null;
  bookingSlotId: string | null;
  leadExternalId: string | null;
  metadata: RuntimeRow | null;
};

function asRecord(value: unknown): RuntimeRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as RuntimeRow;
}

function unwrapPayload(value: unknown): RuntimeRow {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  return Object.keys(payload).length > 0 ? payload : record;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function asOptionalTimestamp(value: unknown): number | null {
  const numeric = asOptionalNumber(value);
  if (numeric !== null) {
    return numeric;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }
  return null;
}

function asLimit(value: unknown, fallback = 100): number {
  const normalized = asOptionalNumber(value);
  return normalized ? Math.min(500, Math.max(1, normalized)) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireCurrentEntityId(ctx: Parameters<NexAppMethodHandler>[0]): string {
  const entityId = String(ctx.user.userId ?? "").trim();
  if (!entityId) {
    throw new Error("authenticated entity id is required");
  }
  return entityId;
}

function resolveAccountId(ctx: Parameters<NexAppMethodHandler>[0]): string {
  return String(ctx.account.accountId ?? ctx.user.accountId ?? "").trim() || "local";
}

async function resolveRuntimeBaseUrl(
  ctx: Parameters<NexAppMethodHandler>[0],
  override: unknown,
): Promise<string> {
  const explicit = asOptionalString(override);
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const config = unwrapPayload(await ctx.nex.config.get({}));
  const runtime = asRecord(config.runtime);
  const tls = asRecord(runtime.tls);
  const port = typeof runtime.port === "number" && Number.isFinite(runtime.port) ? runtime.port : 18789;
  return `${tls.enabled === true ? "https" : "http"}://127.0.0.1:${port}`;
}

function buildInstallationLabel(params: { accountId: string; label: string | null }): string {
  if (params.label) {
    return params.label;
  }
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `web-signals:${params.accountId}:${timestamp}`;
}

function buildSenderEntityName(params: {
  installationId: string;
  label: string | null;
  siteOrigin: string | null;
}): string {
  return ["web-signals", params.label, params.siteOrigin, params.installationId].filter(Boolean).join(":");
}

async function createSenderEntity(
  ctx: Parameters<NexAppMethodHandler>[0],
  params: {
    installationId: string;
    label: string | null;
    siteOrigin: string | null;
  },
): Promise<string> {
  const created = unwrapPayload(
    await ctx.nex.entities.create({
      name: buildSenderEntityName(params),
      type: "web_installation",
      origin: "web-signals",
      normalized: params.installationId,
    }),
  );
  return asNonEmptyString(asRecord(created.entity).id, "senderEntityId");
}

async function ensureWebJourneyConnection(
  ctx: Parameters<NexAppMethodHandler>[0],
  params: {
    installationId: string;
    siteOrigin: string | null;
    runtimeBaseUrl: string;
    label: string | null;
    existingConnectionId?: string | null;
  },
): Promise<{ connectionId: string; endpointId: string }> {
  const fields = { web_installation_id: params.installationId };
  const config = {
    web_installation_id: params.installationId,
    ...(params.siteOrigin ? { site_origin: params.siteOrigin } : {}),
    runtime_base_url: params.runtimeBaseUrl,
    ...(params.label ? { display_name: params.label } : {}),
  };

  const result = params.existingConnectionId
    ? unwrapPayload(
        await ctx.nex.adapters.connections.update({
          connectionId: params.existingConnectionId,
          adapter: WEB_SIGNALS_PLATFORM,
          authMethodId: WEB_SIGNALS_AUTH_METHOD_ID,
          fields,
          config,
        }),
      )
    : unwrapPayload(
        await ctx.nex.adapters.connections.create({
          adapter: WEB_SIGNALS_PLATFORM,
          authMethodId: WEB_SIGNALS_AUTH_METHOD_ID,
          fields,
          config,
        }),
      );

  const connectionId =
    asOptionalString(result.connectionId) ??
    asOptionalString(result.connection_id) ??
    params.existingConnectionId ??
    null;
  if (!connectionId) {
    throw new Error("web-journey connection did not return a connection id");
  }
  return { connectionId, endpointId: connectionId };
}

async function ensureWebJourneyServeReady(
  ctx: Parameters<NexAppMethodHandler>[0],
  installation: WebSignalsInstallationRecord,
): Promise<{ connectionId: string; endpointId: string }> {
  const connectionId = installation.webJourneyConnectionId?.trim();
  const endpointId = installation.webJourneyEndpointId?.trim();
  if (!connectionId || !endpointId) {
    throw new Error("web installation is missing its web-journey adapter binding");
  }
  await ctx.nex.adapter.serve.start({
    adapter: WEB_SIGNALS_PLATFORM,
    connection_id: connectionId,
  });
  return { connectionId, endpointId };
}

async function startWebJourneyServeSession(
  ctx: Parameters<NexAppMethodHandler>[0],
  connectionId: string,
): Promise<void> {
  await ctx.nex.adapter.serve.start({
    adapter: WEB_SIGNALS_PLATFORM,
    connection_id: connectionId,
  });
}

function installationView(record: WebSignalsInstallationRecord): Record<string, unknown> {
  return {
    web_installation_id: record.webInstallationId,
    account_id: record.accountId,
    label: record.label,
    site_origin: record.siteOrigin,
    web_journey_connection_id: record.webJourneyConnectionId,
    web_journey_endpoint_id: record.webJourneyEndpointId,
    status: record.status,
    sender_entity_id: record.senderEntityId,
    created_by_entity_id: record.createdByEntityId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    first_seen_at: record.firstSeenAt,
    last_seen_at: record.lastSeenAt,
    runtime_base_url: record.runtimeBaseUrl,
    current_token_id: record.currentTokenId,
    current_token_created_at: record.currentTokenCreatedAt,
    current_token_expires_at: record.currentTokenExpiresAt,
    current_token_revoked_at: record.currentTokenRevokedAt,
    current_token_label: record.currentTokenLabel,
    metadata: record.metadata,
  };
}

function tokenView(record: WebSignalsTokenRecord): Record<string, unknown> {
  return {
    id: record.id,
    web_installation_id: record.webInstallationId,
    token_id: record.tokenId,
    label: record.label,
    created_by_entity_id: record.createdByEntityId,
    created_at: record.createdAt,
    last_used_at: record.lastUsedAt,
    expires_at: record.expiresAt,
    revoked_at: record.revokedAt,
    metadata: record.metadata,
  };
}

function eventView(record: WebJourneyEventRecord): Record<string, unknown> {
  return {
    id: record.id,
    web_installation_id: record.webInstallationId,
    event_id: record.eventId,
    captured_at: record.capturedAt,
    received_at: record.receivedAt,
    consent_state: record.consentState,
    event_name: record.eventName,
    browser_id: record.browserId,
    session_id: record.sessionId,
    page_url: record.pageUrl,
    page_path: record.pagePath,
    host: record.host,
    referrer: record.referrer,
    event_source_url: record.eventSourceUrl,
    page_title: record.pageTitle,
    user_agent: record.userAgent,
    viewport_width: record.viewportWidth,
    viewport_height: record.viewportHeight,
    utm_source: record.utmSource,
    utm_medium: record.utmMedium,
    utm_campaign: record.utmCampaign,
    utm_content: record.utmContent,
    utm_term: record.utmTerm,
    fbclid: record.fbclid,
    fbc: record.fbc,
    fbp: record.fbp,
    gclid: record.gclid,
    gbraid: record.gbraid,
    wbraid: record.wbraid,
    ttclid: record.ttclid,
    ttp: record.ttp,
    msclkid: record.msclkid,
    surface_id: record.surfaceId,
    surface_label: record.surfaceLabel,
    surface_category: record.surfaceCategory,
    target_type: record.targetType,
    target_id: record.targetId,
    target_label: record.targetLabel,
    bridge_surface: record.bridgeSurface,
    handoff_id: record.handoffId,
    checkout_token: record.checkoutToken,
    checkout_key: record.checkoutKey,
    checkout_id: record.checkoutId,
    cart_token: record.cartToken,
    form_id: record.formId,
    form_submission_id: record.formSubmissionId,
    booking_id: record.bookingId,
    booking_slot_id: record.bookingSlotId,
    lead_external_id: record.leadExternalId,
    metadata: record.metadata,
  };
}

function readWebJourneyEventRow(value: unknown): WebJourneyEventRecord | null {
  const row = asRecord(value);
  const webInstallationId =
    asOptionalString(row.web_installation_id) ?? asOptionalString(row.webInstallationId);
  const eventId = asOptionalString(row.event_id) ?? asOptionalString(row.eventId);
  const eventName = asOptionalString(row.event_name) ?? asOptionalString(row.eventName);
  const sessionId = asOptionalString(row.session_id) ?? asOptionalString(row.sessionId);
  const pageUrl = asOptionalString(row.page_url) ?? asOptionalString(row.pageUrl);
  const pagePath = asOptionalString(row.page_path) ?? asOptionalString(row.pagePath);
  const host = asOptionalString(row.host);
  if (!webInstallationId || !eventId || !eventName || !sessionId || !pageUrl || !pagePath || !host) {
    return null;
  }
  const consentState =
    asOptionalString(row.consent_state) ?? asOptionalString(row.consentState) ?? "unknown";
  return {
    id:
      asOptionalString(row.id) ??
      `${webInstallationId}:${eventId}`,
    webInstallationId,
    eventId,
    capturedAt:
      asOptionalNumber(row.captured_at) ??
      asOptionalNumber(row.capturedAt) ??
      Date.now(),
    receivedAt:
      asOptionalNumber(row.received_at) ??
      asOptionalNumber(row.receivedAt) ??
      Date.now(),
    consentState:
      consentState === "granted" || consentState === "denied" || consentState === "unknown"
        ? consentState
        : "unknown",
    eventName,
    browserId: asOptionalString(row.browser_id) ?? asOptionalString(row.browserId),
    sessionId,
    pageUrl,
    pagePath,
    host,
    referrer: asOptionalString(row.referrer),
    eventSourceUrl: asOptionalString(row.event_source_url) ?? asOptionalString(row.eventSourceUrl),
    pageTitle: asOptionalString(row.page_title) ?? asOptionalString(row.pageTitle),
    userAgent: asOptionalString(row.user_agent) ?? asOptionalString(row.userAgent),
    viewportWidth: asOptionalNumber(row.viewport_width) ?? asOptionalNumber(row.viewportWidth),
    viewportHeight: asOptionalNumber(row.viewport_height) ?? asOptionalNumber(row.viewportHeight),
    utmSource: asOptionalString(row.utm_source) ?? asOptionalString(row.utmSource),
    utmMedium: asOptionalString(row.utm_medium) ?? asOptionalString(row.utmMedium),
    utmCampaign: asOptionalString(row.utm_campaign) ?? asOptionalString(row.utmCampaign),
    utmContent: asOptionalString(row.utm_content) ?? asOptionalString(row.utmContent),
    utmTerm: asOptionalString(row.utm_term) ?? asOptionalString(row.utmTerm),
    fbclid: asOptionalString(row.fbclid),
    fbc: asOptionalString(row.fbc),
    fbp: asOptionalString(row.fbp),
    gclid: asOptionalString(row.gclid),
    gbraid: asOptionalString(row.gbraid),
    wbraid: asOptionalString(row.wbraid),
    ttclid: asOptionalString(row.ttclid),
    ttp: asOptionalString(row.ttp),
    msclkid: asOptionalString(row.msclkid),
    surfaceId: asOptionalString(row.surface_id) ?? asOptionalString(row.surfaceId),
    surfaceLabel: asOptionalString(row.surface_label) ?? asOptionalString(row.surfaceLabel),
    surfaceCategory:
      asOptionalString(row.surface_category) ?? asOptionalString(row.surfaceCategory),
    targetType: asOptionalString(row.target_type) ?? asOptionalString(row.targetType),
    targetId: asOptionalString(row.target_id) ?? asOptionalString(row.targetId),
    targetLabel: asOptionalString(row.target_label) ?? asOptionalString(row.targetLabel),
    bridgeSurface:
      asOptionalString(row.bridge_surface) ?? asOptionalString(row.bridgeSurface),
    handoffId: asOptionalString(row.handoff_id) ?? asOptionalString(row.handoffId),
    checkoutToken:
      asOptionalString(row.checkout_token) ?? asOptionalString(row.checkoutToken),
    checkoutKey: asOptionalString(row.checkout_key) ?? asOptionalString(row.checkoutKey),
    checkoutId: asOptionalString(row.checkout_id) ?? asOptionalString(row.checkoutId),
    cartToken: asOptionalString(row.cart_token) ?? asOptionalString(row.cartToken),
    formId: asOptionalString(row.form_id) ?? asOptionalString(row.formId),
    formSubmissionId:
      asOptionalString(row.form_submission_id) ?? asOptionalString(row.formSubmissionId),
    bookingId: asOptionalString(row.booking_id) ?? asOptionalString(row.bookingId),
    bookingSlotId:
      asOptionalString(row.booking_slot_id) ?? asOptionalString(row.bookingSlotId),
    leadExternalId:
      asOptionalString(row.lead_external_id) ?? asOptionalString(row.leadExternalId),
    metadata: asRecord(row.metadata),
  };
}

function readRecordEvent(record: RuntimeRow): WebJourneyEventRecord | null {
  const metadata = asRecord(record.metadata);
  const event =
    readWebJourneyEventRow(metadata.web_event) ??
    readWebJourneyEventRow(metadata.row);
  if (!event) {
    return null;
  }
  return {
    ...event,
    id: asOptionalString(record.id) ?? event.id,
    capturedAt: asOptionalNumber(record.timestamp) ?? event.capturedAt,
    receivedAt: asOptionalNumber(record.received_at) ?? event.receivedAt,
  };
}

function buildEventSummary(event: Omit<WebJourneyEventRecord, "metadata">): string {
  const parts = [
    event.eventName,
    event.pagePath,
    event.surfaceId,
    event.surfaceLabel,
    event.targetId,
    event.targetLabel,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return parts.join(" ");
}

function buildWebJourneyRecordIngestEnvelope(
  event: Omit<WebJourneyEventRecord, "metadata"> & { metadata: RuntimeRow | null },
): RuntimeRow {
  return {
    operation: "record.ingest",
    routing: {
      adapter: WEB_SIGNALS_PLATFORM,
      platform: WEB_SIGNALS_PLATFORM,
      connection_id: event.webInstallationId,
      sender_id: event.browserId ? `browser:${event.browserId}` : `session:${event.sessionId}`,
      sender_name: event.surfaceLabel ?? event.targetLabel ?? undefined,
      receiver_id: event.webInstallationId,
      receiver_name: event.host,
      space_id: event.host,
      space_name: event.host,
      container_kind: "group",
      container_id: event.host,
      container_name: event.host,
      thread_id: event.sessionId,
      metadata: {
        web_installation_id: event.webInstallationId,
        event_id: event.eventId,
        event_name: event.eventName,
        session_id: event.sessionId,
        host: event.host,
        page_path: event.pagePath,
        consent_state: event.consentState,
        bridge_surface: event.bridgeSurface,
        handoff_id: event.handoffId,
        ...event.metadata,
      },
    },
    payload: {
      external_record_id: `${event.webInstallationId}:${event.eventId}`,
      timestamp: event.capturedAt,
      content: buildEventSummary(event),
      content_type: "text",
      metadata: {
        web_installation_id: event.webInstallationId,
        event_id: event.eventId,
        event_name: event.eventName,
        session_id: event.sessionId,
        browser_id: event.browserId,
        host: event.host,
        page_path: event.pagePath,
        web_event: { ...event, metadata: event.metadata },
      },
    },
  };
}

function readCollectInput(value: unknown): RuntimeRow {
  const record = asRecord(value);
  const event = asRecord(record.event);
  return Object.keys(event).length > 0 ? event : record;
}

function readBatchEvents(value: unknown): RuntimeRow[] {
  const record = asRecord(value);
  const events = record.events;
  if (Array.isArray(events)) {
    return events.filter((entry): entry is RuntimeRow => !!entry && typeof entry === "object" && !Array.isArray(entry)).map((entry) => entry as RuntimeRow);
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is RuntimeRow => !!entry && typeof entry === "object" && !Array.isArray(entry)).map((entry) => entry as RuntimeRow);
  }
  return [];
}

function resolveInstallationFromCollectContext(
  db: ReturnType<typeof openWebSignalsDb>,
  ctx: Parameters<NexAppMethodHandler>[0],
  params: RuntimeRow,
  eventInput?: RuntimeRow,
): WebSignalsInstallationRecord {
  const explicitInstallationId =
    asOptionalString(params.web_installation_id) ??
    asOptionalString(params.websiteInstallationId) ??
    asOptionalString(eventInput?.web_installation_id) ??
    asOptionalString(eventInput?.webInstallationId);
  const callerEntityId = String(ctx.user.userId ?? "").trim();
  const boundInstallation = callerEntityId ? findInstallationBySenderEntityId(db, callerEntityId) : null;
  if (boundInstallation) {
    if (explicitInstallationId && explicitInstallationId !== boundInstallation.webInstallationId) {
      throw new Error("web installation does not match sender token binding");
    }
    return boundInstallation;
  }
  throw new Error(
    explicitInstallationId
      ? "sender token is not bound to the requested web installation"
      : "sender token is not bound to any web installation",
  );
}

function normalizeWebJourneyCollectEvent(
  installationId: string,
  value: RuntimeRow,
): RuntimeRow {
  return {
    web_installation_id: installationId,
    event_id: asOptionalString(value.event_id) ?? asOptionalString(value.eventId),
    captured_at: asOptionalTimestamp(value.captured_at) ?? asOptionalTimestamp(value.capturedAt),
    received_at: asOptionalTimestamp(value.received_at) ?? asOptionalTimestamp(value.receivedAt),
    consent_state: asOptionalString(value.consent_state) ?? asOptionalString(value.consentState),
    event_name: asOptionalString(value.event_name) ?? asOptionalString(value.eventName),
    browser_id: asOptionalString(value.browser_id) ?? asOptionalString(value.browserId),
    session_id: asOptionalString(value.session_id) ?? asOptionalString(value.sessionId),
    page_url: asOptionalString(value.page_url) ?? asOptionalString(value.pageUrl),
    page_path: asOptionalString(value.page_path) ?? asOptionalString(value.pagePath),
    host: asOptionalString(value.host),
    referrer: asOptionalString(value.referrer),
    event_source_url:
      asOptionalString(value.event_source_url) ?? asOptionalString(value.eventSourceUrl),
    page_title: asOptionalString(value.page_title) ?? asOptionalString(value.pageTitle),
    user_agent: asOptionalString(value.user_agent) ?? asOptionalString(value.userAgent),
    viewport_width:
      asOptionalNumber(value.viewport_width) ?? asOptionalNumber(value.viewportWidth),
    viewport_height:
      asOptionalNumber(value.viewport_height) ?? asOptionalNumber(value.viewportHeight),
    utm_source: asOptionalString(value.utm_source) ?? asOptionalString(value.utmSource),
    utm_medium: asOptionalString(value.utm_medium) ?? asOptionalString(value.utmMedium),
    utm_campaign: asOptionalString(value.utm_campaign) ?? asOptionalString(value.utmCampaign),
    utm_content: asOptionalString(value.utm_content) ?? asOptionalString(value.utmContent),
    utm_term: asOptionalString(value.utm_term) ?? asOptionalString(value.utmTerm),
    fbclid: asOptionalString(value.fbclid),
    fbc: asOptionalString(value.fbc),
    fbp: asOptionalString(value.fbp),
    gclid: asOptionalString(value.gclid),
    gbraid: asOptionalString(value.gbraid),
    wbraid: asOptionalString(value.wbraid),
    ttclid: asOptionalString(value.ttclid),
    ttp: asOptionalString(value.ttp),
    msclkid: asOptionalString(value.msclkid),
    surface_id: asOptionalString(value.surface_id) ?? asOptionalString(value.surfaceId),
    surface_label: asOptionalString(value.surface_label) ?? asOptionalString(value.surfaceLabel),
    surface_category:
      asOptionalString(value.surface_category) ?? asOptionalString(value.surfaceCategory),
    target_type: asOptionalString(value.target_type) ?? asOptionalString(value.targetType),
    target_id: asOptionalString(value.target_id) ?? asOptionalString(value.targetId),
    target_label: asOptionalString(value.target_label) ?? asOptionalString(value.targetLabel),
    bridge_surface:
      asOptionalString(value.bridge_surface) ?? asOptionalString(value.bridgeSurface),
    handoff_id: asOptionalString(value.handoff_id) ?? asOptionalString(value.handoffId),
    checkout_token:
      asOptionalString(value.checkout_token) ?? asOptionalString(value.checkoutToken),
    checkout_key: asOptionalString(value.checkout_key) ?? asOptionalString(value.checkoutKey),
    checkout_id: asOptionalString(value.checkout_id) ?? asOptionalString(value.checkoutId),
    cart_token: asOptionalString(value.cart_token) ?? asOptionalString(value.cartToken),
    form_id: asOptionalString(value.form_id) ?? asOptionalString(value.formId),
    form_submission_id:
      asOptionalString(value.form_submission_id) ?? asOptionalString(value.formSubmissionId),
    booking_id: asOptionalString(value.booking_id) ?? asOptionalString(value.bookingId),
    booking_slot_id:
      asOptionalString(value.booking_slot_id) ?? asOptionalString(value.bookingSlotId),
    lead_external_id:
      asOptionalString(value.lead_external_id) ?? asOptionalString(value.leadExternalId),
    metadata: asRecord(value.metadata),
  };
}

async function collectViaWebJourney(
  ctx: Parameters<NexAppMethodHandler>[0],
  installation: WebSignalsInstallationRecord,
  command: "collect" | "collect.batch",
  payload: RuntimeRow,
): Promise<RuntimeRow> {
  const { endpointId } = await ensureWebJourneyServeReady(ctx, installation);
  let invokeResult: RuntimeRow | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    invokeResult = asRecord(
      await ctx.nex.adapter.serve.invoke({
        endpoint_id: endpointId,
        command,
        payload,
        timeout_ms: 15_000,
        idempotency_key: randomUUID(),
      }),
    );
    const adapterError = asRecord(invokeResult.error);
    const adapterMessage =
      asOptionalString(adapterError.message) ??
      asOptionalString(invokeResult.error) ??
      null;
    if (invokeResult.ok === true || adapterMessage !== "adapter serve endpoint not found") {
      break;
    }
    await sleep(50);
  }
  if (!invokeResult) {
    throw new Error("web-journey adapter invoke returned no response");
  }
  if (invokeResult.ok !== true) {
    const adapterError = asRecord(invokeResult.error);
    throw new Error(
      asOptionalString(adapterError.message) ??
        asOptionalString(invokeResult.error) ??
        "web-journey adapter invoke failed",
    );
  }
  const adapterPayload = asRecord(invokeResult.payload);
  if (adapterPayload.ok !== true) {
    const adapterError = asRecord(adapterPayload.error);
    throw new Error(
      asOptionalString(adapterError.message) ??
        asOptionalString(adapterPayload.error) ??
        "web-journey adapter rejected collector payload",
    );
  }
  return adapterPayload;
}

function readRecordsList(payload: RuntimeRow): RuntimeRow[] {
  const records = payload.records;
  if (!Array.isArray(records)) {
    return [];
  }
  return records.filter((entry): entry is RuntimeRow => !!entry && typeof entry === "object" && !Array.isArray(entry));
}

function requireWebJourneyEvent(value: unknown): WebJourneyEventRecord {
  const event =
    readWebJourneyEventRow(value) ??
    readRecordEvent({ metadata: { web_event: value } });
  if (!event) {
    throw new Error("web-journey adapter returned an invalid event payload");
  }
  return event;
}

async function readEventsFromRecords(
  ctx: Parameters<NexAppMethodHandler>[0],
  installation: WebSignalsInstallationRecord,
  params: RuntimeRow,
): Promise<WebJourneyEventRecord[]> {
  const response = unwrapPayload(
    await ctx.nex.records.list({
      platform: WEB_SIGNALS_PLATFORM,
      connection_id: installation.webJourneyConnectionId ?? installation.webInstallationId,
      ...(asOptionalString(params.session_id) ? { thread_id: asOptionalString(params.session_id) } : {}),
      limit: asLimit(params.limit, 100),
    }),
  );
  return readRecordsList(response)
    .map((record) => readRecordEvent(record))
    .filter((entry): entry is WebJourneyEventRecord => entry !== null)
    .filter((entry) => entry.webInstallationId === installation.webInstallationId)
    .filter((entry) => {
      const eventName = asOptionalString(params.event_name);
      return !eventName || entry.eventName === eventName;
    });
}

async function readEventsFromRecordsWithRetry(
  ctx: Parameters<NexAppMethodHandler>[0],
  installation: WebSignalsInstallationRecord,
  params: RuntimeRow,
): Promise<WebJourneyEventRecord[]> {
  let previousCount = -1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const events = await readEventsFromRecords(ctx, installation, params);
    if (events.length > 0 && events.length === previousCount) {
      return events;
    }
    previousCount = events.length;
    if (attempt < 9) {
      await sleep(50);
    } else {
      return events;
    }
  }
  return [];
}

const createInstallation: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const accountId = resolveAccountId(ctx);
  const createdByEntityId = requireCurrentEntityId(ctx);
  const label = asOptionalString(params.label);
  const siteOrigin = asOptionalString(params.site_origin);
  const runtimeBaseUrl = await resolveRuntimeBaseUrl(ctx, params.runtime_base_url);
  const expiresAt = asOptionalNumber(params.expires_at);
  const metadata =
    params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
      ? (params.metadata as RuntimeRow)
      : null;
  const webInstallationId = randomUUID();
  const now = Date.now();
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const senderEntityId = await createSenderEntity(ctx, {
      installationId: webInstallationId,
      label,
      siteOrigin,
    });
    const journey = await ensureWebJourneyConnection(ctx, {
      installationId: webInstallationId,
      siteOrigin,
      runtimeBaseUrl,
      label,
    });
    await startWebJourneyServeSession(ctx, journey.connectionId);
    const credential = unwrapPayload(
      await ctx.nex.auth.tokens.create({
        entityId: senderEntityId,
        role: "operator",
        scopes: [...WEB_SIGNALS_SENDER_SCOPES],
        label: buildInstallationLabel({ accountId, label }),
        expiresAt: expiresAt ?? undefined,
      }),
    );
    const credentialRecord = asRecord(credential.credential);
    const token = String(credential.token ?? "");
    const tokenId = String(credentialRecord.id ?? "");
    const installation = insertInstallation(db, {
      webInstallationId,
      accountId,
      label,
      siteOrigin,
      webJourneyConnectionId: journey.connectionId,
      webJourneyEndpointId: journey.endpointId,
      status: "active",
      senderEntityId,
      createdByEntityId,
      createdAt: now,
      updatedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      runtimeBaseUrl,
      currentTokenId: tokenId,
      currentTokenCreatedAt: typeof credentialRecord.createdAt === "number" ? credentialRecord.createdAt : now,
      currentTokenExpiresAt: typeof credentialRecord.expiresAt === "number" ? credentialRecord.expiresAt : expiresAt,
      currentTokenRevokedAt: typeof credentialRecord.revokedAt === "number" ? credentialRecord.revokedAt : null,
      currentTokenLabel: typeof credentialRecord.label === "string" ? credentialRecord.label : null,
      metadata: {
        ...(metadata ?? {}),
        senderEntityId,
        runtimeBaseUrl,
        siteOrigin,
      },
    });
    return {
      ok: true,
      installation: installationView(installation),
      token,
      token_id: tokenId,
    };
  } finally {
    db.close();
  }
};

const getInstallation: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const webInstallationId = asNonEmptyString(params.web_installation_id, "web_installation_id");
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, webInstallationId);
    if (!installation) {
      throw new Error(`unknown web installation id: ${webInstallationId}`);
    }
    return {
      ok: true,
      installation: installationView(installation),
      tokens: listTokens(db, { webInstallationId, includeRevoked: true, limit: 50 }).map(tokenView),
    };
  } finally {
    db.close();
  }
};

const listInstallationsHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    return {
      ok: true,
      installations: listInstallations(db, {
        accountId: resolveAccountId(ctx),
        status:
          params.status === "active" ||
          params.status === "paused" ||
          params.status === "revoked" ||
          params.status === "error"
            ? params.status
            : undefined,
        limit: asLimit(params.limit, 100),
      }).map(installationView),
    };
  } finally {
    db.close();
  }
};

const rotateInstallation: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const webInstallationId = asNonEmptyString(params.web_installation_id, "web_installation_id");
  const label = asOptionalString(params.label);
  const expiresAt = asOptionalNumber(params.expires_at);
  const runtimeBaseUrlOverride = params.runtime_base_url;
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, webInstallationId);
    if (!installation) {
      throw new Error(`unknown web installation id: ${webInstallationId}`);
    }
    const senderEntityId =
      installation.senderEntityId ??
      (await createSenderEntity(ctx, {
        installationId: installation.webInstallationId,
        label: installation.label,
        siteOrigin: installation.siteOrigin,
      }));
    const runtimeBaseUrl = await resolveRuntimeBaseUrl(ctx, runtimeBaseUrlOverride ?? installation.runtimeBaseUrl);
    const journey = await ensureWebJourneyConnection(ctx, {
      installationId: installation.webInstallationId,
      siteOrigin: installation.siteOrigin,
      runtimeBaseUrl,
      label: label ?? installation.label,
      existingConnectionId: installation.webJourneyConnectionId,
    });
    await startWebJourneyServeSession(ctx, journey.connectionId);
    const oldTokenId = installation.currentTokenId;
    if (oldTokenId) {
      await ctx.nex.auth.tokens.revoke({ id: oldTokenId });
      updateTokenRevocation(db, oldTokenId, Date.now());
    }
    const credential = unwrapPayload(
      await ctx.nex.auth.tokens.create({
        entityId: senderEntityId,
        role: "operator",
        scopes: [...WEB_SIGNALS_SENDER_SCOPES],
        label: label ?? installation.label ?? `web-signals:${installation.webInstallationId}`,
        expiresAt: expiresAt ?? undefined,
      }),
    );
    const credentialRecord = asRecord(credential.credential);
    const token = String(credential.token ?? "");
    const tokenId = String(credentialRecord.id ?? "");
    const tokenRow = insertToken(db, {
      id: randomUUID(),
      webInstallationId: installation.webInstallationId,
      tokenId,
      label: typeof credentialRecord.label === "string" ? credentialRecord.label : null,
      createdByEntityId: requireCurrentEntityId(ctx),
      createdAt: typeof credentialRecord.createdAt === "number" ? credentialRecord.createdAt : Date.now(),
      lastUsedAt: typeof credentialRecord.lastUsedAt === "number" ? credentialRecord.lastUsedAt : null,
      expiresAt: typeof credentialRecord.expiresAt === "number" ? credentialRecord.expiresAt : expiresAt,
      revokedAt: typeof credentialRecord.revokedAt === "number" ? credentialRecord.revokedAt : null,
      metadata: {
        senderEntityId,
        runtimeBaseUrl,
      },
    });
    updateInstallation(db, installation.webInstallationId, {
      senderEntityId,
      runtimeBaseUrl,
      webJourneyConnectionId: journey.connectionId,
      webJourneyEndpointId: journey.endpointId,
      currentTokenId: tokenId,
      currentTokenCreatedAt: tokenRow.createdAt,
      currentTokenExpiresAt: tokenRow.expiresAt,
      currentTokenRevokedAt: tokenRow.revokedAt,
      currentTokenLabel: tokenRow.label,
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        ...(installation.metadata ?? {}),
        senderEntityId,
        runtimeBaseUrl,
      },
    });
    const refreshed = findInstallationById(db, installation.webInstallationId);
    if (!refreshed) {
      throw new Error("installation refresh failed");
    }
    return {
      ok: true,
      installation: installationView(refreshed),
      token,
      token_id: tokenId,
    };
  } finally {
    db.close();
  }
};

const deleteInstallationHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const webInstallationId = asNonEmptyString(params.web_installation_id, "web_installation_id");
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, webInstallationId);
    if (!installation) {
      throw new Error(`unknown web installation id: ${webInstallationId}`);
    }
    const tokenRows = listTokens(db, {
      webInstallationId,
      includeRevoked: true,
      limit: 500,
    });
    const tokenIds = new Set(
      tokenRows
        .filter((token) => token.revokedAt == null)
        .map((token) => token.tokenId),
    );
    if (installation.currentTokenId && !tokenIds.has(installation.currentTokenId)) {
      tokenIds.add(installation.currentTokenId);
    }
    for (const tokenId of tokenIds) {
      await ctx.nex.auth.tokens.revoke({ id: tokenId });
      updateTokenRevocation(db, tokenId, Date.now());
    }
    const deleted = deleteInstallation(db, webInstallationId);
    return {
      ok: true,
      installation: deleted ? installationView(deleted) : null,
      revoked_token_ids: [...tokenIds],
    };
  } finally {
    db.close();
  }
};

const collectHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const event = asRecord(params.event);
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const installation = resolveInstallationFromCollectContext(db, ctx, params, event);
    const result = await collectViaWebJourney(ctx, installation, "collect", {
      web_event: normalizeWebJourneyCollectEvent(installation.webInstallationId, event),
    });
    updateInstallation(db, installation.webInstallationId, {
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
    });
    return {
      ok: true,
      event: eventView(requireWebJourneyEvent(result.event)),
      deduped: result.deduped === true,
    };
  } finally {
    db.close();
  }
};

const collectBatchHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const events = readBatchEvents(params.events);
  if (events.length === 0) {
    return { ok: true, count: 0, events: [] };
  }
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const installation = resolveInstallationFromCollectContext(db, ctx, params, events[0]);
    const result = await collectViaWebJourney(ctx, installation, "collect.batch", {
      web_events: events.map((entry) =>
        normalizeWebJourneyCollectEvent(installation.webInstallationId, entry),
      ),
    });
    updateInstallation(db, installation.webInstallationId, {
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
    });
    const resultEvents = Array.isArray(result.events)
      ? result.events
          .map((entry) => readWebJourneyEventRow(entry))
          .filter((entry): entry is WebJourneyEventRecord => entry !== null)
          .map(eventView)
      : [];
    return {
      ok: true,
      count: typeof result.count === "number" && Number.isFinite(result.count) ? result.count : resultEvents.length,
      events: resultEvents,
    };
  } finally {
    db.close();
  }
};

const listEventsHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const webInstallationId = asNonEmptyString(params.web_installation_id, "web_installation_id");
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, webInstallationId);
    if (!installation) {
      throw new Error(`unknown web installation id: ${webInstallationId}`);
    }
    return {
      ok: true,
      events: (await readEventsFromRecordsWithRetry(ctx, installation, params)).map(eventView),
    };
  } finally {
    db.close();
  }
};

const getEventHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const webInstallationId = asNonEmptyString(params.web_installation_id, "web_installation_id");
  const eventId = asNonEmptyString(params.event_id, "event_id");
  const db = openWebSignalsDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, webInstallationId);
    if (!installation) {
      throw new Error(`unknown web installation id: ${webInstallationId}`);
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const payload = unwrapPayload(
        await ctx.nex.records.get({
          id: `${installation.webInstallationId}:${eventId}`,
        }),
      );
      const event = readRecordEvent(asRecord(payload.record));
      if (event && event.webInstallationId === installation.webInstallationId) {
        return {
          ok: true,
          event: eventView(event),
        };
      }
      if (attempt < 9) {
        await sleep(50);
      }
    }
    throw new Error(`unknown event id for installation: ${eventId}`);
  } finally {
    db.close();
  }
};

export const handlers: Record<string, NexAppMethodHandler> = {
  "web-signals.installations.create": createInstallation,
  "web-signals.installations.get": getInstallation,
  "web-signals.installations.list": listInstallationsHandler,
  "web-signals.installations.rotate": rotateInstallation,
  "web-signals.installations.delete": deleteInstallationHandler,
  "web-signals.web-journey.collect": collectHandler,
  "web-signals.web-journey.collect.batch": collectBatchHandler,
  "web-signals.events.list": listEventsHandler,
  "web-signals.events.get": getEventHandler,
};
