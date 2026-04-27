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
  recomputeScopes?: boolean;
};

const ACQUISITION_PLATFORMS = new Set(["meta-ads", "google-ads", "tiktok-business"]);
const BACKEND_PLATFORMS = new Set(["shopify", "patient-now-emr"]);
const WEBSITE_PLATFORMS = new Set(["web-journey"]);
const DEFAULT_REPLAY_LIMIT = 250;
const REPLAY_YIELD_EVERY_RECORDS = 50;
const REPLAY_DETAIL_PREVIEW_LIMIT = 50;

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

function hasSignalValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return false;
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
    receiver_id:
      asOptionalString(input.receiver_id) ??
      asOptionalString(input.receiver_contact_id),
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
  return Object.keys(direct).length > 0 ? direct : {};
}

function derivedOf(metadata: RuntimeRow): RuntimeRow {
  return asRecord(metadata.derived);
}

function bridgeAttributesOf(metadata: RuntimeRow): RuntimeRow {
  return asRecord(metadata.bridge_attributes);
}

function parseUrlLike(value: unknown): URL | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      return new URL(raw);
    }
    return new URL(raw, "https://web-signals.invalid");
  } catch {
    return null;
  }
}

function readUrlAttributionParams(...values: unknown[]): RuntimeRow {
  const extracted: RuntimeRow = {};
  for (const value of values) {
    const url = parseUrlLike(value);
    if (!url) {
      continue;
    }
    const params = url.searchParams;
    const assign = (key: string, nextValue: string | null): void => {
      if (!nextValue) {
        return;
      }
      if (!asString(extracted[key])) {
        extracted[key] = nextValue;
      }
    };
    assign("utm_source", params.get("utm_source"));
    assign("utm_medium", params.get("utm_medium"));
    assign("utm_campaign", params.get("utm_campaign"));
    assign("utm_content", params.get("utm_content"));
    assign("utm_term", params.get("utm_term"));
    assign("utm_id", params.get("utm_id"));
    assign("fbclid", params.get("fbclid"));
    assign("gclid", params.get("gclid"));
    assign("gbraid", params.get("gbraid"));
    assign("wbraid", params.get("wbraid"));
    assign("ttclid", params.get("ttclid"));
    assign("msclkid", params.get("msclkid"));
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments[0] === "cart" && pathSegments[1] === "c" && pathSegments[2]) {
      assign("cart_token", pathSegments[2]);
    }
    assign("checkout_key", params.get("key"));
  }
  return extracted;
}

function mergedEvidenceWithUrlParams(base: RuntimeRow, ...sources: unknown[]): RuntimeRow {
  const next = { ...base };
  const extracted = readUrlAttributionParams(...sources);
  for (const [key, value] of Object.entries(extracted)) {
    if (!hasSignalValue(next[key])) {
      next[key] = value;
    }
  }
  return next;
}

function extractShopifyNoteAttributes(row: RuntimeRow): RuntimeRow {
  const noteAttributes = asRecord(row.note_attributes);
  const extracted: RuntimeRow = {};
  for (const [rawKey, rawValue] of Object.entries(noteAttributes)) {
    const key = rawKey.startsWith("ms_") ? rawKey.slice(3) : rawKey;
    if (!key || hasSignalValue(extracted[key])) {
      continue;
    }
    extracted[key] = rawValue;
  }
  return extracted;
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

function webInstallationIdFromRow(row: RuntimeRow, metadata: RuntimeRow): string | null {
  return firstNonEmpty(
    row.web_installation_id,
    row.webInstallationId,
    metadata.web_installation_id,
    metadata.webInstallationId,
    asRecord(metadata.source_request).web_installation_id,
    asRecord(metadata.source_request).webInstallationId,
  );
}

function resolveMatchingBindings(db: DatabaseSync, record: RuntimeRecord, row: RuntimeRow): AttributionBindingRecord[] {
  const role = roleForPlatform(record, row);
  if (!role) {
    return [];
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
  const enriched = mergedEvidenceWithUrlParams(
    evidence,
    evidence.event_source_url,
    evidence.page_url,
    evidence.page_path,
    evidence.landing_path,
    evidence.landing_site,
  );
  const utmSource = lower(enriched.utm_source);
  const utmMedium = lower(enriched.utm_medium);
  const utmCampaign = lower(enriched.utm_campaign);
  const referrer = lower(enriched.referrer);

  const isPaidMedium = /(^|_|\b)(cpc|ppc|paid|paid_social|paid-social|paidsearch|paid_search|display|retargeting|prospecting)(\b|_)/.test(
    utmMedium,
  );
  const isOrganicSocialMedium = /(^|_|\b)(bio|social|organic|organic_social|link_in_bio|profile_link)(\b|_)/.test(
    utmMedium,
  ) || utmCampaign === "organic_social";
  const isMetaSource = /(facebook|instagram|^ig$|meta)/.test(utmSource);
  const isSearchSource = /(google|adwords|gads|bing|microsoft|msn)/.test(utmSource);
  const isTikTokSource = /(tiktok)/.test(utmSource);

  if (firstNonEmpty(enriched.fbclid, enriched.fbc)) {
    return { sourceChannel: "meta_paid", sourceConfidence: "high", paidPlatform: "meta-ads" };
  }
  if (firstNonEmpty(enriched.gclid, enriched.gbraid, enriched.wbraid, enriched.msclkid)) {
    return { sourceChannel: "search_paid", sourceConfidence: "high", paidPlatform: "google-ads" };
  }
  if (firstNonEmpty(enriched.ttclid)) {
    return { sourceChannel: "tiktok_paid", sourceConfidence: "high", paidPlatform: "tiktok-business" };
  }

  if (utmSource || utmMedium) {
    if (isMetaSource && isPaidMedium) {
      return { sourceChannel: "meta_paid", sourceConfidence: "medium", paidPlatform: "meta-ads" };
    }
    if (isSearchSource && isPaidMedium) {
      return { sourceChannel: "search_paid", sourceConfidence: "medium", paidPlatform: "google-ads" };
    }
    if (isTikTokSource && isPaidMedium) {
      return { sourceChannel: "tiktok_paid", sourceConfidence: "medium", paidPlatform: "tiktok-business" };
    }
    if (utmSource === "shop_app") {
      return { sourceChannel: "shop_app", sourceConfidence: "medium", paidPlatform: null };
    }
    if (isMetaSource && isOrganicSocialMedium) {
      return { sourceChannel: "instagram_organic_social", sourceConfidence: "medium", paidPlatform: null };
    }
    if (isTikTokSource && isOrganicSocialMedium) {
      return { sourceChannel: "tiktok_organic_social", sourceConfidence: "medium", paidPlatform: null };
    }
    if (/email|newsletter/.test(utmMedium) || /mailchimp|klaviyo/.test(utmSource)) {
      return { sourceChannel: "email", sourceConfidence: "medium", paidPlatform: null };
    }
    return {
      sourceChannel: "utm_only",
      sourceConfidence: "medium",
      paidPlatform: null,
    };
  }

  if (/(google\.)/.test(referrer)) {
    return { sourceChannel: "google_organic", sourceConfidence: "low", paidPlatform: null };
  }
  if (/(shop\.app)/.test(referrer)) {
    return { sourceChannel: "shop_app", sourceConfidence: "low", paidPlatform: null };
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
      return "search_paid";
    case "tiktok-business":
      return "tiktok_paid";
    default:
      return platform;
  }
}

function canonicalAdFactFamilyRank(fact: AttributionAdFactRecord): number {
  switch (fact.family) {
    case "campaign_daily":
      return 500;
    case "account_daily":
      return 450;
    case "adset_daily":
    case "ad_group_daily":
      return 300;
    case "ad_daily":
      return 200;
    case "account_hourly":
    case "campaign_hourly":
      return 100;
    case "campaign_snapshot":
    case "account_access_snapshot":
      return 10;
    default:
      return fact.granularity === "daily" ? 50 : fact.granularity === "hourly" ? 25 : 0;
  }
}

function selectCanonicalAdFactsForMarts(
  adFacts: AttributionAdFactRecord[],
): AttributionAdFactRecord[] {
  const bestByPlatformDay = new Map<string, number>();
  for (const fact of adFacts) {
    const day = fact.date ?? (fact.hour ? fact.hour.slice(0, 10) : null);
    if (!day || !fact.sourceChannel) {
      continue;
    }
    const key = `${fact.platform}:${day}`;
    const rank = canonicalAdFactFamilyRank(fact);
    const current = bestByPlatformDay.get(key) ?? Number.NEGATIVE_INFINITY;
    if (rank > current) {
      bestByPlatformDay.set(key, rank);
    }
  }

  return adFacts.filter((fact) => {
    const day = fact.date ?? (fact.hour ? fact.hour.slice(0, 10) : null);
    if (!day || !fact.sourceChannel) {
      return false;
    }
    const expectedRank = bestByPlatformDay.get(`${fact.platform}:${day}`);
    if (typeof expectedRank !== "number") {
      return false;
    }
    return canonicalAdFactFamilyRank(fact) === expectedRank;
  });
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
  const webInstallationId = webInstallationIdFromRow(row, metadata);
  const eventName = asString(row.event_name);
  if (!webInstallationId || !eventName) {
    return null;
  }
  const logicalRowId = firstNonEmpty(metadata.logical_row_id, row.event_id, record.record_id, record.id);
  const eventId = firstNonEmpty(row.event_id, logicalRowId);
  if (!logicalRowId || !eventId) {
    return null;
  }
  const enrichedRow = mergedEvidenceWithUrlParams(
    row,
    row.event_source_url,
    row.page_url,
    row.page_path,
    row.landing_path,
  );
  const classification = classifySourceFromEvidence(enrichedRow);
  return {
    scopeId,
    sourceRecordId: record.record_id || record.id,
    logicalRowId,
    webInstallationId,
    eventId,
    eventName,
    capturedAt: parseTimestamp(row.captured_at ?? row.timestamp ?? record.timestamp),
    sessionId: asOptionalString(row.session_id),
    browserId: asOptionalString(row.browser_id),
    consentState: asOptionalString(row.consent_state),
    pageUrl: asOptionalString(enrichedRow.page_url),
    pagePath: asOptionalString(enrichedRow.page_path),
    host: asOptionalString(row.host),
    referrer: asOptionalString(enrichedRow.referrer),
    eventSourceUrl: asOptionalString(enrichedRow.event_source_url),
    sourceChannel: classification.sourceChannel,
    sourceConfidence: classification.sourceConfidence,
    utmSource: asOptionalString(enrichedRow.utm_source),
    utmMedium: asOptionalString(enrichedRow.utm_medium),
    utmCampaign: asOptionalString(enrichedRow.utm_campaign),
    utmContent: asOptionalString(enrichedRow.utm_content),
    utmTerm: asOptionalString(enrichedRow.utm_term),
    fbclid: asOptionalString(enrichedRow.fbclid),
    fbc: asOptionalString(enrichedRow.fbc),
    fbp: asOptionalString(enrichedRow.fbp),
    gclid: asOptionalString(enrichedRow.gclid),
    gbraid: asOptionalString(enrichedRow.gbraid),
    wbraid: asOptionalString(enrichedRow.wbraid),
    ttclid: asOptionalString(enrichedRow.ttclid),
    ttp: asOptionalString(enrichedRow.ttp),
    msclkid: asOptionalString(enrichedRow.msclkid),
    bridgeSurface: asOptionalString(enrichedRow.bridge_surface),
    handoffId: asOptionalString(enrichedRow.handoff_id),
    checkoutToken: asOptionalString(enrichedRow.checkout_token),
    checkoutKey: asOptionalString(enrichedRow.checkout_key),
    checkoutId: asOptionalString(enrichedRow.checkout_id),
    cartToken: asOptionalString(enrichedRow.cart_token),
    formId: asOptionalString(enrichedRow.form_id),
    formSubmissionId: asOptionalString(enrichedRow.form_submission_id),
    bookingId: asOptionalString(enrichedRow.booking_id),
    bookingSlotId: asOptionalString(enrichedRow.booking_slot_id),
    leadExternalId: asOptionalString(enrichedRow.lead_external_id),
    row: enrichedRow,
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
  const bridgeAttributes = mergedEvidenceWithUrlParams(
    {
      ...extractShopifyNoteAttributes(row),
      ...asRecord(row.bridge_attributes),
      ...bridgeAttributesOf(metadata),
    } satisfies RuntimeRow,
    row.event_source_url,
    row.page_url,
    row.page_path,
    row.landing_path,
    row.landing_site,
    row.referring_site,
  );
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
    const key = `${event.webInstallationId}:${event.sessionId}`;
    const existing =
      grouped.get(key) ??
      {
        scopeId,
        webInstallationId: event.webInstallationId,
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
    if (confidenceRank(classification.sourceConfidence) > confidenceRank(existing.sourceConfidence)) {
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
      ) ?? `${event.webInstallationId}:${event.eventId}`;
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
      webInstallationId: event.webInstallationId,
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

  function resolveBridgeMatch(outcome: AttributionBusinessOutcomeRecord): {
    bridge: AttributionConversionBridgeRecord | null;
    matchMethod: string | null;
  } {
    const candidates: Array<[string | null, string]> = [
      [firstNonEmpty(outcome.cartToken, outcome.bridgeAttributes.cart_token), "bridge_cart_token"],
      [firstNonEmpty(outcome.checkoutToken, outcome.bridgeAttributes.checkout_token), "bridge_checkout_token"],
      [firstNonEmpty(outcome.bridgeAttributes.checkout_key), "bridge_checkout_key"],
      [firstNonEmpty(outcome.bridgeAttributes.checkout_id), "bridge_checkout_id"],
      [firstNonEmpty(outcome.bridgeAttributes.handoff_id), "bridge_handoff_id"],
      [firstNonEmpty(outcome.bridgeAttributes.form_submission_id), "bridge_form_submission"],
      [firstNonEmpty(outcome.bridgeAttributes.booking_id), "bridge_booking"],
      [firstNonEmpty(outcome.bridgeAttributes.lead_external_id), "bridge_lead_external_id"],
      [firstNonEmpty(outcome.bridgeAttributes.initiate_checkout_event_id), "bridge_checkout_event"],
    ];
    for (const [candidate, matchMethod] of candidates) {
      if (!candidate) {
        continue;
      }
      const bridge = bridgeByKey.get(candidate);
      if (bridge) {
        return { bridge, matchMethod };
      }
    }
    return { bridge: null, matchMethod: null };
  }

  return outcomes.map((outcome) => {
    const backendClassification = classifySourceFromEvidence(outcome.bridgeAttributes);
    const session = outcome.sessionId ? sessions.get(outcome.sessionId) ?? null : null;
    const bridgeMatch = resolveBridgeMatch(outcome);
    const bridge =
      bridgeMatch.bridge ??
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
    if (bridge && bridgeMatch.matchMethod) {
      matchMethod = bridgeMatch.matchMethod;
    } else if (bridge) {
      matchMethod = "bridge_match";
    } else if (session) {
      matchMethod = "session_match";
    } else if (backendClassification.sourceChannel !== "direct_or_unknown") {
      matchMethod =
        hasSignalValue(outcome.bridgeAttributes.landing_site) ||
        hasSignalValue(outcome.bridgeAttributes.landing_path) ||
        hasSignalValue(outcome.bridgeAttributes.event_source_url)
          ? "landing_site_params"
          : "backend_bridge_attributes";
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

  for (const fact of selectCanonicalAdFactsForMarts(adFacts)) {
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

function processCanonicalRecordWithDb(
  db: DatabaseSync,
  params: Omit<ProcessCanonicalRecordParams, "dataDir">,
): Record<string, unknown> {
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
  const recomputeScopes = params.recomputeScopes !== false;
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

    if (recomputeScopes) {
      perScope.push(recomputeScope(db, binding.scopeId));
    }
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
}

export function processCanonicalRecord(params: ProcessCanonicalRecordParams): Record<string, unknown> {
  return withAttributionDb(params.dataDir, (db) =>
    processCanonicalRecordWithDb(db, {
      record: params.record,
      recordId: params.recordId,
      skipProcessedCheck: params.skipProcessedCheck,
      recomputeScopes: params.recomputeScopes,
    }),
  );
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
    recomputeScopes: false,
  });
}

export async function replayBoundRecords(params: {
  runtime: RuntimeListClient;
  dataDir: string;
  scopeId?: string | null;
  limitPerPlatform?: number | null;
}): Promise<Record<string, unknown>> {
  const db = openAttributionDb(params.dataDir);
  try {
    const bindings = listBindings(db, { scopeId: params.scopeId ?? null });
    if (bindings.length === 0) {
      return { ok: true, processed: 0, skipped: 0, bindings: 0 };
    }

    const limit = Math.max(1, Math.trunc(params.limitPerPlatform ?? DEFAULT_REPLAY_LIMIT));
    const connectionBindings = bindings.filter((binding) => binding.connectionId);

    const seenRecords = new Set<string>();
    let processed = 0;
    let skipped = 0;
    let detailCount = 0;
    let rowsSinceYield = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const binding of connectionBindings) {
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
          const result = processCanonicalRecordWithDb(db, {
            record: row,
            recordId: token,
            skipProcessedCheck: true,
            recomputeScopes: false,
          });
          processed += asInteger(result.processed_scopes);
          skipped += asInteger(result.skipped_scopes);
          detailCount += 1;
          if (details.length < REPLAY_DETAIL_PREVIEW_LIMIT) {
            details.push(result);
          }
          rowsSinceYield += 1;
          if (rowsSinceYield >= REPLAY_YIELD_EVERY_RECORDS) {
            rowsSinceYield = 0;
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }
        if (rows.length < limit) {
          break;
        }
        offset += rows.length;
      }
    }

    const scopeIds = Array.from(new Set(bindings.map((binding) => binding.scopeId)));
    const recomputed = scopeIds.map((scopeId) => recomputeScope(db, scopeId));
    return {
      ok: true,
      bindings: bindings.length,
      scopes: recomputed,
      processed,
      skipped,
      records_seen: seenRecords.size,
      detail_count: detailCount,
      details,
    };
  } finally {
    db.close();
  }
}

export default processRecordIngested;
