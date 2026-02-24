# Hosted Frontdoor Multi-Workspace Access

**Status:** DESIGN (review before implementation)  
**Last Updated:** 2026-02-23  
**Related:**
- `HOSTED_FRONTDOOR_PER_TENANT_RUNTIME.md`
- `HOSTED_DIRECT_BROWSER_RUNTIME_CONTRACT.md`
- `SINGLE_TENANT_MULTI_USER.md`
- `INGRESS_INTEGRITY.md`
- `CONTROL_PLANE_AUTHZ_TAXONOMY.md`

---

## Summary

This spec defines how one authenticated user can access **multiple Nexus workspaces** from one hosted frontdoor system.

Canonical shape:

1. one stateful frontdoor backend (auth/session/token/routing authority)
2. one or more product shell frontends (Vercel or otherwise)
3. one runtime per workspace (isolation boundary)
4. one user identity that can have memberships across many workspaces
5. explicit workspace selection before runtime token mint/connect

---

## Why This Exists

Current frontdoor behavior is effectively **single-workspace per login identity**.

Current mapping shape (from code):

- OIDC account mapping resolves directly to one `tenantId`
- password users resolve directly to one `tenantId`
- session stores a principal that already includes one fixed `tenantId`
- runtime token mint uses that fixed tenant

That blocks:

- one user switching between multiple workspaces
- one person operating multiple businesses/projects (Glowbot, Oracle Tree, Intent Systems, etc.)
- shared frontdoor account with role-based access across many workspaces

---

## Decision Set (Locked)

1. **Frontdoor backend remains stateful and canonical**
   - It owns auth, session, workspace resolution, runtime token minting, and routing decisions.
2. **Product shells are stateless clients**
   - Any number of branded frontends can target the same frontdoor backend.
3. **Workspace is the routing/security unit**
   - Runtime tokens are minted for exactly one workspace at a time.
4. **User identity is global to frontdoor; principal is workspace-scoped**
   - A global user can be mapped to different runtime entity/roles/scopes per workspace membership.
5. **Explicit workspace selection is required when membership count > 1**
   - no implicit fallback to a random/default workspace.
6. **No client-controlled routing trust**
   - browser cannot choose arbitrary runtime target; frontdoor derives target from workspace membership only.

---

## Domain and Surface Model

Two kinds of public origins are valid and expected:

1. **Frontdoor API/backend origin** (stateful)
   - Example: `https://frontdoor.nexushub.sh`
2. **Shell frontend origin(s)** (stateless)
   - Example: `https://shell.nexushub.sh`, `https://glowbot.com`, `https://oracle-tree.com`

All shell frontends call the same frontdoor API origin.

---

## Terminology

- **Frontdoor User**: global identity at frontdoor (OIDC sub or local username-backed account).
- **Workspace**: one isolated Nexus runtime target with its own state/ledgers/config.
- **Membership**: mapping of `frontdoor_user_id -> workspace_id` with workspace-specific `entity_id`, roles, scopes.
- **Active Workspace**: selected workspace bound to current browser session context.

---

## Target Data Model (Frontdoor)

### 1) Users (global)

`frontdoor_users`

- `user_id` (pk)
- `username` (optional for password auth)
- `email` (optional)
- `display_name`
- `disabled`
- `created_at_ms`, `updated_at_ms`

### 2) Identity links

`frontdoor_identity_links`

- `provider` (e.g. `google`, `password`)
- `subject` (OIDC `sub` or local user key)
- `user_id` (fk -> `frontdoor_users.user_id`)
- `created_at_ms`, `updated_at_ms`
- unique `(provider, subject)`

### 3) Workspaces (routable runtimes)

`frontdoor_workspaces`

- `workspace_id` (pk)
- `workspace_slug`
- `display_name`
- `runtime_url`
- `runtime_public_base_url`
- `runtime_ws_url` (optional)
- `runtime_sse_url` (optional)
- `state_dir` (optional ops metadata)
- `status` (`active`/`disabled`)
- `created_at_ms`, `updated_at_ms`

### 4) Memberships (authorization + principal projection)

`frontdoor_workspace_memberships`

- `user_id` (fk)
- `workspace_id` (fk)
- `entity_id` (workspace-local runtime principal id)
- `roles_json`
- `scopes_json`
- `is_default` (boolean)
- `created_at_ms`, `updated_at_ms`
- pk `(user_id, workspace_id)`

### 5) Sessions

`frontdoor_sessions` (existing table extended)

- existing session fields
- `user_id` (global)
- `active_workspace_id` (nullable until selection)
- `auth_context_json` (optional: provider/amr metadata)

---

## Principal Projection Model

Frontdoor resolves user once, then projects a workspace-scoped principal:

`(user_id, workspace_id) -> { entity_id, roles, scopes }`

This is what gets embedded into runtime access tokens.

Result:

- same human can be `operator` in workspace A
- same human can be `member` in workspace B
- same human can map to different `entity_id` values across workspaces

---

## API Contract Changes

### `GET /api/auth/session` (extended)

Returns global auth state plus workspace context summary:

```json
{
  "authenticated": true,
  "user_id": "user_123",
  "display_name": "Tyler Brandt",
  "email": "tyler@example.com",
  "workspace_count": 3,
  "active_workspace_id": "ws_oracle_tree",
  "active_workspace_display_name": "Oracle Tree"
}
```

### `GET /api/workspaces`

Lists caller memberships:

```json
{
  "ok": true,
  "items": [
    {
      "workspace_id": "ws_glowbot",
      "display_name": "Glowbot",
      "is_default": true,
      "status": "active",
      "roles": ["operator"],
      "scopes": ["*"]
    }
  ]
}
```

### `POST /api/workspaces/select`

Request:

```json
{
  "workspace_id": "ws_glowbot"
}
```

Response:

```json
{
  "ok": true,
  "active_workspace_id": "ws_glowbot"
}
```

Behavior:

- validates membership
- stores active workspace on session
- rejects non-member workspace with `403`

### `POST /api/runtime/token` (workspace-aware)

Rules:

- if request includes `workspace_id`, validate membership and set active workspace
- if omitted, use `active_workspace_id`
- if no active workspace and membership count is 1, auto-select that workspace
- if no active workspace and membership count > 1, return `409 workspace_selection_required`

Response extends existing contract:

```json
{
  "ok": true,
  "workspace_id": "ws_glowbot",
  "tenant_id": "ws_glowbot",
  "entity_id": "entity:operator:tyler",
  "access_token": "<jwt>",
  "runtime": {
    "tenant_id": "ws_glowbot",
    "base_url": "https://rt-ws-glowbot.example.com",
    "http_base_url": "https://rt-ws-glowbot.example.com",
    "ws_url": "wss://rt-ws-glowbot.example.com/",
    "sse_url": "https://rt-ws-glowbot.example.com/api/events/stream"
  }
}
```

---

## Runtime Token Claims (Workspace-Aware)

Required claims:

- existing required claims from hosted contract
- `workspace_id` (new canonical routing unit)
- `entity_id`
- `scopes`

Recommended:

- `roles`
- `session_id`
- `client_id`

Compatibility note:

- `tenant_id` can remain mirrored to `workspace_id` initially.
- runtime pinning should validate the configured workspace/tenant id match.

---

## Shell UX Contract

### Login + selection flow

1. user authenticates (Google/password)
2. shell reads `/api/auth/session`
3. shell reads `/api/workspaces`
4. behavior:
   - 0 workspaces: show “no workspace assigned”
   - 1 workspace: auto-select and enable launch
   - >1 workspaces: show workspace picker before launch

### Workspace switch

- shell exposes a workspace switcher
- switch calls `/api/workspaces/select`
- next token mint/launch uses selected workspace

### Operator fallback visibility

- keep operator/password flow hidden by default in customer shell
- expose only under explicit operator mode

---

## Security Invariants

1. **Membership-gated routing only**
   - no API may accept caller-provided runtime URL/host.
2. **One token = one workspace**
   - token claims and runtime descriptor must agree.
3. **No identity spoofing through workspace selection**
   - entity/roles/scopes derive from membership row, never request payload.
4. **Session-bound active workspace**
   - active workspace state is server-side.
5. **Auditability**
   - log workspace selection events and runtime token mint workspace id.

---

## Integration with Existing Frontdoor Code (Gap Map)

Current code hotspots requiring redesign:

- `src/types.ts`
  - `UserConfig` currently has single `tenantId/entityId` (must move to membership model)
- `src/session-store.ts`
  - session principal currently encodes fixed tenant
- `src/tenant-resolver.ts`
  - currently `principal.tenantId -> tenant`
- `src/oidc-auth.ts`
  - mapping currently resolves to one tenant principal
- `src/autoprovision-store.ts`
  - OIDC account primary key maps to single tenant; must split identity link + memberships
- `src/server.ts`
  - `/api/auth/session`, `/api/runtime/token` currently assume single fixed tenant per session

---

## Cutover Plan (Spec-Level, Pre-Implementation)

### Phase 1: Data model

- introduce users + identity links + workspaces + memberships schema
- backfill existing single-tenant users into one membership each

### Phase 2: Session + API

- add active workspace to session
- add `/api/workspaces` + `/api/workspaces/select`
- update `/api/runtime/token` to enforce selection semantics

### Phase 3: Shell

- add workspace picker and switcher
- enforce selection-required UX when count > 1

### Phase 4: Hardening

- add audit events for workspace switch + token mint workspace
- add tests for cross-workspace isolation and non-member deny

---

## Acceptance Criteria

1. A user with 3 memberships can switch workspaces and receive tokens for the selected workspace only.
2. A token minted for workspace A cannot access runtime B.
3. A user cannot select or mint tokens for a workspace without membership.
4. If user has >1 memberships and no active workspace, `/api/runtime/token` returns `workspace_selection_required`.
5. Shell displays deterministic workspace selection flow and never exposes debug token controls in customer mode.

---

## Out of Scope (This Spec)

- Cross-workspace shared memory/data federation
- Per-workspace billing/usage metering model
- Invite lifecycle UX details
- OIDC organization/team mapping strategy beyond membership data model

