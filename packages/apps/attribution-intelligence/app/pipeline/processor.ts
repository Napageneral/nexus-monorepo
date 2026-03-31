import type { DatabaseSync } from "node:sqlite";
import type { JobScriptContext } from "../../../../../nex/src/api/server-work.js";
import {
  type AttributionAdFactRecord,
  type AttributionBindingRecord,
  type AttributionBusinessOutcomeRecord,
  type AttributionConversionBridgeRecord,
  type AttributionDailyFunnelMartRecord,
  type AttributionDailySourceMartRecord,
  type AttributionOutcomeAttributionRecord,
  type AttributionSessionSourceFact,
  type AttributionWebEventRecord,
  isoDay,
  listAdFactsForScope,
  listBindings,
  listBindingsForConnection,
  listBindingsForWebsiteInstallation,
  listBusinessOutcomes,
  listSessionSourceFacts,
  listWebEventsForScope,
  markRecordProcessed,
  openAttributionDb,
  replaceConversionBridges,
  replaceDailyFunnelMarts,
  replaceDailySourceMarts,
  replaceOutcomeAttributions,
  replaceSessionSourceFacts,
  startOfDayMs,
  upsertAdFact,
  upsertBusinessOutcome,
  upsertWebEvent,
  withAttributionDb,
} from "../storage/store.js";

type RuntimeRow = Record<string, unknown>;

type RuntimeRecord = {
  id: string;
  record_id: string;
  platform: string;
  receiver_id: string | null;
  container_id: string | null;
  thread_id: string | null;
  timestamp: number;
  metadata: Record<string, unknown>;
};

type RuntimeListClient = Record<string, any>;

type ProcessCanonicalRecordParams = {
  dataDir: string;
  record: RuntimeRow;
  recordId?: string | null;
  skipProcessedCheck?: boolean;
};

const ACQUISITION_PLATFORMS = new Set(["meta-ads", "google-ads", "tiktok-business"]);
const BACKEND_PLATFORMS = new Set(["shopify", "patient-now-emr"]);
const WEBSITE_PLATFORMS = new Set(["website-input", "website-tracking"]);
const DEFAULT_REPLAY_LIMIT = 250;

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | null {
  const text = asString(value);
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInteger(value: unknown): number {
  const numeric = asNumber(value);
  return numeric === null ? 0 : Math.trunc(numeric);
}

function lower(value: unknown): string {
  return asString(value).toLowerCase();
}

function unwrapPayload(value: unknown): RuntimeRow {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  return Object.keys(payload).length > 0 ? payload : record;
}

function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function stringifyKey(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const text = stringifyKey(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function roleForPlatform(record: RuntimeRecord, row: RuntimeRow): AttributionBindingRecord["role"] | null {
  if (WEBSITE_PLATFORMS.has(record.platform) || asString(row.event_name)) {
    return "website";
  }
  if (ACQUISITION_PLATFORMS.has(record.platform)) {
    return "acquisition";
  }
  if (hasBackendOutcomeSignal(record, row)) {
    return "backend";
  }
  return null;
}

function normalizeRecord(input: RuntimeRow, recordIdHint?: string | null): RuntimeRecord {
  return {
    id: firstNonEmpty(input.id, recordIdHint) ?? "",
    record_id: firstNonEmpty(input.record_id, recordIdHint, input.id) ?? "",
    platform: asString(input.platform),
    receiver_id: asOptionalString(input.receiver_id),
    container_id: asOptionalString(input.container_id),
    thread_id: asOptionalString(input.thread_id),
    timestamp: parseTimestamp(input.timestamp),
    metadata: asRecord(input.metadata),
  };
}

function familyOf(record: RuntimeRecord): string {
  return asString(record.metadata.family) || asString(record.container_id) || "unknown";
}

function providerIds(metadata: RuntimeRow): RuntimeRow {
  return asRecord(metadata.provider_ids);
}

function rowOf(metadata: RuntimeRow): RuntimeRow {
  const direct = asRecord(metadata.row);
  if (Object.keys(direct).length > 0) {
    return direct;
  }
  const websiteEvent = asRecord(metadata.website_event);
  if (Object.keys(websiteEvent).length === 0) {
    return {};
  }
  return {
    ...websiteEvent,
    website_installation_id: firstNonEmpty(
      websiteEvent.website_installation_id,
      websiteEvent.websiteInstallationId,
    ),
    event_id: firstNonEmpty(websiteEvent.event_id, websiteEvent.eventId),
    event_name: firstNonEmpty(websiteEvent.event_name, websiteEvent.eventName),
    captured_at: firstNonEmpty(websiteEvent.captured_at, websiteEvent.capturedAt),
    received_at: firstNonEmpty(websiteEvent.received_at, websiteEvent.receivedAt),
    consent_state: firstNonEmpty(websiteEvent.consent_state, websiteEvent.consentState),
    session_id: firstNonEmpty(websiteEvent.session_id, websiteEvent.sessionId),
    browser_id: firstNonEmpty(websiteEvent.browser_id, websiteEvent.browserId),
    page_url: firstNonEmpty(websiteEvent.page_url, websiteEvent.pageUrl),
    page_path: firstNonEmpty(websiteEvent.page_path, websiteEvent.pagePath),
    event_source_url: firstNonEmpty(websiteEvent.event_source_url, websiteEvent.eventSourceUrl),
    utm_source: firstNonEmpty(websiteEvent.utm_source, websiteEvent.utmSource),
    utm_medium: firstNonEmpty(websiteEvent.utm_medium, websiteEvent.utmMedium),
    utm_campaign: firstNonEmpty(websiteEvent.utm_campaign, websiteEvent.utmCampaign),
    utm_content: firstNonEmpty(websiteEvent.utm_content, websiteEvent.utmContent),
    utm_term: firstNonEmpty(websiteEvent.utm_term, websiteEvent.utmTerm),
    surface_id: firstNonEmpty(websiteEvent.surface_id, websiteEvent.surfaceId),
    surface_label: firstNonEmpty(websiteEvent.surface_label, websiteEvent.surfaceLabel),
    surface_category: firstNonEmpty(websiteEvent.surface_category, websiteEvent.surfaceCategory),
    target_type: firstNonEmpty(websiteEvent.target_type, websiteEvent.targetType),
    target_id: firstNonEmpty(websiteEvent.target_id, websiteEvent.targetId),
    target_label: firstNonEmpty(websiteEvent.target_label, websiteEvent.targetLabel),
    bridge_surface: firstNonEmpty(websiteEvent.bridge_surface, websiteEvent.bridgeSurface),
    handoff_id: firstNonEmpty(websiteEvent.handoff_id, websiteEvent.handoffId),
    checkout_token: firstNonEmpty(websiteEvent.checkout_token, websiteEvent.checkoutToken),
    checkout_key: firstNonEmpty(websiteEvent.checkout_key, websiteEvent.checkoutKey),
    checkout_id: firstNonEmpty(websiteEvent.checkout_id, websiteEvent.checkoutId),
    cart_token: firstNonEmpty(websiteEvent.cart_token, websiteEvent.cartToken),
    form_id: firstNonEmpty(websiteEvent.form_id, websiteEvent.formId),
    form_submission_id: firstNonEmpty(websiteEvent.form_submission_id, websiteEvent.formSubmissionId),
    booking_id: firstNonEmpty(websiteEvent.booking_id, websiteEvent.bookingId),
    booking_slot_id: firstNonEmpty(websiteEvent.booking_slot_id, websiteEvent.bookingSlotId),
    lead_external_id: firstNonEmpty(websiteEvent.lead_external_id, websiteEvent.leadExternalId),
  };
}

function derivedOf(metadata: RuntimeRow): RuntimeRow {
  return asRecord(metadata.derived);
}

function bridgeAttributesOf(metadata: RuntimeRow): RuntimeRow {
  return asRecord(metadata.bridge_attributes);
}

function hasBackendOutcomeSignal(record: RuntimeRecord, row: RuntimeRow): boolean {
  if (BACKEND_PLATFORMS.has(record.platform)) {
    return true;
  }

  const family = familyOf(record);
  if (
    [
      "order",
      "lead",
      "booking",
      "appointment",
      "consult",
      "procedure",
      "encounter",
      "invoice",
    ].includes(family)
  ) {
    return true;
  }

  if (
    firstNonEmpty(
      row.backend_entity_id,
      row.outcome_id,
      row.order_id,
      row.lead_id,
      row.appointment_id,
      row.booking_id,
      row.consult_id,
      row.procedure_id,
      row.encounter_id,
      row.invoice_id,
    )
  ) {
    return true;
  }

  if (Object.keys(bridgeAttributesOf(record.metadata)).length > 0) {
    return true;
  }

  return Boolean(firstNonEmpty(row.outcome_type, row.entity_type, row.record_type, row.status, row.stage));
}

function websiteInstallationIdFromRow(row: RuntimeRow, metadata: RuntimeRow): string | null {
  return firstNonEmpty(
    row.website_installation_id,
    metadata.website_installation_id,
    asRecord(metadata.source_request).website_installation_id,
  );
}

function resolveMatchingBindings(db: DatabaseSync, record: RuntimeRecord, row: RuntimeRow): AttributionBindingRecord[] {
  const role = roleForPlatform(record, row);
  if (!role) {
    return [];
  }
  if (role === "website") {
    const installationId = websiteInstallationIdFromRow(row, record.metadata);
    if (!installationId) {
      return [];
    }
    return listBindingsForWebsiteInstallation(db, installationId).filter((binding) => binding.role === "website");
  }

  const connectionId = firstNonEmpty(record.metadata.connection_id, record.receiver_id);
  if (!connectionId) {
    return [];
  }
  return listBindingsForConnection(db, connectionId, role).filter(
    (binding) => !binding.platform || binding.platform === record.platform,
  );
}

function classifySourceFromEvidence(evidence: RuntimeRow): {
  sourceChannel: string;
  sourceConfidence: string;
  paidPlatform: string | null;
} {
  if (firstNonEmpty(evidence.fbclid, evidence.fbc, evidence.fbp)) {
    return { sourceChannel: "meta_paid", sourceConfidence: "high", paidPlatform: "meta-ads" };
  }
  if (firstNonEmpty(evidence.gclid, evidence.gbraid, evidence.wbraid)) {
    return { sourceChannel: "google_paid", sourceConfidence: "high", paidPlatform: "google-ads" };
  }
  if (firstNonEmpty(evidence.ttclid, evidence.ttp)) {
    return { sourceChannel: "tiktok_paid", sourceConfidence: "high", paidPlatform: "tiktok-business" };
  }

  const utmSource = lower(evidence.utm_source);
  const utmMedium = lower(evidence.utm_medium);
  if (utmSource || utmMedium) {
    if (
      /cpc|ppc|paid|paid_social|paid-social|display|retargeting/.test(utmMedium) ||
      /(facebook|instagram|meta)/.test(utmSource)
    ) {
      return { sourceChannel: "meta_paid", sourceConfidence: "medium", paidPlatform: "meta-ads" };
    }
    if (/(google|adwords|gads)/.test(utmSource) || /cpc|search|paid_search/.test(utmMedium)) {
      return { sourceChannel: "google_paid", sourceConfidence: "medium", paidPlatform: "google-ads" };
    }
    if (/(tiktok)/.test(utmSource)) {
      return { sourceChannel: "tiktok_paid", sourceConfidence: "medium", paidPlatform: "tiktok-business" };
    }
    if (/email|newsletter/.test(utmMedium) || /mailchimp|klaviyo/.test(utmSource)) {
      return { sourceChannel: "email", sourceConfidence: "medium", paidPlatform: null };
    }
    return {
      sourceChannel: firstNonEmpty(utmSource, utmMedium) ?? "other_campaign",
      sourceConfidence: "medium",
      paidPlatform: null,
    };
  }

  const referrer = lower(evidence.referrer);
  if (/(google\.)/.test(referrer)) {
    return { sourceChannel: "google_organic", sourceConfidence: "low", paidPlatform: null };
  }
  if (/(instagram\.com)/.test(referrer)) {
    return { sourceChannel: "instagram_referral", sourceConfidence: "low", paidPlatform: null };
  }
  if (/(facebook\.com|fb\.com|m\.facebook\.com)/.test(referrer)) {
    return { sourceChannel: "facebook_referral", sourceConfidence: "low", paidPlatform: null };
  }
  if (/(tiktok\.com)/.test(referrer)) {
    return { sourceChannel: "tiktok_referral", sourceConfidence: "low", paidPlatform: null };
  }
  if (referrer) {
    return { sourceChannel: "other_referral", sourceConfidence: "low", paidPlatform: null };
  }
  return { sourceChannel: "direct_or_unknown", sourceConfidence: "unknown", paidPlatform: null };
}

function channelForAdPlatform(platform: string): string {
  switch (platform) {
    case "meta-ads":
      return "meta_paid";
    case "google-ads":
      return "google_paid";
    case "tiktok-business":
      return "tiktok_paid";
    default:
      return platform;
  }
}

function getDateFromRow(row: RuntimeRow): string | null {
  const raw = firstNonEmpty(row.date, row.date_start, row.stat_time_day, row.segments_date);
  if (!raw) {
    return null;
  }
  return raw.slice(0, 10);
}

function getHourFromRow(row: RuntimeRow): string | null {
  return firstNonEmpty(row.hour, row.stat_time_hour, row.segments_hour, row.hourly_stats_aggregated_by_advertiser_time_zone);
}

function parseAdFact(scopeId: string, binding: AttributionBindingRecord, record: RuntimeRecord): AttributionAdFactRecord | null {
  const metadata = record.metadata;
  const row = rowOf(metadata);
  const derived = derivedOf(metadata);
  const family = familyOf(record);
  if (!family || family === "order" || family === "line_item") {
    return null;
  }
  const account = providerIds(metadata);
  const logicalRowId = firstNonEmpty(metadata.logical_row_id, record.record_id, record.id);
  if (!logicalRowId) {
    return null;
  }
  const spend = asNumber(derived.spend) ?? asNumber(derived.cost) ?? asNumber(row.spend) ?? asNumber(row.cost);
  const impressions = asNumber(derived.impressions) ?? asNumber(row.impressions);
  const clicks = asNumber(derived.clicks) ?? asNumber(row.clicks);
  const landingPageViews =
    asNumber(derived.landing_page_views) ??
    asNumber(row.landing_page_views) ??
    asNumber(row.landingPageViews);
  const purchases =
    asNumber(derived.purchases) ??
    asNumber(derived.conversions) ??
    asNumber(row.purchases) ??
    asNumber(row.conversions);
  const purchaseValue =
    asNumber(derived.purchase_value) ??
    asNumber(derived.conversions_value) ??
    asNumber(row.purchase_value) ??
    asNumber(row.conversions_value);

  return {
    scopeId,
    sourceRecordId: record.record_id || record.id,
    platform: record.platform,
    connectionId: binding.connectionId,
    family,
    logicalRowId,
    revisionHash: asOptionalString(metadata.revision_hash),
    accountId: firstNonEmpty(account.ad_account_id, account.customer_id, account.advertiser_id, row.ad_account_id, row.customer_id, row.advertiser_id),
    campaignId: firstNonEmpty(account.campaign_id, row.campaign_id),
    campaignName: firstNonEmpty(row.campaign_name),
    adGroupId: firstNonEmpty(account.ad_group_id, account.adgroup_id, row.ad_group_id, row.adgroup_id, row.adset_id),
    adGroupName: firstNonEmpty(row.ad_group_name, row.adgroup_name, row.adset_name),
    adId: firstNonEmpty(account.ad_id, row.ad_id),
    adName: firstNonEmpty(row.ad_name),
    date: getDateFromRow(row),
    hour: getHourFromRow(row),
    granularity: family.includes("hourly") ? "hourly" : family.includes("snapshot") ? "snapshot" : "daily",
    sourceChannel: channelForAdPlatform(record.platform),
    spend,
    impressions,
    clicks,
    landingPageViews,
    purchases,
    purchaseValue,
    row,
    derived,
    updatedAt: Date.now(),
  };
}

function parseWebsiteEvent(
  scopeId: string,
  binding: AttributionBindingRecord,
  record: RuntimeRecord,
): AttributionWebEventRecord | null {
  const metadata = record.metadata;
  const row = rowOf(metadata);
  const websiteInstallationId = binding.websiteInstallationId ?? websiteInstallationIdFromRow(row, metadata);
  const eventName = asString(row.event_name);
  if (!websiteInstallationId || !eventName) {
    return null;
  }
  const logicalRowId = firstNonEmpty(metadata.logical_row_id, row.event_id, record.record_id, record.id);
  const eventId = firstNonEmpty(row.event_id, logicalRowId);
  if (!logicalRowId || !eventId) {
    return null;
  }
  const classification = classifySourceFromEvidence(row);
  return {
    scopeId,
    sourceRecordId: record.record_id || record.id,
    logicalRowId,
    websiteInstallationId,
    eventId,
    eventName,
    capturedAt: parseTimestamp(row.captured_at ?? row.timestamp ?? record.timestamp),
    sessionId: asOptionalString(row.session_id),
    browserId: asOptionalString(row.browser_id),
    consentState: asOptionalString(row.consent_state),
    pageUrl: asOptionalString(row.page_url),
    pagePath: asOptionalString(row.page_path),
    host: asOptionalString(row.host),
    referrer: asOptionalString(row.referrer),
    eventSourceUrl: asOptionalString(row.event_source_url),
    sourceChannel: classification.sourceChannel,
    sourceConfidence: classification.sourceConfidence,
    utmSource: asOptionalString(row.utm_source),
    utmMedium: asOptionalString(row.utm_medium),
    utmCampaign: asOptionalString(row.utm_campaign),
    utmContent: asOptionalString(row.utm_content),
    utmTerm: asOptionalString(row.utm_term),
    fbclid: asOptionalString(row.fbclid),
    fbc: asOptionalString(row.fbc),
    fbp: asOptionalString(row.fbp),
    gclid: asOptionalString(row.gclid),
    gbraid: asOptionalString(row.gbraid),
    wbraid: asOptionalString(row.wbraid),
    ttclid: asOptionalString(row.ttclid),
    ttp: asOptionalString(row.ttp),
    msclkid: asOptionalString(row.msclkid),
    bridgeSurface: asOptionalString(row.bridge_surface),
    handoffId: asOptionalString(row.handoff_id),
    checkoutToken: asOptionalString(row.checkout_token),
    checkoutKey: asOptionalString(row.checkout_key),
    checkoutId: asOptionalString(row.checkout_id),
    cartToken: asOptionalString(row.cart_token),
    formId: asOptionalString(row.form_id),
    formSubmissionId: asOptionalString(row.form_submission_id),
    bookingId: asOptionalString(row.booking_id),
    bookingSlotId: asOptionalString(row.booking_slot_id),
    leadExternalId: asOptionalString(row.lead_external_id),
    row,
    updatedAt: Date.now(),
  };
}

function parseBusinessOutcome(
  scopeId: string,
  binding: AttributionBindingRecord,
  record: RuntimeRecord,
): AttributionBusinessOutcomeRecord | null {
  const family = familyOf(record);
  const metadata = record.metadata;
  const row = rowOf(metadata);
  if (!hasBackendOutcomeSignal(record, row)) {
    return null;
  }
  const bridgeAttributes = {
    ...asRecord(row.bridge_attributes),
    ...bridgeAttributesOf(metadata),
  } satisfies RuntimeRow;
  const outcomeId = firstNonEmpty(
    row.backend_entity_id,
    row.outcome_id,
    row.order_id,
    row.lead_id,
    row.appointment_id,
    row.booking_id,
    row.consult_id,
    row.procedure_id,
    row.encounter_id,
    row.invoice_id,
    metadata.logical_row_id,
    record.thread_id,
    record.record_id,
    record.id,
  );
  const outcomeType = firstNonEmpty(
    row.outcome_type,
    row.entity_type,
    row.record_type,
    record.platform === "shopify" && family === "order" ? "order" : null,
    family !== "unknown" ? family : null,
  );
  if (!outcomeId || !outcomeType) {
    return null;
  }
  const occurredAt = parseTimestamp(
    row.occurred_at ?? row.processed_at ?? row.created_at ?? row.updated_at ?? record.timestamp,
  );
  const grossValue =
    asNumber(row.gross_value) ??
    asNumber(row.total_price) ??
    asNumber(row.total_amount) ??
    asNumber(row.revenue) ??
    asNumber(row.value) ??
    asNumber(row.amount);
  const netValue =
    asNumber(row.net_value) ??
    asNumber(row.subtotal_price) ??
    asNumber(row.net_amount) ??
    asNumber(row.collected_revenue) ??
    asNumber(row.value);
  return {
    scopeId,
    platform: record.platform,
    sourceRecordId: record.record_id || record.id,
    logicalRowId: firstNonEmpty(metadata.logical_row_id, outcomeId) ?? outcomeId,
    connectionId: binding.connectionId,
    backendEntityId: outcomeId,
    outcomeType,
    outcomeStatus:
      firstNonEmpty(
        row.outcome_status,
        row.status,
        row.financial_status,
        row.fulfillment_status,
        row.stage,
        row.lifecycle_stage,
        row.cancelled_at ? "cancelled" : null,
      ) ?? null,
    occurredAt,
    currency: asOptionalString(row.currency),
    grossValue,
    netValue,
    customerId: firstNonEmpty(row.customer_id, row.patient_id, row.person_id, row.contact_id, row.user_id),
    customerEmail: firstNonEmpty(row.customer_email, row.email, row.patient_email, row.lead_email),
    sessionId: firstNonEmpty(bridgeAttributes.session_id, row.session_id),
    checkoutToken: firstNonEmpty(row.checkout_token, bridgeAttributes.checkout_token),
    cartToken: firstNonEmpty(row.cart_token, bridgeAttributes.cart_token),
    bridgeAttributes,
    row,
    updatedAt: Date.now(),
  };
}

function confidenceRank(value: string): number {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function eventCountKey(eventName: string): keyof AttributionSessionSourceFact | null {
  switch (eventName) {
    case "page_view":
      return "pageViews";
    case "content_view":
      return "contentViews";
    case "cta_click":
      return "ctaClicks";
    case "handoff_start":
      return "handoffStarts";
    case "handoff_confirmed":
      return "handoffConfirmed";
    case "product_view":
      return "productViews";
    case "cart_add":
      return "cartAdds";
    case "checkout_start":
      return "checkoutStarts";
    case "checkout_complete":
      return "checkoutCompletes";
    case "form_start":
      return "formStarts";
    case "form_submit":
      return "formSubmits";
    case "booking_complete":
      return "bookingsCompleted";
    default:
      return null;
  }
}

function incrementSessionCounter(
  row: AttributionSessionSourceFact,
  key: ReturnType<typeof eventCountKey>,
): void {
  switch (key) {
    case "pageViews":
      row.pageViews += 1;
      return;
    case "contentViews":
      row.contentViews += 1;
      return;
    case "ctaClicks":
      row.ctaClicks += 1;
      return;
    case "handoffStarts":
      row.handoffStarts += 1;
      return;
    case "handoffConfirmed":
      row.handoffConfirmed += 1;
      return;
    case "productViews":
      row.productViews += 1;
      return;
    case "cartAdds":
      row.cartAdds += 1;
      return;
    case "checkoutStarts":
      row.checkoutStarts += 1;
      return;
    case "checkoutCompletes":
      row.checkoutCompletes += 1;
      return;
    case "formStarts":
      row.formStarts += 1;
      return;
    case "formSubmits":
      row.formSubmits += 1;
      return;
    case "bookingsCompleted":
      row.bookingsCompleted += 1;
      return;
    default:
      return;
  }
}

function buildSessionFacts(scopeId: string, events: AttributionWebEventRecord[]): AttributionSessionSourceFact[] {
  const grouped = new Map<string, AttributionSessionSourceFact>();
  for (const event of events) {
    if (!event.sessionId) {
      continue;
    }
    const key = `${event.websiteInstallationId}:${event.sessionId}`;
    const existing =
      grouped.get(key) ??
      {
        scopeId,
        websiteInstallationId: event.websiteInstallationId,
        sessionId: event.sessionId,
        firstSeenAt: event.capturedAt,
        lastSeenAt: event.capturedAt,
        eventCount: 0,
        pageViews: 0,
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
        evidence: {},
        updatedAt: Date.now(),
      } satisfies AttributionSessionSourceFact;

    existing.firstSeenAt = Math.min(existing.firstSeenAt, event.capturedAt);
    existing.lastSeenAt = Math.max(existing.lastSeenAt, event.capturedAt);
    existing.eventCount += 1;
    const counterKey = eventCountKey(event.eventName);
    incrementSessionCounter(existing, counterKey);

    const evidence = {
      referrer: event.referrer,
      utm_source: event.utmSource,
      utm_medium: event.utmMedium,
      utm_campaign: event.utmCampaign,
      utm_content: event.utmContent,
      utm_term: event.utmTerm,
      fbclid: event.fbclid,
      fbc: event.fbc,
      fbp: event.fbp,
      gclid: event.gclid,
      gbraid: event.gbraid,
      wbraid: event.wbraid,
      ttclid: event.ttclid,
      ttp: event.ttp,
      msclkid: event.msclkid,
      page_url: event.pageUrl,
      event_source_url: event.eventSourceUrl,
    } satisfies RuntimeRow;
    const classification = classifySourceFromEvidence(evidence);
    if (confidenceRank(classification.sourceConfidence) >= confidenceRank(existing.sourceConfidence)) {
      existing.sourceChannel = classification.sourceChannel;
      existing.sourceConfidence = classification.sourceConfidence;
      existing.evidence = evidence;
    }
    grouped.set(key, existing);
  }
  return Array.from(grouped.values()).sort((left, right) => left.firstSeenAt - right.firstSeenAt);
}

function buildConversionBridges(scopeId: string, events: AttributionWebEventRecord[]): AttributionConversionBridgeRecord[] {
  const bridges = new Map<string, AttributionConversionBridgeRecord>();
  for (const event of events) {
    const bridgeKey =
      firstNonEmpty(
        event.handoffId,
        event.checkoutToken,
        event.checkoutKey,
        event.checkoutId,
        event.cartToken,
        event.formSubmissionId,
        event.bookingId,
        event.leadExternalId,
      ) ?? `${event.websiteInstallationId}:${event.eventId}`;
    const evidence = {
      event_id: event.eventId,
      session_id: event.sessionId,
      source_channel: event.sourceChannel,
      source_confidence: event.sourceConfidence,
      referrer: event.referrer,
      utm_source: event.utmSource,
      utm_medium: event.utmMedium,
      fbclid: event.fbclid,
      gclid: event.gclid,
      ttclid: event.ttclid,
    };
    bridges.set(bridgeKey, {
      scopeId,
      bridgeKey,
      websiteInstallationId: event.websiteInstallationId,
      sessionId: event.sessionId,
      bridgeSurface: event.bridgeSurface,
      handoffId: event.handoffId,
      checkoutToken: event.checkoutToken,
      checkoutKey: event.checkoutKey,
      checkoutId: event.checkoutId,
      cartToken: event.cartToken,
      formId: event.formId,
      formSubmissionId: event.formSubmissionId,
      bookingId: event.bookingId,
      bookingSlotId: event.bookingSlotId,
      leadExternalId: event.leadExternalId,
      eventId: event.eventId,
      sourceChannel: event.sourceChannel,
      sourceConfidence: event.sourceConfidence,
      evidence,
      occurredAt: event.capturedAt,
      updatedAt: Date.now(),
    });
  }
  return Array.from(bridges.values());
}

function buildOutcomeAttributions(
  scopeId: string,
  outcomes: Array<AttributionBusinessOutcomeRecord & { attribution: AttributionOutcomeAttributionRecord | null }>,
  sessionFacts: AttributionSessionSourceFact[],
  bridges: AttributionConversionBridgeRecord[],
): AttributionOutcomeAttributionRecord[] {
  const sessions = new Map(sessionFacts.map((entry) => [entry.sessionId, entry] as const));
  const bridgeByKey = new Map<string, AttributionConversionBridgeRecord>();
  for (const bridge of bridges) {
    for (const key of [
      bridge.handoffId,
      bridge.checkoutToken,
      bridge.checkoutKey,
      bridge.checkoutId,
      bridge.cartToken,
      bridge.formSubmissionId,
      bridge.bookingId,
      bridge.leadExternalId,
    ]) {
      if (key) {
        bridgeByKey.set(key, bridge);
      }
    }
  }

  return outcomes.map((outcome) => {
    const backendClassification = classifySourceFromEvidence(outcome.bridgeAttributes);
    const session = outcome.sessionId ? sessions.get(outcome.sessionId) ?? null : null;
    const bridge =
      bridgeByKey.get(firstNonEmpty(outcome.checkoutToken, outcome.cartToken) ?? "") ??
      (outcome.sessionId ? Array.from(bridgeByKey.values()).find((entry) => entry.sessionId === outcome.sessionId) ?? null : null);

    const primaryEvidence = bridge?.evidence ?? session?.evidence ?? outcome.bridgeAttributes;
    const primaryClassification =
      bridge?.sourceChannel && bridge.sourceConfidence
        ? {
            sourceChannel: bridge.sourceChannel,
            sourceConfidence: bridge.sourceConfidence,
            paidPlatform: classifySourceFromEvidence(bridge.evidence).paidPlatform,
          }
        : session
          ? {
              sourceChannel: session.sourceChannel,
              sourceConfidence: session.sourceConfidence,
              paidPlatform: classifySourceFromEvidence(session.evidence).paidPlatform,
            }
          : backendClassification;

    let matchMethod = "unresolved";
    let unresolvedReason: string | null = null;
    if (bridge) {
      matchMethod = "bridge_match";
    } else if (session) {
      matchMethod = "session_match";
    } else if (backendClassification.sourceChannel !== "direct_or_unknown") {
      matchMethod = "backend_bridge_attributes";
    } else {
      unresolvedReason = "no_bridge_or_session_evidence";
    }

    return {
      scopeId,
      outcomeId: outcome.backendEntityId,
      sourceChannel: primaryClassification.sourceChannel,
      sourceConfidence: primaryClassification.sourceConfidence,
      matchMethod,
      paidPlatform: primaryClassification.paidPlatform,
      sessionId: firstNonEmpty(outcome.sessionId, session?.sessionId),
      evidence: asRecord(primaryEvidence),
      unresolvedReason,
      updatedAt: Date.now(),
    };
  });
}

function buildDailySourceMarts(
  scopeId: string,
  adFacts: AttributionAdFactRecord[],
  outcomes: Array<AttributionBusinessOutcomeRecord & { attribution: AttributionOutcomeAttributionRecord | null }>,
  attributions: AttributionOutcomeAttributionRecord[],
): AttributionDailySourceMartRecord[] {
  const map = new Map<string, AttributionDailySourceMartRecord>();
  const upsert = (date: string | null, sourceChannel: string | null): AttributionDailySourceMartRecord | null => {
    if (!date || !sourceChannel) {
      return null;
    }
    const key = `${date}:${sourceChannel}`;
    const existing =
      map.get(key) ??
      {
        scopeId,
        date,
        sourceChannel,
        spend: 0,
        impressions: 0,
        clicks: 0,
        landingPageViews: 0,
        purchases: 0,
        purchaseValue: 0,
        outcomes: 0,
        grossRevenue: 0,
      } satisfies AttributionDailySourceMartRecord;
    map.set(key, existing);
    return existing;
  };

  for (const fact of adFacts) {
    const row = upsert(fact.date ?? (fact.hour ? fact.hour.slice(0, 10) : null), fact.sourceChannel);
    if (!row) {
      continue;
    }
    row.spend += fact.spend ?? 0;
    row.impressions += fact.impressions ?? 0;
    row.clicks += fact.clicks ?? 0;
    row.landingPageViews += fact.landingPageViews ?? 0;
    row.purchases += fact.purchases ?? 0;
    row.purchaseValue += fact.purchaseValue ?? 0;
  }

  const attributionByOutcome = new Map(attributions.map((entry) => [entry.outcomeId, entry] as const));
  for (const outcome of outcomes) {
    const attribution = attributionByOutcome.get(outcome.backendEntityId);
    const row = upsert(isoDay(outcome.occurredAt), attribution?.sourceChannel ?? "direct_or_unknown");
    if (!row) {
      continue;
    }
    row.outcomes += 1;
    row.grossRevenue += outcome.grossValue ?? 0;
  }

  return Array.from(map.values()).sort((left, right) =>
    left.date === right.date ? left.sourceChannel.localeCompare(right.sourceChannel) : left.date.localeCompare(right.date),
  );
}

function buildDailyFunnelMarts(
  scopeId: string,
  sessions: AttributionSessionSourceFact[],
  outcomes: Array<AttributionBusinessOutcomeRecord & { attribution: AttributionOutcomeAttributionRecord | null }>,
  attributions: AttributionOutcomeAttributionRecord[],
): AttributionDailyFunnelMartRecord[] {
  const map = new Map<string, AttributionDailyFunnelMartRecord>();
  const ensure = (date: string, sourceChannel: string): AttributionDailyFunnelMartRecord => {
    const key = `${date}:${sourceChannel}`;
    const existing =
      map.get(key) ??
      {
        scopeId,
        date,
        sourceChannel,
        sessions: 0,
        pageViews: 0,
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
        outcomes: 0,
        grossRevenue: 0,
      } satisfies AttributionDailyFunnelMartRecord;
    map.set(key, existing);
    return existing;
  };

  for (const session of sessions) {
    const row = ensure(isoDay(session.firstSeenAt), session.sourceChannel);
    row.sessions += 1;
    row.pageViews += session.pageViews;
    row.contentViews += session.contentViews;
    row.ctaClicks += session.ctaClicks;
    row.handoffStarts += session.handoffStarts;
    row.handoffConfirmed += session.handoffConfirmed;
    row.productViews += session.productViews;
    row.cartAdds += session.cartAdds;
    row.checkoutStarts += session.checkoutStarts;
    row.checkoutCompletes += session.checkoutCompletes;
    row.formStarts += session.formStarts;
    row.formSubmits += session.formSubmits;
    row.bookingsCompleted += session.bookingsCompleted;
  }

  const attributionByOutcome = new Map(attributions.map((entry) => [entry.outcomeId, entry] as const));
  for (const outcome of outcomes) {
    const attribution = attributionByOutcome.get(outcome.backendEntityId);
    const row = ensure(isoDay(outcome.occurredAt), attribution?.sourceChannel ?? "direct_or_unknown");
    row.outcomes += 1;
    row.grossRevenue += outcome.grossValue ?? 0;
  }

  return Array.from(map.values()).sort((left, right) =>
    left.date === right.date ? left.sourceChannel.localeCompare(right.sourceChannel) : left.date.localeCompare(right.date),
  );
}

function recomputeScope(db: DatabaseSync, scopeId: string): Record<string, unknown> {
  const events = listWebEventsForScope(db, scopeId);
  const sessions = buildSessionFacts(scopeId, events);
  replaceSessionSourceFacts(db, scopeId, sessions);

  const bridges = buildConversionBridges(scopeId, events);
  replaceConversionBridges(db, scopeId, bridges);

  const outcomes = listBusinessOutcomes(db, { scopeId, limit: 5000 });
  const attributions = buildOutcomeAttributions(scopeId, outcomes, sessions, bridges);
  replaceOutcomeAttributions(db, scopeId, attributions);

  const adFacts = listAdFactsForScope(db, scopeId);
  replaceDailySourceMarts(db, scopeId, buildDailySourceMarts(scopeId, adFacts, outcomes, attributions));
  replaceDailyFunnelMarts(db, scopeId, buildDailyFunnelMarts(scopeId, sessions, outcomes, attributions));

  return {
    scope_id: scopeId,
    ad_facts: adFacts.length,
    web_events: events.length,
    sessions: sessions.length,
    bridges: bridges.length,
    outcomes: outcomes.length,
    outcome_attributions: attributions.length,
  };
}

export function processCanonicalRecord(params: ProcessCanonicalRecordParams): Record<string, unknown> {
  return withAttributionDb(params.dataDir, (db) => {
    const normalized = normalizeRecord(params.record, params.recordId);
    const row = rowOf(normalized.metadata);
    const bindings = resolveMatchingBindings(db, normalized, row);
    if (bindings.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_matching_bindings",
        platform: normalized.platform,
        record_id: normalized.record_id || normalized.id,
      };
    }

    const perScope: Array<Record<string, unknown>> = [];
    let processed = 0;
    let skipped = 0;
    for (const binding of bindings) {
      const recordToken = normalized.record_id || normalized.id;
      if (!params.skipProcessedCheck && recordToken) {
        const accepted = markRecordProcessed(db, {
          scopeId: binding.scopeId,
          recordId: recordToken,
          platform: normalized.platform,
          connectionId: binding.connectionId,
        });
        if (!accepted) {
          skipped += 1;
          continue;
        }
      }

      let changed = false;
      if (binding.role === "acquisition") {
        const fact = parseAdFact(binding.scopeId, binding, normalized);
        if (fact) {
          upsertAdFact(db, fact);
          changed = true;
        }
      } else if (binding.role === "website") {
        const event = parseWebsiteEvent(binding.scopeId, binding, normalized);
        if (event) {
          upsertWebEvent(db, event);
          changed = true;
        }
      } else if (binding.role === "backend") {
        const outcome = parseBusinessOutcome(binding.scopeId, binding, normalized);
        if (outcome) {
          upsertBusinessOutcome(db, outcome);
          changed = true;
        }
      }

      if (!changed) {
        skipped += 1;
        continue;
      }

      perScope.push(recomputeScope(db, binding.scopeId));
      processed += 1;
    }

    return {
      ok: true,
      platform: normalized.platform,
      record_id: normalized.record_id || normalized.id,
      processed_scopes: processed,
      skipped_scopes: skipped,
      scopes: perScope,
    };
  });
}

export async function processRecordIngested(
  ctx: JobScriptContext,
  params: RuntimeRow,
): Promise<Record<string, unknown>> {
  const dataDir = firstNonEmpty(ctx.job.config.data_dir, params.data_dir);
  if (!dataDir) {
    throw new Error("attribution job config is missing data_dir");
  }
  return processCanonicalRecord({
    dataDir,
    record: asRecord(params.record),
    recordId: firstNonEmpty(params.record_id),
  });
}

export async function replayBoundRecords(params: {
  runtime: RuntimeListClient;
  dataDir: string;
  scopeId?: string | null;
  limitPerPlatform?: number | null;
}): Promise<Record<string, unknown>> {
  const bindings = withAttributionDb(params.dataDir, (db) =>
    listBindings(db, { scopeId: params.scopeId ?? null }),
  );
  if (bindings.length === 0) {
    return { ok: true, processed: 0, skipped: 0, bindings: 0 };
  }

  const limit = Math.max(1, Math.trunc(params.limitPerPlatform ?? DEFAULT_REPLAY_LIMIT));
  const acquisitionOrBackendBindings = bindings.filter((binding) => binding.connectionId);
  const websiteBindings = bindings.filter((binding) => binding.websiteInstallationId);

  const seenRecords = new Set<string>();
  let processed = 0;
  let skipped = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const binding of acquisitionOrBackendBindings) {
    let offset = 0;
    while (true) {
      const payload = unwrapPayload(
        await params.runtime.records.list({
          connection_id: binding.connectionId,
          ...(binding.platform ? { platform: binding.platform } : {}),
          limit,
          offset,
        }),
      );
      const rows = Array.isArray(payload.records)
        ? payload.records.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) as RuntimeRow[]
        : [];
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        const record = normalizeRecord(row);
        const token = record.record_id || record.id;
        if (!token || seenRecords.has(token)) {
          skipped += 1;
          continue;
        }
        seenRecords.add(token);
        const result = processCanonicalRecord({
          dataDir: params.dataDir,
          record: row,
          recordId: token,
          skipProcessedCheck: true,
        });
        processed += asInteger(result.processed_scopes);
        skipped += asInteger(result.skipped_scopes);
        details.push(result);
      }
      if (rows.length < limit) {
        break;
      }
      offset += rows.length;
    }
  }

  const websitePlatforms = ["website-input", "website-tracking"];
  for (const platform of websitePlatforms) {
    let offset = 0;
    while (true) {
      const payload = unwrapPayload(
        await params.runtime.records.list({
          platform,
          limit,
          offset,
        }),
      );
      const rows = Array.isArray(payload.records)
        ? payload.records.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) as RuntimeRow[]
        : [];
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        const record = normalizeRecord(row);
        const token = record.record_id || record.id;
        if (!token || seenRecords.has(token)) {
          skipped += 1;
          continue;
        }
        const installationId = websiteInstallationIdFromRow(rowOf(record.metadata), record.metadata);
        if (!installationId || !websiteBindings.some((binding) => binding.websiteInstallationId === installationId)) {
          skipped += 1;
          continue;
        }
        seenRecords.add(token);
        const result = processCanonicalRecord({
          dataDir: params.dataDir,
          record: row,
          recordId: token,
          skipProcessedCheck: true,
        });
        processed += asInteger(result.processed_scopes);
        skipped += asInteger(result.skipped_scopes);
        details.push(result);
      }
      if (rows.length < limit) {
        break;
      }
      offset += rows.length;
    }
  }

  const scopeIds = Array.from(new Set(bindings.map((binding) => binding.scopeId)));
  const recomputed = withAttributionDb(params.dataDir, (db) => scopeIds.map((scopeId) => recomputeScope(db, scopeId)));
  return {
    ok: true,
    bindings: bindings.length,
    scopes: recomputed,
    processed,
    skipped,
    records_seen: seenRecords.size,
    details,
  };
}

export default processRecordIngested;
