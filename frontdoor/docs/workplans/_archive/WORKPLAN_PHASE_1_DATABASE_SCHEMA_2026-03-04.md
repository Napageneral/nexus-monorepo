# Phase 1: Database Schema + Store Layer

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** Phase 0 (infrastructure setup — need env vars for config)
**Enables:** Phase 2 (cloud provider), Phase 3 (provisioning flow)
**Specs:** [CLOUD_PROVISIONING_ARCHITECTURE §10](../specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md), [TENANT_NETWORKING_AND_ROUTING §7](../specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md)

---

## Goal

Clean-slate rewrite of the server database schema and store layer to support cloud provisioning. No migration — nuke existing data and start fresh.

---

## Current State

### Existing `frontdoor_servers` schema:
```sql
CREATE TABLE IF NOT EXISTS frontdoor_servers (
  server_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  generated_name TEXT NOT NULL,
  runtime_url TEXT NOT NULL,
  runtime_public_base_url TEXT NOT NULL,
  runtime_ws_url TEXT,
  runtime_sse_url TEXT,
  runtime_auth_token TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning',
  tier TEXT NOT NULL DEFAULT 'standard',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
```

### Problems:
- `runtime_url`, `runtime_public_base_url`, etc. assume localhost URLs — not cloud IPs
- No `tenant_id`, `provider`, `provider_server_id`, `plan`, `private_ip`, `runtime_port`, `provision_token`
- Status values are wrong: uses "active" instead of "running", missing "failed", "deprovisioning", "deleted"
- No `deleted_at_ms` for soft delete
- No API token tables

---

## Tasks

### 1.1 — Rewrite `frontdoor_servers` table

**File:** `src/frontdoor-store.ts`

Replace the CREATE TABLE statement with:

```sql
CREATE TABLE IF NOT EXISTS frontdoor_servers (
  server_id            TEXT PRIMARY KEY,
  account_id           TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
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
```

**Removed columns:** `runtime_url`, `runtime_public_base_url`, `runtime_ws_url`, `runtime_sse_url`, `tier`.

**Why:** Runtime URLs are now derived from `private_ip` + `runtime_port`. The helper `getServerRuntimeUrl(server)` returns `http://${server.privateIp}:${server.runtimePort}`. `tier` is replaced by `plan` (the actual Hetzner server type).

**Status values:** `provisioning` | `running` | `failed` | `deprovisioning` | `deleted`

### 1.2 — Update `ServerRecord` TypeScript type

```typescript
export type ServerStatus = "provisioning" | "running" | "failed" | "deprovisioning" | "deleted";

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
```

### 1.3 — Add helper function for runtime URL

```typescript
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
```

### 1.4 — Update store methods

**`createServer()`** — new signature:
```typescript
createServer(input: {
  serverId?: string;          // auto-generated if not provided
  accountId: string;
  tenantId: string;
  displayName: string;
  generatedName: string;
  plan?: string;               // default: 'cax11'
  provider?: string;           // default: 'hetzner'
  provisionToken?: string;
  runtimeAuthToken?: string;
}): ServerRecord
```

**`updateServer()`** — accept new fields:
```typescript
updateServer(serverId: string, updates: {
  displayName?: string;
  status?: ServerStatus;
  providerServerId?: string;
  privateIp?: string;
  publicIp?: string;
  runtimePort?: number;
  provisionToken?: string | null;  // null to clear after callback
  deletedAtMs?: number;
}): void
```

**New methods:**
```typescript
// Look up server by tenant ID (for routing table)
getServerByTenantId(tenantId: string): ServerRecord | null

// Look up server by provision token (for callback endpoint)
getServerByProvisionToken(token: string): ServerRecord | null

// Get all running servers (for routing table initialization)
getRunningServers(): ServerRecord[]

// Get all non-deleted servers for a user (for dashboard)
getActiveServersForUser(userId: string): ServerRecord[]
```

**Remove/update:**
- Remove `getServerByRuntimeBinding()` — no longer relevant
- Update `getServersForUser()` → `getActiveServersForUser()` — filter out `deleted` and `deprovisioning`
- Remove any references to `runtimeUrl`, `runtimePublicBaseUrl`, `runtimeWsUrl`, `runtimeSseUrl`

### 1.5 — Create `frontdoor_api_tokens` table

Per spec [TENANT_NETWORKING_AND_ROUTING §7](../specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md):

```sql
CREATE TABLE IF NOT EXISTS frontdoor_api_tokens (
  token_id      TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES frontdoor_users(user_id),
  account_id    TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  display_name  TEXT NOT NULL,
  scopes        TEXT NOT NULL DEFAULT '*',
  last_used_ms  INTEGER,
  expires_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER
);
```

### 1.6 — Add API token store methods

```typescript
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

// Create token — takes raw token string, hashes it, stores hash
createApiToken(input: {
  tokenId: string;
  tokenHash: string;
  userId: string;
  accountId: string;
  displayName: string;
  expiresAtMs?: number;
}): ApiTokenRecord

// Find token by hash (for validation)
getApiTokenByHash(hash: string): ApiTokenRecord | null

// List tokens for a user (without hashes)
listApiTokens(userId: string): Omit<ApiTokenRecord, 'tokenHash'>[]

// Revoke a token
revokeApiToken(tokenId: string): void

// Update last_used_ms
touchApiToken(tokenId: string): void
```

### 1.7 — Update all code referencing old server schema

Search the entire codebase for references to removed/changed fields:

- `runtime_url` / `runtimeUrl` — replace with `getServerRuntimeUrl(server)`
- `runtime_public_base_url` / `runtimePublicBaseUrl` — replace with `getServerPublicUrl(server)`
- `runtime_ws_url` / `runtimeWsUrl` — replace with `getServerRuntimeWsUrl(server)`
- `runtime_sse_url` / `runtimeSseUrl` — remove (SSE goes through same HTTP URL)
- `tier` — replace with `plan`
- `status === "active"` — replace with `status === "running"`
- `status === "disabled"` — replace with `status === "deleted"` or `status === "deprovisioning"`

**Key files to update:**
- `src/server.ts` — all server API handlers, proxy logic
- `src/tenant-autoprovision.ts` — provisioning trigger
- `src/config.ts` — config loading
- `public/index.html` — dashboard UI JavaScript

### 1.8 — Nuke existing data

Since there are no users, wipe all databases on deployment:

```bash
rm -f /var/lib/nexus-frontdoor/*.db
```

The store will recreate tables on startup with the new schema.

---

## Verification

- [ ] `frontdoor_servers` table uses new schema
- [ ] `frontdoor_api_tokens` table exists
- [ ] `ServerRecord` type matches schema
- [ ] All references to `runtimeUrl`, `runtimePublicBaseUrl` etc. are removed
- [ ] Status values use new set: provisioning, running, failed, deprovisioning, deleted
- [ ] `getServerByTenantId()`, `getServerByProvisionToken()`, `getRunningServers()` work
- [ ] Frontdoor starts cleanly with empty databases
