# Workplan: Credential System Database Migration
**Status:** COMPLETED — commit f36731799
**Created:** 2026-03-04
**Spec References:**
- [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](../CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md) (full spec)
- [API_DESIGN_BATCH_2.md](../API_DESIGN_BATCH_2.md) (credentials operations section)
**Dependencies:** WP_IDENTITY_DB_OVERHAUL (requires contacts table for contact_id FK)

---

## Goal

Replace the dual file-based credential storage systems (CLI flat index + adapter hierarchical file store) with a unified SQLite table in identity.db. All secrets gated by ACL policies, resolved through a 6-step pipeline, with 6 storage type resolvers and native nex encrypted store.

---

## Current State

### Storage Files
**CLI credential index:**
- `~/nexus/state/credentials/index.json` — Flat credential list with pointers
- Format: `{ entries: CredentialEntry[] }` where each entry has pointer (env/inline), exposed, broken flags

**Adapter hierarchical store:**
- `~/nexus/state/credentials/{service}/accounts/{account}/auth/*.json` — Per-account credential metadata
- `~/nexus/state/credentials/{service}/accounts/{account}/secrets/*.json` — Secret storage

**Connection state:**
- `~/nexus/state/adapter-connections/connections.json` — Adapter connection records
- `~/nexus/state/adapter-connections/oauth-pending.json` — In-progress OAuth flows
- `~/nexus/state/adapter-connections/custom-setup-pending.json` — In-progress custom setups

### Code
- `src/agents/cli-credentials.ts` — CLI credential management (reads index.json)
- `src/nex/control-plane/server-methods/ingress-credentials.ts` — Ingress credential RPC handlers
- `src/commands/credential.ts` — CLI commands for credentials
- Various credential resolution code scattered across runtime-context.ts and adapter code

### Limitations
- Two separate credential systems with no unified query interface
- No ACL integration (file-based = all-or-nothing access)
- No credential health tracking or validation state
- No structured query capability (can't list "all broken anthropic credentials")
- Manual file management and hierarchical directory structures

---

## Target State

### Database Schema

**credentials** (in identity.db):
```sql
CREATE TABLE credentials (
    id              TEXT PRIMARY KEY,
    service         TEXT NOT NULL,          -- 'anthropic', 'slack', 'google'
    contact_id      TEXT REFERENCES contacts(id),  -- OPTIONAL link to contact
    kind            TEXT NOT NULL,          -- 'api_key', 'oauth', 'token', 'config'

    -- Storage: WHERE the secret lives
    storage_type    TEXT NOT NULL,          -- 'nex', 'inline', 'env', 'keychain', '1password', 'external'
    storage_config  TEXT NOT NULL,          -- JSON: depends on storage_type

    -- OAuth lifecycle (NULL for non-OAuth)
    expires_at      INTEGER,
    refresh_token_ref TEXT REFERENCES credentials(id),  -- self-referential for refresh tokens

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

CREATE INDEX idx_credentials_service ON credentials(service);
CREATE INDEX idx_credentials_contact ON credentials(contact_id);
CREATE INDEX idx_credentials_status ON credentials(status);
```

**vault** (in identity.db — separate table for encrypted secrets):
```sql
CREATE TABLE vault (
    secret_id   TEXT PRIMARY KEY,
    blob_json   TEXT NOT NULL,      -- { nonce, tag, data } base64-encoded
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

**adapter_connections** (in identity.db — replaces connections.json):
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

CREATE INDEX idx_adapter_connections_adapter ON adapter_connections(adapter);
CREATE INDEX idx_adapter_connections_credential ON adapter_connections(credential_id);
```

### Nex Encrypted Store

**Implementation:** ~100-150 lines using node:crypto, no external dependencies.

**Key architecture:**
```
Master Key (macOS Keychain or restricted file)
    ↓ HKDF-SHA256
Per-Secret Key (derived from master key + secret_id)
    ↓ AES-256-GCM
Encrypted Secret Blob (stored in vault table)
```

**Storage location:**
- Master key: macOS Keychain via `security add-generic-password -s "nexus-vault" -a "master"`
- Fallback: `~/.nexus/state/vault/master.key` with 0o600 permissions
- Encrypted blobs: vault table in identity.db

**Module:** `src/nex/vault/encrypted-store.ts` (NEW)

### Storage Type Resolvers

Six storage providers, each ~20-50 lines:

1. **nex** — Decrypt from vault table (AES-256-GCM)
2. **inline** — Read plaintext from storage_config.value (dev/testing only)
3. **env** — Read from process.env[storage_config.var]
4. **keychain** — macOS Keychain via `security find-generic-password -s <service> -a <account> -w`
5. **1password** — 1Password CLI via `op read "op://<vault>/<item>/<field>"`
6. **external** — Run shell command, parse stdout (covers gog, Vault, AWS Secrets Manager, etc.)

**Module:** `src/nex/vault/storage-resolvers.ts` (NEW)

### Credential Resolution Pipeline

**6-step pipeline:**
```typescript
1. LOOKUP
   credentials table → find by ID or (service, contact_id, kind)

2. CHECK STATUS
   If status is 'revoked' → error
   If status is 'expired' → attempt OAuth refresh → error if fails

3. RESOLVE STORAGE
   Dispatch to storage provider based on storage_type
   Provider returns raw secret data

4. VALIDATE KIND
   Parse raw data according to kind schema (api_key, oauth, token, config)
   Zod validation ensures shape correctness

5. UPDATE STATE
   Set last_used = now()
   On failure: increment error_count, set last_error, maybe set status = 'broken'
   On success: reset error_count, clear last_error

6. RETURN
   Return typed credential object to caller
```

**Module:** `src/nex/vault/credential-resolver.ts` (NEW)

### Operations

**9 credential operations:**
- `credentials.list` — List credentials (filter by service, contact_id, kind, status)
- `credentials.get` — Get credential metadata (NOT the secret value)
- `credentials.create` — Store a new credential
- `credentials.update` — Update metadata, storage pointer, or note
- `credentials.delete` — Soft-revoke (sets status='revoked')
- `credentials.resolve` — Resolve to actual secret value (privileged, ACL-gated)
- `credentials.verify` — Validate against external service (updates status)
- `credentials.scan` — Scan environment variables for known credential patterns
- `credentials.link` — Link unlinked credential to a contact_id

---

## Changes Required

### Database Schema Changes

**File:** `src/db/identity.ts`

1. **Add credentials table** with schema above
2. **Add vault table** with schema above
3. **Add adapter_connections table** with schema above
4. **Update ensureIdentitySchema()** to create these tables
5. **Add credential CRUD functions:**
   - insertCredential, updateCredential, queryCredentials
   - insertVaultSecret, getVaultSecret, updateVaultSecret
   - insertAdapterConnection, updateAdapterConnection, queryAdapterConnections

### New Code

**File:** `src/nex/vault/encrypted-store.ts` (NEW)
- `initMasterKey(env)` — Load or generate master key from OS keychain
- `deriveSecretKey(masterKey, secretId)` — HKDF key derivation
- `encryptSecret(masterKey, secretId, plaintext)` — AES-256-GCM encryption
- `decryptSecret(masterKey, secretId, encryptedBlob)` — AES-256-GCM decryption
- Types: `EncryptedBlob { nonce, tag, data }`, `MasterKey`

**File:** `src/nex/vault/storage-resolvers.ts` (NEW)
- `resolveNexStorage(db, storage_config)` — Decrypt from vault table
- `resolveInlineStorage(storage_config)` — Read plaintext value
- `resolveEnvStorage(storage_config, env)` — Read from process.env
- `resolveKeychainStorage(storage_config)` — macOS keychain lookup
- `resolve1PasswordStorage(storage_config)` — 1Password CLI
- `resolveExternalStorage(storage_config)` — Run shell command
- `resolveCredentialStorage(db, credential)` — Dispatcher

**File:** `src/nex/vault/credential-resolver.ts` (NEW)
- `resolveCredential(db, credentialId, env?)` — Full 6-step resolution pipeline
- `resolveCredentialByService(db, service, contact_id?, kind?, env?)` — Lookup + resolve
- `validateCredentialKind(kind, rawData)` — Zod validation for api_key/oauth/token/config
- `updateCredentialStatus(db, credentialId, status, error?)` — Update health state
- `attemptOAuthRefresh(db, credential)` — Refresh expired OAuth token

**File:** `src/nex/vault/credential-operations.ts` (NEW)
- Implement all 9 credential operations:
  - `credentialsList(db, filters)` — Query with filters
  - `credentialsGet(db, id)` — Get metadata only
  - `credentialsCreate(db, input)` — Insert new credential + optional vault secret
  - `credentialsUpdate(db, id, updates)` — Update metadata
  - `credentialsDelete(db, id)` — Soft-revoke (status='revoked')
  - `credentialsResolve(db, id, env)` — Resolve to actual secret (ACL-gated)
  - `credentialsVerify(db, id)` — Validate against external service
  - `credentialsScan(env)` — Scan environment variables
  - `credentialsLink(db, id, contact_id)` — Link to contact

**File:** `src/nex/vault/adapter-connection-operations.ts` (NEW)
- Adapter connection management (12 ops from spec):
  - `adapters.connections.list/get/status/test/disconnect`
  - `adapters.connections.oauth.start/complete`
  - `adapters.connections.apikey.save`
  - `adapters.connections.custom.start/submit/status/cancel`
- These replace the file-based connection management

**File:** `src/nex/vault/migration.ts` (NEW)
- `migrateCliCredentials(db, env)` — Read index.json, convert to DB rows
- `migrateAdapterCredentials(db, env)` — Read hierarchical file store, convert to DB rows
- `migrateAdapterConnections(db, env)` — Read connections.json, convert to DB rows
- `performCredentialMigration(db, env)` — Full migration orchestration

### Modified Files

**File:** `src/db/identity.ts`
- **Add:** credentials, vault, adapter_connections table schemas
- **Add:** Credential CRUD functions (insert/update/query)
- **Add:** Vault CRUD functions (insert/get/update)
- **Add:** Adapter connection CRUD functions (insert/update/query)
- **Update:** ensureIdentitySchema() to create new tables

**File:** `src/nex/control-plane/server-methods/ingress-credentials.ts`
- **Update:** Replace hardcoded audience="ingress" with unified credential operations
- **Update:** Token creation to use credential-resolver for ACL checking
- **Simplify:** Remove dual-system complexity (CLI vs adapter credentials)
- **Replace:** File-based credential lookups with DB queries

**File:** `src/agents/cli-credentials.ts`
- **Update:** Replace index.json reads with DB queries
- **Update:** Credential list/get/expose/hide to use DB operations
- **Remove:** File-based index management
- **Add:** Migration trigger on first use (if index.json exists)

**File:** `src/commands/credential.ts`
- **Update:** All credential CLI commands to use DB operations
- **Update:** `nex credential add` to write to DB
- **Update:** `nex credential list` to query DB
- **Update:** `nex credential remove` to soft-revoke in DB
- **Add:** `nex credential migrate` command for manual migration trigger

**File:** `src/iam/policies.ts`
- **Update:** Add credential resolution + ACL checking in permission evaluation
- **Add:** `matchesCredentialPattern(credentialRef, allowedPatterns)` — Wildcard matching for service/contact_id

**File:** `src/nex/control-plane/runtime-context.ts`
- **Update:** Replace file-based credential resolution with DB-backed resolver
- **Update:** Inject credential-resolver into agent tool execution context
- **Remove:** Hierarchical file reading code
- **Remove:** Dual-index credential lookups

**File:** `src/nex/control-plane/server-methods/adapter-connections.ts`
- **Update:** Replace connections.json reads/writes with adapter_connections table
- **Update:** OAuth flow completion to write to credentials + adapter_connections tables
- **Update:** API key setup to write to credentials + adapter_connections tables
- **Remove:** File-based connection state management

### Deleted Files/Code

**File-based storage (DELETE after migration):**
- `~/nexus/state/credentials/index.json`
- `~/nexus/state/credentials/{service}/` (entire directory hierarchy)
- `~/nexus/state/adapter-connections/connections.json`
- `~/nexus/state/adapter-connections/oauth-pending.json`
- `~/nexus/state/adapter-connections/custom-setup-pending.json`

**Code removed:**
- File resolution code in runtime-context.ts that reads from filesystem
- `writeSecretRecord()` in adapter-connections.ts
- Dual-index reading logic in cli-credentials.ts
- Hierarchical file path construction code

### Operations to Register

**Credentials domain (9 ops):**
- `credentials.list`, `credentials.get`, `credentials.create`, `credentials.update`, `credentials.delete`
- `credentials.resolve`, `credentials.verify`, `credentials.scan`, `credentials.link`

**Adapter connections (12 ops):**
- `adapters.connections.list`, `adapters.connections.get`, `adapters.connections.status`, `adapters.connections.test`, `adapters.connections.disconnect`
- `adapters.connections.oauth.start`, `adapters.connections.oauth.complete`
- `adapters.connections.apikey.save`
- `adapters.connections.custom.start`, `adapters.connections.custom.submit`, `adapters.connections.custom.status`, `adapters.connections.custom.cancel`

**Total: 21 operations**

---

## Execution Order

### Phase 1: Encrypted Store Implementation (FOUNDATION)
1. **Implement nex encrypted store** — encrypted-store.ts (~100-150 lines)
2. **Implement storage resolvers** — storage-resolvers.ts (6 resolvers)
3. **Test encryption/decryption** — Unit tests for AES-256-GCM
4. **Test all storage resolvers** — Unit tests for each resolver type

### Phase 2: Database Schema (DEPENDS on WP1)
5. **Add credentials, vault, adapter_connections tables** — Update identity.ts schema
6. **Add credential CRUD functions** — Insert/update/query operations in identity.ts
7. **Test DB operations** — Unit tests for credential CRUD

### Phase 3: Core Operations
8. **Implement credential resolver** — credential-resolver.ts (6-step pipeline)
9. **Implement credential operations** — credential-operations.ts (9 ops)
10. **Implement adapter connection operations** — adapter-connection-operations.ts (12 ops)
11. **Test credential resolution** — Unit tests for each storage type
12. **Test credential operations** — Integration tests with DB

### Phase 4: Migration
13. **Implement migration logic** — migration.ts (3 migration functions)
14. **Test migration on dev data** — Verify all credentials migrate correctly
15. **Run migration on production-like dataset** — Validate data integrity
16. **Create migration CLI command** — `nex credential migrate`

### Phase 5: Integration
17. **Update ingress-credentials.ts** — Replace file-based with DB operations
18. **Update cli-credentials.ts** — Replace index.json with DB queries
19. **Update runtime-context.ts** — Use credential-resolver for agents/adapters
20. **Update adapter-connections.ts** — Replace connections.json with DB
21. **Update policies.ts** — Add credential ACL matching
22. **Register all operations** — Add to nex server method registry

### Phase 6: Testing & Validation
23. **Integration tests** — Full pipeline with DB credentials
24. **E2E tests** — Adapter setup flows writing to DB
25. **E2E tests** — Agent tools resolving credentials from DB
26. **ACL tests** — Verify credential gating works
27. **OAuth refresh tests** — Verify refresh token flow

### Phase 7: Cleanup
28. **Delete file-based storage** — Remove index.json, hierarchical directories, connections.json
29. **Remove file resolution code** — Purge from runtime-context.ts
30. **Update documentation** — Reflect new DB-backed credential system

---

## Notes

**Master key management:** On first use, generate a 256-bit random key and store in macOS Keychain. Fall back to restricted file (~/.nexus/state/vault/master.key with 0o600) on Linux or if keychain access fails. Master key never leaves secure storage.

**Migration safety:** Migration is idempotent. If a credential with the same (service, contact_id, kind) exists in DB, skip it. Log all migrations for audit trail. Keep file-based storage intact until manual deletion (don't auto-delete on migration success).

**ACL integration:** credentials.resolve is the ONLY operation that returns the actual secret value. All other operations return metadata only. credentials.resolve checks `permissions.credentials` patterns from matched policies. Patterns are `service/contact_id` or `service/*` for wildcards.

**OAuth refresh:** When a credential with status='expired' is resolved, automatically attempt refresh if refresh_token_ref is present. On success, update access token and expires_at. On failure, keep status='expired' and return error.

**Pending OAuth flows:** In-progress OAuth and custom setup flows can either move to an `adapter_setup_sessions` table with TTL, or stay as ephemeral in-memory state. Recommendation: in-memory with optional DB persistence for crash recovery (these are short-lived: 10min for OAuth, 24h for custom).

**contact_id NULL handling:** When contact_id is NULL, the credential is "unlinked" — the user added an API key without specifying whose account. The UNIQUE constraint allows multiple NULL contact_ids (SQLite treats NULL as distinct values). An agent can later call credentials.link to associate it with a contact.

**Hard cutover:** No backwards compatibility. File-based credential storage is fully replaced. All deployments must run migration.
