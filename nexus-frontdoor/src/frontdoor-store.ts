import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { randomToken, tokenHash, verifyPasswordHash } from "./crypto.js";
import type { FrontdoorConfig, Principal, TenantConfig } from "./types.js";

// ── Utility Functions ───────────────────────────────────────────────

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

function normalizeAppId(value: string): string {
  return value.trim().toLowerCase();
}

function toSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return normalized || "server";
}

function nowMs(): number {
  return Date.now();
}

function canonicalizeRuntimeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    const noTrailingSlash = parsed.toString().replace(/\/+$/g, "");
    return noTrailingSlash.toLowerCase();
  } catch {
    return value.replace(/\/+$/g, "").toLowerCase();
  }
}

function startOfUtcMonthMs(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
}

function endOfUtcMonthMs(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0) - 1;
}

function toUtcDateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function parseEntitlementCountLimit(raw: string | undefined): number | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "unlimited" || normalized === "infinite" || normalized === "infinity") {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
}

// ── Type Definitions ────────────────────────────────────────────────

export type FrontdoorUserRecord = {
  userId: string;
  username?: string;
  passwordHash?: string;
  email?: string;
  displayName?: string;
  disabled: boolean;
};

export type IdentityLinkRecord = {
  provider: string;
  subject: string;
  userId: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type AccountRecord = {
  accountId: string;
  displayName: string;
  ownerUserId: string;
  status: "active" | "suspended" | "closed";
  createdAtMs: number;
  updatedAtMs: number;
};

export type AccountMemberRole = "owner" | "admin" | "member" | "viewer";

export type AccountMemberRecord = {
  accountId: string;
  userId: string;
  role: AccountMemberRole;
  invitedBy?: string;
  joinedAtMs: number;
};

export type AccountMemberView = AccountMemberRecord & {
  username?: string;
  email?: string;
  displayName?: string;
};

export type ServerStatus = "provisioning" | "running" | "failed" | "deprovisioning" | "deleted" | "suspended";

export type ServerRecord = {
  serverId: string;
  accountId: string;
  tenantId: string;
  displayName: string;
  generatedName: string;
  status: ServerStatus;
  plan: string;
  provider: string;
  providerServerId: string | null;
  privateIp: string | null;
  publicIp: string | null;
  runtimePort: number;
  runtimeAuthToken: string | null;
  provisionToken: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
};

export function getServerRuntimeUrl(server: ServerRecord): string | null {
  if (!server.privateIp || !server.runtimePort) return null;
  return `http://${server.privateIp}:${server.runtimePort}`;
}

export function getServerRuntimeWsUrl(server: ServerRecord): string | null {
  if (!server.privateIp || !server.runtimePort) return null;
  return `ws://${server.privateIp}:${server.runtimePort}`;
}

export function getServerPublicUrl(server: ServerRecord): string {
  return `https://${server.tenantId}.nexushub.sh`;
}

export type ApiTokenRecord = {
  tokenId: string;
  tokenHash: string;
  userId: string;
  accountId: string;
  displayName: string;
  scopes: string;
  lastUsedMs: number | null;
  expiresAtMs: number | null;
  createdAtMs: number;
  revokedAtMs: number | null;
};

export type AccountMembershipView = ServerRecord & {
  entityId: string;
  roles: string[];
  scopes: string[];
  isDefault: boolean;
};

export type ServerSubscriptionRecord = {
  serverId: string;
  accountId: string;
  tier: string;
  status: string;
  provider: string;
  customerId?: string;
  subscriptionId?: string;
  periodStartMs?: number;
  periodEndMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type AppSubscriptionRecord = {
  accountId: string;
  appId: string;
  planId: string;
  status: string;
  provider: string;
  customerId?: string;
  subscriptionId?: string;
  periodStartMs?: number;
  periodEndMs?: number;
  cancelledAtMs?: number;
  cancelAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type AccountEntitlementRecord = {
  accountId: string;
  appId: string;
  entitlementKey: string;
  entitlementValue: string;
  source: "plan" | "override" | "trial" | "comp";
  expiresAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ServerAppInstallStatus =
  | "not_installed"
  | "installing"
  | "installed"
  | "failed"
  | "uninstalling"
  | "blocked_no_entitlement";

export type ServerAppInstallRecord = {
  serverId: string;
  appId: string;
  status: ServerAppInstallStatus;
  version?: string;
  entryPath?: string;
  lastError?: string;
  installedAtMs?: number;
  source: "onboarding" | "manual" | "admin" | "system" | "purchase" | "inferred" | "auto_provision" | "api";
  createdAtMs: number;
  updatedAtMs: number;
};

export type ServerLimitsSummary = {
  serverId: string;
  maxMembers: number;
  maxMonthlyTokens: number;
  maxAdapters: number;
  maxConcurrentSessions: number;
};

export type ServerUsageSummary = {
  serverId: string;
  windowDays: number;
  requestsTotal: number;
  tokensIn: number;
  tokensOut: number;
  activeMembers: number;
  daysWithData: number;
};

export type AccountInvoiceSummary = {
  accountId: string;
  invoiceId: string;
  provider: string;
  status: string;
  amountDue: number;
  currency: string;
  hostedInvoiceUrl?: string;
  periodStartMs?: number;
  periodEndMs?: number;
  createdAtMs: number;
  paidAtMs?: number;
};

export type InviteView = {
  inviteId: string;
  accountId: string;
  createdByUserId: string;
  role: string;
  scopes: string[];
  expiresAtMs: number;
  createdAtMs: number;
  redeemedByUserId?: string;
  redeemedAtMs?: number;
  revokedAtMs?: number;
};

export type CreditBalanceRecord = {
  accountId: string;
  balanceCents: number;
  currency: string;
  freeTierExpiresAtMs: number | null;
  updatedAtMs: number;
};

export type CreditTransactionRecord = {
  transactionId: string;
  accountId: string;
  amountCents: number;
  balanceAfterCents: number;
  type: "deposit" | "usage" | "refund" | "trial_grant" | "adjustment";
  description: string;
  referenceId: string | null;
  createdAtMs: number;
};

export type ProductRecord = {
  productId: string;
  displayName: string;
  tagline?: string;
  accentColor?: string;
  logoSvg?: string;
  iconSvg?: string;
  manifestVersion?: string;
  homepageUrl?: string;
  onboardingOrigin?: string;
};

export type ProductPlanRecord = {
  planId: string;
  productId: string;
  displayName: string;
  description?: string;
  priceMonthly: number;
  priceYearly?: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  featuresJson?: string;
  limitsJson?: string;
  isDefault: boolean;
  sortOrder: number;
  status?: "active" | "archived";
};

export type ResolvedEntitlements = {
  appId: string;
  planId: string;
  entitlements: Record<string, string>;
  usage: Record<string, string>;
};

// ── FrontdoorStore ──────────────────────────────────────────────────

export class FrontdoorStore {
  private readonly db: DatabaseSync;

  constructor(private readonly sqlitePath: string) {
    const resolved = path.resolve(sqlitePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new DatabaseSync(resolved);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      -- Users
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

      -- Identity Links (OIDC provider → user mapping)
      CREATE TABLE IF NOT EXISTS frontdoor_identity_links (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(provider, subject),
        FOREIGN KEY(user_id) REFERENCES frontdoor_users(user_id) ON DELETE CASCADE
      );

      -- Accounts (billing + ownership unit)
      CREATE TABLE IF NOT EXISTS frontdoor_accounts (
        account_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES frontdoor_users(user_id),
        status TEXT NOT NULL DEFAULT 'active',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      -- Account Memberships (team membership at account level)
      CREATE TABLE IF NOT EXISTS frontdoor_account_memberships (
        account_id TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
        user_id TEXT NOT NULL REFERENCES frontdoor_users(user_id),
        role TEXT NOT NULL DEFAULT 'member',
        invited_by TEXT,
        joined_at_ms INTEGER NOT NULL,
        PRIMARY KEY(account_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_account_memberships_user
        ON frontdoor_account_memberships(user_id);

      -- Servers (nex runtime instances, owned by accounts)
      CREATE TABLE IF NOT EXISTS frontdoor_servers (
        server_id            TEXT PRIMARY KEY,
        account_id           TEXT NOT NULL,
        tenant_id            TEXT NOT NULL UNIQUE,
        display_name         TEXT NOT NULL,
        generated_name       TEXT NOT NULL,
        status               TEXT NOT NULL DEFAULT 'provisioning',
        plan                 TEXT NOT NULL DEFAULT 'cax11',
        provider             TEXT NOT NULL DEFAULT 'hetzner',
        provider_server_id   TEXT,
        private_ip           TEXT,
        public_ip            TEXT,
        runtime_port         INTEGER DEFAULT 8080,
        runtime_auth_token   TEXT,
        provision_token      TEXT,
        created_at_ms        INTEGER NOT NULL,
        updated_at_ms        INTEGER NOT NULL,
        deleted_at_ms        INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_servers_account
        ON frontdoor_servers(account_id);

      -- API Tokens (per-user API keys)
      CREATE TABLE IF NOT EXISTS frontdoor_api_tokens (
        token_id      TEXT PRIMARY KEY,
        token_hash    TEXT NOT NULL,
        user_id       TEXT NOT NULL,
        account_id    TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        scopes        TEXT NOT NULL DEFAULT '*',
        last_used_ms  INTEGER,
        expires_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        revoked_at_ms INTEGER
      );

      -- Server Subscriptions (per-server billing)
      CREATE TABLE IF NOT EXISTS frontdoor_server_subscriptions (
        server_id TEXT PRIMARY KEY REFERENCES frontdoor_servers(server_id),
        account_id TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
        tier TEXT NOT NULL DEFAULT 'standard',
        status TEXT NOT NULL DEFAULT 'active',
        provider TEXT NOT NULL DEFAULT 'none',
        customer_id TEXT,
        subscription_id TEXT,
        period_start_ms INTEGER,
        period_end_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      -- App Subscriptions (per-account, per-app billing)
      CREATE TABLE IF NOT EXISTS frontdoor_app_subscriptions (
        account_id TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
        app_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        provider TEXT NOT NULL DEFAULT 'none',
        customer_id TEXT,
        subscription_id TEXT,
        period_start_ms INTEGER,
        period_end_ms INTEGER,
        cancelled_at_ms INTEGER,
        cancel_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(account_id, app_id)
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_app_subscriptions_account
        ON frontdoor_app_subscriptions(account_id);

      -- Account Entitlements (derived from app subscriptions)
      CREATE TABLE IF NOT EXISTS frontdoor_account_entitlements (
        account_id TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
        app_id TEXT NOT NULL,
        entitlement_key TEXT NOT NULL,
        entitlement_value TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'plan',
        expires_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(account_id, app_id, entitlement_key)
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_account_entitlements_account
        ON frontdoor_account_entitlements(account_id);

      -- Server App Installs (which apps are installed on which servers)
      CREATE TABLE IF NOT EXISTS frontdoor_server_app_installs (
        server_id TEXT NOT NULL REFERENCES frontdoor_servers(server_id),
        app_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_installed',
        version TEXT,
        entry_path TEXT,
        last_error TEXT,
        installed_at_ms INTEGER,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(server_id, app_id)
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_server_app_installs_server
        ON frontdoor_server_app_installs(server_id);

      -- Invites (account-level invitations)
      CREATE TABLE IF NOT EXISTS frontdoor_invites (
        invite_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL,
        redeemed_by_user_id TEXT,
        redeemed_at_ms INTEGER,
        revoked_at_ms INTEGER,
        FOREIGN KEY(account_id) REFERENCES frontdoor_accounts(account_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_invites_account
        ON frontdoor_invites(account_id);
      CREATE INDEX IF NOT EXISTS idx_frontdoor_invites_expires
        ON frontdoor_invites(expires_at_ms);

      -- Billing Events (webhook idempotency + audit)
      CREATE TABLE IF NOT EXISTS frontdoor_billing_events (
        provider TEXT NOT NULL,
        event_id TEXT NOT NULL,
        account_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        error_text TEXT,
        received_at_ms INTEGER NOT NULL,
        processed_at_ms INTEGER,
        PRIMARY KEY(provider, event_id),
        FOREIGN KEY(account_id) REFERENCES frontdoor_accounts(account_id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_billing_events_account
        ON frontdoor_billing_events(account_id);

      -- Server Limits
      CREATE TABLE IF NOT EXISTS frontdoor_server_limits (
        server_id TEXT PRIMARY KEY,
        max_members INTEGER NOT NULL DEFAULT 10,
        max_monthly_tokens INTEGER NOT NULL DEFAULT 1000000,
        max_adapters INTEGER NOT NULL DEFAULT 20,
        max_concurrent_sessions INTEGER NOT NULL DEFAULT 16,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        FOREIGN KEY(server_id) REFERENCES frontdoor_servers(server_id) ON DELETE CASCADE
      );

      -- Server Usage Daily
      CREATE TABLE IF NOT EXISTS frontdoor_server_usage_daily (
        server_id TEXT NOT NULL,
        date_utc TEXT NOT NULL,
        requests_total INTEGER NOT NULL DEFAULT 0,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        active_members INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(server_id, date_utc),
        FOREIGN KEY(server_id) REFERENCES frontdoor_servers(server_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_server_usage_daily_server
        ON frontdoor_server_usage_daily(server_id);

      -- Account Invoices
      CREATE TABLE IF NOT EXISTS frontdoor_account_invoices (
        account_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        amount_due INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'usd',
        hosted_invoice_url TEXT,
        period_start_ms INTEGER,
        period_end_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        paid_at_ms INTEGER,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(account_id, invoice_id),
        FOREIGN KEY(account_id) REFERENCES frontdoor_accounts(account_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_account_invoices_account_created
        ON frontdoor_account_invoices(account_id, created_at_ms DESC);

      -- Account Credits (prepaid balance)
      CREATE TABLE IF NOT EXISTS frontdoor_account_credits (
        account_id TEXT PRIMARY KEY REFERENCES frontdoor_accounts(account_id),
        balance_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'usd',
        free_tier_expires_at_ms INTEGER,
        updated_at_ms INTEGER NOT NULL
      );

      -- Credit Transactions (audit log)
      CREATE TABLE IF NOT EXISTS frontdoor_credit_transactions (
        transaction_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
        amount_cents INTEGER NOT NULL,
        balance_after_cents INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        reference_id TEXT,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_credit_transactions_account
        ON frontdoor_credit_transactions(account_id);
      CREATE INDEX IF NOT EXISTS idx_frontdoor_credit_transactions_created
        ON frontdoor_credit_transactions(created_at_ms);

      -- Product Registry
      CREATE TABLE IF NOT EXISTS frontdoor_products (
        product_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        tagline TEXT,
        accent_color TEXT,
        logo_svg TEXT,
        icon_svg TEXT,
        manifest_version TEXT,
        homepage_url TEXT,
        onboarding_origin TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      -- Product Plans
      CREATE TABLE IF NOT EXISTS frontdoor_product_plans (
        plan_id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        price_monthly INTEGER NOT NULL DEFAULT 0,
        price_yearly INTEGER,
        stripe_price_id_monthly TEXT,
        stripe_price_id_yearly TEXT,
        features_json TEXT,
        limits_json TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        FOREIGN KEY(product_id) REFERENCES frontdoor_products(product_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_frontdoor_product_plans_product
        ON frontdoor_product_plans(product_id, sort_order);
    `);
  }

  close(): void {
    this.db.close();
  }

  // ── Seed from Config ────────────────────────────────────────────────

  seedFromConfig(config: FrontdoorConfig): void {
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
    }
    // Seed configured tenants as servers under a system account
    for (const tenant of config.tenants.values()) {
      const systemAccount = this.ensureSystemAccount();
      const existingServer = this.getServer(tenant.id);
      if (!existingServer) {
        // Use a direct INSERT for seeded servers since they are pre-provisioned
        const now = nowMs();
        this.db
          .prepare(
            `
            INSERT INTO frontdoor_servers (
              server_id, account_id, tenant_id, display_name, generated_name,
              status, plan, provider, runtime_port, runtime_auth_token,
              created_at_ms, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, 'running', 'seed', 'config', 8080, ?, ?, ?)
            ON CONFLICT(server_id) DO NOTHING
          `,
          )
          .run(
            tenant.id,
            systemAccount.accountId,
            tenant.id,
            tenant.id,
            tenant.id,
            tenant.runtimeAuthToken ?? null,
            now,
            now,
          );
      } else {
        this.updateServer(tenant.id, {
          status: "running",
        });
      }
      // Ensure configured users have membership on this server's account
      for (const user of config.usersById.values()) {
        if (user.tenantId === tenant.id) {
          this.addAccountMember(
            systemAccount.accountId,
            user.id,
            "owner",
          );
        }
      }
    }
  }

  private ensureSystemAccount(): AccountRecord {
    const existing = this.getAccount("system-account");
    if (existing) {
      return existing;
    }
    // Ensure the system user exists before creating the system account (FK constraint)
    this.upsertUser({
      userId: "system",
      username: "system",
      email: "system@localhost",
      displayName: "System",
      disabled: true,
    });
    return this.createAccountWithId("system-account", "System", "system");
  }

  // ── User Methods ──────────────────────────────────────────────────

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

  upsertUser(record: FrontdoorUserRecord): FrontdoorUserRecord {
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

  // ── Identity Link Methods ─────────────────────────────────────────

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

  listIdentityLinksForUser(userId: string): IdentityLinkRecord[] {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return [];
    }
    const rows = this.db
      .prepare(
        `
        SELECT
          provider,
          subject,
          user_id,
          created_at_ms,
          updated_at_ms
        FROM frontdoor_identity_links
        WHERE user_id = ?
        ORDER BY updated_at_ms DESC
      `,
      )
      .all(normalizedUserId) as Array<{
      provider: string;
      subject: string;
      user_id: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>;
    return rows.map((row) => ({
      provider: row.provider,
      subject: row.subject,
      userId: row.user_id,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    }));
  }

  authenticatePassword(username: string, password: string): FrontdoorUserRecord | null {
    // Try username first, then fall back to email lookup
    let user = this.getUserByUsername(username);
    if (!user && username.includes("@")) {
      user = this.getUserByEmail(username);
    }
    if (!user || user.disabled || !user.passwordHash) {
      return null;
    }
    if (!verifyPasswordHash({ password, encoded: user.passwordHash })) {
      return null;
    }
    return user;
  }

  // ── Account Methods ───────────────────────────────────────────────

  createAccount(displayName: string, ownerUserId: string): AccountRecord {
    const accountId = `acct-${randomUUID().slice(0, 12)}`;
    return this.createAccountWithId(accountId, displayName, ownerUserId);
  }

  private createAccountWithId(accountId: string, displayName: string, ownerUserId: string): AccountRecord {
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_accounts (
          account_id,
          display_name,
          owner_user_id,
          status,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, 'active', ?, ?)
        ON CONFLICT(account_id) DO NOTHING
      `,
      )
      .run(accountId, displayName.trim() || accountId, ownerUserId, createdAt, createdAt);

    // Owner is always a member with owner role
    this.addAccountMember(accountId, ownerUserId, "owner");

    // Initialize credit balance with 7-day free tier
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    this.initializeCredits(accountId, 0, nowMs() + sevenDays);

    const account = this.getAccount(accountId);
    if (!account) {
      throw new Error("failed_to_create_account");
    }
    return account;
  }

  getAccount(accountId: string): AccountRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          account_id,
          display_name,
          owner_user_id,
          status,
          created_at_ms,
          updated_at_ms
        FROM frontdoor_accounts
        WHERE account_id = ?
        LIMIT 1
      `,
      )
      .get(accountId) as
      | {
          account_id: string;
          display_name: string;
          owner_user_id: string;
          status: string;
          created_at_ms: number;
          updated_at_ms: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      accountId: row.account_id,
      displayName: row.display_name,
      ownerUserId: row.owner_user_id,
      status: row.status === "suspended" ? "suspended" : row.status === "closed" ? "closed" : "active",
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    };
  }

  getAccountsForUser(userId: string): AccountRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          a.account_id,
          a.display_name,
          a.owner_user_id,
          a.status,
          a.created_at_ms,
          a.updated_at_ms
        FROM frontdoor_account_memberships m
        JOIN frontdoor_accounts a ON a.account_id = m.account_id
        WHERE m.user_id = ? AND a.status = 'active'
        ORDER BY a.display_name ASC
      `,
      )
      .all(userId) as Array<{
      account_id: string;
      display_name: string;
      owner_user_id: string;
      status: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>;
    return rows.map((row) => ({
      accountId: row.account_id,
      displayName: row.display_name,
      ownerUserId: row.owner_user_id,
      status: row.status === "suspended" ? "suspended" as const : row.status === "closed" ? "closed" as const : "active" as const,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    }));
  }

  listAllAccounts(): AccountRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          account_id,
          display_name,
          owner_user_id,
          status,
          created_at_ms,
          updated_at_ms
        FROM frontdoor_accounts
        ORDER BY display_name ASC
      `,
      )
      .all() as Array<{
      account_id: string;
      display_name: string;
      owner_user_id: string;
      status: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>;
    return rows.map((row) => ({
      accountId: row.account_id,
      displayName: row.display_name,
      ownerUserId: row.owner_user_id,
      status: row.status === "suspended" ? "suspended" as const : row.status === "closed" ? "closed" as const : "active" as const,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    }));
  }

  updateAccount(accountId: string, updates: { displayName?: string; status?: string }): void {
    const updatedAt = nowMs();
    if (updates.displayName !== undefined) {
      this.db
        .prepare("UPDATE frontdoor_accounts SET display_name = ?, updated_at_ms = ? WHERE account_id = ?")
        .run(updates.displayName.trim(), updatedAt, accountId);
    }
    if (updates.status !== undefined) {
      this.db
        .prepare("UPDATE frontdoor_accounts SET status = ?, updated_at_ms = ? WHERE account_id = ?")
        .run(updates.status, updatedAt, accountId);
    }
  }

  // ── Account Membership Methods ────────────────────────────────────

  addAccountMember(accountId: string, userId: string, role: AccountMemberRole, invitedBy?: string): void {
    const joinedAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_account_memberships (
          account_id,
          user_id,
          role,
          invited_by,
          joined_at_ms
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(account_id, user_id) DO UPDATE SET
          role = CASE
            WHEN excluded.role = 'owner' THEN 'owner'
            WHEN frontdoor_account_memberships.role = 'owner' THEN 'owner'
            ELSE excluded.role
          END
      `,
      )
      .run(accountId, userId, role, invitedBy ?? null, joinedAt);
  }

  removeAccountMember(accountId: string, userId: string): void {
    this.db
      .prepare("DELETE FROM frontdoor_account_memberships WHERE account_id = ? AND user_id = ?")
      .run(accountId, userId);
  }

  updateAccountMemberRole(accountId: string, userId: string, role: AccountMemberRole): void {
    this.db
      .prepare(
        "UPDATE frontdoor_account_memberships SET role = ? WHERE account_id = ? AND user_id = ?",
      )
      .run(role, accountId, userId);
  }

  getAccountMembers(accountId: string): AccountMemberView[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          m.account_id,
          m.user_id,
          m.role,
          m.invited_by,
          m.joined_at_ms,
          u.username,
          u.email,
          u.display_name
        FROM frontdoor_account_memberships m
        JOIN frontdoor_users u ON u.user_id = m.user_id
        WHERE m.account_id = ?
        ORDER BY m.role ASC, COALESCE(u.display_name, u.email, u.username, u.user_id) ASC
      `,
      )
      .all(accountId) as Array<{
      account_id: string;
      user_id: string;
      role: string;
      invited_by: string | null;
      joined_at_ms: number;
      username: string | null;
      email: string | null;
      display_name: string | null;
    }>;
    return rows.map((row) => ({
      accountId: row.account_id,
      userId: row.user_id,
      role: (row.role === "owner" || row.role === "admin" || row.role === "member" || row.role === "viewer"
        ? row.role
        : "member") as AccountMemberRole,
      invitedBy: row.invited_by ?? undefined,
      joinedAtMs: row.joined_at_ms,
      username: row.username ?? undefined,
      email: row.email ?? undefined,
      displayName: row.display_name ?? undefined,
    }));
  }

  getAccountMembership(accountId: string, userId: string): AccountMemberRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT account_id, user_id, role, invited_by, joined_at_ms
        FROM frontdoor_account_memberships
        WHERE account_id = ? AND user_id = ?
        LIMIT 1
      `,
      )
      .get(accountId, userId) as
      | {
          account_id: string;
          user_id: string;
          role: string;
          invited_by: string | null;
          joined_at_ms: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      accountId: row.account_id,
      userId: row.user_id,
      role: (row.role === "owner" || row.role === "admin" || row.role === "member" || row.role === "viewer"
        ? row.role
        : "member") as AccountMemberRole,
      invitedBy: row.invited_by ?? undefined,
      joinedAtMs: row.joined_at_ms,
    };
  }

  countAccountMembers(accountId: string): number {
    const row = this.db
      .prepare("SELECT count(*) AS count FROM frontdoor_account_memberships WHERE account_id = ?")
      .get(accountId) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  // ── Server Methods ────────────────────────────────────────────────

  private mapServerRow(row: {
    server_id: string;
    account_id: string;
    tenant_id: string;
    display_name: string;
    generated_name: string;
    status: string;
    plan: string;
    provider: string;
    provider_server_id: string | null;
    private_ip: string | null;
    public_ip: string | null;
    runtime_port: number | null;
    runtime_auth_token: string | null;
    provision_token: string | null;
    created_at_ms: number;
    updated_at_ms: number;
    deleted_at_ms: number | null;
  }): ServerRecord {
    const status = row.status;
    return {
      serverId: row.server_id,
      accountId: row.account_id,
      tenantId: row.tenant_id,
      displayName: row.display_name,
      generatedName: row.generated_name,
      status: (status === "provisioning" || status === "running" || status === "failed" || status === "deprovisioning" || status === "deleted")
        ? status
        : "provisioning",
      plan: row.plan,
      provider: row.provider,
      providerServerId: row.provider_server_id ?? null,
      privateIp: row.private_ip ?? null,
      publicIp: row.public_ip ?? null,
      runtimePort: row.runtime_port ?? 8080,
      runtimeAuthToken: row.runtime_auth_token ?? null,
      provisionToken: row.provision_token ?? null,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      deletedAtMs: row.deleted_at_ms ?? null,
    };
  }

  upsertServer(record: ServerRecord): ServerRecord {
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_servers (
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          account_id = excluded.account_id,
          tenant_id = excluded.tenant_id,
          display_name = excluded.display_name,
          generated_name = excluded.generated_name,
          status = excluded.status,
          plan = excluded.plan,
          provider = excluded.provider,
          provider_server_id = excluded.provider_server_id,
          private_ip = excluded.private_ip,
          public_ip = excluded.public_ip,
          runtime_port = excluded.runtime_port,
          runtime_auth_token = excluded.runtime_auth_token,
          provision_token = excluded.provision_token,
          updated_at_ms = excluded.updated_at_ms,
          deleted_at_ms = excluded.deleted_at_ms
      `,
      )
      .run(
        record.serverId,
        record.accountId,
        record.tenantId,
        record.displayName,
        record.generatedName || record.displayName,
        record.status,
        record.plan || "cax11",
        record.provider || "hetzner",
        record.providerServerId ?? null,
        record.privateIp ?? null,
        record.publicIp ?? null,
        record.runtimePort ?? 8080,
        record.runtimeAuthToken ?? null,
        record.provisionToken ?? null,
        createdAt,
        createdAt,
        record.deletedAtMs ?? null,
      );
    this.ensureServerLimitsDefaults(record.serverId);
    return this.getServer(record.serverId) ?? record;
  }

  createServer(input: {
    serverId?: string;
    accountId: string;
    tenantId: string;
    displayName: string;
    generatedName: string;
    plan?: string;
    provider?: string;
    provisionToken?: string;
    runtimeAuthToken?: string;
  }): ServerRecord {
    const serverId = input.serverId?.trim() || randomUUID();
    if (this.getServer(serverId)) {
      throw new Error("server_already_exists");
    }
    const now = nowMs();
    const plan = input.plan?.trim() || "cax11";
    const provider = input.provider?.trim() || "hetzner";
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_servers (
          server_id,
          account_id,
          tenant_id,
          display_name,
          generated_name,
          status,
          plan,
          provider,
          runtime_port,
          runtime_auth_token,
          provision_token,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, 'provisioning', ?, ?, 8080, ?, ?, ?, ?)
      `,
      )
      .run(
        serverId,
        input.accountId,
        input.tenantId,
        input.displayName.trim() || serverId,
        input.generatedName.trim() || input.displayName.trim() || serverId,
        plan,
        provider,
        input.runtimeAuthToken?.trim() || null,
        input.provisionToken?.trim() || null,
        now,
        now,
      );
    this.ensureServerLimitsDefaults(serverId);
    const created = this.getServer(serverId);
    if (!created) {
      throw new Error("failed_to_create_server");
    }
    return created;
  }

  getServer(serverId: string): ServerRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        FROM frontdoor_servers
        WHERE server_id = ?
        LIMIT 1
      `,
      )
      .get(serverId) as
      | {
          server_id: string;
          account_id: string;
          tenant_id: string;
          display_name: string;
          generated_name: string;
          status: string;
          plan: string;
          provider: string;
          provider_server_id: string | null;
          private_ip: string | null;
          public_ip: string | null;
          runtime_port: number | null;
          runtime_auth_token: string | null;
          provision_token: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          deleted_at_ms: number | null;
        }
      | undefined;
    return row ? this.mapServerRow(row) : null;
  }

  getServersForAccount(accountId: string): ServerRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        FROM frontdoor_servers
        WHERE account_id = ? AND (deleted_at_ms IS NULL AND status != 'deleted')
        ORDER BY display_name ASC
      `,
      )
      .all(accountId) as Array<{
      server_id: string;
      account_id: string;
      tenant_id: string;
      display_name: string;
      generated_name: string;
      status: string;
      plan: string;
      provider: string;
      provider_server_id: string | null;
      private_ip: string | null;
      public_ip: string | null;
      runtime_port: number | null;
      runtime_auth_token: string | null;
      provision_token: string | null;
      created_at_ms: number;
      updated_at_ms: number;
      deleted_at_ms: number | null;
    }>;
    return rows.map((row) => this.mapServerRow(row));
  }

  listAllServers(): ServerRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        FROM frontdoor_servers
        WHERE deleted_at_ms IS NULL AND status != 'deleted'
        ORDER BY display_name ASC
      `,
      )
      .all() as Array<{
      server_id: string;
      account_id: string;
      tenant_id: string;
      display_name: string;
      generated_name: string;
      status: string;
      plan: string;
      provider: string;
      provider_server_id: string | null;
      private_ip: string | null;
      public_ip: string | null;
      runtime_port: number | null;
      runtime_auth_token: string | null;
      provision_token: string | null;
      created_at_ms: number;
      updated_at_ms: number;
      deleted_at_ms: number | null;
    }>;
    return rows.map((row) => this.mapServerRow(row));
  }

  getServersForUser(userId: string): ServerRecord[] {
    const accounts = this.getAccountsForUser(userId);
    const servers: ServerRecord[] = [];
    for (const account of accounts) {
      servers.push(...this.getServersForAccount(account.accountId));
    }
    return servers;
  }

  updateServer(serverId: string, updates: Partial<{
    displayName: string;
    status: ServerStatus;
    providerServerId: string;
    privateIp: string;
    publicIp: string;
    runtimePort: number;
    runtimeAuthToken: string | null;
    provisionToken: string | null;
    deletedAtMs: number;
  }>): void {
    const updatedAt = nowMs();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (updates.displayName !== undefined) {
      fields.push("display_name = ?");
      values.push(updates.displayName.trim());
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.providerServerId !== undefined) {
      fields.push("provider_server_id = ?");
      values.push(updates.providerServerId);
    }
    if (updates.privateIp !== undefined) {
      fields.push("private_ip = ?");
      values.push(updates.privateIp);
    }
    if (updates.publicIp !== undefined) {
      fields.push("public_ip = ?");
      values.push(updates.publicIp);
    }
    if (updates.runtimePort !== undefined) {
      fields.push("runtime_port = ?");
      values.push(updates.runtimePort);
    }
    if (updates.runtimeAuthToken !== undefined) {
      fields.push("runtime_auth_token = ?");
      values.push(updates.runtimeAuthToken);
    }
    if (updates.provisionToken !== undefined) {
      fields.push("provision_token = ?");
      values.push(updates.provisionToken);
    }
    if (updates.deletedAtMs !== undefined) {
      fields.push("deleted_at_ms = ?");
      values.push(updates.deletedAtMs);
    }
    if (fields.length === 0) {
      return;
    }
    fields.push("updated_at_ms = ?");
    values.push(updatedAt);
    values.push(serverId);
    this.db.prepare(`UPDATE frontdoor_servers SET ${fields.join(", ")} WHERE server_id = ?`).run(...values);
  }

  getServerByTenantId(tenantId: string): ServerRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        FROM frontdoor_servers
        WHERE tenant_id = ?
        LIMIT 1
      `,
      )
      .get(tenantId) as
      | {
          server_id: string;
          account_id: string;
          tenant_id: string;
          display_name: string;
          generated_name: string;
          status: string;
          plan: string;
          provider: string;
          provider_server_id: string | null;
          private_ip: string | null;
          public_ip: string | null;
          runtime_port: number | null;
          runtime_auth_token: string | null;
          provision_token: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          deleted_at_ms: number | null;
        }
      | undefined;
    return row ? this.mapServerRow(row) : null;
  }

  getServerByProvisionToken(token: string): ServerRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        FROM frontdoor_servers
        WHERE provision_token = ? AND status = 'provisioning'
        LIMIT 1
      `,
      )
      .get(token) as
      | {
          server_id: string;
          account_id: string;
          tenant_id: string;
          display_name: string;
          generated_name: string;
          status: string;
          plan: string;
          provider: string;
          provider_server_id: string | null;
          private_ip: string | null;
          public_ip: string | null;
          runtime_port: number | null;
          runtime_auth_token: string | null;
          provision_token: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          deleted_at_ms: number | null;
        }
      | undefined;
    return row ? this.mapServerRow(row) : null;
  }

  getRunningServers(): ServerRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        FROM frontdoor_servers
        WHERE status = 'running'
        ORDER BY display_name ASC
      `,
      )
      .all() as Array<{
      server_id: string;
      account_id: string;
      tenant_id: string;
      display_name: string;
      generated_name: string;
      status: string;
      plan: string;
      provider: string;
      provider_server_id: string | null;
      private_ip: string | null;
      public_ip: string | null;
      runtime_port: number | null;
      runtime_auth_token: string | null;
      provision_token: string | null;
      created_at_ms: number;
      updated_at_ms: number;
      deleted_at_ms: number | null;
    }>;
    return rows.map((row) => this.mapServerRow(row));
  }

  getStuckProvisioningServers(timeoutMs: number): ServerRecord[] {
    const cutoff = Date.now() - timeoutMs;
    const rows = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tenant_id, display_name, generated_name,
          status, plan, provider, provider_server_id,
          private_ip, public_ip, runtime_port, runtime_auth_token,
          provision_token, created_at_ms, updated_at_ms, deleted_at_ms
        FROM frontdoor_servers
        WHERE status = 'provisioning' AND created_at_ms < ?
        ORDER BY created_at_ms ASC
      `,
      )
      .all(cutoff) as Array<{
      server_id: string;
      account_id: string;
      tenant_id: string;
      display_name: string;
      generated_name: string;
      status: string;
      plan: string;
      provider: string;
      provider_server_id: string | null;
      private_ip: string | null;
      public_ip: string | null;
      runtime_port: number | null;
      runtime_auth_token: string | null;
      provision_token: string | null;
      created_at_ms: number;
      updated_at_ms: number;
      deleted_at_ms: number | null;
    }>;
    return rows.map((row) => this.mapServerRow(row));
  }

  // ── API Token Methods ─────────────────────────────────────────────

  createApiToken(input: {
    tokenId: string;
    tokenHash: string;
    userId: string;
    accountId: string;
    displayName: string;
    expiresAtMs?: number;
  }): ApiTokenRecord {
    const now = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_api_tokens (
          token_id, token_hash, user_id, account_id, display_name,
          scopes, created_at_ms, expires_at_ms
        ) VALUES (?, ?, ?, ?, ?, '*', ?, ?)
      `,
      )
      .run(
        input.tokenId,
        input.tokenHash,
        input.userId,
        input.accountId,
        input.displayName.trim(),
        now,
        input.expiresAtMs ?? null,
      );
    return {
      tokenId: input.tokenId,
      tokenHash: input.tokenHash,
      userId: input.userId,
      accountId: input.accountId,
      displayName: input.displayName.trim(),
      scopes: "*",
      lastUsedMs: null,
      expiresAtMs: input.expiresAtMs ?? null,
      createdAtMs: now,
      revokedAtMs: null,
    };
  }

  getApiTokenByHash(hash: string): ApiTokenRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          token_id, token_hash, user_id, account_id, display_name,
          scopes, last_used_ms, expires_at_ms, created_at_ms, revoked_at_ms
        FROM frontdoor_api_tokens
        WHERE token_hash = ? AND revoked_at_ms IS NULL
        LIMIT 1
      `,
      )
      .get(hash) as
      | {
          token_id: string;
          token_hash: string;
          user_id: string;
          account_id: string;
          display_name: string;
          scopes: string;
          last_used_ms: number | null;
          expires_at_ms: number | null;
          created_at_ms: number;
          revoked_at_ms: number | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      tokenId: row.token_id,
      tokenHash: row.token_hash,
      userId: row.user_id,
      accountId: row.account_id,
      displayName: row.display_name,
      scopes: row.scopes,
      lastUsedMs: row.last_used_ms ?? null,
      expiresAtMs: row.expires_at_ms ?? null,
      createdAtMs: row.created_at_ms,
      revokedAtMs: row.revoked_at_ms ?? null,
    };
  }

  listApiTokens(userId: string): Omit<ApiTokenRecord, "tokenHash">[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          token_id, user_id, account_id, display_name,
          scopes, last_used_ms, expires_at_ms, created_at_ms, revoked_at_ms
        FROM frontdoor_api_tokens
        WHERE user_id = ?
        ORDER BY created_at_ms DESC
      `,
      )
      .all(userId) as Array<{
      token_id: string;
      user_id: string;
      account_id: string;
      display_name: string;
      scopes: string;
      last_used_ms: number | null;
      expires_at_ms: number | null;
      created_at_ms: number;
      revoked_at_ms: number | null;
    }>;
    return rows.map((row) => ({
      tokenId: row.token_id,
      userId: row.user_id,
      accountId: row.account_id,
      displayName: row.display_name,
      scopes: row.scopes,
      lastUsedMs: row.last_used_ms ?? null,
      expiresAtMs: row.expires_at_ms ?? null,
      createdAtMs: row.created_at_ms,
      revokedAtMs: row.revoked_at_ms ?? null,
    }));
  }

  revokeApiToken(tokenId: string): void {
    this.db
      .prepare(
        `
        UPDATE frontdoor_api_tokens
        SET revoked_at_ms = ?
        WHERE token_id = ? AND revoked_at_ms IS NULL
      `,
      )
      .run(nowMs(), tokenId);
  }

  touchApiToken(tokenId: string): void {
    this.db
      .prepare(
        `
        UPDATE frontdoor_api_tokens
        SET last_used_ms = ?
        WHERE token_id = ?
      `,
      )
      .run(nowMs(), tokenId);
  }

  // ── Server Subscription Methods ───────────────────────────────────

  createServerSubscription(params: {
    serverId: string;
    accountId: string;
    tier?: string;
    status?: string;
    provider?: string;
    customerId?: string;
    subscriptionId?: string;
    periodStartMs?: number;
    periodEndMs?: number;
  }): void {
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_server_subscriptions (
          server_id,
          account_id,
          tier,
          status,
          provider,
          customer_id,
          subscription_id,
          period_start_ms,
          period_end_ms,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          account_id = excluded.account_id,
          tier = excluded.tier,
          status = excluded.status,
          provider = excluded.provider,
          customer_id = excluded.customer_id,
          subscription_id = excluded.subscription_id,
          period_start_ms = excluded.period_start_ms,
          period_end_ms = excluded.period_end_ms,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        params.serverId,
        params.accountId,
        params.tier || "standard",
        params.status || "active",
        params.provider || "none",
        params.customerId ?? null,
        params.subscriptionId ?? null,
        params.periodStartMs ?? startOfUtcMonthMs(createdAt),
        params.periodEndMs ?? endOfUtcMonthMs(createdAt),
        createdAt,
        createdAt,
      );
  }

  getServerSubscription(serverId: string): ServerSubscriptionRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tier, status, provider,
          customer_id, subscription_id,
          period_start_ms, period_end_ms,
          created_at_ms, updated_at_ms
        FROM frontdoor_server_subscriptions
        WHERE server_id = ?
        LIMIT 1
      `,
      )
      .get(serverId) as
      | {
          server_id: string;
          account_id: string;
          tier: string;
          status: string;
          provider: string;
          customer_id: string | null;
          subscription_id: string | null;
          period_start_ms: number | null;
          period_end_ms: number | null;
          created_at_ms: number;
          updated_at_ms: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      serverId: row.server_id,
      accountId: row.account_id,
      tier: row.tier,
      status: row.status,
      provider: row.provider,
      customerId: row.customer_id ?? undefined,
      subscriptionId: row.subscription_id ?? undefined,
      periodStartMs: row.period_start_ms ?? undefined,
      periodEndMs: row.period_end_ms ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    };
  }

  getServerSubscriptionsForAccount(accountId: string): ServerSubscriptionRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          server_id, account_id, tier, status, provider,
          customer_id, subscription_id,
          period_start_ms, period_end_ms,
          created_at_ms, updated_at_ms
        FROM frontdoor_server_subscriptions
        WHERE account_id = ?
        ORDER BY created_at_ms DESC
      `,
      )
      .all(accountId) as Array<{
      server_id: string;
      account_id: string;
      tier: string;
      status: string;
      provider: string;
      customer_id: string | null;
      subscription_id: string | null;
      period_start_ms: number | null;
      period_end_ms: number | null;
      created_at_ms: number;
      updated_at_ms: number;
    }>;
    return rows.map((row) => ({
      serverId: row.server_id,
      accountId: row.account_id,
      tier: row.tier,
      status: row.status,
      provider: row.provider,
      customerId: row.customer_id ?? undefined,
      subscriptionId: row.subscription_id ?? undefined,
      periodStartMs: row.period_start_ms ?? undefined,
      periodEndMs: row.period_end_ms ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    }));
  }

  // ── App Subscription Methods ──────────────────────────────────────

  createAppSubscription(params: {
    accountId: string;
    appId: string;
    planId: string;
    status?: string;
    provider?: string;
    customerId?: string;
    subscriptionId?: string;
    periodStartMs?: number;
    periodEndMs?: number;
  }): void {
    const createdAt = nowMs();
    const appId = normalizeAppId(params.appId);
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_app_subscriptions (
          account_id,
          app_id,
          plan_id,
          status,
          provider,
          customer_id,
          subscription_id,
          period_start_ms,
          period_end_ms,
          cancelled_at_ms,
          cancel_at_ms,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, app_id) DO UPDATE SET
          plan_id = excluded.plan_id,
          status = excluded.status,
          provider = excluded.provider,
          customer_id = excluded.customer_id,
          subscription_id = excluded.subscription_id,
          period_start_ms = excluded.period_start_ms,
          period_end_ms = excluded.period_end_ms,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        params.accountId,
        appId,
        params.planId,
        params.status || "active",
        params.provider || "none",
        params.customerId ?? null,
        params.subscriptionId ?? null,
        params.periodStartMs ?? null,
        params.periodEndMs ?? null,
        null,
        null,
        createdAt,
        createdAt,
      );
  }

  getAppSubscription(accountId: string, appId: string): AppSubscriptionRecord | null {
    const normalizedAppId = normalizeAppId(appId);
    const row = this.db
      .prepare(
        `
        SELECT
          account_id, app_id, plan_id, status, provider,
          customer_id, subscription_id,
          period_start_ms, period_end_ms,
          cancelled_at_ms, cancel_at_ms,
          created_at_ms, updated_at_ms
        FROM frontdoor_app_subscriptions
        WHERE account_id = ? AND app_id = ?
        LIMIT 1
      `,
      )
      .get(accountId, normalizedAppId) as
      | {
          account_id: string;
          app_id: string;
          plan_id: string;
          status: string;
          provider: string;
          customer_id: string | null;
          subscription_id: string | null;
          period_start_ms: number | null;
          period_end_ms: number | null;
          cancelled_at_ms: number | null;
          cancel_at_ms: number | null;
          created_at_ms: number;
          updated_at_ms: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      accountId: row.account_id,
      appId: row.app_id,
      planId: row.plan_id,
      status: row.status,
      provider: row.provider,
      customerId: row.customer_id ?? undefined,
      subscriptionId: row.subscription_id ?? undefined,
      periodStartMs: row.period_start_ms ?? undefined,
      periodEndMs: row.period_end_ms ?? undefined,
      cancelledAtMs: row.cancelled_at_ms ?? undefined,
      cancelAtMs: row.cancel_at_ms ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    };
  }

  getAppSubscriptionsForAccount(accountId: string): AppSubscriptionRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          account_id, app_id, plan_id, status, provider,
          customer_id, subscription_id,
          period_start_ms, period_end_ms,
          cancelled_at_ms, cancel_at_ms,
          created_at_ms, updated_at_ms
        FROM frontdoor_app_subscriptions
        WHERE account_id = ?
        ORDER BY app_id ASC
      `,
      )
      .all(accountId) as Array<{
      account_id: string;
      app_id: string;
      plan_id: string;
      status: string;
      provider: string;
      customer_id: string | null;
      subscription_id: string | null;
      period_start_ms: number | null;
      period_end_ms: number | null;
      cancelled_at_ms: number | null;
      cancel_at_ms: number | null;
      created_at_ms: number;
      updated_at_ms: number;
    }>;
    return rows.map((row) => ({
      accountId: row.account_id,
      appId: row.app_id,
      planId: row.plan_id,
      status: row.status,
      provider: row.provider,
      customerId: row.customer_id ?? undefined,
      subscriptionId: row.subscription_id ?? undefined,
      periodStartMs: row.period_start_ms ?? undefined,
      periodEndMs: row.period_end_ms ?? undefined,
      cancelledAtMs: row.cancelled_at_ms ?? undefined,
      cancelAtMs: row.cancel_at_ms ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    }));
  }

  updateAppSubscription(accountId: string, appId: string, updates: {
    planId?: string;
    status?: string;
    provider?: string;
    customerId?: string;
    subscriptionId?: string;
    periodStartMs?: number;
    periodEndMs?: number;
    cancelledAtMs?: number;
    cancelAtMs?: number;
  }): void {
    const updatedAt = nowMs();
    const normalizedAppId = normalizeAppId(appId);
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (updates.planId !== undefined) {
      fields.push("plan_id = ?");
      values.push(updates.planId);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.provider !== undefined) {
      fields.push("provider = ?");
      values.push(updates.provider);
    }
    if (updates.customerId !== undefined) {
      fields.push("customer_id = ?");
      values.push(updates.customerId);
    }
    if (updates.subscriptionId !== undefined) {
      fields.push("subscription_id = ?");
      values.push(updates.subscriptionId);
    }
    if (updates.periodStartMs !== undefined) {
      fields.push("period_start_ms = ?");
      values.push(updates.periodStartMs);
    }
    if (updates.periodEndMs !== undefined) {
      fields.push("period_end_ms = ?");
      values.push(updates.periodEndMs);
    }
    if (updates.cancelledAtMs !== undefined) {
      fields.push("cancelled_at_ms = ?");
      values.push(updates.cancelledAtMs);
    }
    if (updates.cancelAtMs !== undefined) {
      fields.push("cancel_at_ms = ?");
      values.push(updates.cancelAtMs);
    }
    if (fields.length === 0) {
      return;
    }
    fields.push("updated_at_ms = ?");
    values.push(updatedAt);
    values.push(accountId);
    values.push(normalizedAppId);
    this.db
      .prepare(
        `UPDATE frontdoor_app_subscriptions SET ${fields.join(", ")} WHERE account_id = ? AND app_id = ?`,
      )
      .run(...values);
  }

  // ── Account Entitlement Methods ───────────────────────────────────

  setAccountEntitlement(params: {
    accountId: string;
    appId: string;
    entitlementKey: string;
    entitlementValue: string;
    source?: "plan" | "override" | "trial" | "comp";
    expiresAtMs?: number;
  }): void {
    const createdAt = nowMs();
    const appId = normalizeAppId(params.appId);
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_account_entitlements (
          account_id,
          app_id,
          entitlement_key,
          entitlement_value,
          source,
          expires_at_ms,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, app_id, entitlement_key) DO UPDATE SET
          entitlement_value = excluded.entitlement_value,
          source = excluded.source,
          expires_at_ms = excluded.expires_at_ms,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        params.accountId,
        appId,
        params.entitlementKey,
        params.entitlementValue,
        params.source || "plan",
        params.expiresAtMs ?? null,
        createdAt,
        createdAt,
      );
  }

  getAccountEntitlements(accountId: string, appId: string): Record<string, string> {
    const normalizedAppId = normalizeAppId(appId);
    const now = nowMs();
    const rows = this.db
      .prepare(
        `
        SELECT
          entitlement_key,
          entitlement_value,
          source
        FROM frontdoor_account_entitlements
        WHERE account_id = ? AND app_id = ?
          AND (expires_at_ms IS NULL OR expires_at_ms > ?)
        ORDER BY entitlement_key ASC
      `,
      )
      .all(accountId, normalizedAppId, now) as Array<{
      entitlement_key: string;
      entitlement_value: string;
      source: string;
    }>;
    const entitlements: Record<string, string> = {};
    for (const row of rows) {
      entitlements[row.entitlement_key] = row.entitlement_value;
    }
    return entitlements;
  }

  listAccountEntitlements(accountId: string, appId?: string): AccountEntitlementRecord[] {
    const now = nowMs();
    const query = appId
      ? `
        SELECT
          account_id, app_id, entitlement_key, entitlement_value, source,
          expires_at_ms, created_at_ms, updated_at_ms
        FROM frontdoor_account_entitlements
        WHERE account_id = ? AND app_id = ?
          AND (expires_at_ms IS NULL OR expires_at_ms > ?)
        ORDER BY entitlement_key ASC
      `
      : `
        SELECT
          account_id, app_id, entitlement_key, entitlement_value, source,
          expires_at_ms, created_at_ms, updated_at_ms
        FROM frontdoor_account_entitlements
        WHERE account_id = ?
          AND (expires_at_ms IS NULL OR expires_at_ms > ?)
        ORDER BY app_id ASC, entitlement_key ASC
      `;
    const args = appId ? [accountId, normalizeAppId(appId), now] : [accountId, now];
    const rows = this.db.prepare(query).all(...args) as Array<{
      account_id: string;
      app_id: string;
      entitlement_key: string;
      entitlement_value: string;
      source: string;
      expires_at_ms: number | null;
      created_at_ms: number;
      updated_at_ms: number;
    }>;
    return rows.map((row) => ({
      accountId: row.account_id,
      appId: row.app_id,
      entitlementKey: row.entitlement_key,
      entitlementValue: row.entitlement_value,
      source: row.source as "plan" | "override" | "trial" | "comp",
      expiresAtMs: row.expires_at_ms ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    }));
  }

  syncEntitlementsFromPlan(accountId: string, appId: string, planId: string): void {
    const plan = this.getProductPlan(planId);
    if (!plan?.limitsJson) {
      return;
    }
    let limits: Record<string, unknown> = {};
    try {
      limits = JSON.parse(plan.limitsJson) as Record<string, unknown>;
    } catch {
      return;
    }
    for (const [key, value] of Object.entries(limits)) {
      if (key && value !== undefined && value !== null) {
        this.setAccountEntitlement({
          accountId,
          appId,
          entitlementKey: key,
          entitlementValue: String(value),
          source: "plan",
        });
      }
    }
  }

  resolveAccountEntitlements(accountId: string, appId: string): ResolvedEntitlements | null {
    const normalizedAppId = normalizeAppId(appId);
    const sub = this.getAppSubscription(accountId, normalizedAppId);
    if (!sub) {
      return null;
    }
    const planId = sub.planId;

    // Start with plan defaults from the plan's limits_json
    const entitlements: Record<string, string> = {};
    const plan = this.getProductPlan(planId);
    if (plan?.limitsJson) {
      try {
        const planLimits = JSON.parse(plan.limitsJson) as Record<string, unknown>;
        for (const [key, value] of Object.entries(planLimits)) {
          if (key && value !== undefined && value !== null) {
            entitlements[key] = String(value);
          }
        }
      } catch {
        // Ignore malformed JSON.
      }
    }

    // Layer on stored entitlements (overrides, trials, comps take precedence)
    const stored = this.getAccountEntitlements(accountId, normalizedAppId);
    for (const [key, value] of Object.entries(stored)) {
      entitlements[key] = value;
    }

    // Usage placeholder
    const usage: Record<string, string> = {};

    return {
      appId: normalizedAppId,
      planId,
      entitlements,
      usage,
    };
  }

  // ── Server App Install Methods ────────────────────────────────────

  upsertServerAppInstall(params: {
    serverId: string;
    appId: string;
    status: ServerAppInstallStatus;
    version?: string;
    entryPath?: string;
    lastError?: string;
    source?: "onboarding" | "manual" | "admin" | "system" | "purchase" | "inferred" | "auto_provision" | "api";
  }): void {
    const serverId = params.serverId.trim();
    const appId = normalizeAppId(params.appId);
    if (!serverId || !appId) {
      return;
    }
    const createdAt = nowMs();
    const installedAtMs = params.status === "installed" ? createdAt : null;
    const source = params.source ?? "manual";
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_server_app_installs (
          server_id,
          app_id,
          status,
          version,
          entry_path,
          last_error,
          installed_at_ms,
          source,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id, app_id) DO UPDATE SET
          status = excluded.status,
          version = COALESCE(excluded.version, frontdoor_server_app_installs.version),
          entry_path = excluded.entry_path,
          last_error = excluded.last_error,
          installed_at_ms = COALESCE(excluded.installed_at_ms, frontdoor_server_app_installs.installed_at_ms),
          source = excluded.source,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        serverId,
        appId,
        params.status,
        params.version?.trim() || null,
        params.entryPath?.trim() || null,
        params.lastError?.trim() || null,
        installedAtMs,
        source,
        createdAt,
        createdAt,
      );
  }

  setServerAppInstallStatus(
    serverId: string,
    appId: string,
    status: ServerAppInstallStatus,
    extra?: { version?: string; entryPath?: string; lastError?: string },
  ): void {
    this.upsertServerAppInstall({
      serverId,
      appId,
      status,
      version: extra?.version,
      entryPath: extra?.entryPath,
      lastError: extra?.lastError,
    });
  }

  getServerAppInstall(serverId: string, appId: string): ServerAppInstallRecord | null {
    const normalizedServerId = serverId.trim();
    const normalizedAppId = normalizeAppId(appId);
    if (!normalizedServerId || !normalizedAppId) {
      return null;
    }
    const row = this.db
      .prepare(
        `
        SELECT
          server_id, app_id, status, version, entry_path,
          last_error, installed_at_ms, source,
          created_at_ms, updated_at_ms
        FROM frontdoor_server_app_installs
        WHERE server_id = ? AND app_id = ?
        LIMIT 1
      `,
      )
      .get(normalizedServerId, normalizedAppId) as
      | {
          server_id: string;
          app_id: string;
          status: string;
          version: string | null;
          entry_path: string | null;
          last_error: string | null;
          installed_at_ms: number | null;
          source: string;
          created_at_ms: number;
          updated_at_ms: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return this.mapServerAppInstallRow(row);
  }

  getServerAppInstalls(serverId: string): ServerAppInstallRecord[] {
    const normalizedServerId = serverId.trim();
    if (!normalizedServerId) {
      return [];
    }
    const rows = this.db
      .prepare(
        `
        SELECT
          server_id, app_id, status, version, entry_path,
          last_error, installed_at_ms, source,
          created_at_ms, updated_at_ms
        FROM frontdoor_server_app_installs
        WHERE server_id = ?
        ORDER BY app_id ASC
      `,
      )
      .all(normalizedServerId) as Array<{
      server_id: string;
      app_id: string;
      status: string;
      version: string | null;
      entry_path: string | null;
      last_error: string | null;
      installed_at_ms: number | null;
      source: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>;
    return rows.map((row) => this.mapServerAppInstallRow(row));
  }

  getServerEffectiveAppInstalls(serverId: string): ServerAppInstallRecord[] {
    const server = this.getServer(serverId);
    if (!server) {
      return [];
    }
    const byApp = new Map<string, ServerAppInstallRecord>();
    for (const install of this.getServerAppInstalls(serverId)) {
      byApp.set(install.appId, install);
    }
    // Control app is always implicitly installed
    if (!byApp.has("control")) {
      const now = nowMs();
      byApp.set("control", {
        serverId,
        appId: "control",
        status: "installed",
        entryPath: "/app/control/chat",
        source: "system",
        createdAtMs: now,
        updatedAtMs: now,
        installedAtMs: now,
      });
    }
    return [...byApp.values()].sort((a, b) => a.appId.localeCompare(b.appId));
  }

  private mapServerAppInstallRow(row: {
    server_id: string;
    app_id: string;
    status: string;
    version: string | null;
    entry_path: string | null;
    last_error: string | null;
    installed_at_ms: number | null;
    source: string;
    created_at_ms: number;
    updated_at_ms: number;
  }): ServerAppInstallRecord {
    const status = row.status;
    const source = row.source;
    return {
      serverId: row.server_id,
      appId: row.app_id,
      status:
        status === "installed" ||
        status === "installing" ||
        status === "failed" ||
        status === "uninstalling" ||
        status === "blocked_no_entitlement"
          ? status
          : "not_installed",
      version: row.version ?? undefined,
      entryPath: row.entry_path ?? undefined,
      lastError: row.last_error ?? undefined,
      installedAtMs: row.installed_at_ms ?? undefined,
      source:
        source === "onboarding" ||
        source === "admin" ||
        source === "system" ||
        source === "purchase" ||
        source === "inferred"
          ? source
          : "manual",
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
    };
  }

  // ── Server Limits Methods ─────────────────────────────────────────

  private ensureServerLimitsDefaults(serverId: string): void {
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_server_limits (
          server_id,
          max_members,
          max_monthly_tokens,
          max_adapters,
          max_concurrent_sessions,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO NOTHING
      `,
      )
      .run(serverId, 10, 1_000_000, 20, 16, createdAt, createdAt);
  }

  getServerLimitsSummary(serverId: string): ServerLimitsSummary {
    this.ensureServerLimitsDefaults(serverId);
    const row = this.db
      .prepare(
        `
        SELECT
          server_id,
          max_members,
          max_monthly_tokens,
          max_adapters,
          max_concurrent_sessions
        FROM frontdoor_server_limits
        WHERE server_id = ?
        LIMIT 1
      `,
      )
      .get(serverId) as
      | {
          server_id: string;
          max_members: number;
          max_monthly_tokens: number;
          max_adapters: number;
          max_concurrent_sessions: number;
        }
      | undefined;
    if (!row) {
      return {
        serverId,
        maxMembers: 10,
        maxMonthlyTokens: 1_000_000,
        maxAdapters: 20,
        maxConcurrentSessions: 16,
      };
    }
    return {
      serverId: row.server_id,
      maxMembers: row.max_members,
      maxMonthlyTokens: row.max_monthly_tokens,
      maxAdapters: row.max_adapters,
      maxConcurrentSessions: row.max_concurrent_sessions,
    };
  }

  // ── Server Usage Methods ──────────────────────────────────────────

  upsertServerUsageDaily(params: {
    serverId: string;
    dateUtc?: string;
    requestsTotal: number;
    tokensIn: number;
    tokensOut: number;
    activeMembers: number;
  }): void {
    const dateUtc = params.dateUtc?.trim() || toUtcDateKey(nowMs());
    const updatedAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_server_usage_daily (
          server_id,
          date_utc,
          requests_total,
          tokens_in,
          tokens_out,
          active_members,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id, date_utc) DO UPDATE SET
          requests_total = excluded.requests_total,
          tokens_in = excluded.tokens_in,
          tokens_out = excluded.tokens_out,
          active_members = excluded.active_members,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        params.serverId,
        dateUtc,
        Math.max(0, Math.floor(params.requestsTotal)),
        Math.max(0, Math.floor(params.tokensIn)),
        Math.max(0, Math.floor(params.tokensOut)),
        Math.max(0, Math.floor(params.activeMembers)),
        updatedAt,
      );
  }

  getServerUsageSummary(params: {
    serverId: string;
    windowDays?: number;
  }): ServerUsageSummary {
    const windowDays = Math.max(1, Math.floor(params.windowDays ?? 30));
    const sinceKey = toUtcDateKey(nowMs() - (windowDays - 1) * 24 * 60 * 60 * 1000);
    const row = this.db
      .prepare(
        `
        SELECT
          COALESCE(sum(requests_total), 0) AS requests_total,
          COALESCE(sum(tokens_in), 0) AS tokens_in,
          COALESCE(sum(tokens_out), 0) AS tokens_out,
          COALESCE(max(active_members), 0) AS active_members,
          COALESCE(count(*), 0) AS days_with_data
        FROM frontdoor_server_usage_daily
        WHERE server_id = ? AND date_utc >= ?
      `,
      )
      .get(params.serverId, sinceKey) as
      | {
          requests_total: number;
          tokens_in: number;
          tokens_out: number;
          active_members: number;
          days_with_data: number;
        }
      | undefined;
    return {
      serverId: params.serverId,
      windowDays,
      requestsTotal: row?.requests_total ?? 0,
      tokensIn: row?.tokens_in ?? 0,
      tokensOut: row?.tokens_out ?? 0,
      activeMembers: row?.active_members ?? 0,
      daysWithData: row?.days_with_data ?? 0,
    };
  }

  // ── Billing Event Methods ─────────────────────────────────────────

  recordBillingEvent(params: {
    provider: string;
    eventId: string;
    accountId?: string;
    eventType: string;
    payloadJson: string;
    status: string;
    errorText?: string;
  }): boolean {
    const receivedAt = nowMs();
    const result = this.db
      .prepare(
        `
        INSERT INTO frontdoor_billing_events (
          provider,
          event_id,
          account_id,
          event_type,
          payload_json,
          status,
          error_text,
          received_at_ms,
          processed_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, event_id) DO NOTHING
      `,
      )
      .run(
        params.provider.trim(),
        params.eventId.trim(),
        params.accountId?.trim() || null,
        params.eventType.trim() || "unknown",
        params.payloadJson,
        params.status.trim() || "received",
        params.errorText?.trim() || null,
        receivedAt,
        null,
      );
    return (result.changes ?? 0) > 0;
  }

  markBillingEventProcessed(params: {
    provider: string;
    eventId: string;
    status: string;
    errorText?: string;
  }): void {
    this.db
      .prepare(
        `
        UPDATE frontdoor_billing_events
        SET status = ?, error_text = ?, processed_at_ms = ?
        WHERE provider = ? AND event_id = ?
      `,
      )
      .run(
        params.status.trim() || "processed",
        params.errorText?.trim() || null,
        nowMs(),
        params.provider.trim(),
        params.eventId.trim(),
      );
  }

  // ── Account Invoice Methods ───────────────────────────────────────

  upsertAccountInvoice(params: {
    accountId: string;
    invoiceId: string;
    provider: string;
    status: string;
    amountDue: number;
    currency: string;
    hostedInvoiceUrl?: string;
    periodStartMs?: number;
    periodEndMs?: number;
    createdAtMs?: number;
    paidAtMs?: number;
  }): void {
    const updatedAt = nowMs();
    const createdAtMs =
      typeof params.createdAtMs === "number" && Number.isFinite(params.createdAtMs)
        ? Math.max(0, Math.floor(params.createdAtMs))
        : updatedAt;
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_account_invoices (
          account_id,
          invoice_id,
          provider,
          status,
          amount_due,
          currency,
          hosted_invoice_url,
          period_start_ms,
          period_end_ms,
          created_at_ms,
          paid_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, invoice_id) DO UPDATE SET
          provider = excluded.provider,
          status = excluded.status,
          amount_due = excluded.amount_due,
          currency = excluded.currency,
          hosted_invoice_url = excluded.hosted_invoice_url,
          period_start_ms = excluded.period_start_ms,
          period_end_ms = excluded.period_end_ms,
          paid_at_ms = excluded.paid_at_ms,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        params.accountId,
        params.invoiceId,
        params.provider,
        params.status,
        Math.max(0, Math.floor(params.amountDue || 0)),
        params.currency?.trim().toLowerCase() || "usd",
        params.hostedInvoiceUrl?.trim() || null,
        typeof params.periodStartMs === "number" ? Math.max(0, Math.floor(params.periodStartMs)) : null,
        typeof params.periodEndMs === "number" ? Math.max(0, Math.floor(params.periodEndMs)) : null,
        createdAtMs,
        typeof params.paidAtMs === "number" ? Math.max(0, Math.floor(params.paidAtMs)) : null,
        updatedAt,
      );
  }

  listAccountInvoices(params: {
    accountId: string;
    limit?: number;
  }): AccountInvoiceSummary[] {
    const limit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 50)));
    const rows = this.db
      .prepare(
        `
        SELECT
          account_id,
          invoice_id,
          provider,
          status,
          amount_due,
          currency,
          hosted_invoice_url,
          period_start_ms,
          period_end_ms,
          created_at_ms,
          paid_at_ms
        FROM frontdoor_account_invoices
        WHERE account_id = ?
        ORDER BY created_at_ms DESC
        LIMIT ?
      `,
      )
      .all(params.accountId, limit) as Array<{
      account_id: string;
      invoice_id: string;
      provider: string;
      status: string;
      amount_due: number;
      currency: string;
      hosted_invoice_url: string | null;
      period_start_ms: number | null;
      period_end_ms: number | null;
      created_at_ms: number;
      paid_at_ms: number | null;
    }>;
    return rows.map((row) => ({
      accountId: row.account_id,
      invoiceId: row.invoice_id,
      provider: row.provider,
      status: row.status,
      amountDue: row.amount_due,
      currency: row.currency,
      hostedInvoiceUrl: row.hosted_invoice_url ?? undefined,
      periodStartMs: row.period_start_ms ?? undefined,
      periodEndMs: row.period_end_ms ?? undefined,
      createdAtMs: row.created_at_ms,
      paidAtMs: row.paid_at_ms ?? undefined,
    }));
  }

  // ── Invite Methods (now account-level) ────────────────────────────

  createInvite(params: {
    accountId: string;
    createdByUserId: string;
    role: string;
    scopes: string[];
    expiresInSeconds: number;
  }): InviteView & { inviteToken: string } {
    const account = this.getAccount(params.accountId);
    if (!account || account.status !== "active") {
      throw new Error("account_not_found");
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
          account_id,
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
        account.accountId,
        creator.userId,
        params.role.trim() || "member",
        JSON.stringify(scopes),
        tokenHash(secret),
        expiresAtMs,
        createdAt,
      );
    return {
      inviteId,
      accountId: account.accountId,
      createdByUserId: creator.userId,
      role: params.role.trim() || "member",
      scopes,
      expiresAtMs,
      createdAtMs: createdAt,
      inviteToken,
    };
  }

  listInvites(accountId: string): InviteView[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          invite_id,
          account_id,
          created_by_user_id,
          role,
          scopes_json,
          expires_at_ms,
          created_at_ms,
          redeemed_by_user_id,
          redeemed_at_ms,
          revoked_at_ms
        FROM frontdoor_invites
        WHERE account_id = ?
        ORDER BY created_at_ms DESC
      `,
      )
      .all(accountId) as Array<{
      invite_id: string;
      account_id: string;
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
      accountId: row.account_id,
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
    accountId: string;
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
          account_id,
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
          account_id: string;
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

    // Check member limit
    const existingMembership = this.getAccountMembership(row.account_id, params.userId);
    if (!existingMembership) {
      // Could check entitlement-based member limits here
      const memberCount = this.countAccountMembers(row.account_id);
      // Hard limit check could be added: resolveAccountEntitlements for members.max_count
    }

    // Add to account with the role from the invite
    const role = (row.role === "owner" || row.role === "admin" || row.role === "member" || row.role === "viewer"
      ? row.role
      : "member") as AccountMemberRole;
    this.addAccountMember(
      row.account_id,
      params.userId,
      role,
      row.created_by_user_id,
    );

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
      accountId: row.account_id,
      invite: {
        inviteId: row.invite_id,
        accountId: row.account_id,
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

  // ── OIDC User Resolution ──────────────────────────────────────────

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
    // Auto-create an account for the new user if they don't have one
    const existingAccounts = this.getAccountsForUser(user.userId);
    if (existingAccounts.length === 0) {
      const accountName = params.displayName || params.email || user.userId;
      this.createAccount(accountName, user.userId);
    }
    return this.getUserById(user.userId) ?? user;
  }

  // ── Principal Construction ────────────────────────────────────────

  toPrincipal(params: {
    user: FrontdoorUserRecord;
    server: ServerRecord | null;
    accountId?: string;
    amr: string[];
  }): Principal {
    // Derive roles/scopes from account membership if available
    let roles: string[] = [];
    let scopes: string[] = [];
    if (params.accountId) {
      const membership = this.getAccountMembership(params.accountId, params.user.userId);
      if (membership) {
        roles = [membership.role];
        // Grant scopes based on role
        if (membership.role === "owner" || membership.role === "admin") {
          scopes = ["*"];
        } else if (membership.role === "member") {
          scopes = ["chat.send", "chat.history", "apps.use"];
        } else {
          scopes = ["chat.send"];
        }
      }
    }
    return {
      userId: params.user.userId,
      tenantId: params.server?.serverId ?? "",
      entityId: params.server
        ? `entity:${params.server.serverId}:${params.user.userId}`
        : `entity:user:${params.user.userId}`,
      username: params.user.username,
      displayName: params.user.displayName,
      email: params.user.email,
      roles,
      scopes,
      amr: [...params.amr],
      accountId: params.accountId,
    };
  }

  // ── Product Registry ──────────────────────────────────────────────

  upsertProduct(record: ProductRecord): ProductRecord {
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_products (
          product_id,
          display_name,
          tagline,
          accent_color,
          logo_svg,
          icon_svg,
          manifest_version,
          homepage_url,
          onboarding_origin,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(product_id) DO UPDATE SET
          display_name = excluded.display_name,
          tagline = excluded.tagline,
          accent_color = excluded.accent_color,
          logo_svg = excluded.logo_svg,
          icon_svg = excluded.icon_svg,
          manifest_version = excluded.manifest_version,
          homepage_url = excluded.homepage_url,
          onboarding_origin = excluded.onboarding_origin,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        record.productId,
        record.displayName,
        record.tagline ?? null,
        record.accentColor ?? null,
        record.logoSvg ?? null,
        record.iconSvg ?? null,
        record.manifestVersion ?? null,
        record.homepageUrl ?? null,
        record.onboardingOrigin ?? null,
        createdAt,
        createdAt,
      );
    return this.getProduct(record.productId) ?? record;
  }

  getProduct(productId: string): ProductRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          product_id,
          display_name,
          tagline,
          accent_color,
          logo_svg,
          icon_svg,
          manifest_version,
          homepage_url,
          onboarding_origin
        FROM frontdoor_products
        WHERE product_id = ?
        LIMIT 1
      `,
      )
      .get(productId) as
      | {
          product_id: string;
          display_name: string;
          tagline: string | null;
          accent_color: string | null;
          logo_svg: string | null;
          icon_svg: string | null;
          manifest_version: string | null;
          homepage_url: string | null;
          onboarding_origin: string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      productId: row.product_id,
      displayName: row.display_name,
      tagline: row.tagline ?? undefined,
      accentColor: row.accent_color ?? undefined,
      logoSvg: row.logo_svg ?? undefined,
      iconSvg: row.icon_svg ?? undefined,
      manifestVersion: row.manifest_version ?? undefined,
      homepageUrl: row.homepage_url ?? undefined,
      onboardingOrigin: row.onboarding_origin ?? undefined,
    };
  }

  listProducts(): ProductRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          product_id,
          display_name,
          tagline,
          accent_color,
          logo_svg,
          icon_svg,
          manifest_version,
          homepage_url,
          onboarding_origin
        FROM frontdoor_products
        ORDER BY display_name ASC
      `,
      )
      .all() as Array<{
      product_id: string;
      display_name: string;
      tagline: string | null;
      accent_color: string | null;
      logo_svg: string | null;
      icon_svg: string | null;
      manifest_version: string | null;
      homepage_url: string | null;
      onboarding_origin: string | null;
    }>;
    return rows.map((row) => ({
      productId: row.product_id,
      displayName: row.display_name,
      tagline: row.tagline ?? undefined,
      accentColor: row.accent_color ?? undefined,
      logoSvg: row.logo_svg ?? undefined,
      iconSvg: row.icon_svg ?? undefined,
      manifestVersion: row.manifest_version ?? undefined,
      homepageUrl: row.homepage_url ?? undefined,
      onboardingOrigin: row.onboarding_origin ?? undefined,
    }));
  }

  // ── Product Plans ─────────────────────────────────────────────────

  upsertProductPlan(record: ProductPlanRecord): ProductPlanRecord {
    const createdAt = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO frontdoor_product_plans (
          plan_id,
          product_id,
          display_name,
          description,
          price_monthly,
          price_yearly,
          stripe_price_id_monthly,
          stripe_price_id_yearly,
          features_json,
          limits_json,
          is_default,
          sort_order,
          status,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(plan_id) DO UPDATE SET
          product_id = excluded.product_id,
          display_name = excluded.display_name,
          description = excluded.description,
          price_monthly = excluded.price_monthly,
          price_yearly = excluded.price_yearly,
          stripe_price_id_monthly = COALESCE(frontdoor_product_plans.stripe_price_id_monthly, excluded.stripe_price_id_monthly),
          stripe_price_id_yearly = COALESCE(frontdoor_product_plans.stripe_price_id_yearly, excluded.stripe_price_id_yearly),
          features_json = excluded.features_json,
          limits_json = excluded.limits_json,
          is_default = excluded.is_default,
          sort_order = excluded.sort_order,
          status = 'active',
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        record.planId,
        record.productId,
        record.displayName,
        record.description ?? null,
        record.priceMonthly,
        record.priceYearly ?? null,
        record.stripePriceIdMonthly ?? null,
        record.stripePriceIdYearly ?? null,
        record.featuresJson ?? null,
        record.limitsJson ?? null,
        record.isDefault ? 1 : 0,
        record.sortOrder,
        createdAt,
        createdAt,
      );
    return this.getProductPlan(record.planId) ?? record;
  }

  getProductPlan(planId: string): ProductPlanRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          plan_id, product_id, display_name, description,
          price_monthly, price_yearly,
          stripe_price_id_monthly, stripe_price_id_yearly,
          features_json, limits_json,
          is_default, sort_order, status
        FROM frontdoor_product_plans
        WHERE plan_id = ?
        LIMIT 1
      `,
      )
      .get(planId) as
      | {
          plan_id: string;
          product_id: string;
          display_name: string;
          description: string | null;
          price_monthly: number;
          price_yearly: number | null;
          stripe_price_id_monthly: string | null;
          stripe_price_id_yearly: string | null;
          features_json: string | null;
          limits_json: string | null;
          is_default: number;
          sort_order: number;
          status: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      planId: row.plan_id,
      productId: row.product_id,
      displayName: row.display_name,
      description: row.description ?? undefined,
      priceMonthly: row.price_monthly,
      priceYearly: row.price_yearly ?? undefined,
      stripePriceIdMonthly: row.stripe_price_id_monthly ?? undefined,
      stripePriceIdYearly: row.stripe_price_id_yearly ?? undefined,
      featuresJson: row.features_json ?? undefined,
      limitsJson: row.limits_json ?? undefined,
      isDefault: row.is_default === 1,
      sortOrder: row.sort_order,
      status: (row.status === "archived" ? "archived" : "active") as "active" | "archived",
    };
  }

  listProductPlans(productId: string): ProductPlanRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          plan_id, product_id, display_name, description,
          price_monthly, price_yearly,
          stripe_price_id_monthly, stripe_price_id_yearly,
          features_json, limits_json,
          is_default, sort_order, status
        FROM frontdoor_product_plans
        WHERE product_id = ?
        ORDER BY sort_order ASC
      `,
      )
      .all(productId) as Array<{
      plan_id: string;
      product_id: string;
      display_name: string;
      description: string | null;
      price_monthly: number;
      price_yearly: number | null;
      stripe_price_id_monthly: string | null;
      stripe_price_id_yearly: string | null;
      features_json: string | null;
      limits_json: string | null;
      is_default: number;
      sort_order: number;
      status: string;
    }>;
    return rows.map((row) => ({
      planId: row.plan_id,
      productId: row.product_id,
      displayName: row.display_name,
      description: row.description ?? undefined,
      priceMonthly: row.price_monthly,
      priceYearly: row.price_yearly ?? undefined,
      stripePriceIdMonthly: row.stripe_price_id_monthly ?? undefined,
      stripePriceIdYearly: row.stripe_price_id_yearly ?? undefined,
      featuresJson: row.features_json ?? undefined,
      limitsJson: row.limits_json ?? undefined,
      isDefault: row.is_default === 1,
      sortOrder: row.sort_order,
      status: (row.status === "archived" ? "archived" : "active") as "active" | "archived",
    }));
  }

  getDefaultPlanForProduct(productId: string): ProductPlanRecord | null {
    const plans = this.listProductPlans(productId);
    const defaultPlan = plans.find((p) => p.isDefault);
    return defaultPlan ?? plans[0] ?? null;
  }

  getProductPlanIds(productId: string): string[] {
    const rows = this.db
      .prepare(
        `
        SELECT plan_id
        FROM frontdoor_product_plans
        WHERE product_id = ?
      `,
      )
      .all(productId) as Array<{ plan_id: string }>;
    return rows.map((row) => row.plan_id);
  }

  archiveProductPlan(planId: string): void {
    this.db
      .prepare(
        `
        UPDATE frontdoor_product_plans
        SET status = 'archived', updated_at_ms = ?
        WHERE plan_id = ?
      `,
      )
      .run(nowMs(), planId);
  }

  // -----------------------------------------------------------------------
  // Credit System
  // -----------------------------------------------------------------------

  getCreditBalance(accountId: string): CreditBalanceRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT account_id, balance_cents, currency, free_tier_expires_at_ms, updated_at_ms
        FROM frontdoor_account_credits
        WHERE account_id = ?
        LIMIT 1
      `,
      )
      .get(accountId) as
      | {
          account_id: string;
          balance_cents: number;
          currency: string;
          free_tier_expires_at_ms: number | null;
          updated_at_ms: number;
        }
      | undefined;
    if (!row) return null;
    return {
      accountId: row.account_id,
      balanceCents: row.balance_cents,
      currency: row.currency,
      freeTierExpiresAtMs: row.free_tier_expires_at_ms ?? null,
      updatedAtMs: row.updated_at_ms,
    };
  }

  initializeCredits(
    accountId: string,
    initialBalanceCents = 0,
    freeTierExpiresAtMs?: number,
  ): void {
    const now = nowMs();
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO frontdoor_account_credits
          (account_id, balance_cents, currency, free_tier_expires_at_ms, updated_at_ms)
        VALUES (?, ?, 'usd', ?, ?)
      `,
      )
      .run(accountId, initialBalanceCents, freeTierExpiresAtMs ?? null, now);
  }

  addCredits(params: {
    accountId: string;
    amountCents: number;
    type: "deposit" | "refund" | "trial_grant" | "adjustment";
    description: string;
    referenceId?: string;
  }): { transactionId: string; balanceAfterCents: number } {
    const now = nowMs();
    const txId = `ctx-${now}-${Math.random().toString(36).slice(2, 8)}`;

    this.db.exec("BEGIN");
    try {
      // Ensure credit record exists
      this.initializeCredits(params.accountId);

      // Update balance
      this.db
        .prepare(
          `UPDATE frontdoor_account_credits SET balance_cents = balance_cents + ?, updated_at_ms = ? WHERE account_id = ?`,
        )
        .run(params.amountCents, now, params.accountId);

      // Read new balance
      const row = this.db
        .prepare(`SELECT balance_cents FROM frontdoor_account_credits WHERE account_id = ?`)
        .get(params.accountId) as { balance_cents: number };

      // Insert transaction
      this.db
        .prepare(
          `
          INSERT INTO frontdoor_credit_transactions
            (transaction_id, account_id, amount_cents, balance_after_cents, type, description, reference_id, created_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(txId, params.accountId, params.amountCents, row.balance_cents, params.type, params.description, params.referenceId ?? null, now);

      this.db.exec("COMMIT");
      return { transactionId: txId, balanceAfterCents: row.balance_cents };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  deductCredits(params: {
    accountId: string;
    amountCents: number;
    type: "usage";
    description: string;
    referenceId?: string;
  }): { ok: true; transactionId: string; balanceAfterCents: number } | { ok: false; error: "insufficient_balance"; currentBalanceCents: number } {
    const now = nowMs();
    const txId = `ctx-${now}-${Math.random().toString(36).slice(2, 8)}`;

    this.db.exec("BEGIN");
    try {
      const row = this.db
        .prepare(`SELECT balance_cents FROM frontdoor_account_credits WHERE account_id = ?`)
        .get(params.accountId) as { balance_cents: number } | undefined;

      if (!row) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "insufficient_balance", currentBalanceCents: 0 };
      }

      // Allow up to $1 negative balance before rejecting
      if (row.balance_cents < params.amountCents && row.balance_cents < 100) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "insufficient_balance", currentBalanceCents: row.balance_cents };
      }

      // Deduct
      const newBalance = row.balance_cents - params.amountCents;
      this.db
        .prepare(
          `UPDATE frontdoor_account_credits SET balance_cents = ?, updated_at_ms = ? WHERE account_id = ?`,
        )
        .run(newBalance, now, params.accountId);

      // Insert transaction
      this.db
        .prepare(
          `
          INSERT INTO frontdoor_credit_transactions
            (transaction_id, account_id, amount_cents, balance_after_cents, type, description, reference_id, created_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(txId, params.accountId, -params.amountCents, newBalance, params.type, params.description, params.referenceId ?? null, now);

      this.db.exec("COMMIT");
      return { ok: true, transactionId: txId, balanceAfterCents: newBalance };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  getCreditTransactions(
    accountId: string,
    opts?: { limit?: number; offset?: number },
  ): CreditTransactionRecord[] {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const rows = this.db
      .prepare(
        `
        SELECT transaction_id, account_id, amount_cents, balance_after_cents,
               type, description, reference_id, created_at_ms
        FROM frontdoor_credit_transactions
        WHERE account_id = ?
        ORDER BY created_at_ms DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(accountId, limit, offset) as Array<{
      transaction_id: string;
      account_id: string;
      amount_cents: number;
      balance_after_cents: number;
      type: string;
      description: string;
      reference_id: string | null;
      created_at_ms: number;
    }>;

    return rows.map((r) => ({
      transactionId: r.transaction_id,
      accountId: r.account_id,
      amountCents: r.amount_cents,
      balanceAfterCents: r.balance_after_cents,
      type: r.type as CreditTransactionRecord["type"],
      description: r.description,
      referenceId: r.reference_id,
      createdAtMs: r.created_at_ms,
    }));
  }

  getActiveAccountsWithServers(): Array<{ accountId: string }> {
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT a.account_id
        FROM frontdoor_accounts a
        JOIN frontdoor_servers s ON s.account_id = a.account_id
        WHERE a.status = 'active' AND s.status IN ('running', 'provisioning')
      `,
      )
      .all() as Array<{ account_id: string }>;
    return rows.map((r) => ({ accountId: r.account_id }));
  }
}

// ── Conversion Helpers ──────────────────────────────────────────────

export function serverToTenantConfig(server: ServerRecord): TenantConfig {
  const runtimeUrl = getServerRuntimeUrl(server) ?? `http://localhost:${server.runtimePort}`;
  const wsUrl = getServerRuntimeWsUrl(server) ?? undefined;
  return {
    id: server.serverId,
    runtimeUrl,
    runtimePublicBaseUrl: getServerPublicUrl(server),
    runtimeWsUrl: wsUrl,
    runtimeSseUrl: undefined,
    runtimeAuthToken: server.runtimeAuthToken ?? undefined,
  };
}
