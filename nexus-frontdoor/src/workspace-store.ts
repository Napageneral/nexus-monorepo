import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { randomToken, tokenHash, verifyPasswordHash } from "./crypto.js";
import type { FrontdoorConfig, Principal, TenantConfig } from "./types.js";

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

function dedupe(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const item = value.trim();
    if (!item) {
      continue;
    }
    out.add(item);
  }
  return [...out];
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function toSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return normalized || "workspace";
}

function nowMs(): number {
  return Date.now();
}

export type FrontdoorUserRecord = {
  userId: string;
  username?: string;
  passwordHash?: string;
  email?: string;
  displayName?: string;
  disabled: boolean;
};

export type WorkspaceRecord = {
  workspaceId: string;
  workspaceSlug: string;
  displayName: string;
  runtimeUrl: string;
  runtimePublicBaseUrl: string;
  runtimeWsUrl?: string;
  runtimeSseUrl?: string;
  status: "active" | "disabled";
};

export type WorkspaceMembershipView = WorkspaceRecord & {
  entityId: string;
  roles: string[];
  scopes: string[];
  isDefault: boolean;
};

export type InviteView = {
  inviteId: string;
  workspaceId: string;
  createdByUserId: string;
  role: string;
  scopes: string[];
  expiresAtMs: number;
  createdAtMs: number;
  redeemedByUserId?: string;
  redeemedAtMs?: number;
  revokedAtMs?: number;
};

export class WorkspaceStore {
  private readonly db: DatabaseSync;

  constructor(private readonly sqlitePath: string) {
    const resolved = path.resolve(sqlitePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new DatabaseSync(resolved);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS frontdoor_users (
        user_id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password_hash TEXT,
        email TEXT,
        display_name TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS frontdoor_identity_links (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(provider, subject),
        FOREIGN KEY(user_id) REFERENCES frontdoor_users(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS frontdoor_workspaces (
        workspace_id TEXT PRIMARY KEY,
        workspace_slug TEXT NOT NULL,
        display_name TEXT NOT NULL,
        runtime_url TEXT NOT NULL,
        runtime_public_base_url TEXT NOT NULL,
        runtime_ws_url TEXT,
        runtime_sse_url TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS frontdoor_workspace_memberships (
        user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        roles_json TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(user_id, workspace_id),
        FOREIGN KEY(user_id) REFERENCES frontdoor_users(user_id) ON DELETE CASCADE,
        FOREIGN KEY(workspace_id) REFERENCES frontdoor_workspaces(workspace_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_memberships_user
        ON frontdoor_workspace_memberships(user_id);

      CREATE TABLE IF NOT EXISTS frontdoor_invites (
        invite_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL,
        redeemed_by_user_id TEXT,
        redeemed_at_ms INTEGER,
        revoked_at_ms INTEGER,
        FOREIGN KEY(workspace_id) REFERENCES frontdoor_workspaces(workspace_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_invites_workspace
        ON frontdoor_invites(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_frontdoor_invites_expires
        ON frontdoor_invites(expires_at_ms);
    `);
  }

  close(): void {
    this.db.close();
  }

  seedFromConfig(config: FrontdoorConfig): void {
    for (const tenant of config.tenants.values()) {
      this.upsertWorkspace({
        workspaceId: tenant.id,
        workspaceSlug: toSlug(tenant.id),
        displayName: tenant.id,
        runtimeUrl: tenant.runtimeUrl,
        runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
        runtimeWsUrl: tenant.runtimeWsUrl,
        runtimeSseUrl: tenant.runtimeSseUrl,
        status: "active",
      });
    }
    for (const user of config.usersById.values()) {
      const savedUser = this.upsertUser({
        userId: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
        email: user.email,
        displayName: user.displayName,
        disabled: user.disabled === true,
      });
      if (savedUser.username) {
        this.upsertIdentityLink({
          provider: "password",
          subject: savedUser.username,
          userId: savedUser.userId,
        });
      }
      this.ensureMembership({
        userId: savedUser.userId,
        workspaceId: user.tenantId,
        entityId: user.entityId,
        roles: user.roles,
        scopes: user.scopes,
        isDefault: true,
      });
    }
  }

  private mapWorkspaceRow(row: {
    workspace_id: string;
    workspace_slug: string;
    display_name: string;
    runtime_url: string;
    runtime_public_base_url: string;
    runtime_ws_url: string | null;
    runtime_sse_url: string | null;
    status: string;
  }): WorkspaceRecord {
    return {
      workspaceId: row.workspace_id,
      workspaceSlug: row.workspace_slug,
      displayName: row.display_name,
      runtimeUrl: row.runtime_url,
      runtimePublicBaseUrl: row.runtime_public_base_url,
      runtimeWsUrl: row.runtime_ws_url ?? undefined,
      runtimeSseUrl: row.runtime_sse_url ?? undefined,
      status: row.status === "disabled" ? "disabled" : "active",
    };
  }

  private mapUserRow(row: {
    user_id: string;
    username: string | null;
    password_hash: string | null;
    email: string | null;
    display_name: string | null;
    disabled: number;
  }): FrontdoorUserRecord {
    return {
      userId: row.user_id,
      username: row.username ?? undefined,
      passwordHash: row.password_hash ?? undefined,
      email: row.email ?? undefined,
      displayName: row.display_name ?? undefined,
      disabled: row.disabled === 1,
    };
  }

  upsertWorkspace(record: WorkspaceRecord): WorkspaceRecord {
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_workspaces (
          workspace_id,
          workspace_slug,
          display_name,
          runtime_url,
          runtime_public_base_url,
          runtime_ws_url,
          runtime_sse_url,
          status,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          workspace_slug = excluded.workspace_slug,
          display_name = excluded.display_name,
          runtime_url = excluded.runtime_url,
          runtime_public_base_url = excluded.runtime_public_base_url,
          runtime_ws_url = excluded.runtime_ws_url,
          runtime_sse_url = excluded.runtime_sse_url,
          status = excluded.status,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        record.workspaceId,
        toSlug(record.workspaceSlug || record.displayName || record.workspaceId),
        record.displayName,
        record.runtimeUrl,
        record.runtimePublicBaseUrl || record.runtimeUrl,
        record.runtimeWsUrl ?? null,
        record.runtimeSseUrl ?? null,
        record.status,
        createdAt,
        createdAt,
      );
    return this.getWorkspace(record.workspaceId) ?? record;
  }

  createWorkspace(input: {
    workspaceId?: string;
    displayName: string;
    runtimeUrl: string;
    runtimePublicBaseUrl?: string;
    runtimeWsUrl?: string;
    runtimeSseUrl?: string;
  }): WorkspaceRecord {
    const baseId = input.workspaceId?.trim() || "";
    const workspaceId = baseId || `ws-${toSlug(input.displayName)}-${randomUUID().slice(0, 8)}`;
    if (this.getWorkspace(workspaceId)) {
      throw new Error("workspace_already_exists");
    }
    return this.upsertWorkspace({
      workspaceId,
      workspaceSlug: toSlug(input.displayName || workspaceId),
      displayName: input.displayName.trim() || workspaceId,
      runtimeUrl: input.runtimeUrl.trim(),
      runtimePublicBaseUrl: input.runtimePublicBaseUrl?.trim() || input.runtimeUrl.trim(),
      runtimeWsUrl: input.runtimeWsUrl?.trim() || undefined,
      runtimeSseUrl: input.runtimeSseUrl?.trim() || undefined,
      status: "active",
    });
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          workspace_id,
          workspace_slug,
          display_name,
          runtime_url,
          runtime_public_base_url,
          runtime_ws_url,
          runtime_sse_url,
          status
        FROM frontdoor_workspaces
        WHERE workspace_id = ?
        LIMIT 1
      `,
      )
      .get(workspaceId) as
      | {
          workspace_id: string;
          workspace_slug: string;
          display_name: string;
          runtime_url: string;
          runtime_public_base_url: string;
          runtime_ws_url: string | null;
          runtime_sse_url: string | null;
          status: string;
        }
      | undefined;
    return row ? this.mapWorkspaceRow(row) : null;
  }

  private upsertUser(record: FrontdoorUserRecord): FrontdoorUserRecord {
    const createdAt = nowMs();
    const username = record.username ? normalizeUsername(record.username) : null;
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_users (
          user_id,
          username,
          password_hash,
          email,
          display_name,
          disabled,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          username = COALESCE(excluded.username, frontdoor_users.username),
          password_hash = COALESCE(excluded.password_hash, frontdoor_users.password_hash),
          email = COALESCE(excluded.email, frontdoor_users.email),
          display_name = COALESCE(excluded.display_name, frontdoor_users.display_name),
          disabled = excluded.disabled,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        record.userId,
        username,
        record.passwordHash ?? null,
        record.email ?? null,
        record.displayName ?? null,
        record.disabled ? 1 : 0,
        createdAt,
        createdAt,
      );
    const resolved = this.getUserById(record.userId);
    if (!resolved) {
      throw new Error("failed_to_upsert_user");
    }
    return resolved;
  }

  getUserById(userId: string): FrontdoorUserRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT user_id, username, password_hash, email, display_name, disabled
        FROM frontdoor_users
        WHERE user_id = ?
        LIMIT 1
      `,
      )
      .get(userId) as
      | {
          user_id: string;
          username: string | null;
          password_hash: string | null;
          email: string | null;
          display_name: string | null;
          disabled: number;
        }
      | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  getUserByUsername(username: string): FrontdoorUserRecord | null {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return null;
    }
    const row = this.db
      .prepare(
        `
        SELECT user_id, username, password_hash, email, display_name, disabled
        FROM frontdoor_users
        WHERE username = ?
        LIMIT 1
      `,
      )
      .get(normalized) as
      | {
          user_id: string;
          username: string | null;
          password_hash: string | null;
          email: string | null;
          display_name: string | null;
          disabled: number;
        }
      | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  getUserByEmail(email: string): FrontdoorUserRecord | null {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const row = this.db
      .prepare(
        `
        SELECT user_id, username, password_hash, email, display_name, disabled
        FROM frontdoor_users
        WHERE lower(email) = ?
        LIMIT 1
      `,
      )
      .get(normalized) as
      | {
          user_id: string;
          username: string | null;
          password_hash: string | null;
          email: string | null;
          display_name: string | null;
          disabled: number;
        }
      | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  upsertIdentityLink(params: { provider: string; subject: string; userId: string }): void {
    const provider = params.provider.trim().toLowerCase();
    const subject = params.subject.trim().toLowerCase();
    if (!provider || !subject || !params.userId.trim()) {
      return;
    }
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_identity_links (
          provider,
          subject,
          user_id,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(provider, subject) DO UPDATE SET
          user_id = excluded.user_id,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(provider, subject, params.userId.trim(), createdAt, createdAt);
  }

  getUserByIdentityLink(provider: string, subject: string): FrontdoorUserRecord | null {
    const normalizedProvider = provider.trim().toLowerCase();
    const normalizedSubject = subject.trim().toLowerCase();
    if (!normalizedProvider || !normalizedSubject) {
      return null;
    }
    const row = this.db
      .prepare(
        `
        SELECT
          u.user_id,
          u.username,
          u.password_hash,
          u.email,
          u.display_name,
          u.disabled
        FROM frontdoor_identity_links l
        JOIN frontdoor_users u ON u.user_id = l.user_id
        WHERE l.provider = ? AND l.subject = ?
        LIMIT 1
      `,
      )
      .get(normalizedProvider, normalizedSubject) as
      | {
          user_id: string;
          username: string | null;
          password_hash: string | null;
          email: string | null;
          display_name: string | null;
          disabled: number;
        }
      | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  authenticatePassword(username: string, password: string): FrontdoorUserRecord | null {
    const user = this.getUserByUsername(username);
    if (!user || user.disabled || !user.passwordHash) {
      return null;
    }
    if (!verifyPasswordHash({ password, encoded: user.passwordHash })) {
      return null;
    }
    return user;
  }

  ensureMembership(params: {
    userId: string;
    workspaceId: string;
    entityId: string;
    roles: string[];
    scopes: string[];
    isDefault?: boolean;
  }): WorkspaceMembershipView {
    const user = this.getUserById(params.userId);
    if (!user) {
      throw new Error("user_not_found");
    }
    const workspace = this.getWorkspace(params.workspaceId);
    if (!workspace) {
      throw new Error("workspace_not_found");
    }
    const createdAt = nowMs();
    const roles = dedupe(params.roles);
    const scopes = dedupe(params.scopes);
    const isDefault = params.isDefault === true ? 1 : 0;
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_workspace_memberships (
          user_id,
          workspace_id,
          entity_id,
          roles_json,
          scopes_json,
          is_default,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, workspace_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          roles_json = excluded.roles_json,
          scopes_json = excluded.scopes_json,
          is_default = CASE
            WHEN excluded.is_default = 1 THEN 1
            ELSE frontdoor_workspace_memberships.is_default
          END,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        user.userId,
        workspace.workspaceId,
        params.entityId.trim() || `entity:${workspace.workspaceId}:${user.userId}`,
        JSON.stringify(roles),
        JSON.stringify(scopes),
        isDefault,
        createdAt,
        createdAt,
      );
    if (isDefault === 1) {
      this.setDefaultWorkspace(user.userId, workspace.workspaceId);
    }
    const membership = this.getMembership(user.userId, workspace.workspaceId);
    if (!membership) {
      throw new Error("failed_to_ensure_membership");
    }
    return membership;
  }

  listWorkspacesForUser(userId: string): WorkspaceMembershipView[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          w.workspace_id,
          w.workspace_slug,
          w.display_name,
          w.runtime_url,
          w.runtime_public_base_url,
          w.runtime_ws_url,
          w.runtime_sse_url,
          w.status,
          m.entity_id,
          m.roles_json,
          m.scopes_json,
          m.is_default
        FROM frontdoor_workspace_memberships m
        JOIN frontdoor_workspaces w ON w.workspace_id = m.workspace_id
        WHERE m.user_id = ? AND w.status = 'active'
        ORDER BY m.is_default DESC, w.display_name ASC
      `,
      )
      .all(userId) as Array<{
      workspace_id: string;
      workspace_slug: string;
      display_name: string;
      runtime_url: string;
      runtime_public_base_url: string;
      runtime_ws_url: string | null;
      runtime_sse_url: string | null;
      status: string;
      entity_id: string;
      roles_json: string;
      scopes_json: string;
      is_default: number;
    }>;
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      workspaceSlug: row.workspace_slug,
      displayName: row.display_name,
      runtimeUrl: row.runtime_url,
      runtimePublicBaseUrl: row.runtime_public_base_url,
      runtimeWsUrl: row.runtime_ws_url ?? undefined,
      runtimeSseUrl: row.runtime_sse_url ?? undefined,
      status: row.status === "disabled" ? "disabled" : "active",
      entityId: row.entity_id,
      roles: parseJsonArray(row.roles_json),
      scopes: parseJsonArray(row.scopes_json),
      isDefault: row.is_default === 1,
    }));
  }

  countWorkspacesForUser(userId: string): number {
    const row = this.db
      .prepare(
        `
        SELECT count(*) AS count
        FROM frontdoor_workspace_memberships m
        JOIN frontdoor_workspaces w ON w.workspace_id = m.workspace_id
        WHERE m.user_id = ? AND w.status = 'active'
      `,
      )
      .get(userId) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  getMembership(userId: string, workspaceId: string): WorkspaceMembershipView | null {
    const rows = this.listWorkspacesForUser(userId);
    for (const row of rows) {
      if (row.workspaceId === workspaceId) {
        return row;
      }
    }
    return null;
  }

  getDefaultMembership(userId: string): WorkspaceMembershipView | null {
    const memberships = this.listWorkspacesForUser(userId);
    if (memberships.length === 0) {
      return null;
    }
    const explicit = memberships.find((item) => item.isDefault);
    return explicit ?? memberships[0] ?? null;
  }

  setDefaultWorkspace(userId: string, workspaceId: string): boolean {
    const membership = this.getMembership(userId, workspaceId);
    if (!membership) {
      return false;
    }
    this.db
      .prepare(
        `
        UPDATE frontdoor_workspace_memberships
        SET is_default = CASE WHEN workspace_id = ? THEN 1 ELSE 0 END,
            updated_at_ms = ?
        WHERE user_id = ?
      `,
      )
      .run(workspaceId, nowMs(), userId);
    return true;
  }

  toPrincipal(params: {
    user: FrontdoorUserRecord;
    membership: WorkspaceMembershipView | null;
    amr: string[];
  }): Principal {
    return {
      userId: params.user.userId,
      tenantId: params.membership?.workspaceId ?? "",
      entityId: params.membership?.entityId ?? `entity:user:${params.user.userId}`,
      username: params.user.username,
      displayName: params.user.displayName,
      email: params.user.email,
      roles: params.membership ? [...params.membership.roles] : [],
      scopes: params.membership ? [...params.membership.scopes] : [],
      amr: [...params.amr],
    };
  }

  resolveOrCreateOidcUser(params: {
    provider: string;
    subject: string;
    email?: string;
    displayName?: string;
    fallbackPrincipal?: Principal | null;
  }): FrontdoorUserRecord {
    const provider = params.provider.trim().toLowerCase();
    const subject = params.subject.trim().toLowerCase();
    if (!provider || !subject) {
      throw new Error("invalid_oidc_subject");
    }
    const linked = this.getUserByIdentityLink(provider, subject);
    if (linked) {
      const merged = this.upsertUser({
        userId: linked.userId,
        username: linked.username,
        passwordHash: linked.passwordHash,
        email: params.email || linked.email,
        displayName: params.displayName || linked.displayName,
        disabled: linked.disabled,
      });
      return merged;
    }
    let user: FrontdoorUserRecord | null = null;
    if (params.email) {
      user = this.getUserByEmail(params.email);
    }
    if (!user && params.fallbackPrincipal?.userId) {
      user = this.getUserById(params.fallbackPrincipal.userId);
    }
    if (!user) {
      user = this.upsertUser({
        userId: `user-${randomUUID()}`,
        email: params.email,
        displayName: params.displayName,
        disabled: false,
      });
    }
    this.upsertIdentityLink({
      provider,
      subject,
      userId: user.userId,
    });
    if (params.fallbackPrincipal?.tenantId) {
      this.ensureMembership({
        userId: user.userId,
        workspaceId: params.fallbackPrincipal.tenantId,
        entityId:
          params.fallbackPrincipal.entityId || `entity:${params.fallbackPrincipal.tenantId}:${user.userId}`,
        roles: params.fallbackPrincipal.roles,
        scopes: params.fallbackPrincipal.scopes,
        isDefault: this.countWorkspacesForUser(user.userId) === 0,
      });
    }
    return this.getUserById(user.userId) ?? user;
  }

  createInvite(params: {
    workspaceId: string;
    createdByUserId: string;
    role: string;
    scopes: string[];
    expiresInSeconds: number;
  }): InviteView & { inviteToken: string } {
    const workspace = this.getWorkspace(params.workspaceId);
    if (!workspace || workspace.status !== "active") {
      throw new Error("workspace_not_found");
    }
    const creator = this.getUserById(params.createdByUserId);
    if (!creator) {
      throw new Error("creator_not_found");
    }
    const inviteId = randomUUID();
    const secret = randomToken(24);
    const inviteToken = `inv_${inviteId}.${secret}`;
    const createdAt = nowMs();
    const expiresAtMs = createdAt + Math.max(60, Math.floor(params.expiresInSeconds)) * 1000;
    const scopes = dedupe(params.scopes);
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_invites (
          invite_id,
          workspace_id,
          created_by_user_id,
          role,
          scopes_json,
          token_hash,
          expires_at_ms,
          created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        inviteId,
        workspace.workspaceId,
        creator.userId,
        params.role.trim() || "workspace_member",
        JSON.stringify(scopes),
        tokenHash(secret),
        expiresAtMs,
        createdAt,
      );
    return {
      inviteId,
      workspaceId: workspace.workspaceId,
      createdByUserId: creator.userId,
      role: params.role.trim() || "workspace_member",
      scopes,
      expiresAtMs,
      createdAtMs: createdAt,
      inviteToken,
    };
  }

  listInvites(workspaceId: string): InviteView[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          invite_id,
          workspace_id,
          created_by_user_id,
          role,
          scopes_json,
          expires_at_ms,
          created_at_ms,
          redeemed_by_user_id,
          redeemed_at_ms,
          revoked_at_ms
        FROM frontdoor_invites
        WHERE workspace_id = ?
        ORDER BY created_at_ms DESC
      `,
      )
      .all(workspaceId) as Array<{
      invite_id: string;
      workspace_id: string;
      created_by_user_id: string;
      role: string;
      scopes_json: string;
      expires_at_ms: number;
      created_at_ms: number;
      redeemed_by_user_id: string | null;
      redeemed_at_ms: number | null;
      revoked_at_ms: number | null;
    }>;
    return rows.map((row) => ({
      inviteId: row.invite_id,
      workspaceId: row.workspace_id,
      createdByUserId: row.created_by_user_id,
      role: row.role,
      scopes: parseJsonArray(row.scopes_json),
      expiresAtMs: row.expires_at_ms,
      createdAtMs: row.created_at_ms,
      redeemedByUserId: row.redeemed_by_user_id ?? undefined,
      redeemedAtMs: row.redeemed_at_ms ?? undefined,
      revokedAtMs: row.revoked_at_ms ?? undefined,
    }));
  }

  revokeInvite(inviteId: string): boolean {
    const result = this.db
      .prepare(
        `
        UPDATE frontdoor_invites
        SET revoked_at_ms = ?, redeemed_at_ms = redeemed_at_ms
        WHERE invite_id = ? AND revoked_at_ms IS NULL
      `,
      )
      .run(nowMs(), inviteId);
    return (result.changes ?? 0) > 0;
  }

  redeemInvite(params: { token: string; userId: string }): {
    workspace: WorkspaceMembershipView;
    invite: InviteView;
  } {
    const [idPart, secretPart] = params.token.trim().split(".");
    if (!idPart?.startsWith("inv_") || !secretPart?.trim()) {
      throw new Error("invalid_invite_token");
    }
    const inviteId = idPart.slice("inv_".length);
    const row = this.db
      .prepare(
        `
        SELECT
          invite_id,
          workspace_id,
          created_by_user_id,
          role,
          scopes_json,
          token_hash,
          expires_at_ms,
          created_at_ms,
          redeemed_by_user_id,
          redeemed_at_ms,
          revoked_at_ms
        FROM frontdoor_invites
        WHERE invite_id = ?
        LIMIT 1
      `,
      )
      .get(inviteId) as
      | {
          invite_id: string;
          workspace_id: string;
          created_by_user_id: string;
          role: string;
          scopes_json: string;
          token_hash: string;
          expires_at_ms: number;
          created_at_ms: number;
          redeemed_by_user_id: string | null;
          redeemed_at_ms: number | null;
          revoked_at_ms: number | null;
        }
      | undefined;
    if (!row) {
      throw new Error("invite_not_found");
    }
    const current = nowMs();
    if (row.revoked_at_ms !== null) {
      throw new Error("invite_revoked");
    }
    if (row.redeemed_at_ms !== null) {
      throw new Error("invite_redeemed");
    }
    if (row.expires_at_ms <= current) {
      throw new Error("invite_expired");
    }
    if (row.token_hash !== tokenHash(secretPart.trim())) {
      throw new Error("invalid_invite_token");
    }

    const membership = this.getMembership(params.userId, row.workspace_id);
    const nextRoles = dedupe([...(membership?.roles ?? []), row.role]);
    const nextScopes = dedupe([...(membership?.scopes ?? []), ...parseJsonArray(row.scopes_json)]);
    const ensured = this.ensureMembership({
      userId: params.userId,
      workspaceId: row.workspace_id,
      entityId: membership?.entityId ?? `entity:${row.workspace_id}:${params.userId}`,
      roles: nextRoles,
      scopes: nextScopes,
      isDefault: this.countWorkspacesForUser(params.userId) <= 1,
    });

    this.db
      .prepare(
        `
        UPDATE frontdoor_invites
        SET redeemed_by_user_id = ?, redeemed_at_ms = ?
        WHERE invite_id = ? AND redeemed_at_ms IS NULL
      `,
      )
      .run(params.userId, current, inviteId);

    return {
      workspace: ensured,
      invite: {
        inviteId: row.invite_id,
        workspaceId: row.workspace_id,
        createdByUserId: row.created_by_user_id,
        role: row.role,
        scopes: parseJsonArray(row.scopes_json),
        expiresAtMs: row.expires_at_ms,
        createdAtMs: row.created_at_ms,
        redeemedByUserId: params.userId,
        redeemedAtMs: current,
        revokedAtMs: row.revoked_at_ms ?? undefined,
      },
    };
  }
}

export function workspaceToTenantConfig(workspace: WorkspaceRecord): TenantConfig {
  return {
    id: workspace.workspaceId,
    runtimeUrl: workspace.runtimeUrl,
    runtimePublicBaseUrl: workspace.runtimePublicBaseUrl,
    runtimeWsUrl: workspace.runtimeWsUrl,
    runtimeSseUrl: workspace.runtimeSseUrl,
  };
}
