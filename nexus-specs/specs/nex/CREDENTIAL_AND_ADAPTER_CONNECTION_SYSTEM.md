# Credential & Adapter Connection System

**Status:** DESIGN (target state)
**Last Updated:** 2026-03-03

---

## Overview

This document specifies the unified credential storage, adapter connection, and access control system for Nex. It replaces two separate legacy systems (CLI flat credential index + adapter hierarchical file store) with a single database-backed system integrated with the ACL policy engine.

**Core principle:** A credential is a secret that Nex holds for interacting with an external service. Credentials are stored in one table, gated by ACL policies, and consumed by adapters and agent tools through a unified resolution pipeline.

---

## Objects

Three database objects form the system:

| Object | Purpose |
|--------|---------|
| `credentials` | Secrets Nex holds for external services (API keys, OAuth tokens, etc.) |
| `adapter_connections` | Links between adapters and credentials, with connection health state |
| ACL `policies` | Gate which identities can use which credentials (via `permissions.credentials`) |

---

## Credentials

### Schema

```sql
CREATE TABLE credentials (
    id              TEXT PRIMARY KEY,
    service         TEXT NOT NULL,          -- 'anthropic', 'slack', 'google'
    contact_id      TEXT,                   -- link to contacts table (OPTIONAL)
    kind            TEXT NOT NULL,          -- 'api_key', 'oauth', 'token', 'config'

    -- Storage: WHERE the secret lives
    storage_type    TEXT NOT NULL,          -- 'nex', 'inline', 'env', 'keychain', '1password', 'external'
    storage_config  TEXT NOT NULL,          -- JSON: depends on storage_type

    -- OAuth lifecycle (NULL for non-OAuth)
    expires_at      INTEGER,
    refresh_token_ref TEXT,                 -- credential ID for refresh token (self-referential)

    -- State
    status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'broken', 'expired', 'revoked'
    last_validated  INTEGER,
    last_used       INTEGER,
    last_error      TEXT,
    error_count     INTEGER DEFAULT 0,

    -- Metadata
    source          TEXT,                   -- 'manual', 'scan', 'import', 'oauth_flow', 'adapter_setup'
    note            TEXT,

    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,

    UNIQUE(service, contact_id, kind)
);
```

### Fields Explained

**`service`** — The external service this credential authenticates to. Normalized lowercase: `anthropic`, `slack`, `google`, `discord`, `openai`, `github`, etc. This is the namespace for the credential.

**`contact_id`** — Optional link to a contact in the contacts table. When present, this identifies WHOSE account the credential belongs to — e.g., "tyler@intent-systems.com on Anthropic." The contact links to an entity, which provides ownership through the identity graph.

When `contact_id` is NULL, the credential is unlinked — the user dropped in an API key without specifying whose account it's for. An agent can later ask and link it. The UNIQUE constraint on `(service, contact_id, kind)` allows NULL contact_id (multiple unlinked credentials per service).

**`kind`** — The type of credential. Determines what the resolved value looks like:

| Kind | Resolved Shape | Description |
|------|---------------|-------------|
| `api_key` | `{ fields: Record<string, string>, primary_field?: string }` | One or more named fields (adapter-defined) |
| `oauth` | `{ access_token, refresh_token?, token_type?, scope?, expires_at? }` | Standard OAuth token set |
| `token` | `{ token: string }` | Single bearer token |
| `config` | `{ fields: Record<string, string> }` | Arbitrary key-value pairs from adapter setup |

These are validated at the application level, not by the DB schema. Each kind has a Zod schema that validates the resolved value.

**`storage_type` + `storage_config`** — WHERE the actual secret lives. Six types:

| Type | Config Shape | Resolution |
|------|-------------|------------|
| `nex` | `{ secret_id: string }` | Decrypt from nex encrypted store (AES-256-GCM) |
| `inline` | `{ value: string }` | Plaintext in DB (dev/testing only) |
| `env` | `{ var: string }` | Read `process.env[var]` |
| `keychain` | `{ service: string, account: string }` | macOS Keychain via `security find-generic-password -s <service> -a <account> -w` |
| `1password` | `{ vault: string, item: string, fields: Record<string, string> }` | 1Password CLI via `op read "op://<vault>/<item>/<field>"` |
| `external` | `{ command: string, format?: "raw"\|"json", jsonPath?: string }` | Run command, read stdout. Covers gog and any other CLI tool. |

**`status`** — Current health state:
- `active` — credential is working
- `broken` — last validation failed, `last_error` has details, `error_count` tracks consecutive failures
- `expired` — OAuth token expired and refresh failed (or no refresh token)
- `revoked` — manually revoked by user

**`last_validated`** — Timestamp of last successful validation (e.g., health check to the service). NULL if never validated.

**`last_used`** — Timestamp of last successful resolution (when the secret was fetched and used). Updated on every `credentials.resolve` call.

**`last_error` + `error_count`** — Most recent failure and consecutive failure count. Reset to NULL/0 on successful validation.

**`source`** — How the credential was created:
- `manual` — user entered it via CLI or UI
- `scan` — discovered by environment variable scan
- `import` — imported from external source
- `oauth_flow` — created by adapter OAuth completion
- `adapter_setup` — created by adapter custom setup flow

---

## Storage Types in Detail

### `nex` — Nex Encrypted Store (Target Default)

The recommended storage type for production use. Secrets are encrypted at rest using AES-256-GCM.

**Implementation:**

```
~/nexus/state/secrets/
  master.key          -- encrypted master key (or stored in OS keychain)
  vault.db            -- SQLite with encrypted blobs
```

Or simpler: a single encrypted JSON file per secret, keyed by `secret_id`.

**Key derivation chain:**
1. **Master key** — stored in macOS Keychain (`security` CLI) or Linux Secret Service, or as a key file with `0o600` permissions as fallback
2. **Per-secret key** — derived from master key + secret_id via HKDF
3. **Encryption** — AES-256-GCM with random 96-bit nonce per encryption

**Resolution flow:**
1. Read `storage_config.secret_id`
2. Load encrypted blob from vault
3. Derive decryption key from master key + secret_id
4. Decrypt with AES-256-GCM
5. Parse result according to `kind` schema
6. Return resolved credential

**Implementation complexity:** ~100-150 lines of `node:crypto` code. No external dependencies.

### `inline` — Plaintext in DB

For development and testing. The secret value is stored directly in `storage_config.value`. No encryption.

**Security:** NOT suitable for production. The DB file is readable. Use `nex` type for anything sensitive.

### `env` — Environment Variable

Secret lives in a process environment variable. The DB only stores the variable name.

**Resolution:** `process.env[storage_config.var]`

**Good for:** CI/CD environments, Docker deployments where secrets are injected via env vars.

### `keychain` — macOS Keychain

Secret lives in the macOS system keychain. Accessed via the `security` CLI.

**Resolution:** `security find-generic-password -s <service> -a <account> -w`

**Good for:** macOS local development where the user wants OS-level secret protection.

### `1password` — 1Password CLI

Secret lives in a 1Password vault. Accessed via the `op` CLI.

**Resolution:** `op read "op://<vault>/<item>/<field>"` for each field in `storage_config.fields`

**Good for:** Teams using 1Password for secret management.

### `external` — Arbitrary Command

Secret is retrieved by running a shell command. Covers any CLI tool (gog, Vault, AWS Secrets Manager, etc.).

**Resolution:** `execSync(storage_config.command)` → parse stdout as raw or JSON, optionally extract via `jsonPath`.

**Good for:** Integration with any external secret manager.

---

## Credential Resolution Pipeline

When any part of the system needs a credential's actual value:

```
1. LOOKUP
   credentials table → find by ID or (service, contact_id, kind)

2. CHECK STATUS
   If status is 'revoked' → error
   If status is 'expired' → attempt refresh (for OAuth) → error if refresh fails

3. RESOLVE STORAGE
   Read storage_type + storage_config
   Dispatch to appropriate provider (nex, inline, env, keychain, 1password, external)
   Provider returns raw secret data

4. VALIDATE KIND
   Parse raw data according to kind schema (api_key, oauth, token, config)
   Extract primary value and supplementary fields

5. UPDATE STATE
   Set last_used = now()
   If resolution failed: increment error_count, set last_error, maybe set status = 'broken'
   If resolution succeeded: reset error_count, clear last_error

6. RETURN
   Return typed credential object to caller
```

---

## Adapter Connections

### Schema

```sql
CREATE TABLE adapter_connections (
    id              TEXT PRIMARY KEY,
    adapter         TEXT NOT NULL,          -- adapter name (e.g., 'discord', 'slack')
    service         TEXT NOT NULL,          -- credential service name
    credential_id   TEXT REFERENCES credentials(id),
    auth_method     TEXT NOT NULL,          -- 'oauth2', 'api_key', 'file_upload', 'custom_flow'
    status          TEXT NOT NULL DEFAULT 'disconnected',  -- 'connected', 'disconnected', 'error', 'expired'
    error           TEXT,
    metadata_json   TEXT,                   -- adapter-specific metadata
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,

    UNIQUE(adapter, service)
);
```

### What This Table Does

An adapter connection links an **adapter** (external process that bridges Nex to a platform) to a **credential** (the secret that authenticates to that platform). It tracks the health state of that link.

**Example rows:**

| adapter | service | credential_id | auth_method | status |
|---------|---------|--------------|-------------|--------|
| discord | discord | cred_abc123 | api_key | connected |
| slack | slack | cred_def456 | oauth2 | connected |
| gog | google | cred_ghi789 | oauth2 | expired |

### Replaces

This table replaces `connections.json` (file-based adapter connection state). The JSON file tracked:
- adapter, service, account, credential_ref, authMethod, status, lastSync, error, metadata, updatedAt

The DB table captures all the same data with proper foreign keys and queryability.

### Pending Setup Flows

In-progress OAuth and custom setup flows (previously in `oauth-pending.json` and `custom-setup-pending.json`) can either:
- Move to a `adapter_setup_sessions` table with TTL
- Stay as ephemeral in-memory state (they're short-lived: 10min for OAuth, 24h for custom)

Recommendation: in-memory with fallback to a simple DB table for crash recovery.

---

## Adapter Setup → Credential Flow

When a user sets up an adapter connection, the adapter guides them through authentication. Here's how the flow writes to the credential system:

### OAuth Flow

```
1. UI calls adapters.connections.oauth.start
   → Control plane generates OAuth URL with state token
   → Returns redirect URL to UI

2. User completes OAuth in browser
   → Provider redirects back with auth code

3. UI calls adapters.connections.oauth.complete with code + state
   → Control plane exchanges code for tokens
   → Writes to credentials table:
     - service: adapter's service name (e.g., "slack")
     - contact_id: resolved from token response (email, user ID) → contact lookup
     - kind: "oauth"
     - storage_type: "nex" (encrypted)
     - storage_config: { secret_id: <generated> }
     - source: "oauth_flow"
     - expires_at: from token response
   → Encrypts token data in nex vault
   → Creates/updates adapter_connections row:
     - credential_id: the new credential's ID
     - auth_method: "oauth2"
     - status: "connected"
```

### API Key Flow

```
1. UI calls adapters.connections.apikey.save with user-entered fields
   → Control plane validates fields against adapter's declared schema
   → Writes to credentials table:
     - service: adapter's service name
     - contact_id: resolved from fields (email, account) → contact lookup
     - kind: "api_key"
     - storage_type: "nex" (encrypted)
     - source: "adapter_setup"
   → Optionally validates via adapter health check
   → Creates/updates adapter_connections row
```

### Custom Setup Flow

```
1. UI calls adapters.connections.custom.start
   → Adapter binary receives adapter.setup.start
   → Returns fields it needs from the user

2. UI calls adapters.connections.custom.submit with user input
   → Adapter processes input
   → May return more fields (multi-step)
   → Eventually returns status: "completed" with secret_fields
   → Control plane writes secrets to credentials table
   → Creates/updates adapter_connections row
```

### Non-Adapter Credentials

Credentials that aren't tied to adapters (e.g., an Anthropic API key used by agent tools) follow a simpler flow:

```
1. User calls credentials.create (CLI or API)
   → Specify service, kind, secret value (or pointer)
   → Optionally specify contact_id
   → Written to credentials table

2. Agent tool needs the credential
   → resolveAccess stage checks permissions.credentials against policies
   → If allowed, credential is resolved via storage provider
   → Secret value injected into tool context
```

---

## ACL Integration

### How Policies Gate Credential Access

Policy `permissions.credentials` contains a list of credential ref patterns:

```yaml
permissions:
  credentials: ["*"]                    # all credentials
  credentials: ["anthropic/*"]          # all credentials for anthropic service
  credentials: ["slack/contact_abc"]    # specific credential for a specific contact
  credentials: []                       # no credential access
```

Credential refs are `service/contact_id` (or `service/*` for wildcards). When `contact_id` is NULL (unlinked credential), the ref is `service/_unlinked_<id>`.

### Evaluation Flow

```
1. Inbound request arrives (message, API call, etc.)

2. resolveAccess stage evaluates ACL policies
   → Matching policies contribute permissions.credentials
   → Wildcard "*" = all credentials
   → Arrays are INTERSECTED across multiple matching policies (restrictive merge)
   → Result: list of allowed credential ref patterns

3. AccessContext.permissions.credentials = ["anthropic/*", "slack/contact_abc"]

4. When agent/adapter needs a credential:
   → Check if the credential's ref matches any allowed pattern
   → If match: resolve and inject
   → If no match: deny with clear error
```

### Default Access by Role

| Role | Default Credential Access | Rationale |
|------|--------------------------|-----------|
| Owner | `["*"]` | Full access to all credentials |
| Operator | `["*"]` | Operators manage the system |
| Member | `[]` | No credential access by default (grant via policy) |
| Customer | `[]` | No credential access (sandboxed) |

### Contact-Based Ownership

When a credential has a `contact_id`:
- The contact links to an entity via the contacts table
- That entity's identity determines ownership
- Policies can match on the owning entity's properties (tags, groups, etc.)

This means: "Tyler's Anthropic key" is naturally accessible to Tyler (the entity who owns the contact) via the existing owner policy. Other entities need explicit policy grants.

---

## Credential Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `credentials.list` | read | List credentials (filter by service, contact_id, kind, status) |
| `credentials.get` | read | Get credential metadata (NOT the secret value) |
| `credentials.create` | write | Store a new credential |
| `credentials.update` | write | Update credential metadata, storage pointer, or note |
| `credentials.delete` | write | Soft-revoke a credential (sets status='revoked') |
| `credentials.resolve` | read | Resolve credential to actual secret value (privileged, ACL-gated) |
| `credentials.verify` | write | Validate credential against external service (updates last_validated/status) |
| `credentials.scan` | write | Scan environment variables for known credential patterns |
| `credentials.link` | write | Link an unlinked credential to a contact_id |

## Adapter Connection Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `adapters.connections.list` | read | List all adapter connections with status |
| `adapters.connections.get` | read | Get single adapter connection |
| `adapters.connections.status` | read | Get connection health for a specific adapter |
| `adapters.connections.test` | read | Test connection health (validates credential, returns latency) |
| `adapters.connections.disconnect` | write | Disconnect adapter (revoke credential, update status) |
| `adapters.connections.oauth.start` | write | Start OAuth flow |
| `adapters.connections.oauth.complete` | write | Complete OAuth flow → writes credential + connection |
| `adapters.connections.apikey.save` | write | Save API key → writes credential + connection |
| `adapters.connections.custom.start` | write | Start adapter-guided setup |
| `adapters.connections.custom.submit` | write | Submit step in setup flow |
| `adapters.connections.custom.status` | read | Check setup flow status |
| `adapters.connections.custom.cancel` | write | Cancel setup flow |

---

## Migration Path

### From Legacy to Target

**CLI credential store** (`credentials/index.json` with `entries[]`):
- Each `CredentialEntry` becomes a `credentials` row
- `pointer.type: "env"` → `storage_type: "env"`, `storage_config: { var: pointer.key }`
- `pointer.type: "inline"` → `storage_type: "inline"`, `storage_config: { value: pointer.value }`
- `exposed` field → if true, credential is active; if false, status is `revoked`
- `broken` field → status is `broken`

**Adapter hierarchical store** (`credentials/{service}/accounts/{account}/auth/*.json`):
- Each `CredentialRecord` becomes a `credentials` row
- `storage.provider` maps directly to `storage_type`
- The `secrets/*.json` files get re-encrypted into nex vault (for `storage_type: "nex"`)
- `auth/*.json` metadata merges into the credential row fields

**Connection state** (`adapter-connections/connections.json`):
- Each `AdapterConnectionRecord` becomes an `adapter_connections` row
- `credential_ref` resolves to a `credential_id` foreign key

**Pending flows** (`oauth-pending.json`, `custom-setup-pending.json`):
- Move to in-memory state with optional DB persistence for crash recovery

### What Gets Deleted

After migration:
- `credentials/index.json` (flat CLI index)
- `credentials/{service}/` (hierarchical adapter store)
- `adapter-connections/connections.json`
- `adapter-connections/oauth-pending.json`
- `adapter-connections/custom-setup-pending.json`
- All credential file resolution code in `runtime-context.ts` that reads from filesystem
- `writeSecretRecord()` in adapter-connections.ts
- Dual-index reading logic in credential CLI

---

## Appendix: Nex Encrypted Store Specification

### Design

The nex encrypted store provides at-rest encryption for secrets using standard cryptographic primitives from `node:crypto`. No external dependencies.

### Architecture

```
Master Key (stored in OS keychain or restricted key file)
    ↓ HKDF-SHA256
Per-Secret Key (derived from master key + secret_id)
    ↓ AES-256-GCM
Encrypted Secret Blob (stored in DB or vault file)
```

### Master Key Management

**macOS:** Master key stored in macOS Keychain via `security` CLI:
```bash
# Store: security add-generic-password -s "nexus-vault" -a "master" -w "<base64-key>"
# Read:  security find-generic-password -s "nexus-vault" -a "master" -w
```

**Linux:** Master key stored via `secret-tool` (libsecret) or fallback to restricted key file:
```bash
# Key file: ~/.nexus/state/vault/master.key (mode 0o600)
```

**Generation:** `crypto.randomBytes(32)` — 256-bit random key, generated on first use.

### Encryption

```typescript
import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

function encrypt(masterKey: Buffer, secretId: string, plaintext: string): EncryptedBlob {
  // Derive per-secret key
  const key = hkdfSync('sha256', masterKey, secretId, 'nex-vault', 32);

  // Encrypt with AES-256-GCM
  const nonce = randomBytes(12);  // 96-bit nonce
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { nonce: nonce.toString('base64'), tag: tag.toString('base64'), data: encrypted.toString('base64') };
}

function decrypt(masterKey: Buffer, secretId: string, blob: EncryptedBlob): string {
  const key = hkdfSync('sha256', masterKey, secretId, 'nex-vault', 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8');
}
```

### Storage

Encrypted blobs can be stored:
- **In the credentials table itself** — add an `encrypted_value` BLOB column (simple, everything in one place)
- **In a separate vault table** — `vault(secret_id TEXT PK, blob TEXT NOT NULL, created_at INTEGER)` (separation of concerns)

Recommendation: separate vault table. Keeps the credentials table clean for queries and metadata, while the vault is purely a secure blob store.

```sql
CREATE TABLE vault (
    secret_id   TEXT PRIMARY KEY,
    blob_json   TEXT NOT NULL,      -- { nonce, tag, data } base64-encoded
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

### Security Properties

- **At-rest encryption:** Secrets are never stored in plaintext on disk
- **Per-secret keys:** Compromising one secret's key doesn't compromise others
- **Authenticated encryption:** GCM provides both confidentiality and integrity
- **Master key isolation:** Master key lives in OS keychain, not on filesystem (macOS)
- **No external dependencies:** Pure `node:crypto`
