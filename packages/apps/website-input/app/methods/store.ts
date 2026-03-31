import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type WebsiteInstallationStatus = "active" | "paused" | "revoked" | "error";
export type WebsiteConsentState = "granted" | "denied" | "unknown";

export type WebsiteInstallationRecord = {
  id: string;
  accountId: string;
  label: string | null;
  siteOrigin: string | null;
  status: WebsiteInstallationStatus;
  senderEntityId: string;
  createdByEntityId: string;
  createdAt: number;
  updatedAt: number;
  firstSeenAt: number;
  lastSeenAt: number;
  collectorBaseUrl: string;
  currentTokenId: string | null;
  currentTokenCreatedAt: number | null;
  currentTokenExpiresAt: number | null;
  currentTokenRevokedAt: number | null;
  currentTokenLabel: string | null;
  metadata: Record<string, unknown> | null;
};

export type WebsiteInstallationTokenRecord = {
  id: string;
  installationId: string;
  tokenId: string;
  label: string | null;
  createdByEntityId: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  metadata: Record<string, unknown> | null;
};

export type WebsiteEventRecord = {
  id: string;
  websiteInstallationId: string;
  eventId: string;
  capturedAt: number;
  receivedAt: number;
  consentState: WebsiteConsentState;
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
  metadata: Record<string, unknown> | null;
};

const WEBSITE_INPUT_DB_NAME = "website-input.db";

const WEBSITE_INPUT_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS website_input_installations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  label TEXT,
  site_origin TEXT,
  status TEXT NOT NULL,
  sender_entity_id TEXT,
  created_by_entity_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  collector_base_url TEXT NOT NULL,
  current_token_id TEXT,
  current_token_created_at INTEGER,
  current_token_expires_at INTEGER,
  current_token_revoked_at INTEGER,
  current_token_label TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_website_input_installations_account_created
  ON website_input_installations(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_input_installations_status_seen
  ON website_input_installations(status, last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_input_installations_sender_entity
  ON website_input_installations(sender_entity_id)
  WHERE sender_entity_id IS NOT NULL AND sender_entity_id <> '';

CREATE TABLE IF NOT EXISTS website_input_tokens (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  token_id TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by_entity_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  metadata_json TEXT,
  FOREIGN KEY (installation_id) REFERENCES website_input_installations(id)
);
CREATE INDEX IF NOT EXISTS idx_website_input_tokens_installation_created
  ON website_input_tokens(installation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS website_input_events (
  id TEXT PRIMARY KEY,
  website_installation_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  consent_state TEXT NOT NULL,
  event_name TEXT NOT NULL,
  browser_id TEXT,
  session_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  page_path TEXT NOT NULL,
  host TEXT NOT NULL,
  referrer TEXT,
  event_source_url TEXT,
  page_title TEXT,
  user_agent TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
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
  surface_id TEXT,
  surface_label TEXT,
  surface_category TEXT,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
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
  metadata_json TEXT,
  UNIQUE(website_installation_id, event_id),
  FOREIGN KEY (website_installation_id) REFERENCES website_input_installations(id)
);
CREATE INDEX IF NOT EXISTS idx_website_input_events_installation_captured
  ON website_input_events(website_installation_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_input_events_session
  ON website_input_events(website_installation_id, session_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_input_events_name
  ON website_input_events(website_installation_id, event_name, captured_at DESC);
`;

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function stringifyJson(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function openWebsiteInputDb(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, WEBSITE_INPUT_DB_NAME);
  const db = new DatabaseSync(dbPath);
  db.exec(WEBSITE_INPUT_SCHEMA_SQL);
  try {
    db.exec("ALTER TABLE website_input_installations ADD COLUMN sender_entity_id TEXT");
  } catch {
    // Column already exists on upgraded databases.
  }
  db.exec("DROP INDEX IF EXISTS idx_website_input_installations_sender_entity");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_website_input_installations_sender_entity ON website_input_installations(sender_entity_id) WHERE sender_entity_id IS NOT NULL AND sender_entity_id <> ''",
  );
  return db;
}

function rowToInstallation(row: Record<string, unknown>): WebsiteInstallationRecord {
  return {
    id: String(row.id ?? ""),
    accountId: String(row.account_id ?? ""),
    label: typeof row.label === "string" ? row.label : null,
    siteOrigin: typeof row.site_origin === "string" ? row.site_origin : null,
    status: String(row.status ?? "active") as WebsiteInstallationStatus,
    senderEntityId:
      typeof row.sender_entity_id === "string" && row.sender_entity_id.trim().length > 0
        ? row.sender_entity_id
        : null,
    createdByEntityId: String(row.created_by_entity_id ?? ""),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    firstSeenAt: Number(row.first_seen_at ?? 0),
    lastSeenAt: Number(row.last_seen_at ?? 0),
    collectorBaseUrl: String(row.collector_base_url ?? ""),
    currentTokenId: typeof row.current_token_id === "string" ? row.current_token_id : null,
    currentTokenCreatedAt:
      typeof row.current_token_created_at === "number" ? row.current_token_created_at : null,
    currentTokenExpiresAt:
      typeof row.current_token_expires_at === "number" ? row.current_token_expires_at : null,
    currentTokenRevokedAt:
      typeof row.current_token_revoked_at === "number" ? row.current_token_revoked_at : null,
    currentTokenLabel:
      typeof row.current_token_label === "string" ? row.current_token_label : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
  };
}

function rowToToken(row: Record<string, unknown>): WebsiteInstallationTokenRecord {
  return {
    id: String(row.id ?? ""),
    installationId: String(row.installation_id ?? ""),
    tokenId: String(row.token_id ?? ""),
    label: typeof row.label === "string" ? row.label : null,
    createdByEntityId: String(row.created_by_entity_id ?? ""),
    createdAt: Number(row.created_at ?? 0),
    lastUsedAt: typeof row.last_used_at === "number" ? row.last_used_at : null,
    expiresAt: typeof row.expires_at === "number" ? row.expires_at : null,
    revokedAt: typeof row.revoked_at === "number" ? row.revoked_at : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
  };
}

function rowToEvent(row: Record<string, unknown>): WebsiteEventRecord {
  return {
    id: String(row.id ?? ""),
    websiteInstallationId: String(row.website_installation_id ?? ""),
    eventId: String(row.event_id ?? ""),
    capturedAt: Number(row.captured_at ?? 0),
    receivedAt: Number(row.received_at ?? 0),
    consentState: String(row.consent_state ?? "unknown") as WebsiteConsentState,
    eventName: String(row.event_name ?? ""),
    browserId: typeof row.browser_id === "string" ? row.browser_id : null,
    sessionId: String(row.session_id ?? ""),
    pageUrl: String(row.page_url ?? ""),
    pagePath: String(row.page_path ?? ""),
    host: String(row.host ?? ""),
    referrer: typeof row.referrer === "string" ? row.referrer : null,
    eventSourceUrl: typeof row.event_source_url === "string" ? row.event_source_url : null,
    pageTitle: typeof row.page_title === "string" ? row.page_title : null,
    userAgent: typeof row.user_agent === "string" ? row.user_agent : null,
    viewportWidth: typeof row.viewport_width === "number" ? row.viewport_width : null,
    viewportHeight: typeof row.viewport_height === "number" ? row.viewport_height : null,
    utmSource: typeof row.utm_source === "string" ? row.utm_source : null,
    utmMedium: typeof row.utm_medium === "string" ? row.utm_medium : null,
    utmCampaign: typeof row.utm_campaign === "string" ? row.utm_campaign : null,
    utmContent: typeof row.utm_content === "string" ? row.utm_content : null,
    utmTerm: typeof row.utm_term === "string" ? row.utm_term : null,
    fbclid: typeof row.fbclid === "string" ? row.fbclid : null,
    fbc: typeof row.fbc === "string" ? row.fbc : null,
    fbp: typeof row.fbp === "string" ? row.fbp : null,
    gclid: typeof row.gclid === "string" ? row.gclid : null,
    gbraid: typeof row.gbraid === "string" ? row.gbraid : null,
    wbraid: typeof row.wbraid === "string" ? row.wbraid : null,
    ttclid: typeof row.ttclid === "string" ? row.ttclid : null,
    ttp: typeof row.ttp === "string" ? row.ttp : null,
    msclkid: typeof row.msclkid === "string" ? row.msclkid : null,
    surfaceId: typeof row.surface_id === "string" ? row.surface_id : null,
    surfaceLabel: typeof row.surface_label === "string" ? row.surface_label : null,
    surfaceCategory: typeof row.surface_category === "string" ? row.surface_category : null,
    targetType: typeof row.target_type === "string" ? row.target_type : null,
    targetId: typeof row.target_id === "string" ? row.target_id : null,
    targetLabel: typeof row.target_label === "string" ? row.target_label : null,
    bridgeSurface: typeof row.bridge_surface === "string" ? row.bridge_surface : null,
    handoffId: typeof row.handoff_id === "string" ? row.handoff_id : null,
    checkoutToken: typeof row.checkout_token === "string" ? row.checkout_token : null,
    checkoutKey: typeof row.checkout_key === "string" ? row.checkout_key : null,
    checkoutId: typeof row.checkout_id === "string" ? row.checkout_id : null,
    cartToken: typeof row.cart_token === "string" ? row.cart_token : null,
    formId: typeof row.form_id === "string" ? row.form_id : null,
    formSubmissionId: typeof row.form_submission_id === "string" ? row.form_submission_id : null,
    bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
    bookingSlotId: typeof row.booking_slot_id === "string" ? row.booking_slot_id : null,
    leadExternalId: typeof row.lead_external_id === "string" ? row.lead_external_id : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
  };
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value: unknown, field: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function normalizeBridgeInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function insertInstallation(db: DatabaseSync, input: {
  id: string;
  accountId: string;
  label?: string | null;
  siteOrigin?: string | null;
  status?: WebsiteInstallationStatus;
  senderEntityId?: string | null;
  createdByEntityId: string;
  createdAt: number;
  updatedAt: number;
  firstSeenAt: number;
  lastSeenAt: number;
  collectorBaseUrl: string;
  currentTokenId?: string | null;
  currentTokenCreatedAt?: number | null;
  currentTokenExpiresAt?: number | null;
  currentTokenRevokedAt?: number | null;
  currentTokenLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}): WebsiteInstallationRecord {
  db.prepare(
    `INSERT INTO website_input_installations (
      id, account_id, label, site_origin, status, sender_entity_id, created_by_entity_id,
      created_at, updated_at, first_seen_at, last_seen_at, collector_base_url,
      current_token_id, current_token_created_at, current_token_expires_at,
      current_token_revoked_at, current_token_label, metadata_json
    ) VALUES (
      @id, @account_id, @label, @site_origin, @status, @sender_entity_id, @created_by_entity_id,
      @created_at, @updated_at, @first_seen_at, @last_seen_at, @collector_base_url,
      @current_token_id, @current_token_created_at, @current_token_expires_at,
      @current_token_revoked_at, @current_token_label, @metadata_json
    )`,
  ).run({
    id: input.id,
    account_id: input.accountId,
    label: input.label ?? null,
    site_origin: input.siteOrigin ?? null,
    status: input.status ?? "active",
    sender_entity_id: input.senderEntityId ?? null,
    created_by_entity_id: input.createdByEntityId,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    first_seen_at: input.firstSeenAt,
    last_seen_at: input.lastSeenAt,
    collector_base_url: input.collectorBaseUrl,
    current_token_id: input.currentTokenId ?? null,
    current_token_created_at: input.currentTokenCreatedAt ?? null,
    current_token_expires_at: input.currentTokenExpiresAt ?? null,
    current_token_revoked_at: input.currentTokenRevokedAt ?? null,
    current_token_label: input.currentTokenLabel ?? null,
    metadata_json: stringifyJson(input.metadata),
  });
  return findInstallationById(db, input.id) ?? {
    id: input.id,
    accountId: input.accountId,
    label: input.label ?? null,
    siteOrigin: input.siteOrigin ?? null,
    status: input.status ?? "active",
    senderEntityId: input.senderEntityId ?? null,
    createdByEntityId: input.createdByEntityId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    firstSeenAt: input.firstSeenAt,
    lastSeenAt: input.lastSeenAt,
    collectorBaseUrl: input.collectorBaseUrl,
    currentTokenId: input.currentTokenId ?? null,
    currentTokenCreatedAt: input.currentTokenCreatedAt ?? null,
    currentTokenExpiresAt: input.currentTokenExpiresAt ?? null,
    currentTokenRevokedAt: input.currentTokenRevokedAt ?? null,
    currentTokenLabel: input.currentTokenLabel ?? null,
    metadata: input.metadata ?? null,
  };
}

export function updateInstallation(db: DatabaseSync, id: string, updates: Partial<{
  label: string | null;
  siteOrigin: string | null;
  status: WebsiteInstallationStatus;
  lastSeenAt: number;
  senderEntityId: string | null;
  collectorBaseUrl: string | null;
  currentTokenId: string | null;
  currentTokenCreatedAt: number | null;
  currentTokenExpiresAt: number | null;
  currentTokenRevokedAt: number | null;
  currentTokenLabel: string | null;
  metadata: Record<string, unknown> | null;
}>): void {
  const existing = findInstallationById(db, id);
  if (!existing) {
    throw new Error(`unknown installation id: ${id}`);
  }
  db.prepare(
    `UPDATE website_input_installations
     SET label = COALESCE(@label, label),
         site_origin = COALESCE(@site_origin, site_origin),
         status = COALESCE(@status, status),
         last_seen_at = COALESCE(@last_seen_at, last_seen_at),
         sender_entity_id = CASE
           WHEN @sender_entity_id_set = 1 THEN @sender_entity_id
           ELSE sender_entity_id
         END,
         collector_base_url = COALESCE(@collector_base_url, collector_base_url),
         updated_at = @updated_at,
         current_token_id = COALESCE(@current_token_id, current_token_id),
         current_token_created_at = COALESCE(@current_token_created_at, current_token_created_at),
         current_token_expires_at = COALESCE(@current_token_expires_at, current_token_expires_at),
         current_token_revoked_at = COALESCE(@current_token_revoked_at, current_token_revoked_at),
         current_token_label = COALESCE(@current_token_label, current_token_label),
         metadata_json = COALESCE(@metadata_json, metadata_json)
     WHERE id = @id`,
  ).run({
    id,
    label: updates.label ?? null,
    site_origin: updates.siteOrigin ?? null,
    status: updates.status ?? null,
    last_seen_at: updates.lastSeenAt ?? null,
    sender_entity_id: updates.senderEntityId ?? null,
    sender_entity_id_set: updates.senderEntityId !== undefined ? 1 : 0,
    collector_base_url: updates.collectorBaseUrl ?? null,
    updated_at: Date.now(),
    current_token_id: updates.currentTokenId ?? null,
    current_token_created_at: updates.currentTokenCreatedAt ?? null,
    current_token_expires_at: updates.currentTokenExpiresAt ?? null,
    current_token_revoked_at: updates.currentTokenRevokedAt ?? null,
    current_token_label: updates.currentTokenLabel ?? null,
    metadata_json: updates.metadata === undefined ? null : stringifyJson(updates.metadata),
  });
}

export function findInstallationById(db: DatabaseSync, id: string): WebsiteInstallationRecord | null {
  const row = db
    .prepare(
      `SELECT
        id, account_id, label, site_origin, status, sender_entity_id, created_by_entity_id,
        created_at, updated_at, first_seen_at, last_seen_at, collector_base_url,
        current_token_id, current_token_created_at, current_token_expires_at,
        current_token_revoked_at, current_token_label, metadata_json
       FROM website_input_installations
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToInstallation(row) : null;
}

export function findInstallationBySenderEntityId(
  db: DatabaseSync,
  senderEntityId: string,
): WebsiteInstallationRecord | null {
  const row = db
    .prepare(
      `SELECT
        id, account_id, label, site_origin, status, sender_entity_id, created_by_entity_id,
        created_at, updated_at, first_seen_at, last_seen_at, collector_base_url,
        current_token_id, current_token_created_at, current_token_expires_at,
        current_token_revoked_at, current_token_label, metadata_json
       FROM website_input_installations
       WHERE sender_entity_id = ?
       LIMIT 1`,
    )
    .get(senderEntityId) as Record<string, unknown> | undefined;
  return row ? rowToInstallation(row) : null;
}

export function findInstallationByTokenId(
  db: DatabaseSync,
  tokenId: string,
): WebsiteInstallationRecord | null {
  const row = db
    .prepare(
      `SELECT i.*
       FROM website_input_installations i
       JOIN website_input_tokens t ON t.installation_id = i.id
       WHERE t.token_id = ?
       LIMIT 1`,
    )
    .get(tokenId) as Record<string, unknown> | undefined;
  return row ? rowToInstallation(row) : null;
}

export function listInstallations(
  db: DatabaseSync,
  opts: { accountId?: string; status?: WebsiteInstallationStatus; limit?: number } = {},
): WebsiteInstallationRecord[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.accountId) {
    clauses.push("account_id = @account_id");
    params.account_id = opts.accountId;
  }
  if (opts.status) {
    clauses.push("status = @status");
    params.status = opts.status;
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Number.isFinite(opts.limit ?? NaN) ? Math.max(1, Math.floor(opts.limit as number)) : 100;
  const rows = db
    .prepare(
      `SELECT
        id, account_id, label, site_origin, status, sender_entity_id, created_by_entity_id,
        created_at, updated_at, first_seen_at, last_seen_at, collector_base_url,
        current_token_id, current_token_created_at, current_token_expires_at,
        current_token_revoked_at, current_token_label, metadata_json
       FROM website_input_installations
       ${where}
       ORDER BY created_at DESC
       LIMIT @limit`,
    )
    .all({ ...params, limit }) as Record<string, unknown>[];
  return rows.map(rowToInstallation);
}

export function insertToken(db: DatabaseSync, input: {
  id: string;
  installationId: string;
  tokenId: string;
  label?: string | null;
  createdByEntityId: string;
  createdAt: number;
  lastUsedAt?: number | null;
  expiresAt?: number | null;
  revokedAt?: number | null;
  metadata?: Record<string, unknown> | null;
}): WebsiteInstallationTokenRecord {
  db.prepare(
    `INSERT INTO website_input_tokens (
      id, installation_id, token_id, label, created_by_entity_id,
      created_at, last_used_at, expires_at, revoked_at, metadata_json
    ) VALUES (
      @id, @installation_id, @token_id, @label, @created_by_entity_id,
      @created_at, @last_used_at, @expires_at, @revoked_at, @metadata_json
    )`,
  ).run({
    id: input.id,
    installation_id: input.installationId,
    token_id: input.tokenId,
    label: input.label ?? null,
    created_by_entity_id: input.createdByEntityId,
    created_at: input.createdAt,
    last_used_at: input.lastUsedAt ?? null,
    expires_at: input.expiresAt ?? null,
    revoked_at: input.revokedAt ?? null,
    metadata_json: stringifyJson(input.metadata),
  });
  return findTokenByTokenId(db, input.tokenId) ?? {
    id: input.id,
    installationId: input.installationId,
    tokenId: input.tokenId,
    label: input.label ?? null,
    createdByEntityId: input.createdByEntityId,
    createdAt: input.createdAt,
    lastUsedAt: input.lastUsedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: input.revokedAt ?? null,
    metadata: input.metadata ?? null,
  };
}

export function updateTokenRevocation(db: DatabaseSync, tokenId: string, revokedAt: number | null): void {
  db.prepare(
    `UPDATE website_input_tokens
     SET revoked_at = @revoked_at
     WHERE token_id = @token_id`,
  ).run({ token_id: tokenId, revoked_at: revokedAt });
}

export function findTokenByTokenId(db: DatabaseSync, tokenId: string): WebsiteInstallationTokenRecord | null {
  const row = db
    .prepare(
      `SELECT
        id, installation_id, token_id, label, created_by_entity_id,
        created_at, last_used_at, expires_at, revoked_at, metadata_json
       FROM website_input_tokens
       WHERE token_id = ?
       LIMIT 1`,
    )
    .get(tokenId) as Record<string, unknown> | undefined;
  return row ? rowToToken(row) : null;
}

export function findTokenById(db: DatabaseSync, id: string): WebsiteInstallationTokenRecord | null {
  const row = db
    .prepare(
      `SELECT
        id, installation_id, token_id, label, created_by_entity_id,
        created_at, last_used_at, expires_at, revoked_at, metadata_json
       FROM website_input_tokens
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToToken(row) : null;
}

export function listTokens(
  db: DatabaseSync,
  opts: { installationId?: string; includeRevoked?: boolean; limit?: number } = {},
): WebsiteInstallationTokenRecord[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.installationId) {
    clauses.push("installation_id = @installation_id");
    params.installation_id = opts.installationId;
  }
  if (!opts.includeRevoked) {
    clauses.push("revoked_at IS NULL");
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Number.isFinite(opts.limit ?? NaN) ? Math.max(1, Math.floor(opts.limit as number)) : 100;
  const rows = db
    .prepare(
      `SELECT
        id, installation_id, token_id, label, created_by_entity_id,
        created_at, last_used_at, expires_at, revoked_at, metadata_json
       FROM website_input_tokens
       ${where}
       ORDER BY created_at DESC
       LIMIT @limit`,
    )
    .all({ ...params, limit }) as Record<string, unknown>[];
  return rows.map(rowToToken);
}

export function upsertEvent(db: DatabaseSync, event: Omit<WebsiteEventRecord, "id"> & { id?: string }): WebsiteEventRecord {
  const now = Date.now();
  const id = event.id ?? randomUUID();
  db.prepare(
    `INSERT INTO website_input_events (
      id, website_installation_id, event_id, captured_at, received_at, consent_state,
      event_name, browser_id, session_id, page_url, page_path, host, referrer,
      event_source_url, page_title, user_agent, viewport_width, viewport_height,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbc, fbp,
      gclid, gbraid, wbraid, ttclid, ttp, msclkid, surface_id, surface_label,
      surface_category, target_type, target_id, target_label, bridge_surface,
      handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
      form_submission_id, booking_id, booking_slot_id, lead_external_id, metadata_json
    ) VALUES (
      @id, @website_installation_id, @event_id, @captured_at, @received_at, @consent_state,
      @event_name, @browser_id, @session_id, @page_url, @page_path, @host, @referrer,
      @event_source_url, @page_title, @user_agent, @viewport_width, @viewport_height,
      @utm_source, @utm_medium, @utm_campaign, @utm_content, @utm_term, @fbclid, @fbc, @fbp,
      @gclid, @gbraid, @wbraid, @ttclid, @ttp, @msclkid, @surface_id, @surface_label,
      @surface_category, @target_type, @target_id, @target_label, @bridge_surface,
      @handoff_id, @checkout_token, @checkout_key, @checkout_id, @cart_token, @form_id,
      @form_submission_id, @booking_id, @booking_slot_id, @lead_external_id, @metadata_json
    )
    ON CONFLICT(website_installation_id, event_id) DO UPDATE SET
      captured_at = excluded.captured_at,
      received_at = excluded.received_at,
      consent_state = excluded.consent_state,
      event_name = excluded.event_name,
      browser_id = excluded.browser_id,
      session_id = excluded.session_id,
      page_url = excluded.page_url,
      page_path = excluded.page_path,
      host = excluded.host,
      referrer = excluded.referrer,
      event_source_url = excluded.event_source_url,
      page_title = excluded.page_title,
      user_agent = excluded.user_agent,
      viewport_width = excluded.viewport_width,
      viewport_height = excluded.viewport_height,
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
      surface_id = excluded.surface_id,
      surface_label = excluded.surface_label,
      surface_category = excluded.surface_category,
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      target_label = excluded.target_label,
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
      metadata_json = excluded.metadata_json`,
  ).run({
    id,
    website_installation_id: event.websiteInstallationId,
    event_id: event.eventId,
    captured_at: event.capturedAt,
    received_at: event.receivedAt ?? now,
    consent_state: event.consentState,
    event_name: event.eventName,
    browser_id: event.browserId ?? null,
    session_id: event.sessionId,
    page_url: event.pageUrl,
    page_path: event.pagePath,
    host: event.host,
    referrer: event.referrer ?? null,
    event_source_url: event.eventSourceUrl ?? null,
    page_title: event.pageTitle ?? null,
    user_agent: event.userAgent ?? null,
    viewport_width: event.viewportWidth ?? null,
    viewport_height: event.viewportHeight ?? null,
    utm_source: event.utmSource ?? null,
    utm_medium: event.utmMedium ?? null,
    utm_campaign: event.utmCampaign ?? null,
    utm_content: event.utmContent ?? null,
    utm_term: event.utmTerm ?? null,
    fbclid: event.fbclid ?? null,
    fbc: event.fbc ?? null,
    fbp: event.fbp ?? null,
    gclid: event.gclid ?? null,
    gbraid: event.gbraid ?? null,
    wbraid: event.wbraid ?? null,
    ttclid: event.ttclid ?? null,
    ttp: event.ttp ?? null,
    msclkid: event.msclkid ?? null,
    surface_id: event.surfaceId ?? null,
    surface_label: event.surfaceLabel ?? null,
    surface_category: event.surfaceCategory ?? null,
    target_type: event.targetType ?? null,
    target_id: event.targetId ?? null,
    target_label: event.targetLabel ?? null,
    bridge_surface: event.bridgeSurface ?? null,
    handoff_id: event.handoffId ?? null,
    checkout_token: event.checkoutToken ?? null,
    checkout_key: event.checkoutKey ?? null,
    checkout_id: event.checkoutId ?? null,
    cart_token: event.cartToken ?? null,
    form_id: event.formId ?? null,
    form_submission_id: event.formSubmissionId ?? null,
    booking_id: event.bookingId ?? null,
    booking_slot_id: event.bookingSlotId ?? null,
    lead_external_id: event.leadExternalId ?? null,
    metadata_json: stringifyJson(event.metadata),
  });
  const row = findEvent(db, event.websiteInstallationId, event.eventId);
  if (!row) {
    throw new Error("failed to load upserted event");
  }
  return row;
}

export function findEvent(
  db: DatabaseSync,
  websiteInstallationId: string,
  eventId: string,
): WebsiteEventRecord | null {
  const row = db
    .prepare(
      `SELECT
        id, website_installation_id, event_id, captured_at, received_at, consent_state,
        event_name, browser_id, session_id, page_url, page_path, host, referrer,
        event_source_url, page_title, user_agent, viewport_width, viewport_height,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbc, fbp,
        gclid, gbraid, wbraid, ttclid, ttp, msclkid, surface_id, surface_label,
        surface_category, target_type, target_id, target_label, bridge_surface,
        handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
        form_submission_id, booking_id, booking_slot_id, lead_external_id, metadata_json
       FROM website_input_events
       WHERE website_installation_id = ? AND event_id = ?
       LIMIT 1`,
    )
    .get(websiteInstallationId, eventId) as Record<string, unknown> | undefined;
  return row ? rowToEvent(row) : null;
}

export function listEvents(
  db: DatabaseSync,
  opts: {
    websiteInstallationId: string;
    sessionId?: string;
    eventName?: string;
    limit?: number;
  },
): WebsiteEventRecord[] {
  const clauses = ["website_installation_id = @website_installation_id"];
  const params: Record<string, unknown> = { website_installation_id: opts.websiteInstallationId };
  if (opts.sessionId) {
    clauses.push("session_id = @session_id");
    params.session_id = opts.sessionId;
  }
  if (opts.eventName) {
    clauses.push("event_name = @event_name");
    params.event_name = opts.eventName;
  }
  const limit = Number.isFinite(opts.limit ?? NaN) ? Math.max(1, Math.floor(opts.limit as number)) : 100;
  const rows = db
    .prepare(
      `SELECT
        id, website_installation_id, event_id, captured_at, received_at, consent_state,
        event_name, browser_id, session_id, page_url, page_path, host, referrer,
        event_source_url, page_title, user_agent, viewport_width, viewport_height,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbc, fbp,
        gclid, gbraid, wbraid, ttclid, ttp, msclkid, surface_id, surface_label,
        surface_category, target_type, target_id, target_label, bridge_surface,
        handoff_id, checkout_token, checkout_key, checkout_id, cart_token, form_id,
        form_submission_id, booking_id, booking_slot_id, lead_external_id, metadata_json
       FROM website_input_events
       WHERE ${clauses.join(" AND ")}
       ORDER BY captured_at DESC, received_at DESC
       LIMIT @limit`,
    )
    .all({ ...params, limit }) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}

export function normalizeConsentState(value: unknown): WebsiteConsentState {
  if (value === "granted" || value === "denied" || value === "unknown") {
    return value;
  }
  return "unknown";
}

export function normalizeEventInput(input: Record<string, unknown>): Omit<WebsiteEventRecord, "id"> {
  const bridgeInput = normalizeBridgeInput(input.bridge);
  const eventId = normalizeRequiredText(input.eventId ?? input.event_id, "eventId");
  const websiteInstallationId = normalizeRequiredText(
    input.websiteInstallationId ?? input.website_installation_id,
    "websiteInstallationId",
  );
  const capturedAt = normalizeNumber(input.capturedAt ?? input.captured_at);
  const sessionId = normalizeRequiredText(input.sessionId ?? input.session_id, "sessionId");
  const pageUrl = normalizeRequiredText(input.pageUrl ?? input.page_url, "pageUrl");
  const pagePath = normalizeRequiredText(input.pagePath ?? input.page_path, "pagePath");
  const host = normalizeRequiredText(input.host, "host");
  const eventName = normalizeRequiredText(input.eventName ?? input.event_name, "eventName");
  return {
    websiteInstallationId,
    eventId,
    capturedAt: capturedAt ?? Date.now(),
    receivedAt: normalizeNumber(input.receivedAt ?? input.received_at) ?? Date.now(),
    consentState: normalizeConsentState(input.consentState ?? input.consent_state),
    eventName,
    browserId: normalizeText(input.browserId ?? input.browser_id),
    sessionId,
    pageUrl,
    pagePath,
    host,
    referrer: normalizeText(input.referrer),
    eventSourceUrl: normalizeText(input.eventSourceUrl ?? input.event_source_url),
    pageTitle: normalizeText(input.pageTitle ?? input.page_title),
    userAgent: normalizeText(input.userAgent ?? input.user_agent),
    viewportWidth: normalizeNumber(input.viewportWidth ?? input.viewport_width),
    viewportHeight: normalizeNumber(input.viewportHeight ?? input.viewport_height),
    utmSource: normalizeText(input.utmSource ?? input.utm_source),
    utmMedium: normalizeText(input.utmMedium ?? input.utm_medium),
    utmCampaign: normalizeText(input.utmCampaign ?? input.utm_campaign),
    utmContent: normalizeText(input.utmContent ?? input.utm_content),
    utmTerm: normalizeText(input.utmTerm ?? input.utm_term),
    fbclid: normalizeText(input.fbclid),
    fbc: normalizeText(input.fbc),
    fbp: normalizeText(input.fbp),
    gclid: normalizeText(input.gclid),
    gbraid: normalizeText(input.gbraid),
    wbraid: normalizeText(input.wbraid),
    ttclid: normalizeText(input.ttclid),
    ttp: normalizeText(input.ttp),
    msclkid: normalizeText(input.msclkid),
    surfaceId: normalizeText(input.surfaceId ?? input.surface_id),
    surfaceLabel: normalizeText(input.surfaceLabel ?? input.surface_label),
    surfaceCategory: normalizeText(input.surfaceCategory ?? input.surface_category),
    targetType: normalizeText(input.targetType ?? input.target_type),
    targetId: normalizeText(input.targetId ?? input.target_id),
    targetLabel: normalizeText(input.targetLabel ?? input.target_label),
    bridgeSurface: normalizeText(
      input.bridgeSurface ?? input.bridge_surface ?? bridgeInput.bridgeSurface ?? bridgeInput.bridge_surface,
    ),
    handoffId: normalizeText(
      input.handoffId ?? input.handoff_id ?? bridgeInput.handoffId ?? bridgeInput.handoff_id,
    ),
    checkoutToken: normalizeText(
      input.checkoutToken ?? input.checkout_token ?? bridgeInput.checkoutToken ?? bridgeInput.checkout_token,
    ),
    checkoutKey: normalizeText(
      input.checkoutKey ?? input.checkout_key ?? bridgeInput.checkoutKey ?? bridgeInput.checkout_key,
    ),
    checkoutId: normalizeText(
      input.checkoutId ?? input.checkout_id ?? bridgeInput.checkoutId ?? bridgeInput.checkout_id,
    ),
    cartToken: normalizeText(
      input.cartToken ?? input.cart_token ?? bridgeInput.cartToken ?? bridgeInput.cart_token,
    ),
    formId: normalizeText(input.formId ?? input.form_id ?? bridgeInput.formId ?? bridgeInput.form_id),
    formSubmissionId: normalizeText(
      input.formSubmissionId ??
        input.form_submission_id ??
        bridgeInput.formSubmissionId ??
        bridgeInput.form_submission_id,
    ),
    bookingId: normalizeText(
      input.bookingId ?? input.booking_id ?? bridgeInput.bookingId ?? bridgeInput.booking_id,
    ),
    bookingSlotId: normalizeText(
      input.bookingSlotId ?? input.booking_slot_id ?? bridgeInput.bookingSlotId ?? bridgeInput.booking_slot_id,
    ),
    leadExternalId: normalizeText(
      input.leadExternalId ?? input.lead_external_id ?? bridgeInput.leadExternalId ?? bridgeInput.lead_external_id,
    ),
    metadata: (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata))
      ? (input.metadata as Record<string, unknown>)
      : null,
  };
}
