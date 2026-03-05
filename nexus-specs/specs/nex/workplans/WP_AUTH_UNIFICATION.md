# Workplan: Auth Unification — Remove Audience, Collapse Servers
**Status:** READY FOR EXECUTION
**Created:** 2026-03-04
**Spec References:**
- [AUDIENCE_REMOVAL_CUTOVER.md](./AUDIENCE_REMOVAL_CUTOVER.md) (detailed 131-occurrence analysis)
- [API_DESIGN_BATCH_2.md](../API_DESIGN_BATCH_2.md) (auth domain spec)
**Dependencies:** None (independent of WP1 and WP2)

---

## Goal

Remove the `audience` field from the auth token system and collapse the two-server architecture (control-plane + ingress) into a unified auth system. Roles and scopes determine what a token can do — not which HTTP server it was presented to. Six auth operations aligned with spec naming.

---

## Current State

### Two-Server Architecture
- **Control-plane server:** Port 18789 (default), accepts `audience: "control-plane"` tokens
- **Ingress server:** Port 18790 (default), accepts `audience: "ingress"` tokens

### Token System
- **auth_tokens table:** Has `audience` column ("control-plane" or "ingress")
- **Token lookup:** `resolveAuthTokenByValue()` filters by audience
- **Token creation:** Must specify audience

### Audience Usage (131 occurrences across 28 files)
Per AUDIENCE_REMOVAL_CUTOVER.md:
- Token lookup filtering (control-plane token can't be used on ingress)
- Loopback bypass gating (blocked when audience === "ingress")
- Hosted mode DB token blocking (DB tokens rejected for control-plane in hosted mode)
- Customer identity derivation (when audience === "ingress" && role !== "operator")

### Code
- `src/db/identity.ts` — audience column, AuthTokenAudience type
- `src/nex/control-plane/auth.ts` — audience checks in authenticateRequest, loopback bypass
- `src/nex/control-plane/server-runtime-config.ts` — audience-specific token checks
- 8 HTTP handler files — Pass audience to auth calls
- 1 WebSocket file — audience in connect/reconnect auth
- 2 server infrastructure files — Two HTTP servers on different ports
- 1 ingress-credentials file — Hardcoded audience="ingress"
- 3 config files — audience in runtime config schema
- 3 CLI files — --audience flags
- ~7 test files — audience in test fixtures

---

## Target State

### Unified Auth System
- **One HTTP server** — All routes on one port (default 18789)
- **No audience field** — Removed from auth_tokens table and all code
- **Role-based access** — IAM policies + roles/scopes determine access

### Token System
- **auth_tokens table:** No audience column
- **Token lookup:** No filtering — all tokens work on all endpoints
- **Token creation:** No audience parameter

### Access Control Replacements
1. **Loopback bypass:** Gate on `role === "operator"` instead of audience
2. **Hosted mode:** Gate on auth method (trusted JWTs work for operator-level ops, DB tokens work for non-operator roles)
3. **Customer anti-spoofing:** Gate on `role === "customer"` — identity hints ignored

### Operations (6 ops from spec)
- `auth.tokens.list` — List tokens (filter by entity, role, status)
- `auth.tokens.create` — Create token (specify role, scopes, expiry)
- `auth.tokens.revoke` — Revoke a token (soft revocation via revoked_at)
- `auth.tokens.rotate` — Atomic rotate: create new + revoke old
- `auth.passwords.set` — Set/change password for an entity
- `auth.login` — Password login → returns token

---

## Changes Required

### This Workplan Wraps AUDIENCE_REMOVAL_CUTOVER.md

**AUDIENCE_REMOVAL_CUTOVER.md** already contains a detailed breakdown of all 131 audience occurrences across 28 files. That workplan covers:
- Removing audience from DB schema
- Updating all HTTP handlers
- Fixing loopback bypass logic
- Fixing hosted mode logic
- Updating config schema
- Updating CLI flags
- Test updates

**This workplan ADDS:**
- Operations alignment (ensure all 6 auth operations exist)
- Namespace changes (auth.users.* → auth.tokens.*, auth.tokens.ingress.* → auth.tokens.*)
- Two-server collapse decision
- Operation registration

### Database Schema Changes

**File:** `src/db/identity.ts`

1. **Drop audience column from auth_tokens:**
```sql
-- Migration:
ALTER TABLE auth_tokens DROP COLUMN audience;
```

2. **Remove AuthTokenAudience type:**
```typescript
// DELETE:
export type AuthTokenAudience = "control-plane" | "ingress";
```

3. **Update createAuthToken function:**
   - Remove `audience` parameter
   - Remove audience from INSERT

4. **Update resolveAuthTokenByValue:**
   - Remove audience filter from WHERE clause

5. **Update listAuthTokens:**
   - Remove audience filter option

### Core Auth Changes

**File:** `src/nex/control-plane/auth.ts`

1. **Remove audience from authenticateRequest:**
```typescript
// OLD:
function authenticateRequest(
  db: DatabaseSync,
  token: string,
  audience: AuthTokenAudience
): ResolvedAuthToken | null

// NEW:
function authenticateRequest(
  db: DatabaseSync,
  token: string
): ResolvedAuthToken | null
```

2. **Replace loopback bypass check:**
```typescript
// OLD:
if (isLoopback && audience === "control-plane") {
  // allow bypass
}

// NEW:
if (isLoopback && auth.role === "operator") {
  // allow bypass
}
```

3. **Replace hosted mode check:**
```typescript
// OLD:
if (hostedMode && audience === "control-plane" && authMethod === "db") {
  throw new Error("DB tokens not allowed for control-plane in hosted mode");
}

// NEW:
if (hostedMode && auth.role === "operator" && authMethod === "db") {
  throw new Error("DB tokens not allowed for operator-level operations in hosted mode");
}
```

4. **Replace customer identity check:**
```typescript
// OLD:
if (audience === "ingress" && auth.role !== "operator") {
  // ignore identity hints (anti-spoofing)
}

// NEW:
if (auth.role === "customer") {
  // ignore identity hints (anti-spoofing)
}
```

**File:** `src/nex/control-plane/server-runtime-config.ts`
- Remove audience-specific hasActiveAuthTokens checks
- Remove ingress auth config separation

### HTTP Handler Changes (8 files)

**Files:**
- `src/nex/control-plane/http-control-handlers.ts`
- `src/nex/control-plane/http-control-adapter.ts`
- `src/nex/control-plane/http-control-browser-apps.ts`
- `src/nex/control-plane/tools-invoke-http.ts`
- `src/nex/control-plane/http-ingress/openai-http.ts`
- `src/nex/control-plane/http-ingress/openresponses-http.ts`
- `src/nex/control-plane/http-ingress/hooks-http.ts`
- `src/nex/control-plane/http-ingress/webchat-session-http.ts`

**Change pattern:**
```typescript
// OLD:
const auth = authenticateRequest(db, token, "control-plane");
const auth = authenticateRequest(db, token, "ingress");

// NEW:
const auth = authenticateRequest(db, token);
```

### WebSocket Changes (1 file)

**File:** `src/nex/control-plane/server/ws-connection/message-handler.ts`
- Remove `audience: "control-plane"` from connect/reconnect auth calls

### Server Infrastructure Changes (2 files)

**File:** `src/nex/control-plane/server-http.ts`
**File:** `src/nex/control-plane/server-runtime-state.ts`

**Decision: Option A — Collapse to one server**

1. **Merge HTTP servers:**
   - All routes on single HTTP server (port 18789)
   - Remove ingress server (port 18790)
   - Ingress routes become regular routes on main server

2. **Config simplification:**
   - Single `port` config (remove separate ingress port)
   - Single bind address (if needed)
   - Network isolation via reverse proxy (not server split)

3. **Route registration:**
   - All control-plane routes registered
   - All ingress routes registered
   - Same auth middleware for all routes (no audience)

### Ingress Credentials Changes (1 file)

**File:** `src/nex/control-plane/server-methods/ingress-credentials.ts`

1. **Remove hardcoded audience:**
```typescript
// OLD:
createAuthToken(db, {
  audience: "ingress",
  entity_id,
  role,
  scopes,
  ...
});

// NEW:
createAuthToken(db, {
  entity_id,
  role,
  scopes,
  ...
});
```

2. **Update operation namespace:**
```typescript
// OLD: auth.users.*, auth.tokens.ingress.*
// NEW: auth.tokens.*, auth.passwords.*
```

### Config Schema Changes (3 files)

**Files:**
- `src/nex/config/schema.ts`
- `src/nex/config/types.runtime.ts`
- `src/nex/config/zod-schema.ts`

**Changes:**
- Remove `audience` from runtime config schema
- Remove `AuthTokenAudience` type references
- Remove audience validation from Zod schema
- Remove separate ingress port config (if collapsing servers)

### CLI Changes (3 files)

**Files:**
- `src/cli/acl-cli.ts`
- `src/cli/channels-cli.ts`
- `src/commands/channels/add.ts`

**Changes:**
- Remove `--audience` flag from token commands
- Remove audience references from token creation
- Update help text to reflect unified auth system

### Test Changes (~7 files)

**Files:**
- `src/nex/control-plane/auth.test.ts`
- Various e2e tests that set audience in configs

**Changes:**
- Remove audience from test fixtures
- Update assertions to not check audience
- Update test configs to remove audience fields
- Add tests for role-based loopback bypass
- Add tests for role-based hosted mode gating

### Operations Alignment

**Current namespace issues to fix:**

1. **auth.users.* → auth.tokens.*:**
   - Some existing code may use `auth.users.*` naming
   - Unified to `auth.tokens.*` per Batch 2 spec

2. **auth.tokens.ingress.* → auth.tokens.*:**
   - Ingress-specific token operations merged into unified namespace

3. **Verify all 6 operations exist:**
   - `auth.tokens.list` — Verify implementation
   - `auth.tokens.create` — Verify implementation
   - `auth.tokens.revoke` — Verify implementation
   - `auth.tokens.rotate` — Verify implementation (may need to add)
   - `auth.passwords.set` — Verify implementation
   - `auth.login` — Verify implementation

### Operations to Register

**Auth domain (6 ops):**
- `auth.tokens.list` — List tokens
- `auth.tokens.create` — Create token
- `auth.tokens.revoke` — Revoke token
- `auth.tokens.rotate` — Atomic rotate (create new + revoke old)
- `auth.passwords.set` — Set/change password
- `auth.login` — Password login → token

---

## Execution Order

### Phase 1: Core Auth Changes (CRITICAL PATH)
1. **Remove AuthTokenAudience type** — identity.ts
2. **Drop audience column** — identity.ts schema migration
3. **Update createAuthToken** — Remove audience parameter
4. **Update resolveAuthTokenByValue** — Remove audience filter
5. **Update authenticateRequest** — Remove audience parameter, add role-based checks

### Phase 2: Access Control Replacements
6. **Replace loopback bypass** — Gate on role === "operator"
7. **Replace hosted mode check** — Gate on auth method + role
8. **Replace customer identity check** — Gate on role === "customer"

### Phase 3: HTTP Layer (PARALLEL)
9. **Update all 8 HTTP handlers** — Remove audience from auth calls
10. **Update WebSocket handler** — Remove audience from auth calls
11. **Update ingress-credentials.ts** — Remove hardcoded audience

### Phase 4: Server Collapse
12. **Merge HTTP servers** — Collapse to single server
13. **Consolidate route registration** — All routes on one server
14. **Remove ingress server code** — Clean up dual-server logic

### Phase 5: Config & CLI
15. **Update config schema** — Remove audience fields
16. **Update CLI** — Remove --audience flags
17. **Update config docs** — Reflect unified server

### Phase 6: Testing
18. **Update auth.test.ts** — Remove audience from tests
19. **Update e2e tests** — Remove audience from fixtures
20. **Add role-based tests** — Loopback, hosted mode, customer gating
21. **Test server collapse** — All routes work on single server

### Phase 7: Operations Alignment
22. **Verify all 6 auth operations exist** — Check implementation
23. **Rename operations if needed** — auth.users.* → auth.tokens.*
24. **Register operations** — Add to nex server method registry
25. **Add auth.tokens.rotate** — If missing, implement atomic rotate

### Phase 8: Documentation & Cleanup
26. **Update API docs** — Reflect unified auth system
27. **Update deployment docs** — Single server configuration
28. **Grep for "audience"** — Verify zero occurrences (except in tests/docs)
29. **Update changelog** — Breaking change notice

---

## Notes

**Hard cutover:** No backwards compatibility. This is a breaking change. All tokens must be recreated without audience. Existing tokens with audience field will fail after schema migration.

**Token migration:** Optionally provide a migration script that:
1. Reads all existing tokens
2. Drops audience column
3. Tokens continue to work (just without audience filtering)

**Two-server collapse rationale:** IAM policies already handle access control. The two-server split was a network boundary partition — but this is better handled by reverse proxy in production. Simpler to have one server with policy-based access control.

**Hosted mode detail:** In hosted mode, frontdoor JWTs (from Claude.ai) are "trusted" and work for all operations. DB-backed tokens work for non-operator roles only. This prevents local token abuse in hosted environments.

**Loopback bypass detail:** When a request comes from localhost (127.0.0.1/::1), if the authenticated role is "operator", bypass all IAM checks. This allows the owner to always access their local instance. Non-operator roles still go through IAM even on loopback.

**Customer anti-spoofing:** When role === "customer", identity hints from the request (X-Entity-Id header, etc.) are ignored. The entity_id is derived from the token only. This prevents customers from spoofing other users' identities in multi-tenant deployments.

**Operations namespace:** Per Batch 2 spec, all auth operations use `auth.tokens.*` and `auth.passwords.*` namespaces. No `auth.users.*` or `auth.tokens.ingress.*` naming.

**AUDIENCE_REMOVAL_CUTOVER.md integration:** This workplan references and wraps the existing detailed cutover workplan. When executing, follow AUDIENCE_REMOVAL_CUTOVER.md for the specific file changes, then add the operations alignment work from this workplan.
