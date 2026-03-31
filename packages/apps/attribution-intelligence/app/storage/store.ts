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
export type AttributionBindingSourceType = "adapter_connection" | "website_installation";

export type AttributionBindingRecord = {
  bindingId: string;
  scopeId: string;
  identityKey: string;
  role: AttributionBindingRole;
  sourceType: AttributionBindingSourceType;
  connectionId: string | null;
  websiteInstallationId: string | null;
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
  websiteInstallationId: string;
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
  websiteInstallationId: string;
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
  websiteInstallationId: string | null;
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

type SqlRow = Record<string, unknown>;

const DB_NAME = "attribution.db";
const SCHEMA_VERSION = 1;

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
  website_installation_id TEXT,
  platform TEXT,
  label TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scope_id) REFERENCES attribution_scopes(scope_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attribution_bindings_scope_role ON attribution_bindings(scope_id, role, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_bindings_connection ON attribution_bindings(connection_id, role);
CREATE INDEX IF NOT EXISTS idx_attribution_bindings_installation ON attribution_bindings(website_installation_id, role);

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
  website_installation_id TEXT NOT NULL,
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
  PRIMARY KEY (scope_id, website_installation_id, logical_row_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_web_events_scope_capture ON attribution_web_events(scope_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_web_events_scope_session ON attribution_web_events(scope_id, session_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_web_events_scope_handoff ON attribution_web_events(scope_id, handoff_id);

CREATE TABLE IF NOT EXISTS attribution_session_source_facts (
  scope_id TEXT NOT NULL,
  website_installation_id TEXT NOT NULL,
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
  PRIMARY KEY (scope_id, website_installation_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_session_source_scope_first_seen ON attribution_session_source_facts(scope_id, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS attribution_conversion_bridges (
  scope_id TEXT NOT NULL,
  bridge_key TEXT NOT NULL,
  website_installation_id TEXT,
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
  if (currentVersion >= SCHEMA_VERSION) {
    db.exec(SCHEMA_SQL);
    return;
  }
  db.exec("BEGIN");
  try {
    db.exec(SCHEMA_SQL);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
  websiteInstallationId?: string | null;
  platform?: string | null;
}): string {
  return [
    input.scopeId.trim(),
    input.role,
    input.sourceType,
    asOptionalString(input.platform) ?? "",
    asOptionalString(input.connectionId) ?? "",
    asOptionalString(input.websiteInstallationId) ?? "",
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
    websiteInstallationId: asOptionalString(row.website_installation_id),
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
              website_installation_id, platform, label, metadata_json, created_at, updated_at
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
              website_installation_id, platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
        WHERE connection_id = ?
          ${role ? "AND role = ?" : ""}
        ORDER BY updated_at DESC, binding_id ASC`,
    )
    .all(...(role ? [normalized, role] : [normalized])) as SqlRow[];
  return rows.map(mapBindingRow);
}

export function listBindingsForWebsiteInstallation(
  db: DatabaseSync,
  websiteInstallationId: string,
): AttributionBindingRecord[] {
  const normalized = asString(websiteInstallationId);
  if (!normalized) {
    return [];
  }
  const rows = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              website_installation_id, platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
        WHERE website_installation_id = ?
        ORDER BY updated_at DESC, binding_id ASC`,
    )
    .all(normalized) as SqlRow[];
  return rows.map(mapBindingRow);
}

export function upsertBinding(db: DatabaseSync, input: {
  bindingId?: string | null;
  scopeId: string;
  role: AttributionBindingRole;
  sourceType: AttributionBindingSourceType;
  connectionId?: string | null;
  websiteInstallationId?: string | null;
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
    websiteInstallationId: input.websiteInstallationId,
    platform: input.platform,
  });
  const existing = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              website_installation_id, platform, label, metadata_json, created_at, updated_at
         FROM attribution_bindings
        WHERE identity_key = ?`,
    )
    .get(identityKey) as SqlRow | undefined;

  const bindingId = asOptionalString(input.bindingId) ?? (existing ? asString(existing.binding_id) : randomUUID());
  const timestamp = nowMs();
  db.prepare(
    `INSERT INTO attribution_bindings (
       binding_id, scope_id, identity_key, role, source_type, connection_id,
       website_installation_id, platform, label, metadata_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(identity_key) DO UPDATE SET
       scope_id = excluded.scope_id,
       role = excluded.role,
       source_type = excluded.source_type,
       connection_id = excluded.connection_id,
       website_installation_id = excluded.website_installation_id,
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
    asOptionalString(input.websiteInstallationId),
    asOptionalString(input.platform),
    asOptionalString(input.label),
    stringifyJson(input.metadata ?? {}),
    timestamp,
    timestamp,
  );

  const row = db
    .prepare(
      `SELECT binding_id, scope_id, identity_key, role, source_type, connection_id,
              website_installation_id, platform, label, metadata_json, created_at, updated_at
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
       scope_id, website_installation_id, logical_row_id, source_record_id, event_id, event_name,
       captured_at, session_id, browser_id, consent_state, page_url, page_path, host, referrer,
       event_source_url, source_channel, source_confidence, utm_source, utm_medium, utm_campaign,
       utm_content, utm_term, fbclid, fbc, fbp, gclid, gbraid, wbraid, ttclid, ttp, msclkid,
       bridge_surface, handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
       form_submission_id, booking_id, booking_slot_id, lead_external_id, row_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_id, website_installation_id, logical_row_id) DO UPDATE SET
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
    event.websiteInstallationId,
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
       scope_id, website_installation_id, session_id, first_seen_at, last_seen_at, event_count,
       page_views, content_views, cta_clicks, handoff_starts, handoff_confirmed, product_views,
       cart_adds, checkout_starts, checkout_completes, form_starts, form_submits, bookings_completed,
       source_channel, source_confidence, evidence_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    statement.run(
      row.scopeId,
      row.websiteInstallationId,
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
       scope_id, bridge_key, website_installation_id, session_id, bridge_surface, handoff_id,
       checkout_token, checkout_key, checkout_id, cart_token, form_id, form_submission_id, booking_id,
       booking_slot_id, lead_external_id, event_id, source_channel, source_confidence, evidence_json,
       occurred_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    statement.run(
      row.scopeId,
      row.bridgeKey,
      asOptionalString(row.websiteInstallationId),
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      `SELECT scope_id, website_installation_id, session_id, first_seen_at, last_seen_at, event_count,
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
    websiteInstallationId: asString(row.website_installation_id),
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
      `SELECT scope_id, source_record_id, logical_row_id, website_installation_id, event_id, event_name,
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
    websiteInstallationId: asString(row.website_installation_id),
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
): (AttributionBusinessOutcomeRecord & { attribution: AttributionOutcomeAttributionRecord | null }) | null {
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
        LIMIT 1`,
    )
    .get(outcomeId.trim()) as SqlRow | undefined;
  return row ? mapOutcomeRow(row) : null;
}

export function readSummary(db: DatabaseSync, scopeId: string, days = 30): Record<string, unknown> {
  const since = startOfDayMs(Date.now() - Math.max(1, days) * DAY_MS);
  const sinceDate = isoDay(since);
  const sourceRows = db
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
        WHERE scope_id = ? AND date >= ?`,
    )
    .get(scopeId, sinceDate) as SqlRow;
  const topChannels = db
    .prepare(
      `SELECT source_channel, spend, clicks, outcomes, gross_revenue
         FROM attribution_daily_source_marts
        WHERE scope_id = ? AND date >= ?
        ORDER BY gross_revenue DESC, spend DESC
        LIMIT 8`,
    )
    .all(scopeId, sinceDate) as SqlRow[];
  return {
    scope_id: scopeId,
    window_days: days,
    totals: {
      spend: asNumber(sourceRows.spend) ?? 0,
      impressions: asNumber(sourceRows.impressions) ?? 0,
      clicks: asNumber(sourceRows.clicks) ?? 0,
      landing_page_views: asNumber(sourceRows.landing_page_views) ?? 0,
      purchases: asNumber(sourceRows.purchases) ?? 0,
      purchase_value: asNumber(sourceRows.purchase_value) ?? 0,
      outcomes: asNumber(sourceRows.outcomes) ?? 0,
      gross_revenue: asNumber(sourceRows.gross_revenue) ?? 0,
    },
    top_channels: topChannels.map((row) => ({
      source_channel: asString(row.source_channel),
      spend: asNumber(row.spend) ?? 0,
      clicks: asNumber(row.clicks) ?? 0,
      outcomes: asNumber(row.outcomes) ?? 0,
      gross_revenue: asNumber(row.gross_revenue) ?? 0,
    })),
  };
}

export function readFunnel(db: DatabaseSync, scopeId: string, days = 30): Record<string, unknown> {
  const sinceDate = isoDay(startOfDayMs(Date.now() - Math.max(1, days) * DAY_MS));
  const rows = db
    .prepare(
      `SELECT date, source_channel, sessions, page_views, content_views, cta_clicks,
              handoff_starts, handoff_confirmed, product_views, cart_adds, checkout_starts,
              checkout_completes, form_starts, form_submits, bookings_completed, outcomes, gross_revenue
         FROM attribution_daily_funnel_marts
        WHERE scope_id = ? AND date >= ?
        ORDER BY date DESC, source_channel ASC`,
    )
    .all(scopeId, sinceDate) as SqlRow[];
  return {
    scope_id: scopeId,
    window_days: days,
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
  };
}

export function readPipelineStatus(db: DatabaseSync, scopeId?: string | null): Record<string, unknown> {
  const latestRun = listPipelineRuns(db, { scopeId: scopeId ?? null, limit: 1 })[0] ?? null;
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM attribution_ad_facts ${scopeId ? "WHERE scope_id = ?" : ""}) AS ad_facts,
         (SELECT COUNT(*) FROM attribution_web_events ${scopeId ? "WHERE scope_id = ?" : ""}) AS web_events,
         (SELECT COUNT(*) FROM attribution_business_outcomes ${scopeId ? "WHERE scope_id = ?" : ""}) AS business_outcomes,
         (SELECT COUNT(*) FROM attribution_outcome_attributions ${scopeId ? "WHERE scope_id = ?" : ""}) AS outcome_attributions`,
    )
    .get(...(scopeId ? [scopeId, scopeId, scopeId, scopeId] : [])) as SqlRow;
  return {
    scope_id: asOptionalString(scopeId),
    latest_run: latestRun,
    counts: {
      ad_facts: asInteger(counts.ad_facts),
      web_events: asInteger(counts.web_events),
      business_outcomes: asInteger(counts.business_outcomes),
      outcome_attributions: asInteger(counts.outcome_attributions),
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
