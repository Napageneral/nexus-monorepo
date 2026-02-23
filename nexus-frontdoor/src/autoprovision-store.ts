import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TenantConfig } from "./types.js";

export type OidcAccountRecord = {
  provider: string;
  subject: string;
  userId: string;
  tenantId: string;
  entityId: string;
  email?: string;
  displayName?: string;
  roles: string[];
  scopes: string[];
};

export type TenantRecord = TenantConfig & {
  stateDir?: string;
};

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  } catch {
    return [];
  }
}

export class AutoProvisionStore {
  private readonly db: DatabaseSync;

  constructor(sqlitePath: string) {
    const resolved = path.resolve(sqlitePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new DatabaseSync(resolved);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS frontdoor_tenants (
        tenant_id TEXT PRIMARY KEY,
        runtime_url TEXT NOT NULL,
        runtime_public_base_url TEXT NOT NULL,
        runtime_ws_url TEXT,
        runtime_sse_url TEXT,
        state_dir TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS frontdoor_oidc_accounts (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        email TEXT,
        display_name TEXT,
        roles_json TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(provider, subject)
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_oidc_accounts_tenant
        ON frontdoor_oidc_accounts(tenant_id);
    `);
  }

  listTenants(): TenantRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          tenant_id,
          runtime_url,
          runtime_public_base_url,
          runtime_ws_url,
          runtime_sse_url,
          state_dir
        FROM frontdoor_tenants
        ORDER BY created_at_ms ASC
      `,
      )
      .all() as Array<{
      tenant_id: string;
      runtime_url: string;
      runtime_public_base_url: string;
      runtime_ws_url: string | null;
      runtime_sse_url: string | null;
      state_dir: string | null;
    }>;
    return rows.map((row) => ({
      id: row.tenant_id,
      runtimeUrl: row.runtime_url,
      runtimePublicBaseUrl: row.runtime_public_base_url,
      runtimeWsUrl: row.runtime_ws_url ?? undefined,
      runtimeSseUrl: row.runtime_sse_url ?? undefined,
      stateDir: row.state_dir ?? undefined,
    }));
  }

  getTenant(tenantId: string): TenantRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          tenant_id,
          runtime_url,
          runtime_public_base_url,
          runtime_ws_url,
          runtime_sse_url,
          state_dir
        FROM frontdoor_tenants
        WHERE tenant_id = ?
        LIMIT 1
      `,
      )
      .get(tenantId) as
      | {
          tenant_id: string;
          runtime_url: string;
          runtime_public_base_url: string;
          runtime_ws_url: string | null;
          runtime_sse_url: string | null;
          state_dir: string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.tenant_id,
      runtimeUrl: row.runtime_url,
      runtimePublicBaseUrl: row.runtime_public_base_url,
      runtimeWsUrl: row.runtime_ws_url ?? undefined,
      runtimeSseUrl: row.runtime_sse_url ?? undefined,
      stateDir: row.state_dir ?? undefined,
    };
  }

  upsertTenant(record: TenantRecord): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_tenants (
          tenant_id,
          runtime_url,
          runtime_public_base_url,
          runtime_ws_url,
          runtime_sse_url,
          state_dir,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          runtime_url = excluded.runtime_url,
          runtime_public_base_url = excluded.runtime_public_base_url,
          runtime_ws_url = excluded.runtime_ws_url,
          runtime_sse_url = excluded.runtime_sse_url,
          state_dir = excluded.state_dir,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        record.id,
        record.runtimeUrl,
        record.runtimePublicBaseUrl,
        record.runtimeWsUrl ?? null,
        record.runtimeSseUrl ?? null,
        record.stateDir ?? null,
        now,
        now,
      );
  }

  getOidcAccount(params: { provider: string; subject: string }): OidcAccountRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          provider,
          subject,
          user_id,
          tenant_id,
          entity_id,
          email,
          display_name,
          roles_json,
          scopes_json
        FROM frontdoor_oidc_accounts
        WHERE provider = ? AND subject = ?
        LIMIT 1
      `,
      )
      .get(params.provider, params.subject) as
      | {
          provider: string;
          subject: string;
          user_id: string;
          tenant_id: string;
          entity_id: string;
          email: string | null;
          display_name: string | null;
          roles_json: string;
          scopes_json: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      provider: row.provider,
      subject: row.subject,
      userId: row.user_id,
      tenantId: row.tenant_id,
      entityId: row.entity_id,
      email: row.email ?? undefined,
      displayName: row.display_name ?? undefined,
      roles: parseJsonArray(row.roles_json),
      scopes: parseJsonArray(row.scopes_json),
    };
  }

  upsertOidcAccount(record: OidcAccountRecord): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_oidc_accounts (
          provider,
          subject,
          user_id,
          tenant_id,
          entity_id,
          email,
          display_name,
          roles_json,
          scopes_json,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, subject) DO UPDATE SET
          user_id = excluded.user_id,
          tenant_id = excluded.tenant_id,
          entity_id = excluded.entity_id,
          email = excluded.email,
          display_name = excluded.display_name,
          roles_json = excluded.roles_json,
          scopes_json = excluded.scopes_json,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        record.provider,
        record.subject,
        record.userId,
        record.tenantId,
        record.entityId,
        record.email ?? null,
        record.displayName ?? null,
        JSON.stringify(record.roles),
        JSON.stringify(record.scopes),
        now,
        now,
      );
  }

  close(): void {
    this.db.close();
  }
}
