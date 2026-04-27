import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type WebSignalsInstallationStatus = "active" | "paused" | "revoked" | "error";

export type WebSignalsInstallationRecord = {
  webInstallationId: string;
  accountId: string;
  label: string | null;
  siteOrigin: string | null;
  webJourneyConnectionId: string | null;
  webJourneyEndpointId: string | null;
  status: WebSignalsInstallationStatus;
  senderEntityId: string | null;
  createdByEntityId: string;
  createdAt: number;
  updatedAt: number;
  firstSeenAt: number;
  lastSeenAt: number;
  runtimeBaseUrl: string;
  currentTokenId: string | null;
  currentTokenCreatedAt: number | null;
  currentTokenExpiresAt: number | null;
  currentTokenRevokedAt: number | null;
  currentTokenLabel: string | null;
  metadata: Record<string, unknown> | null;
};

export type WebSignalsTokenRecord = {
  id: string;
  webInstallationId: string;
  tokenId: string;
  label: string | null;
  createdByEntityId: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  metadata: Record<string, unknown> | null;
};

const WEB_SIGNALS_DB_NAME = "web-signals.db";

const WEB_SIGNALS_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS web_signals_installations (
  web_installation_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  label TEXT,
  site_origin TEXT,
  web_journey_connection_id TEXT,
  web_journey_endpoint_id TEXT,
  status TEXT NOT NULL,
  sender_entity_id TEXT,
  created_by_entity_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  runtime_base_url TEXT NOT NULL,
  current_token_id TEXT,
  current_token_created_at INTEGER,
  current_token_expires_at INTEGER,
  current_token_revoked_at INTEGER,
  current_token_label TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_web_signals_installations_account_created
  ON web_signals_installations(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_signals_installations_status_seen
  ON web_signals_installations(status, last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_signals_installations_sender_entity
  ON web_signals_installations(sender_entity_id)
  WHERE sender_entity_id IS NOT NULL AND sender_entity_id <> '';

CREATE TABLE IF NOT EXISTS web_signals_tokens (
  id TEXT PRIMARY KEY,
  web_installation_id TEXT NOT NULL,
  token_id TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by_entity_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  metadata_json TEXT,
  FOREIGN KEY (web_installation_id) REFERENCES web_signals_installations(web_installation_id)
);
CREATE INDEX IF NOT EXISTS idx_web_signals_tokens_installation_created
  ON web_signals_tokens(web_installation_id, created_at DESC);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text.length > 0 ? text : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function asLimit(value: number | undefined, fallback = 100): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(500, Math.max(1, Math.floor(value)));
}

function rowToInstallation(row: Record<string, unknown>): WebSignalsInstallationRecord {
  return {
    webInstallationId: asString(row.web_installation_id),
    accountId: asString(row.account_id),
    label: asNullableString(row.label),
    siteOrigin: asNullableString(row.site_origin),
    webJourneyConnectionId: asNullableString(row.web_journey_connection_id),
    webJourneyEndpointId: asNullableString(row.web_journey_endpoint_id),
    status: asString(row.status) as WebSignalsInstallationStatus,
    senderEntityId: asNullableString(row.sender_entity_id),
    createdByEntityId: asString(row.created_by_entity_id),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    firstSeenAt: Number(row.first_seen_at ?? 0),
    lastSeenAt: Number(row.last_seen_at ?? 0),
    runtimeBaseUrl: asString(row.runtime_base_url),
    currentTokenId: asNullableString(row.current_token_id),
    currentTokenCreatedAt: asNullableNumber(row.current_token_created_at),
    currentTokenExpiresAt: asNullableNumber(row.current_token_expires_at),
    currentTokenRevokedAt: asNullableNumber(row.current_token_revoked_at),
    currentTokenLabel: asNullableString(row.current_token_label),
    metadata: parseJson<Record<string, unknown>>(asString(row.metadata_json)),
  };
}

function rowToToken(row: Record<string, unknown>): WebSignalsTokenRecord {
  return {
    id: asString(row.id),
    webInstallationId: asString(row.web_installation_id),
    tokenId: asString(row.token_id),
    label: asNullableString(row.label),
    createdByEntityId: asString(row.created_by_entity_id),
    createdAt: Number(row.created_at ?? 0),
    lastUsedAt: asNullableNumber(row.last_used_at),
    expiresAt: asNullableNumber(row.expires_at),
    revokedAt: asNullableNumber(row.revoked_at),
    metadata: parseJson<Record<string, unknown>>(asString(row.metadata_json)),
  };
}

export function openWebSignalsDb(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, WEB_SIGNALS_DB_NAME));
  db.exec(WEB_SIGNALS_SCHEMA_SQL);
  try {
    db.exec("ALTER TABLE web_signals_installations ADD COLUMN web_journey_connection_id TEXT");
  } catch {
    // Column already exists on upgraded databases.
  }
  try {
    db.exec("ALTER TABLE web_signals_installations ADD COLUMN web_journey_endpoint_id TEXT");
  } catch {
    // Column already exists on upgraded databases.
  }
  return db;
}

export function insertInstallation(
  db: DatabaseSync,
  record: Omit<WebSignalsInstallationRecord, "metadata"> & { metadata?: Record<string, unknown> | null },
): WebSignalsInstallationRecord {
  db.prepare(
    `INSERT INTO web_signals_installations (
      web_installation_id, account_id, label, site_origin, web_journey_connection_id, web_journey_endpoint_id, status, sender_entity_id,
      created_by_entity_id, created_at, updated_at, first_seen_at, last_seen_at,
      runtime_base_url, current_token_id, current_token_created_at, current_token_expires_at,
      current_token_revoked_at, current_token_label, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.webInstallationId,
    record.accountId,
    record.label ?? null,
    record.siteOrigin ?? null,
    record.webJourneyConnectionId ?? null,
    record.webJourneyEndpointId ?? null,
    record.status,
    record.senderEntityId ?? null,
    record.createdByEntityId,
    record.createdAt,
    record.updatedAt,
    record.firstSeenAt,
    record.lastSeenAt,
    record.runtimeBaseUrl,
    record.currentTokenId ?? null,
    record.currentTokenCreatedAt ?? null,
    record.currentTokenExpiresAt ?? null,
    record.currentTokenRevokedAt ?? null,
    record.currentTokenLabel ?? null,
    stringifyJson(record.metadata ?? null),
  );
  return findInstallationById(db, record.webInstallationId) as WebSignalsInstallationRecord;
}

export function findInstallationById(db: DatabaseSync, webInstallationId: string): WebSignalsInstallationRecord | null {
  const row = db
    .prepare(`SELECT * FROM web_signals_installations WHERE web_installation_id = ?`)
    .get(webInstallationId) as Record<string, unknown> | undefined;
  return row ? rowToInstallation(row) : null;
}

export function findInstallationBySenderEntityId(
  db: DatabaseSync,
  senderEntityId: string,
): WebSignalsInstallationRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM web_signals_installations WHERE sender_entity_id = ? LIMIT 1`,
    )
    .get(senderEntityId) as Record<string, unknown> | undefined;
  return row ? rowToInstallation(row) : null;
}

export function listInstallations(
  db: DatabaseSync,
  options: { accountId?: string | null; status?: WebSignalsInstallationStatus; limit?: number } = {},
): WebSignalsInstallationRecord[] {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (options.accountId && options.accountId.trim()) {
    clauses.push("account_id = ?");
    values.push(options.accountId.trim());
  }
  if (options.status) {
    clauses.push("status = ?");
    values.push(options.status);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = asLimit(options.limit, 100);
  const rows = db
    .prepare(`SELECT * FROM web_signals_installations ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...values, limit) as Record<string, unknown>[];
  return rows.map(rowToInstallation);
}

export function updateInstallation(
  db: DatabaseSync,
  webInstallationId: string,
  patch: Partial<
    Pick<
      WebSignalsInstallationRecord,
      | "accountId"
      | "label"
      | "siteOrigin"
      | "webJourneyConnectionId"
      | "webJourneyEndpointId"
      | "status"
      | "senderEntityId"
      | "createdByEntityId"
      | "createdAt"
      | "updatedAt"
      | "firstSeenAt"
      | "lastSeenAt"
      | "runtimeBaseUrl"
      | "currentTokenId"
      | "currentTokenCreatedAt"
      | "currentTokenExpiresAt"
      | "currentTokenRevokedAt"
      | "currentTokenLabel"
      | "metadata"
    >
  >,
): WebSignalsInstallationRecord | null {
  const existing = findInstallationById(db, webInstallationId);
  if (!existing) {
    return null;
  }
  const next = {
    accountId: patch.accountId ?? existing.accountId,
    label: patch.label ?? existing.label,
    siteOrigin: patch.siteOrigin ?? existing.siteOrigin,
    webJourneyConnectionId: patch.webJourneyConnectionId ?? existing.webJourneyConnectionId,
    webJourneyEndpointId: patch.webJourneyEndpointId ?? existing.webJourneyEndpointId,
    status: patch.status ?? existing.status,
    senderEntityId: patch.senderEntityId ?? existing.senderEntityId,
    createdByEntityId: patch.createdByEntityId ?? existing.createdByEntityId,
    createdAt: patch.createdAt ?? existing.createdAt,
    updatedAt: patch.updatedAt ?? existing.updatedAt,
    firstSeenAt: patch.firstSeenAt ?? existing.firstSeenAt,
    lastSeenAt: patch.lastSeenAt ?? existing.lastSeenAt,
    runtimeBaseUrl: patch.runtimeBaseUrl ?? existing.runtimeBaseUrl,
    currentTokenId: patch.currentTokenId ?? existing.currentTokenId,
    currentTokenCreatedAt: patch.currentTokenCreatedAt ?? existing.currentTokenCreatedAt,
    currentTokenExpiresAt: patch.currentTokenExpiresAt ?? existing.currentTokenExpiresAt,
    currentTokenRevokedAt: patch.currentTokenRevokedAt ?? existing.currentTokenRevokedAt,
    currentTokenLabel: patch.currentTokenLabel ?? existing.currentTokenLabel,
    metadata: patch.metadata === undefined ? existing.metadata : patch.metadata,
  };
  db.prepare(
    `UPDATE web_signals_installations SET
      account_id = ?,
      label = ?,
      site_origin = ?,
      web_journey_connection_id = ?,
      web_journey_endpoint_id = ?,
      status = ?,
      sender_entity_id = ?,
      created_by_entity_id = ?,
      created_at = ?,
      updated_at = ?,
      first_seen_at = ?,
      last_seen_at = ?,
      runtime_base_url = ?,
      current_token_id = ?,
      current_token_created_at = ?,
      current_token_expires_at = ?,
      current_token_revoked_at = ?,
      current_token_label = ?,
      metadata_json = ?
     WHERE web_installation_id = ?`,
  ).run(
    next.accountId,
    next.label,
    next.siteOrigin,
    next.webJourneyConnectionId,
    next.webJourneyEndpointId,
    next.status,
    next.senderEntityId,
    next.createdByEntityId,
    next.createdAt,
    next.updatedAt,
    next.firstSeenAt,
    next.lastSeenAt,
    next.runtimeBaseUrl,
    next.currentTokenId,
    next.currentTokenCreatedAt,
    next.currentTokenExpiresAt,
    next.currentTokenRevokedAt,
    next.currentTokenLabel,
    stringifyJson(next.metadata ?? null),
    webInstallationId,
  );
  return findInstallationById(db, webInstallationId);
}

export function insertToken(
  db: DatabaseSync,
  record: Omit<WebSignalsTokenRecord, "metadata"> & { metadata?: Record<string, unknown> | null },
): WebSignalsTokenRecord {
  db.prepare(
    `INSERT INTO web_signals_tokens (
      id, web_installation_id, token_id, label, created_by_entity_id,
      created_at, last_used_at, expires_at, revoked_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.webInstallationId,
    record.tokenId,
    record.label ?? null,
    record.createdByEntityId,
    record.createdAt,
    record.lastUsedAt ?? null,
    record.expiresAt ?? null,
    record.revokedAt ?? null,
    stringifyJson(record.metadata ?? null),
  );
  const row = db
    .prepare(`SELECT * FROM web_signals_tokens WHERE id = ?`)
    .get(record.id) as Record<string, unknown> | undefined;
  return row ? rowToToken(row) : { ...record, metadata: record.metadata ?? null };
}

export function listTokens(
  db: DatabaseSync,
  options: { webInstallationId: string; includeRevoked?: boolean; limit?: number },
): WebSignalsTokenRecord[] {
  const clauses = ["web_installation_id = ?"];
  const values: Array<string | number> = [options.webInstallationId];
  if (!options.includeRevoked) {
    clauses.push("revoked_at IS NULL");
  }
  const limit = asLimit(options.limit, 50);
  const rows = db
    .prepare(
      `SELECT * FROM web_signals_tokens WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...values, limit) as Record<string, unknown>[];
  return rows.map(rowToToken);
}

export function updateTokenRevocation(db: DatabaseSync, tokenId: string, revokedAt: number): WebSignalsTokenRecord | null {
  db.prepare(`UPDATE web_signals_tokens SET revoked_at = ? WHERE token_id = ?`).run(revokedAt, tokenId);
  const row = db
    .prepare(`SELECT * FROM web_signals_tokens WHERE token_id = ?`)
    .get(tokenId) as Record<string, unknown> | undefined;
  return row ? rowToToken(row) : null;
}

export function deleteTokensForInstallation(db: DatabaseSync, webInstallationId: string): number {
  const result = db
    .prepare(`DELETE FROM web_signals_tokens WHERE web_installation_id = ?`)
    .run(webInstallationId);
  return Number(result.changes ?? 0);
}

export function deleteInstallation(db: DatabaseSync, webInstallationId: string): WebSignalsInstallationRecord | null {
  const existing = findInstallationById(db, webInstallationId);
  if (!existing) {
    return null;
  }
  deleteTokensForInstallation(db, webInstallationId);
  db.prepare(`DELETE FROM web_signals_installations WHERE web_installation_id = ?`).run(webInstallationId);
  return existing;
}
