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

export type UserProductTenantRecord = {
  userId: string;
  productId: string;
  tenantId: string;
};

export type TenantRecord = TenantConfig & {
  stateDir?: string;
};

export type ProvisionRequestRecord = {
  requestId: string;
  userId: string;
  provider: string;
  subject: string;
  tenantId?: string;
  status: "queued" | "provisioning" | "ready" | "failed";
  stage?: string;
  errorText?: string;
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
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
        runtime_auth_token TEXT,
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

      CREATE TABLE IF NOT EXISTS frontdoor_user_product_tenants (
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(user_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_user_product_tenants_tenant
        ON frontdoor_user_product_tenants(tenant_id);

      CREATE TABLE IF NOT EXISTS frontdoor_provision_requests (
        request_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        tenant_id TEXT,
        status TEXT NOT NULL,
        stage TEXT,
        error_text TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        completed_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_provision_requests_user_updated
        ON frontdoor_provision_requests(user_id, updated_at_ms DESC);
    `);
    try {
      this.db.exec("ALTER TABLE frontdoor_tenants ADD COLUMN runtime_auth_token TEXT");
    } catch {
      // Already exists.
    }
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
          runtime_auth_token,
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
      runtime_auth_token: string | null;
      state_dir: string | null;
    }>;
    return rows.map((row) => ({
      id: row.tenant_id,
      runtimeUrl: row.runtime_url,
      runtimePublicBaseUrl: row.runtime_public_base_url,
      runtimeWsUrl: row.runtime_ws_url ?? undefined,
      runtimeSseUrl: row.runtime_sse_url ?? undefined,
      runtimeAuthToken: row.runtime_auth_token ?? undefined,
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
          runtime_auth_token,
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
          runtime_auth_token: string | null;
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
      runtimeAuthToken: row.runtime_auth_token ?? undefined,
      stateDir: row.state_dir ?? undefined,
    };
  }

  upsertTenant(record: TenantRecord): void {
    this.upsertTenantAt(record, Date.now());
  }

  private upsertTenantAt(record: TenantRecord, now: number): void {
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_tenants (
          tenant_id,
          runtime_url,
          runtime_public_base_url,
          runtime_ws_url,
          runtime_sse_url,
          runtime_auth_token,
          state_dir,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          runtime_url = excluded.runtime_url,
          runtime_public_base_url = excluded.runtime_public_base_url,
          runtime_ws_url = excluded.runtime_ws_url,
          runtime_sse_url = excluded.runtime_sse_url,
          runtime_auth_token = excluded.runtime_auth_token,
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
        record.runtimeAuthToken ?? null,
        record.stateDir ?? null,
        now,
        now,
      );
  }

  startProvisionRequest(params: {
    requestId: string;
    userId: string;
    provider: string;
    subject: string;
    tenantId?: string;
    status?: "queued" | "provisioning";
    stage?: string;
  }): void {
    const now = Date.now();
    const initialStatus = params.status ?? "queued";
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_provision_requests (
          request_id,
          user_id,
          provider,
          subject,
          tenant_id,
          status,
          stage,
          error_text,
          created_at_ms,
          updated_at_ms,
          completed_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)
      `,
      )
      .run(
        params.requestId,
        params.userId,
        params.provider,
        params.subject,
        params.tenantId ?? null,
        initialStatus,
        params.stage ?? null,
        now,
        now,
      );
  }

  updateProvisionRequest(params: {
    requestId: string;
    status: "provisioning" | "ready" | "failed";
    stage?: string;
    tenantId?: string;
    errorText?: string;
  }): void {
    const now = Date.now();
    const completedAt = params.status === "ready" || params.status === "failed" ? now : null;
    this.db
      .prepare(
        `
        UPDATE frontdoor_provision_requests
        SET status = ?,
            stage = ?,
            tenant_id = COALESCE(?, tenant_id),
            error_text = ?,
            updated_at_ms = ?,
            completed_at_ms = COALESCE(?, completed_at_ms)
        WHERE request_id = ?
      `,
      )
      .run(
        params.status,
        params.stage ?? null,
        params.tenantId ?? null,
        params.errorText ?? null,
        now,
        completedAt,
        params.requestId,
      );
  }

  completeProvisionSuccess(params: {
    requestId: string;
    tenant: TenantRecord;
    account: OidcAccountRecord;
    productId?: string;
    stage?: string;
  }): ProvisionRequestRecord {
    return this.withTransaction(() => {
      const now = Date.now();
      this.upsertTenantAt(params.tenant, now);
      this.upsertOidcAccountAt(params.account, now);
      const normalizedProduct = params.productId?.trim().toLowerCase() ?? "";
      if (normalizedProduct) {
        this.upsertUserProductTenantAt(
          {
            userId: params.account.userId,
            productId: normalizedProduct,
            tenantId: params.tenant.id,
          },
          now,
        );
      }
      const update = this.db
        .prepare(
          `
          UPDATE frontdoor_provision_requests
          SET status = 'ready',
              stage = ?,
              tenant_id = ?,
              error_text = NULL,
              updated_at_ms = ?,
              completed_at_ms = ?
          WHERE request_id = ?
        `,
        )
        .run(
          params.stage ?? "complete",
          params.tenant.id,
          now,
          now,
          params.requestId,
        );
      if (!Number(update.changes)) {
        throw new Error("provision_request_not_found");
      }
      const request = this.getProvisionRequest(params.requestId);
      if (!request) {
        throw new Error("provision_request_not_found");
      }
      return request;
    });
  }

  getProvisionRequest(requestId: string): ProvisionRequestRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          request_id,
          user_id,
          provider,
          subject,
          tenant_id,
          status,
          stage,
          error_text,
          created_at_ms,
          updated_at_ms,
          completed_at_ms
        FROM frontdoor_provision_requests
        WHERE request_id = ?
        LIMIT 1
      `,
      )
      .get(requestId) as
      | {
          request_id: string;
          user_id: string;
          provider: string;
          subject: string;
          tenant_id: string | null;
          status: string;
          stage: string | null;
          error_text: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          completed_at_ms: number | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      requestId: row.request_id,
      userId: row.user_id,
      provider: row.provider,
      subject: row.subject,
      tenantId: row.tenant_id ?? undefined,
      status: (row.status || "failed") as ProvisionRequestRecord["status"],
      stage: row.stage ?? undefined,
      errorText: row.error_text ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      completedAtMs: row.completed_at_ms ?? undefined,
    };
  }

  getLatestProvisionRequestByUser(userId: string): ProvisionRequestRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          request_id,
          user_id,
          provider,
          subject,
          tenant_id,
          status,
          stage,
          error_text,
          created_at_ms,
          updated_at_ms,
          completed_at_ms
        FROM frontdoor_provision_requests
        WHERE user_id = ?
        ORDER BY updated_at_ms DESC
        LIMIT 1
      `,
      )
      .get(userId) as
      | {
          request_id: string;
          user_id: string;
          provider: string;
          subject: string;
          tenant_id: string | null;
          status: string;
          stage: string | null;
          error_text: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          completed_at_ms: number | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      requestId: row.request_id,
      userId: row.user_id,
      provider: row.provider,
      subject: row.subject,
      tenantId: row.tenant_id ?? undefined,
      status: (row.status || "failed") as ProvisionRequestRecord["status"],
      stage: row.stage ?? undefined,
      errorText: row.error_text ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      completedAtMs: row.completed_at_ms ?? undefined,
    };
  }

  getLatestProvisionRequestByOidcIdentity(params: {
    provider: string;
    subject: string;
  }): ProvisionRequestRecord | null {
    const provider = params.provider.trim().toLowerCase();
    const subject = params.subject.trim().toLowerCase();
    if (!provider || !subject) {
      return null;
    }
    const row = this.db
      .prepare(
        `
        SELECT
          request_id,
          user_id,
          provider,
          subject,
          tenant_id,
          status,
          stage,
          error_text,
          created_at_ms,
          updated_at_ms,
          completed_at_ms
        FROM frontdoor_provision_requests
        WHERE provider = ? AND subject = ?
        ORDER BY updated_at_ms DESC
        LIMIT 1
      `,
      )
      .get(provider, subject) as
      | {
          request_id: string;
          user_id: string;
          provider: string;
          subject: string;
          tenant_id: string | null;
          status: string;
          stage: string | null;
          error_text: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          completed_at_ms: number | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      requestId: row.request_id,
      userId: row.user_id,
      provider: row.provider,
      subject: row.subject,
      tenantId: row.tenant_id ?? undefined,
      status: (row.status || "failed") as ProvisionRequestRecord["status"],
      stage: row.stage ?? undefined,
      errorText: row.error_text ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      completedAtMs: row.completed_at_ms ?? undefined,
    };
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

  getUserProductTenant(params: { userId: string; productId: string }): UserProductTenantRecord | null {
    const userId = params.userId.trim();
    const productId = params.productId.trim().toLowerCase();
    if (!userId || !productId) {
      return null;
    }
    const row = this.db
      .prepare(
        `
        SELECT user_id, product_id, tenant_id
        FROM frontdoor_user_product_tenants
        WHERE user_id = ? AND product_id = ?
        LIMIT 1
      `,
      )
      .get(userId, productId) as
      | {
          user_id: string;
          product_id: string;
          tenant_id: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      productId: row.product_id,
      tenantId: row.tenant_id,
    };
  }

  upsertOidcAccount(record: OidcAccountRecord): void {
    this.upsertOidcAccountAt(record, Date.now());
  }

  upsertUserProductTenant(record: UserProductTenantRecord): void {
    this.upsertUserProductTenantAt(record, Date.now());
  }

  private upsertOidcAccountAt(record: OidcAccountRecord, now: number): void {
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

  private upsertUserProductTenantAt(record: UserProductTenantRecord, now: number): void {
    const userId = record.userId.trim();
    const productId = record.productId.trim().toLowerCase();
    const tenantId = record.tenantId.trim();
    if (!userId || !productId || !tenantId) {
      return;
    }
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_user_product_tenants (
          user_id,
          product_id,
          tenant_id,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, product_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(userId, productId, tenantId, now, now);
  }

  private withTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // best-effort rollback
      }
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
