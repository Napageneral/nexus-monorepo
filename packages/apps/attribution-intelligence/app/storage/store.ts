import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type AttributionScopeRecord = {
  scopeId: string;
  label: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AttributionBindingRole = "acquisition" | "website" | "backend";
export type AttributionBindingSourceType = "adapter_connection";

export type AttributionBindingRecord = {
  bindingId: string;
  scopeId: string;
  identityKey: string;
  role: AttributionBindingRole;
  sourceType: AttributionBindingSourceType;
  connectionId: string | null;
  platform: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
};

export type AttributionPipelineRunStatus = "running" | "completed" | "completed_empty" | "failed";
export type AttributionPipelineTrigger = "install" | "event" | "manual" | "replay" | "repair";

export type AttributionPipelineRunRecord = {
  runId: string;
  scopeId: string | null;
  trigger: AttributionPipelineTrigger;
  status: AttributionPipelineRunStatus;
  startedAt: number;
  completedAt: number | null;
  stats: Record<string, unknown> | null;
  errorMessage: string | null;
};

export type AttributionAdFactRecord = {
  scopeId: string;
  sourceRecordId: string;
  platform: string;
  connectionId: string | null;
  family: string;
  logicalRowId: string;
  revisionHash: string | null;
  accountId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  adId: string | null;
  adName: string | null;
  date: string | null;
  hour: string | null;
  granularity: "snapshot" | "daily" | "hourly";
  sourceChannel: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  landingPageViews: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  row: Record<string, unknown>;
  derived: Record<string, unknown>;
  updatedAt: number;
};

export type AttributionWebEventRecord = {
  scopeId: string;
  sourceRecordId: string;
  logicalRowId: string;
  webInstallationId: string;
  eventId: string;
  eventName: string;
  capturedAt: number;
  sessionId: string | null;
  browserId: string | null;
  consentState: string | null;
  pageUrl: string | null;
  pagePath: string | null;
  host: string | null;
  referrer: string | null;
  eventSourceUrl: string | null;
  sourceChannel: string | null;
  sourceConfidence: string | null;
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
  row: Record<string, unknown>;
  updatedAt: number;
};

export type AttributionSessionSourceFact = {
  scopeId: string;
  webInstallationId: string;
  sessionId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  eventCount: number;
  pageViews: number;
  contentViews: number;
  ctaClicks: number;
  handoffStarts: number;
  handoffConfirmed: number;
  productViews: number;
  cartAdds: number;
  checkoutStarts: number;
  checkoutCompletes: number;
  formStarts: number;
  formSubmits: number;
  bookingsCompleted: number;
  sourceChannel: string;
  sourceConfidence: string;
  evidence: Record<string, unknown>;
  updatedAt: number;
};

export type AttributionConversionBridgeRecord = {
  scopeId: string;
  bridgeKey: string;
  webInstallationId: string | null;
  sessionId: string | null;
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
  eventId: string | null;
  sourceChannel: string | null;
  sourceConfidence: string | null;
  evidence: Record<string, unknown>;
  occurredAt: number;
  updatedAt: number;
};

export type AttributionBusinessOutcomeRecord = {
  scopeId: string;
  platform: string;
  sourceRecordId: string;
  logicalRowId: string;
  connectionId: string | null;
  backendEntityId: string;
  outcomeType: string;
  outcomeStatus: string | null;
  occurredAt: number;
  currency: string | null;
  grossValue: number | null;
  netValue: number | null;
  customerId: string | null;
  customerEmail: string | null;
  sessionId: string | null;
  checkoutToken: string | null;
  cartToken: string | null;
  bridgeAttributes: Record<string, unknown>;
  row: Record<string, unknown>;
  updatedAt: number;
};

export type AttributionOutcomeAttributionRecord = {
  scopeId: string;
  outcomeId: string;
  sourceChannel: string;
  sourceConfidence: string;
  matchMethod: string;
  paidPlatform: string | null;
  sessionId: string | null;
  evidence: Record<string, unknown>;
  unresolvedReason: string | null;
  updatedAt: number;
};

export type AttributionDailySourceMartRecord = {
  scopeId: string;
  date: string;
  sourceChannel: string;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  outcomes: number;
  grossRevenue: number;
};

export type AttributionDailyFunnelMartRecord = {
  scopeId: string;
  date: string;
  sourceChannel: string;
  sessions: number;
  pageViews: number;
  contentViews: number;
  ctaClicks: number;
  handoffStarts: number;
  handoffConfirmed: number;
  productViews: number;
  cartAdds: number;
  checkoutStarts: number;
  checkoutCompletes: number;
  formStarts: number;
  formSubmits: number;
  bookingsCompleted: number;
  outcomes: number;
  grossRevenue: number;
};

export type AttributionLedgerFilterRecord = {
  reviewOnly: boolean;
  unresolvedOnly: boolean;
  weakMatchOnly: boolean;
  paidOnly: boolean;
  exactPaidIdOnly: boolean;
  utmOnly: boolean;
  directOrUnknownOnly: boolean;
  sourceChannel: string | null;
  query: string | null;
};

export type AttributionLedgerRowRecord = AttributionBusinessOutcomeRecord & {
  attribution: AttributionOutcomeAttributionRecord | null;
  rowCount: number;
  needsReview: boolean;
  unresolved: boolean;
  weakMatch: boolean;
  paid: boolean;
  exactPaidId: boolean;
  utmOnly: boolean;
  multiSignal: boolean;
  directOrUnknown: boolean;
  displayTitle: string | null;
  displayStatus: string | null;
};

export type AttributionLedgerSummaryRecord = {
  totalPrimaryOutcomes: number;
  resolvedPrimaryOutcomes: number;
  unresolvedPrimaryOutcomes: number;
  reviewPrimaryOutcomes: number;
  weakMatchPrimaryOutcomes: number;
  paidPrimaryOutcomes: number;
  exactPaidIdPrimaryOutcomes: number;
  utmOnlyPrimaryOutcomes: number;
  multiSignalPrimaryOutcomes: number;
  directOrUnknownPrimaryOutcomes: number;
};

type SqlRow = Record<string, unknown>;

const DB_NAME = "attribution.db";
const SCHEMA_VERSION = 2;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS attribution_scopes (
  scope_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attribution_bindings (
  binding_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  identity_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  source_type TEXT NOT NULL,
  connection_id TEXT,
  platform TEXT,
  label TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scope_id) REFERENCES attribution_scopes(scope_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attribution_bindings_scope_role ON attribution_bindings(scope_id, role, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_bindings_connection ON attribution_bindings(connection_id, role);

CREATE TABLE IF NOT EXISTS attribution_pipeline_runs (
  run_id TEXT PRIMARY KEY,
  scope_id TEXT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  stats_json TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_attribution_pipeline_runs_scope_started ON attribution_pipeline_runs(scope_id, started_at DESC);

CREATE TABLE IF NOT EXISTS attribution_processed_records (
  scope_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  connection_id TEXT,
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, record_id)
);

CREATE TABLE IF NOT EXISTS attribution_ad_facts (
  scope_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  family TEXT NOT NULL,
  logical_row_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  connection_id TEXT,
  revision_hash TEXT,
  account_id TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_group_id TEXT,
  ad_group_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  date TEXT,
  hour TEXT,
  granularity TEXT NOT NULL,
  source_channel TEXT,
  spend REAL,
  impressions REAL,
  clicks REAL,
  landing_page_views REAL,
  purchases REAL,
  purchase_value REAL,
  row_json TEXT NOT NULL,
  derived_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, platform, family, logical_row_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_ad_facts_scope_date ON attribution_ad_facts(scope_id, date, source_channel);
CREATE INDEX IF NOT EXISTS idx_attribution_ad_facts_source_record ON attribution_ad_facts(source_record_id);

CREATE TABLE IF NOT EXISTS attribution_web_events (
  scope_id TEXT NOT NULL,
  web_installation_id TEXT NOT NULL,
  logical_row_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  session_id TEXT,
  browser_id TEXT,
  consent_state TEXT,
  page_url TEXT,
  page_path TEXT,
  host TEXT,
  referrer TEXT,
  event_source_url TEXT,
  source_channel TEXT,
  source_confidence TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  gclid TEXT,
  gbraid TEXT,
  wbraid TEXT,
  ttclid TEXT,
  ttp TEXT,
  msclkid TEXT,
  bridge_surface TEXT,
  handoff_id TEXT,
  checkout_token TEXT,
  checkout_key TEXT,
  checkout_id TEXT,
  cart_token TEXT,
  form_id TEXT,
  form_submission_id TEXT,
  booking_id TEXT,
  booking_slot_id TEXT,
  lead_external_id TEXT,
  row_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, web_installation_id, logical_row_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_web_events_scope_capture ON attribution_web_events(scope_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_web_events_scope_session ON attribution_web_events(scope_id, session_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_web_events_scope_handoff ON attribution_web_events(scope_id, handoff_id);

CREATE TABLE IF NOT EXISTS attribution_session_source_facts (
  scope_id TEXT NOT NULL,
  web_installation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  page_views INTEGER NOT NULL,
  content_views INTEGER NOT NULL,
  cta_clicks INTEGER NOT NULL,
  handoff_starts INTEGER NOT NULL,
  handoff_confirmed INTEGER NOT NULL,
  product_views INTEGER NOT NULL,
  cart_adds INTEGER NOT NULL,
  checkout_starts INTEGER NOT NULL,
  checkout_completes INTEGER NOT NULL,
  form_starts INTEGER NOT NULL,
  form_submits INTEGER NOT NULL,
  bookings_completed INTEGER NOT NULL,
  source_channel TEXT NOT NULL,
  source_confidence TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, web_installation_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_session_source_scope_first_seen ON attribution_session_source_facts(scope_id, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS attribution_conversion_bridges (
  scope_id TEXT NOT NULL,
  bridge_key TEXT NOT NULL,
  web_installation_id TEXT,
  session_id TEXT,
  bridge_surface TEXT,
  handoff_id TEXT,
  checkout_token TEXT,
  checkout_key TEXT,
  checkout_id TEXT,
  cart_token TEXT,
  form_id TEXT,
  form_submission_id TEXT,
  booking_id TEXT,
  booking_slot_id TEXT,
  lead_external_id TEXT,
  event_id TEXT,
  source_channel TEXT,
  source_confidence TEXT,
  evidence_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, bridge_key)
);
CREATE INDEX IF NOT EXISTS idx_attribution_conversion_bridges_scope_session ON attribution_conversion_bridges(scope_id, session_id);

CREATE TABLE IF NOT EXISTS attribution_business_outcomes (
  scope_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  logical_row_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  connection_id TEXT,
  backend_entity_id TEXT NOT NULL,
  outcome_type TEXT NOT NULL,
  outcome_status TEXT,
  occurred_at INTEGER NOT NULL,
  currency TEXT,
  gross_value REAL,
  net_value REAL,
  customer_id TEXT,
  customer_email TEXT,
  session_id TEXT,
  checkout_token TEXT,
  cart_token TEXT,
  bridge_attributes_json TEXT NOT NULL,
  row_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, platform, logical_row_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_business_outcomes_scope_occurred ON attribution_business_outcomes(scope_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS attribution_outcome_attributions (
  scope_id TEXT NOT NULL,
  outcome_id TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  source_confidence TEXT NOT NULL,
  match_method TEXT NOT NULL,
  paid_platform TEXT,
  session_id TEXT,
  evidence_json TEXT NOT NULL,
  unresolved_reason TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, outcome_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_outcome_attributions_scope_channel ON attribution_outcome_attributions(scope_id, source_channel, updated_at DESC);

CREATE TABLE IF NOT EXISTS attribution_daily_source_marts (
  scope_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  spend REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  clicks REAL NOT NULL DEFAULT 0,
  landing_page_views REAL NOT NULL DEFAULT 0,
  purchases REAL NOT NULL DEFAULT 0,
  purchase_value REAL NOT NULL DEFAULT 0,
  outcomes REAL NOT NULL DEFAULT 0,
  gross_revenue REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_id, date, source_channel)
);

CREATE TABLE IF NOT EXISTS attribution_daily_funnel_marts (
  scope_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  content_views INTEGER NOT NULL DEFAULT 0,
  cta_clicks INTEGER NOT NULL DEFAULT 0,
  handoff_starts INTEGER NOT NULL DEFAULT 0,
  handoff_confirmed INTEGER NOT NULL DEFAULT 0,
  product_views INTEGER NOT NULL DEFAULT 0,
  cart_adds INTEGER NOT NULL DEFAULT 0,
  checkout_starts INTEGER NOT NULL DEFAULT 0,
  checkout_completes INTEGER NOT NULL DEFAULT 0,
  form_starts INTEGER NOT NULL DEFAULT 0,
  form_submits INTEGER NOT NULL DEFAULT 0,
  bookings_completed INTEGER NOT NULL DEFAULT 0,
  outcomes INTEGER NOT NULL DEFAULT 0,
  gross_revenue REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_id, date, source_channel)
);
`;

function nowMs(): number {
  return Date.now();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asOptionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
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

function hasAnySignal(evidence: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => hasSignalValue(evidence[key]));
}

function classifyEvidenceSignals(evidence: Record<string, unknown>): {
  exactPaidId: boolean;
  hasUtm: boolean;
  hasReferrer: boolean;
  hasSession: boolean;
  multiSignal: boolean;
} {
  const exactPaidId = hasAnySignal(evidence, [
    "fbclid",
    "fbc",
    "gclid",
    "gbraid",
    "wbraid",
    "ttclid",
    "msclkid",
  ]);
  const hasUtm = hasAnySignal(evidence, [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]);
  const hasReferrer = hasAnySignal(evidence, ["referrer", "event_source_url", "page_url"]);
  const hasSession = hasAnySignal(evidence, ["session_id", "checkout_token", "cart_token", "handoff_id"]);
  const signalCount = [exactPaidId, hasUtm, hasReferrer, hasSession].filter(Boolean).length;
  return {
    exactPaidId,
    hasUtm,
    hasReferrer,
    hasSession,
    multiSignal: signalCount >= 2,
  };
}

function primaryOutcomePredicateSql(alias = "o"): string {
  return `(
    COALESCE(${alias}.gross_value, 0) > 0
    OR COALESCE(${alias}.net_value, 0) > 0
    OR LOWER(${alias}.outcome_type) IN ('order', 'booking', 'appointment', 'invoice', 'sale', 'lead', 'opportunity')
  )`;
}

function primaryOutcomeRankSql(alias = "o"): string {
  return `CASE LOWER(${alias}.outcome_type)
    WHEN 'order' THEN 80
    WHEN 'invoice' THEN 80
    WHEN 'sale' THEN 80
    WHEN 'booking' THEN 70
    WHEN 'appointment' THEN 70
    WHEN 'consult' THEN 60
    WHEN 'procedure' THEN 60
    WHEN 'lead' THEN 50
    WHEN 'opportunity' THEN 50
    WHEN 'line_item' THEN 40
    WHEN 'fulfillment' THEN 30
    ELSE 10
  END`;
}

function ensureDirectory(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function dbPathFor(dataDir: string): string {
  return path.join(dataDir, DB_NAME);
}

function initializeDb(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  const versionRow = db.prepare("PRAGMA user_version").get() as SqlRow | undefined;
  const currentVersion = versionRow ? asInteger(versionRow.user_version) : 0;
  if (currentVersion === 0) {
    db.exec("BEGIN");
    try {
      db.exec(SCHEMA_SQL);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (currentVersion < SCHEMA_VERSION) {
    db.exec("BEGIN");
    try {
      migrateSchemaToV2(db, currentVersion);
      db.exec(SCHEMA_SQL);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  db.exec(SCHEMA_SQL);
}

function migrateSchemaToV2(db: DatabaseSync, currentVersion: number): void {
  if (currentVersion >= 2) {
    return;
  }

  db.exec(`
DROP INDEX IF EXISTS idx_attribution_bindings_scope_role;
DROP INDEX IF EXISTS idx_attribution_bindings_connection;
DROP INDEX IF EXISTS idx_attribution_web_events_scope_capture;
DROP INDEX IF EXISTS idx_attribution_web_events_scope_session;
DROP INDEX IF EXISTS idx_attribution_web_events_scope_handoff;
DROP INDEX IF EXISTS idx_attribution_session_source_scope_first_seen;
DROP INDEX IF EXISTS idx_attribution_conversion_bridges_scope_session;

ALTER TABLE attribution_bindings RENAME TO attribution_bindings__old;
CREATE TABLE attribution_bindings (
  binding_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  identity_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  source_type TEXT NOT NULL,
  connection_id TEXT,
  platform TEXT,
  label TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scope_id) REFERENCES attribution_scopes(scope_id) ON DELETE CASCADE
);
CREATE INDEX idx_attribution_bindings_scope_role ON attribution_bindings(scope_id, role, updated_at DESC);
CREATE INDEX idx_attribution_bindings_connection ON attribution_bindings(connection_id, role);
INSERT INTO attribution_bindings (
  binding_id, scope_id, identity_key, role, source_type, connection_id, platform, label, metadata_json, created_at, updated_at
)
SELECT
  binding_id,
  scope_id,
  scope_id || ':' || role || ':adapter_connection:' || COALESCE(platform, '') || ':' || COALESCE(connection_id, ''),
  role,
  'adapter_connection',
  connection_id,
  platform,
  label,
  metadata_json,
  created_at,
  updated_at
FROM attribution_bindings__old
WHERE COALESCE(connection_id, '') <> '';
DROP TABLE attribution_bindings__old;

ALTER TABLE attribution_web_events RENAME TO attribution_web_events__old;
CREATE TABLE attribution_web_events (
  scope_id TEXT NOT NULL,
  web_installation_id TEXT NOT NULL,
  logical_row_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  session_id TEXT,
  browser_id TEXT,
  consent_state TEXT,
  page_url TEXT,
  page_path TEXT,
  host TEXT,
  referrer TEXT,
  event_source_url TEXT,
  source_channel TEXT,
  source_confidence TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  gclid TEXT,
  gbraid TEXT,
  wbraid TEXT,
  ttclid TEXT,
  ttp TEXT,
  msclkid TEXT,
  bridge_surface TEXT,
  handoff_id TEXT,
  checkout_token TEXT,
  checkout_key TEXT,
  checkout_id TEXT,
  cart_token TEXT,
  form_id TEXT,
  form_submission_id TEXT,
  booking_id TEXT,
  booking_slot_id TEXT,
  lead_external_id TEXT,
  row_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, web_installation_id, logical_row_id)
);
CREATE INDEX idx_attribution_web_events_scope_capture ON attribution_web_events(scope_id, captured_at DESC);
CREATE INDEX idx_attribution_web_events_scope_session ON attribution_web_events(scope_id, session_id, captured_at DESC);
CREATE INDEX idx_attribution_web_events_scope_handoff ON attribution_web_events(scope_id, handoff_id);
INSERT INTO attribution_web_events (
  scope_id, web_installation_id, logical_row_id, source_record_id, event_id, event_name,
  captured_at, session_id, browser_id, consent_state, page_url, page_path, host, referrer,
  event_source_url, source_channel, source_confidence, utm_source, utm_medium, utm_campaign,
  utm_content, utm_term, fbclid, fbc, fbp, gclid, gbraid, wbraid, ttclid, ttp, msclkid,
  bridge_surface, handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
  form_submission_id, booking_id, booking_slot_id, lead_external_id, row_json, updated_at
)
SELECT
  scope_id, website_installation_id, logical_row_id, source_record_id, event_id, event_name,
  captured_at, session_id, browser_id, consent_state, page_url, page_path, host, referrer,
  event_source_url, source_channel, source_confidence, utm_source, utm_medium, utm_campaign,
  utm_content, utm_term, fbclid, fbc, fbp, gclid, gbraid, wbraid, ttclid, ttp, msclkid,
  bridge_surface, handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
  form_submission_id, booking_id, booking_slot_id, lead_external_id, row_json, updated_at
FROM attribution_web_events__old;
DROP TABLE attribution_web_events__old;

ALTER TABLE attribution_session_source_facts RENAME TO attribution_session_source_facts__old;
CREATE TABLE attribution_session_source_facts (
  scope_id TEXT NOT NULL,
  web_installation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  page_views INTEGER NOT NULL,
  content_views INTEGER NOT NULL,
  cta_clicks INTEGER NOT NULL,
  handoff_starts INTEGER NOT NULL,
  handoff_confirmed INTEGER NOT NULL,
  product_views INTEGER NOT NULL,
  cart_adds INTEGER NOT NULL,
  checkout_starts INTEGER NOT NULL,
  checkout_completes INTEGER NOT NULL,
  form_starts INTEGER NOT NULL,
  form_submits INTEGER NOT NULL,
  bookings_completed INTEGER NOT NULL,
  source_channel TEXT NOT NULL,
  source_confidence TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, web_installation_id, session_id)
);
CREATE INDEX idx_attribution_session_source_scope_first_seen ON attribution_session_source_facts(scope_id, first_seen_at DESC);
INSERT INTO attribution_session_source_facts (
  scope_id, web_installation_id, session_id, first_seen_at, last_seen_at, event_count,
  page_views, content_views, cta_clicks, handoff_starts, handoff_confirmed, product_views,
  cart_adds, checkout_starts, checkout_completes, form_starts, form_submits, bookings_completed,
  source_channel, source_confidence, evidence_json, updated_at
)
SELECT
  scope_id, website_installation_id, session_id, first_seen_at, last_seen_at, event_count,
  page_views, content_views, cta_clicks, handoff_starts, handoff_confirmed, product_views,
  cart_adds, checkout_starts, checkout_completes, form_starts, form_submits, bookings_completed,
  source_channel, source_confidence, evidence_json, updated_at
FROM attribution_session_source_facts__old;
DROP TABLE attribution_session_source_facts__old;

ALTER TABLE attribution_conversion_bridges RENAME TO attribution_conversion_bridges__old;
CREATE TABLE attribution_conversion_bridges (
  scope_id TEXT NOT NULL,
  bridge_key TEXT NOT NULL,
  web_installation_id TEXT,
  session_id TEXT,
  bridge_surface TEXT,
  handoff_id TEXT,
  checkout_token TEXT,
  checkout_key TEXT,
  checkout_id TEXT,
  cart_token TEXT,
  form_id TEXT,
  form_submission_id TEXT,
  booking_id TEXT,
  booking_slot_id TEXT,
  lead_external_id TEXT,
  event_id TEXT,
  source_channel TEXT,
  source_confidence TEXT,
  evidence_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, bridge_key)
);
CREATE INDEX idx_attribution_conversion_bridges_scope_session ON attribution_conversion_bridges(scope_id, session_id);
INSERT INTO attribution_conversion_bridges (
  scope_id, bridge_key, web_installation_id, session_id, bridge_surface, handoff_id,
  checkout_token, checkout_key, checkout_id, cart_token, form_id, form_submission_id, booking_id,
  booking_slot_id, lead_external_id, event_id, source_channel, source_confidence, evidence_json,
  occurred_at, updated_at
)
SELECT
  scope_id, bridge_key, website_installation_id, session_id, bridge_surface, handoff_id,
  checkout_token, checkout_key, checkout_id, cart_token, form_id, form_submission_id, booking_id,
  booking_slot_id, lead_external_id, event_id, source_channel, source_confidence, evidence_json,
  occurred_at, updated_at
FROM attribution_conversion_bridges__old;
DROP TABLE attribution_conversion_bridges__old;
`);
}

export function openAttributionDb(dataDir: string): DatabaseSync {
  ensureDirectory(dataDir);
  const db = new DatabaseSync(dbPathFor(dataDir));
  initializeDb(db);
  return db;
}

export function withAttributionDb<T>(dataDir: string, fn: (db: DatabaseSync) => T): T {
  const db = openAttributionDb(dataDir);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function buildBindingIdentityKey(input: {
  scopeId: string;
  role: AttributionBindingRole;
  sourceType: AttributionBindingSourceType;
  connectionId?: string | null;
  platform?: string | null;
}): string {
  return [
    input.scopeId.trim(),
    input.role,
    input.sourceType,
    asOptionalString(input.platform) ?? "",
    asOptionalString(input.connectionId) ?? "",
  ].join(":");
}

function mapScopeRow(row: SqlRow): AttributionScopeRecord {
  return {
    scopeId: asString(row.scope_id),
    label: asString(row.label),
    description: asOptionalString(row.description),
    createdAt: asInteger(row.created_at),
    updatedAt: asInteger(row.updated_at),
  };
}

function mapBindingRow(row: SqlRow): AttributionBindingRecord {
  return {
    bindingId: asString(row.binding_id),
    scopeId: asString(row.scope_id),
    identityKey: asString(row.identity_key),
    role: asString(row.role) as AttributionBindingRole,
    sourceType: asString(row.source_type) as AttributionBindingSourceType,
    connectionId: asOptionalString(row.connection_id),
    platform: asOptionalString(row.platform),
    label: asOptionalString(row.label),
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: asInteger(row.created_at),
    updatedAt: asInteger(row.updated_at),
  };
}

function mapPipelineRunRow(row: SqlRow): AttributionPipelineRunRecord {
  return {
    runId: asString(row.run_id),
    scopeId: asOptionalString(row.scope_id),
    trigger: asString(row.trigger) as AttributionPipelineTrigger,
    status: asString(row.status) as AttributionPipelineRunStatus,
    startedAt: asInteger(row.started_at),
    completedAt: asNumber(row.completed_at),
    stats: parseJsonRecord(row.stats_json),
    errorMessage: asOptionalString(row.error_message),
  };
}

function mapOutcomeRow(row: SqlRow): AttributionBusinessOutcomeRecord & {
  attribution: AttributionOutcomeAttributionRecord | null;
} {
  const evidence = parseJsonRecord(row.evidence_json);
  return {
    scopeId: asString(row.scope_id),
    platform: asString(row.platform),
    sourceRecordId: asString(row.source_record_id),
    logicalRowId: asString(row.logical_row_id),
    connectionId: asOptionalString(row.connection_id),
    backendEntityId: asString(row.backend_entity_id),
    outcomeType: asString(row.outcome_type),
    outcomeStatus: asOptionalString(row.outcome_status),
    occurredAt: asInteger(row.occurred_at),
    currency: asOptionalString(row.currency),
    grossValue: asNumber(row.gross_value),
    netValue: asNumber(row.net_value),
    customerId: asOptionalString(row.customer_id),
    customerEmail: asOptionalString(row.customer_email),
    sessionId: asOptionalString(row.session_id),
    checkoutToken: asOptionalString(row.checkout_token),
    cartToken: asOptionalString(row.cart_token),
    bridgeAttributes: parseJsonRecord(row.bridge_attributes_json),
    row: parseJsonRecord(row.row_json),
    updatedAt: asInteger(row.updated_at),
    attribution: asString(row.outcome_id)
      ? {
          scopeId: asString(row.scope_id),
          outcomeId: asString(row.outcome_id),
          sourceChannel: asString(row.source_channel),
          sourceConfidence: asString(row.source_confidence),
          matchMethod: asString(row.match_method),
          paidPlatform: asOptionalString(row.paid_platform),
          sessionId: asOptionalString(row.attribution_session_id),
          evidence,
          unresolvedReason: asOptionalString(row.unresolved_reason),
          updatedAt: asInteger(row.attribution_updated_at),
        }
      : null,
  };
}

function displayTitleForOutcome(outcome: AttributionBusinessOutcomeRecord): string | null {
  return (
    firstNonEmpty(
      asOptionalString(outcome.row.name),
      asOptionalString(outcome.row.order_number),
      asOptionalString(outcome.row.order_name),
      asOptionalString(outcome.row.title),
      asOptionalString(outcome.row.display_name),
      outcome.customerEmail,
      outcome.customerId,
      outcome.backendEntityId,
    ) ?? null
  );
}

function toLedgerRow(row: SqlRow): AttributionLedgerRowRecord {
  const outcome = mapOutcomeRow(row);
  const evidence = outcome.attribution?.evidence ?? {};
  const signals = classifyEvidenceSignals(evidence);
  const unresolved = !outcome.attribution || Boolean(outcome.attribution.unresolvedReason);
  const utmOnly = signals.hasUtm && !signals.exactPaidId;
  const matchMethod = outcome.attribution?.matchMethod ?? "";
  const weakMatch =
    !unresolved &&
    ((outcome.attribution?.sourceConfidence ?? "unknown") === "low" ||
      matchMethod === "backend_bridge_attributes" ||
      matchMethod === "landing_site_params" ||
      matchMethod === "bridge_checkout_event" ||
      (matchMethod === "session_match" &&
        !signals.exactPaidId &&
        !signals.multiSignal &&
        !utmOnly));
  return {
    ...outcome,
    rowCount: asInteger(row.entity_row_count),
    needsReview: unresolved || weakMatch || utmOnly,
    unresolved,
    weakMatch,
    paid:
      Boolean(outcome.attribution?.paidPlatform) ||
      Boolean(outcome.attribution?.sourceChannel?.endsWith("_paid")),
    exactPaidId: signals.exactPaidId,
    utmOnly,
    multiSignal: signals.multiSignal,
    directOrUnknown: (outcome.attribution?.sourceChannel ?? "direct_or_unknown") === "direct_or_unknown",
    displayTitle: displayTitleForOutcome(outcome),
    displayStatus: firstNonEmpty(outcome.outcomeStatus, outcome.attribution?.unresolvedReason) ?? null,
  };
}

function listPrimaryOutcomeCandidates(db: DatabaseSync, params: {
  scopeId: string;
  sinceTs?: number;
  untilTs?: number;
  outcomeId?: string | null;
}): AttributionLedgerRowRecord[] {
  const predicate = primaryOutcomePredicateSql("o");
  const rankSql = primaryOutcomeRankSql("o");
  const clauses = ["o.scope_id = ?"];
  const queryParams: Array<string | number> = [params.scopeId];
  if (typeof params.sinceTs === "number") {
    clauses.push("o.occurred_at >= ?");
    queryParams.push(params.sinceTs);
  }
  if (typeof params.untilTs === "number") {
    clauses.push("o.occurred_at < ?");
    queryParams.push(params.untilTs);
  }
  const outcomeId = asOptionalString(params.outcomeId);
  if (outcomeId) {
    clauses.push("o.backend_entity_id = ?");
    queryParams.push(outcomeId);
  }
  const rows = db
    .prepare(
      `WITH ranked AS (
         SELECT o.scope_id, o.platform, o.logical_row_id, o.source_record_id, o.connection_id,
                o.backend_entity_id, o.outcome_type, o.outcome_status, o.occurred_at, o.currency,
                o.gross_value, o.net_value, o.customer_id, o.customer_email, o.session_id,
                o.checkout_token, o.cart_token, o.bridge_attributes_json, o.row_json, o.updated_at,
                a.outcome_id, a.source_channel, a.source_confidence, a.match_method, a.paid_platform,
                a.session_id AS attribution_session_id, a.evidence_json, a.unresolved_reason,
                a.updated_at AS attribution_updated_at,
                COUNT(*) OVER (PARTITION BY o.scope_id, o.backend_entity_id) AS entity_row_count,
                ROW_NUMBER() OVER (
                  PARTITION BY o.scope_id, o.backend_entity_id
                  ORDER BY
                    CASE WHEN COALESCE(o.gross_value, 0) > 0 OR COALESCE(o.net_value, 0) > 0 THEN 1 ELSE 0 END DESC,
                    ${rankSql} DESC,
                    o.occurred_at DESC,
                    o.updated_at DESC,
                    o.logical_row_id DESC
                ) AS entity_rank
           FROM attribution_business_outcomes o
           LEFT JOIN attribution_outcome_attributions a
             ON a.scope_id = o.scope_id
            AND a.outcome_id = o.backend_entity_id
          WHERE ${clauses.join(" AND ")}
            AND ${predicate}
       )
       SELECT *
         FROM ranked
        WHERE entity_rank = 1
        ORDER BY occurred_at DESC, backend_entity_id DESC`,
    )
    .all(...queryParams) as SqlRow[];
  return rows.map(toLedgerRow);
}

function applyLedgerFilters(
  rows: AttributionLedgerRowRecord[],
  filters: AttributionLedgerFilterRecord,
): AttributionLedgerRowRecord[] {
  const sourceChannel = asOptionalString(filters.sourceChannel);
  const query = asOptionalString(filters.query)?.toLowerCase() ?? null;
  return rows.filter((row) => {
    if (filters.reviewOnly && !row.needsReview) {
      return false;
    }
    if (filters.unresolvedOnly && !row.unresolved) {
      return false;
    }
    if (filters.weakMatchOnly && !row.weakMatch) {
      return false;
    }
    if (filters.paidOnly && !row.paid) {
      return false;
    }
    if (filters.exactPaidIdOnly && !row.exactPaidId) {
      return false;
    }
    if (filters.utmOnly && !row.utmOnly) {
      return false;
    }
    if (filters.directOrUnknownOnly && !row.directOrUnknown) {
      return false;
    }
    if (sourceChannel && row.attribution?.sourceChannel !== sourceChannel) {
      return false;
    }
    if (query) {
      const haystack = [
        row.backendEntityId,
        row.displayTitle,
        row.customerEmail,
        row.customerId,
        row.outcomeType,
        row.outcomeStatus,
        row.attribution?.sourceChannel,
      ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

function summarizeLedgerRows(rows: AttributionLedgerRowRecord[]): AttributionLedgerSummaryRecord {
  return {
    totalPrimaryOutcomes: rows.length,
    resolvedPrimaryOutcomes: rows.filter((row) => !row.unresolved).length,
    unresolvedPrimaryOutcomes: rows.filter((row) => row.unresolved).length,
    reviewPrimaryOutcomes: rows.filter((row) => row.needsReview).length,
    weakMatchPrimaryOutcomes: rows.filter((row) => row.weakMatch).length,
    paidPrimaryOutcomes: rows.filter((row) => row.paid).length,
    exactPaidIdPrimaryOutcomes: rows.filter((row) => row.exactPaidId).length,
    utmOnlyPrimaryOutcomes: rows.filter((row) => row.utmOnly).length,
    multiSignalPrimaryOutcomes: rows.filter((row) => row.multiSignal).length,
    directOrUnknownPrimaryOutcomes: rows.filter((row) => row.directOrUnknown).length,
  };
}

export function listScopes(db: DatabaseSync, limit = 50): AttributionScopeRecord[] {
  const rows = db
    .prepare(
      `SELECT scope_id, label, description, created_at, updated_at
         FROM attribution_scopes
        ORDER BY updated_at DESC, scope_id ASC
        LIMIT ?`,
    )
    .all(Math.max(1, Math.trunc(limit))) as SqlRow[];
  return rows.map(mapScopeRow);
}

export function getScope(db: DatabaseSync, scopeId: string): AttributionScopeRecord | null {
  const row = db
    .prepare(
      `SELECT scope_id, label, description, created_at, updated_at
         FROM attribution_scopes
        WHERE scope_id = ?`,
    )
    .get(scopeId.trim()) as SqlRow | undefined;
  return row ? mapScopeRow(row) : null;
}

export function upsertScope(db: DatabaseSync, input: {
  scopeId: string;
  label: string;
  description?: string | null;
}): AttributionScopeRecord {
  const scopeId = asString(input.scopeId);
  const label = asString(input.label);
  if (!scopeId || !label) {
    throw new Error("scope_id and label are required");
  }
  const timestamp = nowMs();
  db.prepare(
    `INSERT INTO attribution_scopes (
       scope_id, label, description, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(scope_id) DO UPDATE SET
       label = excluded.label,
       description = excluded.description,
       updated_at = excluded.updated_at`,
  ).run(
    scopeId,
    label,
    asOptionalString(input.description),
    timestamp,
    timestamp,
  );
  const scope = getScope(db, scopeId);
  if (!scope) {
    throw new Error(`failed to persist scope ${scopeId}`);
  }
  return scope;
}

export function listBindings(db: DatabaseSync, params?: {
  scopeId?: string | null;
  role?: AttributionBindingRole | null;
}): AttributionBindingRecord[] {
  const conditions: string[] = [];
  const values: Array<string> = [];
  if (asOptionalString(params?.scopeId)) {
    conditions.push("scope_id = ?");
    values.push(asString(params?.scopeId));
  }
  if (asOptionalString(params?.role)) {
    conditions.push("role = ?");
    values.push(asString(params?.role));
  }
  const rows = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
         ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY updated_at DESC, binding_id ASC`,
    )
    .all(...values) as SqlRow[];
  return rows.map(mapBindingRow);
}

export function listBindingsForConnection(
  db: DatabaseSync,
  connectionId: string,
  role?: AttributionBindingRole,
): AttributionBindingRecord[] {
  const normalized = asString(connectionId);
  if (!normalized) {
    return [];
  }
  const rows = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
        WHERE connection_id = ?
          ${role ? "AND role = ?" : ""}
        ORDER BY updated_at DESC, binding_id ASC`,
    )
    .all(...(role ? [normalized, role] : [normalized])) as SqlRow[];
  return rows.map(mapBindingRow);
}

export function deleteBinding(
  db: DatabaseSync,
  bindingId: string,
): AttributionBindingRecord | null {
  const normalized = asString(bindingId);
  if (!normalized) {
    return null;
  }
  const existing = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
        WHERE binding_id = ?`,
    )
    .get(normalized) as SqlRow | undefined;
  if (!existing) {
    return null;
  }
  db.prepare(
    `DELETE FROM attribution_bindings
      WHERE binding_id = ?`,
  ).run(normalized);
  return mapBindingRow(existing);
}

export function upsertBinding(db: DatabaseSync, input: {
  bindingId?: string | null;
  scopeId: string;
  role: AttributionBindingRole;
  sourceType: AttributionBindingSourceType;
  connectionId?: string | null;
  platform?: string | null;
  label?: string | null;
  metadata?: Record<string, unknown> | null;
}): AttributionBindingRecord {
  const scopeId = asString(input.scopeId);
  const scope = getScope(db, scopeId);
  if (!scope) {
    throw new Error(`scope ${scopeId} does not exist`);
  }
  const identityKey = buildBindingIdentityKey({
    scopeId,
    role: input.role,
    sourceType: input.sourceType,
    connectionId: input.connectionId,
    platform: input.platform,
  });
  const existing = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
        WHERE identity_key = ?`,
    )
    .get(identityKey) as SqlRow | undefined;

  const bindingId = asOptionalString(input.bindingId) ?? (existing ? asString(existing.binding_id) : randomUUID());
  const timestamp = nowMs();
  db.prepare(
    `INSERT INTO attribution_bindings (
       binding_id, scope_id, identity_key, role, source_type, connection_id,
       platform, label, metadata_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(identity_key) DO UPDATE SET
       scope_id = excluded.scope_id,
       role = excluded.role,
       source_type = excluded.source_type,
       connection_id = excluded.connection_id,
       platform = excluded.platform,
       label = excluded.label,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`,
  ).run(
    bindingId,
    scopeId,
    identityKey,
    input.role,
    input.sourceType,
    asOptionalString(input.connectionId),
    asOptionalString(input.platform),
    asOptionalString(input.label),
    stringifyJson(input.metadata ?? {}),
    timestamp,
    timestamp,
  );

  const row = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
        WHERE identity_key = ?`,
    )
    .get(identityKey) as SqlRow | undefined;
  if (!row) {
    throw new Error(`failed to persist binding ${identityKey}`);
  }
  return mapBindingRow(row);
}

export function startPipelineRun(db: DatabaseSync, input: {
  scopeId?: string | null;
  trigger: AttributionPipelineTrigger;
}): AttributionPipelineRunRecord {
  const runId = randomUUID();
  const startedAt = nowMs();
  db.prepare(
    `INSERT INTO attribution_pipeline_runs (
       run_id, scope_id, trigger, status, started_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(runId, asOptionalString(input.scopeId), input.trigger, "running", startedAt);
  return {
    runId,
    scopeId: asOptionalString(input.scopeId),
    trigger: input.trigger,
    status: "running",
    startedAt,
    completedAt: null,
    stats: {},
    errorMessage: null,
  };
}

export function finishPipelineRun(db: DatabaseSync, input: {
  runId: string;
  status: Exclude<AttributionPipelineRunStatus, "running">;
  stats?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): AttributionPipelineRunRecord {
  const completedAt = nowMs();
  db.prepare(
    `UPDATE attribution_pipeline_runs
        SET status = ?, completed_at = ?, stats_json = ?, error_message = ?
      WHERE run_id = ?`,
  ).run(
    input.status,
    completedAt,
    stringifyJson(input.stats ?? {}),
    asOptionalString(input.errorMessage),
    input.runId,
  );
  const row = db
    .prepare(
      `SELECT run_id, scope_id, trigger, status, started_at, completed_at, stats_json, error_message
         FROM attribution_pipeline_runs
        WHERE run_id = ?`,
    )
    .get(input.runId) as SqlRow | undefined;
  if (!row) {
    throw new Error(`pipeline run ${input.runId} not found`);
  }
  return mapPipelineRunRow(row);
}

export function listPipelineRuns(
  db: DatabaseSync,
  params?: { scopeId?: string | null; limit?: number },
): AttributionPipelineRunRecord[] {
  const scopeId = asOptionalString(params?.scopeId);
  const limit = Math.max(1, Math.trunc(params?.limit ?? 10));
  const rows = db
    .prepare(
      `SELECT run_id, scope_id, trigger, status, started_at, completed_at, stats_json, error_message
         FROM attribution_pipeline_runs
         ${scopeId ? "WHERE scope_id = ?" : ""}
        ORDER BY started_at DESC, run_id DESC
        LIMIT ?`,
    )
    .all(...(scopeId ? [scopeId, limit] : [limit])) as SqlRow[];
  return rows.map(mapPipelineRunRow);
}

export function markRecordProcessed(
  db: DatabaseSync,
  input: { scopeId: string; recordId: string; platform: string; connectionId?: string | null },
): boolean {
  const existing = db
    .prepare(
      `SELECT record_id
         FROM attribution_processed_records
        WHERE scope_id = ? AND record_id = ?`,
    )
    .get(input.scopeId, input.recordId) as SqlRow | undefined;
  if (existing) {
    return false;
  }
  db.prepare(
    `INSERT INTO attribution_processed_records (
       scope_id, record_id, platform, connection_id, processed_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    input.scopeId,
    input.recordId,
    input.platform,
    asOptionalString(input.connectionId),
    nowMs(),
  );
  return true;
}

export function upsertAdFact(db: DatabaseSync, fact: AttributionAdFactRecord): void {
  db.prepare(
    `INSERT INTO attribution_ad_facts (
       scope_id, platform, family, logical_row_id, source_record_id, connection_id, revision_hash,
       account_id, campaign_id, campaign_name, ad_group_id, ad_group_name, ad_id, ad_name,
       date, hour, granularity, source_channel, spend, impressions, clicks, landing_page_views,
       purchases, purchase_value, row_json, derived_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, platform, family, logical_row_id) DO UPDATE SET
       source_record_id = excluded.source_record_id,
       connection_id = excluded.connection_id,
       revision_hash = excluded.revision_hash,
       account_id = excluded.account_id,
       campaign_id = excluded.campaign_id,
       campaign_name = excluded.campaign_name,
       ad_group_id = excluded.ad_group_id,
       ad_group_name = excluded.ad_group_name,
       ad_id = excluded.ad_id,
       ad_name = excluded.ad_name,
       date = excluded.date,
       hour = excluded.hour,
       granularity = excluded.granularity,
       source_channel = excluded.source_channel,
       spend = excluded.spend,
       impressions = excluded.impressions,
       clicks = excluded.clicks,
       landing_page_views = excluded.landing_page_views,
       purchases = excluded.purchases,
       purchase_value = excluded.purchase_value,
       row_json = excluded.row_json,
       derived_json = excluded.derived_json,
       updated_at = excluded.updated_at`,
  ).run(
    fact.scopeId,
    fact.platform,
    fact.family,
    fact.logicalRowId,
    fact.sourceRecordId,
    asOptionalString(fact.connectionId),
    asOptionalString(fact.revisionHash),
    asOptionalString(fact.accountId),
    asOptionalString(fact.campaignId),
    asOptionalString(fact.campaignName),
    asOptionalString(fact.adGroupId),
    asOptionalString(fact.adGroupName),
    asOptionalString(fact.adId),
    asOptionalString(fact.adName),
    asOptionalString(fact.date),
    asOptionalString(fact.hour),
    fact.granularity,
    asOptionalString(fact.sourceChannel),
    fact.spend,
    fact.impressions,
    fact.clicks,
    fact.landingPageViews,
    fact.purchases,
    fact.purchaseValue,
    stringifyJson(fact.row),
    stringifyJson(fact.derived),
    fact.updatedAt,
  );
}

export function upsertWebEvent(db: DatabaseSync, event: AttributionWebEventRecord): void {
  db.prepare(
    `INSERT INTO attribution_web_events (
       scope_id, web_installation_id, logical_row_id, source_record_id, event_id, event_name,
       captured_at, session_id, browser_id, consent_state, page_url, page_path, host, referrer,
       event_source_url, source_channel, source_confidence, utm_source, utm_medium, utm_campaign,
       utm_content, utm_term, fbclid, fbc, fbp, gclid, gbraid, wbraid, ttclid, ttp, msclkid,
       bridge_surface, handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
       form_submission_id, booking_id, booking_slot_id, lead_external_id, row_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, web_installation_id, logical_row_id) DO UPDATE SET
       source_record_id = excluded.source_record_id,
       event_id = excluded.event_id,
       event_name = excluded.event_name,
       captured_at = excluded.captured_at,
       session_id = excluded.session_id,
       browser_id = excluded.browser_id,
       consent_state = excluded.consent_state,
       page_url = excluded.page_url,
       page_path = excluded.page_path,
       host = excluded.host,
       referrer = excluded.referrer,
       event_source_url = excluded.event_source_url,
       source_channel = excluded.source_channel,
       source_confidence = excluded.source_confidence,
       utm_source = excluded.utm_source,
       utm_medium = excluded.utm_medium,
       utm_campaign = excluded.utm_campaign,
       utm_content = excluded.utm_content,
       utm_term = excluded.utm_term,
       fbclid = excluded.fbclid,
       fbc = excluded.fbc,
       fbp = excluded.fbp,
       gclid = excluded.gclid,
       gbraid = excluded.gbraid,
       wbraid = excluded.wbraid,
       ttclid = excluded.ttclid,
       ttp = excluded.ttp,
       msclkid = excluded.msclkid,
       bridge_surface = excluded.bridge_surface,
       handoff_id = excluded.handoff_id,
       checkout_token = excluded.checkout_token,
       checkout_key = excluded.checkout_key,
       checkout_id = excluded.checkout_id,
       cart_token = excluded.cart_token,
       form_id = excluded.form_id,
       form_submission_id = excluded.form_submission_id,
       booking_id = excluded.booking_id,
       booking_slot_id = excluded.booking_slot_id,
       lead_external_id = excluded.lead_external_id,
       row_json = excluded.row_json,
       updated_at = excluded.updated_at`,
  ).run(
    event.scopeId,
    event.webInstallationId,
    event.logicalRowId,
    event.sourceRecordId,
    event.eventId,
    event.eventName,
    event.capturedAt,
    asOptionalString(event.sessionId),
    asOptionalString(event.browserId),
    asOptionalString(event.consentState),
    asOptionalString(event.pageUrl),
    asOptionalString(event.pagePath),
    asOptionalString(event.host),
    asOptionalString(event.referrer),
    asOptionalString(event.eventSourceUrl),
    asOptionalString(event.sourceChannel),
    asOptionalString(event.sourceConfidence),
    asOptionalString(event.utmSource),
    asOptionalString(event.utmMedium),
    asOptionalString(event.utmCampaign),
    asOptionalString(event.utmContent),
    asOptionalString(event.utmTerm),
    asOptionalString(event.fbclid),
    asOptionalString(event.fbc),
    asOptionalString(event.fbp),
    asOptionalString(event.gclid),
    asOptionalString(event.gbraid),
    asOptionalString(event.wbraid),
    asOptionalString(event.ttclid),
    asOptionalString(event.ttp),
    asOptionalString(event.msclkid),
    asOptionalString(event.bridgeSurface),
    asOptionalString(event.handoffId),
    asOptionalString(event.checkoutToken),
    asOptionalString(event.checkoutKey),
    asOptionalString(event.checkoutId),
    asOptionalString(event.cartToken),
    asOptionalString(event.formId),
    asOptionalString(event.formSubmissionId),
    asOptionalString(event.bookingId),
    asOptionalString(event.bookingSlotId),
    asOptionalString(event.leadExternalId),
    stringifyJson(event.row),
    event.updatedAt,
  );
}

export function replaceSessionSourceFacts(
  db: DatabaseSync,
  scopeId: string,
  rows: AttributionSessionSourceFact[],
): void {
  db.prepare(`DELETE FROM attribution_session_source_facts WHERE scope_id = ?`).run(scopeId);
  const statement = db.prepare(
    `INSERT INTO attribution_session_source_facts (
       scope_id, web_installation_id, session_id, first_seen_at, last_seen_at, event_count,
       page_views, content_views, cta_clicks, handoff_starts, handoff_confirmed, product_views,
       cart_adds, checkout_starts, checkout_completes, form_starts, form_submits, bookings_completed,
       source_channel, source_confidence, evidence_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, web_installation_id, session_id) DO UPDATE SET
       first_seen_at = excluded.first_seen_at,
       last_seen_at = excluded.last_seen_at,
       event_count = excluded.event_count,
       page_views = excluded.page_views,
       content_views = excluded.content_views,
       cta_clicks = excluded.cta_clicks,
       handoff_starts = excluded.handoff_starts,
       handoff_confirmed = excluded.handoff_confirmed,
       product_views = excluded.product_views,
       cart_adds = excluded.cart_adds,
       checkout_starts = excluded.checkout_starts,
       checkout_completes = excluded.checkout_completes,
       form_starts = excluded.form_starts,
       form_submits = excluded.form_submits,
       bookings_completed = excluded.bookings_completed,
       source_channel = excluded.source_channel,
       source_confidence = excluded.source_confidence,
       evidence_json = excluded.evidence_json,
       updated_at = excluded.updated_at`,
  );
  for (const row of rows) {
    statement.run(
      row.scopeId,
      row.webInstallationId,
      row.sessionId,
      row.firstSeenAt,
      row.lastSeenAt,
      row.eventCount,
      row.pageViews,
      row.contentViews,
      row.ctaClicks,
      row.handoffStarts,
      row.handoffConfirmed,
      row.productViews,
      row.cartAdds,
      row.checkoutStarts,
      row.checkoutCompletes,
      row.formStarts,
      row.formSubmits,
      row.bookingsCompleted,
      row.sourceChannel,
      row.sourceConfidence,
      stringifyJson(row.evidence),
      row.updatedAt,
    );
  }
}

export function replaceConversionBridges(
  db: DatabaseSync,
  scopeId: string,
  rows: AttributionConversionBridgeRecord[],
): void {
  db.prepare(`DELETE FROM attribution_conversion_bridges WHERE scope_id = ?`).run(scopeId);
  const statement = db.prepare(
    `INSERT INTO attribution_conversion_bridges (
       scope_id, bridge_key, web_installation_id, session_id, bridge_surface, handoff_id,
       checkout_token, checkout_key, checkout_id, cart_token, form_id, form_submission_id, booking_id,
       booking_slot_id, lead_external_id, event_id, source_channel, source_confidence, evidence_json,
       occurred_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, bridge_key) DO UPDATE SET
       web_installation_id = excluded.web_installation_id,
       session_id = excluded.session_id,
       bridge_surface = excluded.bridge_surface,
       handoff_id = excluded.handoff_id,
       checkout_token = excluded.checkout_token,
       checkout_key = excluded.checkout_key,
       checkout_id = excluded.checkout_id,
       cart_token = excluded.cart_token,
       form_id = excluded.form_id,
       form_submission_id = excluded.form_submission_id,
       booking_id = excluded.booking_id,
       booking_slot_id = excluded.booking_slot_id,
       lead_external_id = excluded.lead_external_id,
       event_id = excluded.event_id,
       source_channel = excluded.source_channel,
       source_confidence = excluded.source_confidence,
       evidence_json = excluded.evidence_json,
       occurred_at = excluded.occurred_at,
       updated_at = excluded.updated_at`,
  );
  for (const row of rows) {
    statement.run(
      row.scopeId,
      row.bridgeKey,
      asOptionalString(row.webInstallationId),
      asOptionalString(row.sessionId),
      asOptionalString(row.bridgeSurface),
      asOptionalString(row.handoffId),
      asOptionalString(row.checkoutToken),
      asOptionalString(row.checkoutKey),
      asOptionalString(row.checkoutId),
      asOptionalString(row.cartToken),
      asOptionalString(row.formId),
      asOptionalString(row.formSubmissionId),
      asOptionalString(row.bookingId),
      asOptionalString(row.bookingSlotId),
      asOptionalString(row.leadExternalId),
      asOptionalString(row.eventId),
      asOptionalString(row.sourceChannel),
      asOptionalString(row.sourceConfidence),
      stringifyJson(row.evidence),
      row.occurredAt,
      row.updatedAt,
    );
  }
}

export function upsertBusinessOutcome(db: DatabaseSync, outcome: AttributionBusinessOutcomeRecord): void {
  db.prepare(
    `INSERT INTO attribution_business_outcomes (
       scope_id, platform, logical_row_id, source_record_id, connection_id, backend_entity_id,
       outcome_type, outcome_status, occurred_at, currency, gross_value, net_value, customer_id,
       customer_email, session_id, checkout_token, cart_token, bridge_attributes_json, row_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, platform, logical_row_id) DO UPDATE SET
       source_record_id = excluded.source_record_id,
       connection_id = excluded.connection_id,
       backend_entity_id = excluded.backend_entity_id,
       outcome_type = excluded.outcome_type,
       outcome_status = excluded.outcome_status,
       occurred_at = excluded.occurred_at,
       currency = excluded.currency,
       gross_value = excluded.gross_value,
       net_value = excluded.net_value,
       customer_id = excluded.customer_id,
       customer_email = excluded.customer_email,
       session_id = excluded.session_id,
       checkout_token = excluded.checkout_token,
       cart_token = excluded.cart_token,
       bridge_attributes_json = excluded.bridge_attributes_json,
       row_json = excluded.row_json,
       updated_at = excluded.updated_at`,
  ).run(
    outcome.scopeId,
    outcome.platform,
    outcome.logicalRowId,
    outcome.sourceRecordId,
    asOptionalString(outcome.connectionId),
    outcome.backendEntityId,
    outcome.outcomeType,
    asOptionalString(outcome.outcomeStatus),
    outcome.occurredAt,
    asOptionalString(outcome.currency),
    outcome.grossValue,
    outcome.netValue,
    asOptionalString(outcome.customerId),
    asOptionalString(outcome.customerEmail),
    asOptionalString(outcome.sessionId),
    asOptionalString(outcome.checkoutToken),
    asOptionalString(outcome.cartToken),
    stringifyJson(outcome.bridgeAttributes),
    stringifyJson(outcome.row),
    outcome.updatedAt,
  );
}

export function replaceOutcomeAttributions(
  db: DatabaseSync,
  scopeId: string,
  rows: AttributionOutcomeAttributionRecord[],
): void {
  db.prepare(`DELETE FROM attribution_outcome_attributions WHERE scope_id = ?`).run(scopeId);
  const statement = db.prepare(
    `INSERT INTO attribution_outcome_attributions (
       scope_id, outcome_id, source_channel, source_confidence, match_method, paid_platform,
       session_id, evidence_json, unresolved_reason, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, outcome_id) DO UPDATE SET
       source_channel = excluded.source_channel,
       source_confidence = excluded.source_confidence,
       match_method = excluded.match_method,
       paid_platform = excluded.paid_platform,
       session_id = excluded.session_id,
       evidence_json = excluded.evidence_json,
       unresolved_reason = excluded.unresolved_reason,
       updated_at = excluded.updated_at`,
  );
  for (const row of rows) {
    statement.run(
      row.scopeId,
      row.outcomeId,
      row.sourceChannel,
      row.sourceConfidence,
      row.matchMethod,
      asOptionalString(row.paidPlatform),
      asOptionalString(row.sessionId),
      stringifyJson(row.evidence),
      asOptionalString(row.unresolvedReason),
      row.updatedAt,
    );
  }
}

export function replaceDailySourceMarts(
  db: DatabaseSync,
  scopeId: string,
  rows: AttributionDailySourceMartRecord[],
): void {
  db.prepare(`DELETE FROM attribution_daily_source_marts WHERE scope_id = ?`).run(scopeId);
  const statement = db.prepare(
    `INSERT INTO attribution_daily_source_marts (
       scope_id, date, source_channel, spend, impressions, clicks, landing_page_views,
       purchases, purchase_value, outcomes, gross_revenue
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, date, source_channel) DO UPDATE SET
       spend = excluded.spend,
       impressions = excluded.impressions,
       clicks = excluded.clicks,
       landing_page_views = excluded.landing_page_views,
       purchases = excluded.purchases,
       purchase_value = excluded.purchase_value,
       outcomes = excluded.outcomes,
       gross_revenue = excluded.gross_revenue`,
  );
  for (const row of rows) {
    statement.run(
      row.scopeId,
      row.date,
      row.sourceChannel,
      row.spend,
      row.impressions,
      row.clicks,
      row.landingPageViews,
      row.purchases,
      row.purchaseValue,
      row.outcomes,
      row.grossRevenue,
    );
  }
}

export function replaceDailyFunnelMarts(
  db: DatabaseSync,
  scopeId: string,
  rows: AttributionDailyFunnelMartRecord[],
): void {
  db.prepare(`DELETE FROM attribution_daily_funnel_marts WHERE scope_id = ?`).run(scopeId);
  const statement = db.prepare(
    `INSERT INTO attribution_daily_funnel_marts (
       scope_id, date, source_channel, sessions, page_views, content_views, cta_clicks,
       handoff_starts, handoff_confirmed, product_views, cart_adds, checkout_starts,
       checkout_completes, form_starts, form_submits, bookings_completed, outcomes, gross_revenue
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, date, source_channel) DO UPDATE SET
       sessions = excluded.sessions,
       page_views = excluded.page_views,
       content_views = excluded.content_views,
       cta_clicks = excluded.cta_clicks,
       handoff_starts = excluded.handoff_starts,
       handoff_confirmed = excluded.handoff_confirmed,
       product_views = excluded.product_views,
       cart_adds = excluded.cart_adds,
       checkout_starts = excluded.checkout_starts,
       checkout_completes = excluded.checkout_completes,
       form_starts = excluded.form_starts,
       form_submits = excluded.form_submits,
       bookings_completed = excluded.bookings_completed,
       outcomes = excluded.outcomes,
       gross_revenue = excluded.gross_revenue`,
  );
  for (const row of rows) {
    statement.run(
      row.scopeId,
      row.date,
      row.sourceChannel,
      row.sessions,
      row.pageViews,
      row.contentViews,
      row.ctaClicks,
      row.handoffStarts,
      row.handoffConfirmed,
      row.productViews,
      row.cartAdds,
      row.checkoutStarts,
      row.checkoutCompletes,
      row.formStarts,
      row.formSubmits,
      row.bookingsCompleted,
      row.outcomes,
      row.grossRevenue,
    );
  }
}

export function listSessionSourceFacts(db: DatabaseSync, scopeId: string): AttributionSessionSourceFact[] {
  const rows = db
    .prepare(
      `SELECT scope_id, web_installation_id, session_id, first_seen_at, last_seen_at, event_count,
              page_views, content_views, cta_clicks, handoff_starts, handoff_confirmed, product_views,
              cart_adds, checkout_starts, checkout_completes, form_starts, form_submits, bookings_completed,
              source_channel, source_confidence, evidence_json, updated_at
         FROM attribution_session_source_facts
        WHERE scope_id = ?
        ORDER BY first_seen_at DESC, session_id ASC`,
    )
    .all(scopeId) as SqlRow[];
  return rows.map((row) => ({
    scopeId: asString(row.scope_id),
    webInstallationId: asString(row.web_installation_id),
    sessionId: asString(row.session_id),
    firstSeenAt: asInteger(row.first_seen_at),
    lastSeenAt: asInteger(row.last_seen_at),
    eventCount: asInteger(row.event_count),
    pageViews: asInteger(row.page_views),
    contentViews: asInteger(row.content_views),
    ctaClicks: asInteger(row.cta_clicks),
    handoffStarts: asInteger(row.handoff_starts),
    handoffConfirmed: asInteger(row.handoff_confirmed),
    productViews: asInteger(row.product_views),
    cartAdds: asInteger(row.cart_adds),
    checkoutStarts: asInteger(row.checkout_starts),
    checkoutCompletes: asInteger(row.checkout_completes),
    formStarts: asInteger(row.form_starts),
    formSubmits: asInteger(row.form_submits),
    bookingsCompleted: asInteger(row.bookings_completed),
    sourceChannel: asString(row.source_channel),
    sourceConfidence: asString(row.source_confidence),
    evidence: parseJsonRecord(row.evidence_json),
    updatedAt: asInteger(row.updated_at),
  }));
}

export function listAdFactsForScope(db: DatabaseSync, scopeId: string): AttributionAdFactRecord[] {
  const rows = db
    .prepare(
      `SELECT scope_id, source_record_id, platform, connection_id, family, logical_row_id, revision_hash,
              account_id, campaign_id, campaign_name, ad_group_id, ad_group_name, ad_id, ad_name,
              date, hour, granularity, source_channel, spend, impressions, clicks, landing_page_views,
              purchases, purchase_value, row_json, derived_json, updated_at
         FROM attribution_ad_facts
        WHERE scope_id = ?
        ORDER BY COALESCE(date, ''), COALESCE(hour, ''), family, logical_row_id`,
    )
    .all(scopeId) as SqlRow[];
  return rows.map((row) => ({
    scopeId: asString(row.scope_id),
    sourceRecordId: asString(row.source_record_id),
    platform: asString(row.platform),
    connectionId: asOptionalString(row.connection_id),
    family: asString(row.family),
    logicalRowId: asString(row.logical_row_id),
    revisionHash: asOptionalString(row.revision_hash),
    accountId: asOptionalString(row.account_id),
    campaignId: asOptionalString(row.campaign_id),
    campaignName: asOptionalString(row.campaign_name),
    adGroupId: asOptionalString(row.ad_group_id),
    adGroupName: asOptionalString(row.ad_group_name),
    adId: asOptionalString(row.ad_id),
    adName: asOptionalString(row.ad_name),
    date: asOptionalString(row.date),
    hour: asOptionalString(row.hour),
    granularity: asString(row.granularity) as AttributionAdFactRecord["granularity"],
    sourceChannel: asOptionalString(row.source_channel),
    spend: asNumber(row.spend),
    impressions: asNumber(row.impressions),
    clicks: asNumber(row.clicks),
    landingPageViews: asNumber(row.landing_page_views),
    purchases: asNumber(row.purchases),
    purchaseValue: asNumber(row.purchase_value),
    row: parseJsonRecord(row.row_json),
    derived: parseJsonRecord(row.derived_json),
    updatedAt: asInteger(row.updated_at),
  }));
}

export function listWebEventsForScope(db: DatabaseSync, scopeId: string): AttributionWebEventRecord[] {
  const rows = db
    .prepare(
      `SELECT scope_id, source_record_id, logical_row_id, web_installation_id, event_id, event_name,
              captured_at, session_id, browser_id, consent_state, page_url, page_path, host, referrer,
              event_source_url, source_channel, source_confidence, utm_source, utm_medium, utm_campaign,
              utm_content, utm_term, fbclid, fbc, fbp, gclid, gbraid, wbraid, ttclid, ttp, msclkid,
              bridge_surface, handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
              form_submission_id, booking_id, booking_slot_id, lead_external_id, row_json, updated_at
         FROM attribution_web_events
        WHERE scope_id = ?
        ORDER BY captured_at ASC, event_id ASC`,
    )
    .all(scopeId) as SqlRow[];
  return rows.map((row) => ({
    scopeId: asString(row.scope_id),
    sourceRecordId: asString(row.source_record_id),
    logicalRowId: asString(row.logical_row_id),
    webInstallationId: asString(row.web_installation_id),
    eventId: asString(row.event_id),
    eventName: asString(row.event_name),
    capturedAt: asInteger(row.captured_at),
    sessionId: asOptionalString(row.session_id),
    browserId: asOptionalString(row.browser_id),
    consentState: asOptionalString(row.consent_state),
    pageUrl: asOptionalString(row.page_url),
    pagePath: asOptionalString(row.page_path),
    host: asOptionalString(row.host),
    referrer: asOptionalString(row.referrer),
    eventSourceUrl: asOptionalString(row.event_source_url),
    sourceChannel: asOptionalString(row.source_channel),
    sourceConfidence: asOptionalString(row.source_confidence),
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
    row: parseJsonRecord(row.row_json),
    updatedAt: asInteger(row.updated_at),
  }));
}

export function listBusinessOutcomes(db: DatabaseSync, params?: {
  scopeId?: string | null;
  limit?: number;
}): Array<AttributionBusinessOutcomeRecord & { attribution: AttributionOutcomeAttributionRecord | null }> {
  const scopeId = asOptionalString(params?.scopeId);
  const limit = Math.max(1, Math.trunc(params?.limit ?? 100));
  const rows = db
    .prepare(
      `SELECT o.scope_id, o.platform, o.logical_row_id, o.source_record_id, o.connection_id,
              o.backend_entity_id, o.outcome_type, o.outcome_status, o.occurred_at, o.currency,
              o.gross_value, o.net_value, o.customer_id, o.customer_email, o.session_id,
              o.checkout_token, o.cart_token, o.bridge_attributes_json, o.row_json, o.updated_at,
              a.outcome_id, a.source_channel, a.source_confidence, a.match_method, a.paid_platform,
              a.session_id AS attribution_session_id, a.evidence_json, a.unresolved_reason,
              a.updated_at AS attribution_updated_at
         FROM attribution_business_outcomes o
         LEFT JOIN attribution_outcome_attributions a
           ON a.scope_id = o.scope_id
          AND a.outcome_id = o.backend_entity_id
         ${scopeId ? "WHERE o.scope_id = ?" : ""}
        ORDER BY o.occurred_at DESC, o.backend_entity_id DESC
        LIMIT ?`,
    )
    .all(...(scopeId ? [scopeId, limit] : [limit])) as SqlRow[];
  return rows.map(mapOutcomeRow);
}

export function getBusinessOutcome(
  db: DatabaseSync,
  outcomeId: string,
  scopeId?: string | null,
): (AttributionBusinessOutcomeRecord & { attribution: AttributionOutcomeAttributionRecord | null }) | null {
  const normalizedScopeId = asOptionalString(scopeId);
  const row = db
    .prepare(
      `SELECT o.scope_id, o.platform, o.logical_row_id, o.source_record_id, o.connection_id,
              o.backend_entity_id, o.outcome_type, o.outcome_status, o.occurred_at, o.currency,
              o.gross_value, o.net_value, o.customer_id, o.customer_email, o.session_id,
              o.checkout_token, o.cart_token, o.bridge_attributes_json, o.row_json, o.updated_at,
              a.outcome_id, a.source_channel, a.source_confidence, a.match_method, a.paid_platform,
              a.session_id AS attribution_session_id, a.evidence_json, a.unresolved_reason,
              a.updated_at AS attribution_updated_at
         FROM attribution_business_outcomes o
         LEFT JOIN attribution_outcome_attributions a
           ON a.scope_id = o.scope_id
          AND a.outcome_id = o.backend_entity_id
        WHERE o.backend_entity_id = ?
          ${normalizedScopeId ? "AND o.scope_id = ?" : ""}
        LIMIT 1`,
    )
    .get(...(normalizedScopeId ? [outcomeId.trim(), normalizedScopeId] : [outcomeId.trim()])) as SqlRow | undefined;
  return row ? mapOutcomeRow(row) : null;
}

export function listLedgerOutcomes(db: DatabaseSync, params: {
  scopeId: string;
  days?: number;
  limit?: number;
  offset?: number;
  reviewOnly?: boolean;
  unresolvedOnly?: boolean;
  weakMatchOnly?: boolean;
  paidOnly?: boolean;
  exactPaidIdOnly?: boolean;
  utmOnly?: boolean;
  directOrUnknownOnly?: boolean;
  sourceChannel?: string | null;
  query?: string | null;
}): {
  rows: AttributionLedgerRowRecord[];
  summary: AttributionLedgerSummaryRecord;
  total: number;
  currentWindow: { since: string; untilExclusive: string };
} {
  const days = Math.max(1, Math.trunc(params.days ?? 30));
  const windows = buildSummaryWindow(days);
  const rows = applyLedgerFilters(
    listPrimaryOutcomeCandidates(db, {
      scopeId: params.scopeId,
      sinceTs: windows.currentSinceTs,
      untilTs: windows.currentUntilTs,
    }),
    {
      reviewOnly: Boolean(params.reviewOnly),
      unresolvedOnly: Boolean(params.unresolvedOnly),
      weakMatchOnly: Boolean(params.weakMatchOnly),
      paidOnly: Boolean(params.paidOnly),
      exactPaidIdOnly: Boolean(params.exactPaidIdOnly),
      utmOnly: Boolean(params.utmOnly),
      directOrUnknownOnly: Boolean(params.directOrUnknownOnly),
      sourceChannel: asOptionalString(params.sourceChannel),
      query: asOptionalString(params.query),
    },
  );
  const total = rows.length;
  const limit = Math.max(1, Math.trunc(params.limit ?? 50));
  const offset = Math.max(0, Math.trunc(params.offset ?? 0));
  return {
    rows: rows.slice(offset, offset + limit),
    summary: summarizeLedgerRows(rows),
    total,
    currentWindow: {
      since: windows.currentSinceDate,
      untilExclusive: windows.currentUntilDate,
    },
  };
}

export function readLedgerSummary(db: DatabaseSync, params: {
  scopeId: string;
  days?: number;
}): {
  currentWindow: { since: string; untilExclusive: string };
  summary: AttributionLedgerSummaryRecord;
} {
  const days = Math.max(1, Math.trunc(params.days ?? 30));
  const windows = buildSummaryWindow(days);
  const rows = listPrimaryOutcomeCandidates(db, {
    scopeId: params.scopeId,
    sinceTs: windows.currentSinceTs,
    untilTs: windows.currentUntilTs,
  });
  return {
    currentWindow: {
      since: windows.currentSinceDate,
      untilExclusive: windows.currentUntilDate,
    },
    summary: summarizeLedgerRows(rows),
  };
}

export function getLedgerOutcome(db: DatabaseSync, params: {
  scopeId: string;
  outcomeId: string;
}): AttributionLedgerRowRecord | null {
  const row = listPrimaryOutcomeCandidates(db, {
    scopeId: params.scopeId,
    outcomeId: params.outcomeId,
  })[0];
  return row ?? null;
}

function buildSummaryWindow(days: number): {
  currentSinceTs: number;
  currentUntilTs: number;
  compareSinceTs: number;
  compareUntilTs: number;
  currentSinceDate: string;
  currentUntilDate: string;
  compareSinceDate: string;
  compareUntilDate: string;
} {
  const spanDays = Math.max(1, Math.trunc(days));
  const currentSinceTs = startOfDayMs(Date.now() - spanDays * DAY_MS);
  const currentUntilTs = startOfDayMs(Date.now() + DAY_MS);
  const compareUntilTs = currentSinceTs;
  const compareSinceTs = compareUntilTs - spanDays * DAY_MS;
  return {
    currentSinceTs,
    currentUntilTs,
    compareSinceTs,
    compareUntilTs,
    currentSinceDate: isoDay(currentSinceTs),
    currentUntilDate: isoDay(currentUntilTs),
    compareSinceDate: isoDay(compareSinceTs),
    compareUntilDate: isoDay(compareUntilTs),
  };
}

function ratio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function metricCard(current: number, previous: number, formatter: string): Record<string, unknown> {
  let delta: number | null = null;
  if (previous !== 0) {
    delta = (current - previous) / previous;
  } else if (current !== 0) {
    delta = 1;
  }
  return {
    value: current,
    previous,
    delta,
    formatter,
  };
}

function readSummaryTotals(
  db: DatabaseSync,
  scopeId: string,
  sinceDate: string,
  untilDate: string,
): SqlRow {
  return db
    .prepare(
      `SELECT COALESCE(SUM(spend), 0) AS spend,
              COALESCE(SUM(impressions), 0) AS impressions,
              COALESCE(SUM(clicks), 0) AS clicks,
              COALESCE(SUM(landing_page_views), 0) AS landing_page_views,
              COALESCE(SUM(purchases), 0) AS purchases,
              COALESCE(SUM(purchase_value), 0) AS purchase_value,
              COALESCE(SUM(outcomes), 0) AS outcomes,
              COALESCE(SUM(gross_revenue), 0) AS gross_revenue
         FROM attribution_daily_source_marts
        WHERE scope_id = ?
          AND date >= ?
          AND date < ?`,
    )
    .get(scopeId, sinceDate, untilDate) as SqlRow;
}

function readAttributionStrip(
  db: DatabaseSync,
  scopeId: string,
  sinceTs: number,
  untilTs: number,
): Record<string, number> {
  const summary = summarizeLedgerRows(
    listPrimaryOutcomeCandidates(db, {
      scopeId,
      sinceTs,
      untilTs,
    }),
  );
  const totalPrimaryOutcomes = summary.totalPrimaryOutcomes;
  const resolvedPrimaryOutcomes = summary.resolvedPrimaryOutcomes;
  const unresolvedPrimaryOutcomes = summary.unresolvedPrimaryOutcomes;
  return {
    total_primary_outcomes: totalPrimaryOutcomes,
    resolved_primary_outcomes: resolvedPrimaryOutcomes,
    unresolved_primary_outcomes: unresolvedPrimaryOutcomes,
    review_primary_outcomes: summary.reviewPrimaryOutcomes,
    weak_match_primary_outcomes: summary.weakMatchPrimaryOutcomes,
    direct_or_unknown_primary_outcomes: summary.directOrUnknownPrimaryOutcomes,
    paid_primary_outcomes: summary.paidPrimaryOutcomes,
    exact_paid_id_primary_outcomes: summary.exactPaidIdPrimaryOutcomes,
    utm_only_primary_outcomes: summary.utmOnlyPrimaryOutcomes,
    multi_signal_primary_outcomes: summary.multiSignalPrimaryOutcomes,
    coverage_rate: ratio(resolvedPrimaryOutcomes, totalPrimaryOutcomes),
    unresolved_rate: ratio(unresolvedPrimaryOutcomes, totalPrimaryOutcomes),
  };
}

function readLatestActivity(db: DatabaseSync, scopeId: string): Record<string, unknown> {
  const row = db
    .prepare(
      `SELECT
          (SELECT MAX(updated_at) FROM attribution_ad_facts WHERE scope_id = ?) AS latest_ad_fact_at,
          (SELECT MAX(captured_at) FROM attribution_web_events WHERE scope_id = ?) AS latest_web_event_at,
          (SELECT MAX(captured_at) FROM attribution_web_events WHERE scope_id = ? AND event_name = 'product_view') AS last_product_view_at,
          (SELECT MAX(captured_at) FROM attribution_web_events WHERE scope_id = ? AND event_name = 'cta_click') AS last_cta_click_at,
          (SELECT MAX(captured_at) FROM attribution_web_events WHERE scope_id = ? AND event_name = 'handoff_start') AS last_handoff_started_at,
          (SELECT MAX(captured_at) FROM attribution_web_events WHERE scope_id = ? AND event_name = 'handoff_confirmed') AS last_handoff_confirmed_at,
          (SELECT MAX(occurred_at) FROM attribution_business_outcomes WHERE scope_id = ?) AS latest_backend_outcome_at`,
    )
    .get(scopeId, scopeId, scopeId, scopeId, scopeId, scopeId, scopeId) as SqlRow;
  return {
    latest_ad_fact_at: asNumber(row.latest_ad_fact_at),
    latest_web_event_at: asNumber(row.latest_web_event_at),
    last_product_view_at: asNumber(row.last_product_view_at),
    last_cta_click_at: asNumber(row.last_cta_click_at),
    last_handoff_started_at: asNumber(row.last_handoff_started_at),
    last_handoff_confirmed_at: asNumber(row.last_handoff_confirmed_at),
    latest_backend_outcome_at: asNumber(row.latest_backend_outcome_at),
  };
}

type SourceMartMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  landing_page_views: number;
  purchases: number;
  purchase_value: number;
  outcomes: number;
  gross_revenue: number;
};

function emptySourceMartMetrics(): SourceMartMetrics {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    landing_page_views: 0,
    purchases: 0,
    purchase_value: 0,
    outcomes: 0,
    gross_revenue: 0,
  };
}

function addSourceMartMetrics(target: SourceMartMetrics, row: SqlRow): void {
  target.spend += asNumber(row.spend) ?? 0;
  target.impressions += asNumber(row.impressions) ?? 0;
  target.clicks += asNumber(row.clicks) ?? 0;
  target.landing_page_views += asNumber(row.landing_page_views) ?? 0;
  target.purchases += asNumber(row.purchases) ?? 0;
  target.purchase_value += asNumber(row.purchase_value) ?? 0;
  target.outcomes += asNumber(row.outcomes) ?? 0;
  target.gross_revenue += asNumber(row.gross_revenue) ?? 0;
}

function sourceMartMetricCards(current: SourceMartMetrics, previous: SourceMartMetrics): Record<string, unknown> {
  return {
    spend: metricCard(current.spend, previous.spend, "money"),
    clicks: metricCard(current.clicks, previous.clicks, "count"),
    outcomes: metricCard(current.outcomes, previous.outcomes, "count"),
    gross_revenue: metricCard(current.gross_revenue, previous.gross_revenue, "money"),
    roas: metricCard(
      ratio(current.purchase_value, current.spend),
      ratio(previous.purchase_value, previous.spend),
      "ratio",
    ),
  };
}

function classifyChannelFamily(sourceChannel: string): string {
  const normalized = sourceChannel.trim().toLowerCase();
  if (!normalized || normalized === "direct_or_unknown") {
    return "direct";
  }
  if (
    normalized.endsWith("_paid") ||
    normalized.includes("paid_") ||
    normalized.startsWith("paid_") ||
    normalized === "search_paid" ||
    normalized === "meta_paid" ||
    normalized === "google_paid" ||
    normalized === "tiktok_paid"
  ) {
    return "paid";
  }
  if (normalized.includes("referral") || normalized.includes("affiliate") || normalized.includes("partner")) {
    return "referral";
  }
  if (
    normalized.includes("organic") ||
    normalized === "shop_app" ||
    normalized === "email" ||
    normalized === "sms" ||
    normalized === "ig" ||
    normalized === "facebook_organic_social"
  ) {
    return "organic";
  }
  return "organic";
}

function sortChannelFamily(value: string): number {
  switch (value) {
    case "paid":
      return 0;
    case "organic":
      return 1;
    case "referral":
      return 2;
    case "direct":
      return 3;
    default:
      return 4;
  }
}

function readSourceBreakdowns(
  db: DatabaseSync,
  scopeId: string,
  windows: ReturnType<typeof buildSummaryWindow>,
): {
  channel_groups: Array<Record<string, unknown>>;
  source_breakdown: Array<Record<string, unknown>>;
  channel_trajectory: Array<Record<string, unknown>>;
  source_trajectory: Array<Record<string, unknown>>;
} {
  const rows = db
    .prepare(
      `SELECT date, source_channel,
              COALESCE(SUM(spend), 0) AS spend,
              COALESCE(SUM(impressions), 0) AS impressions,
              COALESCE(SUM(clicks), 0) AS clicks,
              COALESCE(SUM(landing_page_views), 0) AS landing_page_views,
              COALESCE(SUM(purchases), 0) AS purchases,
              COALESCE(SUM(purchase_value), 0) AS purchase_value,
              COALESCE(SUM(outcomes), 0) AS outcomes,
              COALESCE(SUM(gross_revenue), 0) AS gross_revenue
         FROM attribution_daily_source_marts
        WHERE scope_id = ?
          AND date >= ?
          AND date < ?
        GROUP BY date, source_channel
        ORDER BY date ASC, source_channel ASC`,
    )
    .all(scopeId, windows.compareSinceDate, windows.currentUntilDate) as SqlRow[];

  const sourceCurrent = new Map<string, SourceMartMetrics>();
  const sourceCompare = new Map<string, SourceMartMetrics>();
  const familyCurrent = new Map<string, SourceMartMetrics>();
  const familyCompare = new Map<string, SourceMartMetrics>();
  const channelTrajectory = new Map<string, SourceMartMetrics>();

  for (const row of rows) {
    const date = asString(row.date);
    const sourceChannel = asString(row.source_channel);
    const family = classifyChannelFamily(sourceChannel);
    const inCurrent = date >= windows.currentSinceDate && date < windows.currentUntilDate;
    const inCompare = date >= windows.compareSinceDate && date < windows.compareUntilDate;

    if (inCurrent) {
      const sourceMetrics = sourceCurrent.get(sourceChannel) ?? emptySourceMartMetrics();
      addSourceMartMetrics(sourceMetrics, row);
      sourceCurrent.set(sourceChannel, sourceMetrics);

      const familyMetrics = familyCurrent.get(family) ?? emptySourceMartMetrics();
      addSourceMartMetrics(familyMetrics, row);
      familyCurrent.set(family, familyMetrics);

      const trajectoryKey = `${date}:${family}`;
      const trajectoryMetrics = channelTrajectory.get(trajectoryKey) ?? emptySourceMartMetrics();
      addSourceMartMetrics(trajectoryMetrics, row);
      channelTrajectory.set(trajectoryKey, trajectoryMetrics);
    }

    if (inCompare) {
      const sourceMetrics = sourceCompare.get(sourceChannel) ?? emptySourceMartMetrics();
      addSourceMartMetrics(sourceMetrics, row);
      sourceCompare.set(sourceChannel, sourceMetrics);

      const familyMetrics = familyCompare.get(family) ?? emptySourceMartMetrics();
      addSourceMartMetrics(familyMetrics, row);
      familyCompare.set(family, familyMetrics);
    }
  }

  const sourceBreakdown = Array.from(new Set([...sourceCurrent.keys(), ...sourceCompare.keys()]))
    .map((sourceChannel) => {
      const current = sourceCurrent.get(sourceChannel) ?? emptySourceMartMetrics();
      const previous = sourceCompare.get(sourceChannel) ?? emptySourceMartMetrics();
      return {
        source_channel: sourceChannel,
        channel_family: classifyChannelFamily(sourceChannel),
        totals: { ...current },
        compare_totals: { ...previous },
        kpis: sourceMartMetricCards(current, previous),
      };
    })
    .sort((left, right) => {
      const leftRevenue = asNumber(asRecord(left.totals).gross_revenue) ?? 0;
      const rightRevenue = asNumber(asRecord(right.totals).gross_revenue) ?? 0;
      if (rightRevenue !== leftRevenue) {
        return rightRevenue - leftRevenue;
      }
      const leftSpend = asNumber(asRecord(left.totals).spend) ?? 0;
      const rightSpend = asNumber(asRecord(right.totals).spend) ?? 0;
      if (rightSpend !== leftSpend) {
        return rightSpend - leftSpend;
      }
      return asString(left.source_channel).localeCompare(asString(right.source_channel));
    });

  const topSourceChannels = new Set(
    sourceBreakdown
      .slice(0, 6)
      .map((row) => asString(row.source_channel))
      .filter(Boolean),
  );

  const channelGroups = Array.from(new Set([...familyCurrent.keys(), ...familyCompare.keys()]))
    .map((family) => {
      const current = familyCurrent.get(family) ?? emptySourceMartMetrics();
      const previous = familyCompare.get(family) ?? emptySourceMartMetrics();
      return {
        channel_family: family,
        totals: { ...current },
        compare_totals: { ...previous },
        kpis: sourceMartMetricCards(current, previous),
      };
    })
    .sort((left, right) => {
      const familyDelta = sortChannelFamily(asString(left.channel_family)) - sortChannelFamily(asString(right.channel_family));
      if (familyDelta !== 0) {
        return familyDelta;
      }
      const leftRevenue = asNumber(asRecord(left.totals).gross_revenue) ?? 0;
      const rightRevenue = asNumber(asRecord(right.totals).gross_revenue) ?? 0;
      return rightRevenue - leftRevenue;
    });

  const sourceTrajectory = rows
    .filter((row) => {
      const date = asString(row.date);
      const sourceChannel = asString(row.source_channel);
      return (
        date >= windows.currentSinceDate &&
        date < windows.currentUntilDate &&
        topSourceChannels.has(sourceChannel)
      );
    })
    .map((row) => ({
      date: asString(row.date),
      source_channel: asString(row.source_channel),
      channel_family: classifyChannelFamily(asString(row.source_channel)),
      spend: asNumber(row.spend) ?? 0,
      clicks: asNumber(row.clicks) ?? 0,
      outcomes: asNumber(row.outcomes) ?? 0,
      gross_revenue: asNumber(row.gross_revenue) ?? 0,
    }));

  const familyTrajectoryRows = Array.from(channelTrajectory.entries())
    .map(([key, metrics]) => {
      const [date, channelFamily] = key.split(":");
      return {
        date,
        channel_family: channelFamily,
        spend: metrics.spend,
        clicks: metrics.clicks,
        outcomes: metrics.outcomes,
        gross_revenue: metrics.gross_revenue,
      };
    })
    .sort((left, right) => {
      const dateDelta = asString(left.date).localeCompare(asString(right.date));
      if (dateDelta !== 0) {
        return dateDelta;
      }
      return sortChannelFamily(asString(left.channel_family)) - sortChannelFamily(asString(right.channel_family));
    });

  return {
    channel_groups: channelGroups,
    source_breakdown: sourceBreakdown,
    channel_trajectory: familyTrajectoryRows,
    source_trajectory: sourceTrajectory,
  };
}

export function readSummary(db: DatabaseSync, scopeId: string, days = 30): Record<string, unknown> {
  const windows = buildSummaryWindow(days);
  const sourceRows = readSummaryTotals(db, scopeId, windows.currentSinceDate, windows.currentUntilDate);
  const compareRows = readSummaryTotals(db, scopeId, windows.compareSinceDate, windows.compareUntilDate);
  const attributionStrip = readAttributionStrip(db, scopeId, windows.currentSinceTs, windows.currentUntilTs);
  const compareAttributionStrip = readAttributionStrip(db, scopeId, windows.compareSinceTs, windows.compareUntilTs);
  const sourceBreakdowns = readSourceBreakdowns(db, scopeId, windows);
  const topChannels = db
    .prepare(
      `SELECT source_channel,
              COALESCE(SUM(spend), 0) AS spend,
              COALESCE(SUM(clicks), 0) AS clicks,
              COALESCE(SUM(outcomes), 0) AS outcomes,
              COALESCE(SUM(gross_revenue), 0) AS gross_revenue
         FROM attribution_daily_source_marts
        WHERE scope_id = ?
          AND date >= ?
          AND date < ?
        GROUP BY source_channel
        ORDER BY gross_revenue DESC, spend DESC
        LIMIT 8`,
    )
    .all(scopeId, windows.currentSinceDate, windows.currentUntilDate) as SqlRow[];
  const totals = {
    spend: asNumber(sourceRows.spend) ?? 0,
    impressions: asNumber(sourceRows.impressions) ?? 0,
    clicks: asNumber(sourceRows.clicks) ?? 0,
    landing_page_views: asNumber(sourceRows.landing_page_views) ?? 0,
    purchases: asNumber(sourceRows.purchases) ?? 0,
    purchase_value: asNumber(sourceRows.purchase_value) ?? 0,
    outcomes: asNumber(sourceRows.outcomes) ?? 0,
    gross_revenue: asNumber(sourceRows.gross_revenue) ?? 0,
  };
  const compareTotals = {
    spend: asNumber(compareRows.spend) ?? 0,
    impressions: asNumber(compareRows.impressions) ?? 0,
    clicks: asNumber(compareRows.clicks) ?? 0,
    landing_page_views: asNumber(compareRows.landing_page_views) ?? 0,
    purchases: asNumber(compareRows.purchases) ?? 0,
    purchase_value: asNumber(compareRows.purchase_value) ?? 0,
    outcomes: asNumber(compareRows.outcomes) ?? 0,
    gross_revenue: asNumber(compareRows.gross_revenue) ?? 0,
  };
  return {
    scope_id: scopeId,
    window_days: days,
    current_window: {
      since: windows.currentSinceDate,
      until_exclusive: windows.currentUntilDate,
    },
    compare_window: {
      since: windows.compareSinceDate,
      until_exclusive: windows.compareUntilDate,
    },
    totals,
    compare_totals: compareTotals,
    kpis: {
      spend: metricCard(totals.spend, compareTotals.spend, "money"),
      impressions: metricCard(totals.impressions, compareTotals.impressions, "count"),
      clicks: metricCard(totals.clicks, compareTotals.clicks, "count"),
      landing_page_views: metricCard(totals.landing_page_views, compareTotals.landing_page_views, "count"),
      purchases: metricCard(totals.purchases, compareTotals.purchases, "count"),
      purchase_value: metricCard(totals.purchase_value, compareTotals.purchase_value, "money"),
      outcomes: metricCard(totals.outcomes, compareTotals.outcomes, "count"),
      gross_revenue: metricCard(totals.gross_revenue, compareTotals.gross_revenue, "money"),
      roas: metricCard(
        ratio(totals.purchase_value, totals.spend),
        ratio(compareTotals.purchase_value, compareTotals.spend),
        "ratio",
      ),
      match_rate: metricCard(attributionStrip.coverage_rate, compareAttributionStrip.coverage_rate, "percent"),
    },
    attribution_strip: attributionStrip,
    compare_attribution_strip: compareAttributionStrip,
    latest_activity: readLatestActivity(db, scopeId),
    live_funnel: readLiveFunnel(db, scopeId),
    channel_groups: sourceBreakdowns.channel_groups,
    source_breakdown: sourceBreakdowns.source_breakdown,
    channel_trajectory: sourceBreakdowns.channel_trajectory,
    source_trajectory: sourceBreakdowns.source_trajectory,
    top_channels: topChannels.map((row) => ({
      source_channel: asString(row.source_channel),
      spend: asNumber(row.spend) ?? 0,
      clicks: asNumber(row.clicks) ?? 0,
      outcomes: asNumber(row.outcomes) ?? 0,
      gross_revenue: asNumber(row.gross_revenue) ?? 0,
    })),
  };
}

function readLiveFunnel(db: DatabaseSync, scopeId: string): Record<string, unknown> {
  const windows = [
    { window: "15m", minutes: 15 },
    { window: "60m", minutes: 60 },
    { window: "24h", minutes: 24 * 60 },
  ].map(({ window, minutes }) => {
    const sinceTs = nowMs() - minutes * 60 * 1000;
    const events = db
      .prepare(
        `SELECT
           COUNT(CASE WHEN event_name = 'product_view' THEN 1 END) AS product_views,
           COUNT(CASE WHEN event_name = 'cta_click' THEN 1 END) AS cta_clicks,
           COUNT(CASE WHEN event_name = 'handoff_start' THEN 1 END) AS handoff_starts,
           COUNT(CASE WHEN event_name = 'handoff_confirmed' THEN 1 END) AS handoff_confirmed,
           COUNT(DISTINCT CASE WHEN event_name = 'product_view' THEN session_id END) AS product_view_sessions,
           COUNT(DISTINCT CASE WHEN event_name = 'cta_click' THEN session_id END) AS cta_click_sessions,
           COUNT(DISTINCT CASE WHEN event_name = 'handoff_start' THEN session_id END) AS handoff_sessions
         FROM attribution_web_events
        WHERE scope_id = ?
          AND captured_at >= ?`,
      )
      .get(scopeId, sinceTs) as SqlRow;
    const outcomes = db
      .prepare(
        `SELECT
           COUNT(DISTINCT CASE WHEN COALESCE(gross_value, 0) > 0 OR COALESCE(net_value, 0) > 0 THEN backend_entity_id END) AS attributed_outcomes,
           COALESCE(SUM(CASE WHEN COALESCE(gross_value, 0) > 0 THEN gross_value ELSE 0 END), 0) AS gross_revenue
         FROM attribution_business_outcomes
        WHERE scope_id = ?
          AND occurred_at >= ?`,
      )
      .get(scopeId, sinceTs) as SqlRow;
    const productViews = asInteger(events.product_views);
    const ctaClicks = asInteger(events.cta_clicks);
    const handoffStarts = asInteger(events.handoff_starts);
    const handoffConfirmed = asInteger(events.handoff_confirmed);
    return {
      window,
      minutes,
      product_views: productViews,
      cta_clicks: ctaClicks,
      handoff_starts: handoffStarts,
      handoff_confirmed: handoffConfirmed,
      handoff_unconfirmed: Math.max(0, handoffStarts - handoffConfirmed),
      product_view_sessions: asInteger(events.product_view_sessions),
      cta_click_sessions: asInteger(events.cta_click_sessions),
      handoff_sessions: asInteger(events.handoff_sessions),
      product_view_to_cta_rate: ratio(ctaClicks, productViews),
      cta_to_handoff_rate: ratio(handoffStarts, ctaClicks),
      handoff_confirmation_rate: ratio(handoffConfirmed, handoffStarts),
      outcomes: asInteger(outcomes.attributed_outcomes),
      gross_revenue: asNumber(outcomes.gross_revenue) ?? 0,
    };
  });

  const latest = db
    .prepare(
      `SELECT
         MAX(captured_at) AS last_event_at,
         MAX(CASE WHEN event_name = 'product_view' THEN captured_at END) AS last_product_view_at,
         MAX(CASE WHEN event_name = 'cta_click' THEN captured_at END) AS last_cta_click_at,
         MAX(CASE WHEN event_name = 'handoff_start' THEN captured_at END) AS last_handoff_start_at,
         MAX(CASE WHEN event_name = 'handoff_confirmed' THEN captured_at END) AS last_handoff_confirmed_at
       FROM attribution_web_events
      WHERE scope_id = ?`,
    )
    .get(scopeId) as SqlRow;
  const latestOutcome = db
    .prepare(
      `SELECT MAX(occurred_at) AS last_outcome_at
         FROM attribution_business_outcomes
        WHERE scope_id = ?`,
    )
    .get(scopeId) as SqlRow;

  const alerts: Array<Record<string, string>> = [];
  const last15 = asRecord(windows[0]);
  const last60 = asRecord(windows[1]);
  if (asInteger(last15.cta_clicks) >= 5 && asInteger(last15.handoff_starts) === 0) {
    alerts.push({
      level: "critical",
      title: "Clicks without handoffs",
      detail: `${asInteger(last15.cta_clicks)} CTA clicks but 0 handoff starts in the last 15 minutes.`,
    });
  }
  if (asInteger(last60.product_views) >= 20 && asInteger(last60.cta_clicks) === 0) {
    alerts.push({
      level: "warning",
      title: "Views without clicks",
      detail: `${asInteger(last60.product_views)} product views but 0 CTA clicks in the last 60 minutes.`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      level: "ok",
      title: "No active funnel alerts",
      detail: "Recent web-journey funnel steps look healthy.",
    });
  }

  return {
    status: asString(alerts[0]?.level),
    alerts,
    windows,
    latest: {
      last_event_at: asNumber(latest.last_event_at),
      last_product_view_at: asNumber(latest.last_product_view_at),
      last_cta_click_at: asNumber(latest.last_cta_click_at),
      last_handoff_start_at: asNumber(latest.last_handoff_start_at),
      last_handoff_confirmed_at: asNumber(latest.last_handoff_confirmed_at),
      last_outcome_at: asNumber(latestOutcome.last_outcome_at),
    },
  };
}

export function readFunnel(db: DatabaseSync, scopeId: string, days = 30): Record<string, unknown> {
  const windows = buildSummaryWindow(days);
  const rows = db
    .prepare(
      `SELECT date, source_channel, sessions, page_views, content_views, cta_clicks,
              handoff_starts, handoff_confirmed, product_views, cart_adds, checkout_starts,
              checkout_completes, form_starts, form_submits, bookings_completed, outcomes, gross_revenue
         FROM attribution_daily_funnel_marts
        WHERE scope_id = ?
          AND date >= ?
          AND date < ?
        ORDER BY date DESC, source_channel ASC`,
    )
    .all(scopeId, windows.currentSinceDate, windows.currentUntilDate) as SqlRow[];
  return {
    scope_id: scopeId,
    window_days: Math.max(1, Math.trunc(days)),
    rows: rows.map((row) => ({
      date: asString(row.date),
      source_channel: asString(row.source_channel),
      sessions: asInteger(row.sessions),
      page_views: asInteger(row.page_views),
      content_views: asInteger(row.content_views),
      cta_clicks: asInteger(row.cta_clicks),
      handoff_starts: asInteger(row.handoff_starts),
      handoff_confirmed: asInteger(row.handoff_confirmed),
      product_views: asInteger(row.product_views),
      cart_adds: asInteger(row.cart_adds),
      checkout_starts: asInteger(row.checkout_starts),
      checkout_completes: asInteger(row.checkout_completes),
      form_starts: asInteger(row.form_starts),
      form_submits: asInteger(row.form_submits),
      bookings_completed: asInteger(row.bookings_completed),
      outcomes: asInteger(row.outcomes),
      gross_revenue: asNumber(row.gross_revenue) ?? 0,
    })),
    live_funnel: readLiveFunnel(db, scopeId),
  };
}

export function readPipelineStatus(db: DatabaseSync, scopeId?: string | null): Record<string, unknown> {
  const latestRun = listPipelineRuns(db, { scopeId: scopeId ?? null, limit: 1 })[0] ?? null;
  const params = scopeId
    ? [scopeId, scopeId, scopeId, scopeId, scopeId, scopeId, scopeId, scopeId, scopeId]
    : [];
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM attribution_ad_facts ${scopeId ? "WHERE scope_id = ?" : ""}) AS ad_facts,
         (SELECT COUNT(*) FROM attribution_web_events ${scopeId ? "WHERE scope_id = ?" : ""}) AS web_events,
         (SELECT COUNT(*) FROM attribution_business_outcomes ${scopeId ? "WHERE scope_id = ?" : ""}) AS business_outcomes,
         (SELECT COUNT(*) FROM attribution_business_outcomes ${scopeId ? "WHERE scope_id = ?" : ""}) AS business_outcome_rows,
         (SELECT COUNT(DISTINCT backend_entity_id) FROM attribution_business_outcomes ${scopeId ? "WHERE scope_id = ?" : ""}) AS business_outcome_entities,
         (SELECT COUNT(*) FROM attribution_outcome_attributions ${scopeId ? "WHERE scope_id = ?" : ""}) AS outcome_attributions,
         (SELECT COUNT(*) FROM attribution_outcome_attributions ${scopeId ? "WHERE scope_id = ?" : ""}) AS outcome_attribution_entities,
         (SELECT COUNT(*) FROM attribution_outcome_attributions ${scopeId ? "WHERE scope_id = ? AND unresolved_reason IS NULL" : "WHERE unresolved_reason IS NULL"}) AS resolved_outcome_entities,
         (SELECT COUNT(*) FROM attribution_outcome_attributions ${scopeId ? "WHERE scope_id = ? AND unresolved_reason IS NOT NULL" : "WHERE unresolved_reason IS NOT NULL"}) AS unresolved_outcome_entities`,
    )
    .get(...params) as SqlRow;
  const freshnessParams = scopeId ? [scopeId, scopeId, scopeId, scopeId, scopeId] : [];
  const freshness = db
    .prepare(
      `SELECT
         (SELECT MAX(updated_at) FROM attribution_ad_facts ${scopeId ? "WHERE scope_id = ?" : ""}) AS latest_ad_fact_at,
         (SELECT MAX(captured_at) FROM attribution_web_events ${scopeId ? "WHERE scope_id = ?" : ""}) AS latest_web_event_at,
         (SELECT MAX(occurred_at) FROM attribution_business_outcomes ${scopeId ? "WHERE scope_id = ?" : ""}) AS latest_backend_outcome_at,
         (SELECT MAX(updated_at) FROM attribution_business_outcomes ${scopeId ? "WHERE scope_id = ?" : ""}) AS latest_backend_write_at,
         (SELECT MAX(updated_at) FROM attribution_outcome_attributions ${scopeId ? "WHERE scope_id = ?" : ""}) AS latest_attribution_decision_at`,
    )
    .get(...freshnessParams) as SqlRow;
  return {
    scope_id: asOptionalString(scopeId),
    latest_run: latestRun,
    counts: {
      ad_facts: asInteger(counts.ad_facts),
      web_events: asInteger(counts.web_events),
      business_outcomes: asInteger(counts.business_outcomes),
      business_outcome_rows: asInteger(counts.business_outcome_rows),
      business_outcome_entities: asInteger(counts.business_outcome_entities),
      outcome_attributions: asInteger(counts.outcome_attributions),
      outcome_attribution_entities: asInteger(counts.outcome_attribution_entities),
      resolved_outcome_entities: asInteger(counts.resolved_outcome_entities),
      unresolved_outcome_entities: asInteger(counts.unresolved_outcome_entities),
    },
    freshness: {
      latest_ad_fact_at: asNumber(freshness.latest_ad_fact_at),
      latest_web_event_at: asNumber(freshness.latest_web_event_at),
      latest_backend_outcome_at: asNumber(freshness.latest_backend_outcome_at),
      latest_backend_write_at: asNumber(freshness.latest_backend_write_at),
      latest_attribution_decision_at: asNumber(freshness.latest_attribution_decision_at),
    },
  };
}

export function readHealthcheck(db: DatabaseSync): Record<string, unknown> {
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM attribution_scopes) AS scopes,
         (SELECT COUNT(*) FROM attribution_bindings) AS bindings,
         (SELECT COUNT(*) FROM attribution_ad_facts) AS ad_facts,
         (SELECT COUNT(*) FROM attribution_web_events) AS web_events,
         (SELECT COUNT(*) FROM attribution_business_outcomes) AS business_outcomes,
         (SELECT COUNT(*) FROM attribution_outcome_attributions) AS outcome_attributions`,
    )
    .get() as SqlRow;
  return {
    schema_version: SCHEMA_VERSION,
    counts: {
      scopes: asInteger(counts.scopes),
      bindings: asInteger(counts.bindings),
      ad_facts: asInteger(counts.ad_facts),
      web_events: asInteger(counts.web_events),
      business_outcomes: asInteger(counts.business_outcomes),
      outcome_attributions: asInteger(counts.outcome_attributions),
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function startOfDayMs(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
