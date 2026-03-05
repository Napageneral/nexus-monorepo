# Hosted Multi-Workspace Architecture

**Status:** DESIGN
**Last Updated:** 2026-02-23
**Related:**
- `HOSTED_RUNTIME_PROFILE.md`
- `HOSTED_DIRECT_BROWSER_RUNTIME_CONTRACT.md`
- `../ingress/SINGLE_TENANT_MULTI_USER.md`
- `../ingress/INGRESS_INTEGRITY.md`
- `../ingress/CONTROL_PLANE_AUTHZ_TAXONOMY.md`

---

## Summary

This spec defines how one authenticated user can access **multiple Nexus workspaces** from one hosted frontdoor system, covering the data model, API contracts, UX flows, operational model, and provisioning lifecycle.

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

1. **Frontdoor backend remains stateful and canonical** — owns auth, session, workspace resolution, runtime token minting, and routing decisions.
2. **Product shells are stateless clients** — any number of branded frontends target the same frontdoor backend.
3. **Workspace is the routing/security unit** — runtime tokens are minted for exactly one workspace at a time.
4. **User identity is global to frontdoor; principal is workspace-scoped** — a global user can be mapped to different runtime entity/roles/scopes per workspace membership.
5. **Explicit workspace selection is required when membership count > 1** — no implicit fallback to a random/default workspace.
6. **No client-controlled routing trust** — browser cannot choose arbitrary runtime target; frontdoor derives target from workspace membership only.
7. **Owner-only workspace creation initially** — with optional dev override for operator account. Customer self-serve disabled while platform stabilizes.
8. **Multi-workspace switcher UX is first-class** — before broader self-serve onboarding.
9. **Testing may multiplex tenants on one VPS; production targets one VPS per paying workspace.**

---

## Core Definitions

- **VPS**: a virtual server (machine) from Hetzner/DigitalOcean/etc.
- **Service**: a running process on a VPS, usually managed by `systemd`.
- **Runtime**: one long-running Nexus daemon process that owns one workspace's data + execution.
- **Tenant / Workspace**: for hosted mode, treated as the same routing/security unit. One workspace == one tenant == one runtime target. (`workspace_id` is canonical; `tenant_id` mirrored for compatibility.)
- **Frontdoor User**: global identity at frontdoor (OIDC sub or local username-backed account).
- **Membership**: mapping of `frontdoor_user_id -> workspace_id` with workspace-specific `entity_id`, roles, scopes.
- **Active Workspace**: selected workspace bound to current browser session context.

---

## Live Snapshot (As Of 2026-02-23)

Current hosted deployment shape:

1. VPS count: **1** (`oracle-1`)
2. Frontdoor services: **1** (`nexus-frontdoor.service`)
3. Runtime services: **1** (`nex-tenant-dev.service`)
4. Configured workspaces/tenants in frontdoor: **1** (`tenant-dev`)

So: one machine, multiple services, one active tenant/runtime today.

---

## Architecture

### 1) Frontdoor Backend (stateful)

Canonical responsibilities:

1. auth (Google/password now; OIDC providers extensible)
2. session management
3. workspace membership resolution
4. runtime token mint/refresh/revoke
5. runtime routing metadata

Canonical domain example: `frontdoor.nexushub.sh`

### 2) Shell Frontends (stateless)

Any number of branded frontends can exist and call the same frontdoor backend.

Examples: `shell.nexushub.sh`, `glowbot.com`, `oracle-tree.com`

---

## Identity + Access Model

### Global account

A frontdoor user identity (OIDC subject or local account).

### Workspace membership

A mapping from user -> workspace with workspace-scoped principal projection:

`(user_id, workspace_id) -> { entity_id, roles, scopes }`

Result:

- same human can be `operator` in workspace A
- same human can be `member` in workspace B
- same human can map to different `entity_id` values across workspaces

### Role model (initial)

1. `workspace_owner`
2. `workspace_admin`
3. `workspace_member`
4. optional `workspace_viewer`

Permissions are enforced via IAM scopes/roles projected per workspace membership.

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

### Runtime Token Claims (Workspace-Aware)

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

## UX Flows

### 1) Signup/Login

Primary flow:

1. user lands on shell
2. signs up/logs in with Google
3. frontdoor creates or resolves account
4. user sees workspace selection state

Operator fallback:

- username/password remains supported but hidden by default in customer-facing shell.

### 2) First-Time User States

After login, exactly one of:

1. no workspace memberships
   - show "No workspace access yet"
   - show "Contact workspace admin" and invite code/link redemption CTA
2. one membership
   - auto-select workspace
   - show "Open Workspace"
3. multiple memberships
   - require explicit workspace selection
   - persist active workspace in session

### 3) Workspace Switching

UX requirement:

- top-level workspace switcher visible when membership count > 1

Behavior:

1. switching updates session active workspace
2. next token mint/connect targets selected workspace
3. no mixed-workspace state in one token/session call path

### 4) Workspace Creation

Policy (initial):

1. **owner-only** workspace creation in production
2. optional **dev override** for your operator account for testing speed
3. customer self-serve workspace creation disabled initially

Rationale: matches paid onboarding model; keeps provisioning and billing/risk centralized while platform stabilizes.

### 5) Invite Flow

Workspace admin invites member:

1. admin creates invite scoped to workspace + role
2. invitee opens invite link
3. invitee logs in or signs up
4. membership is attached to that workspace
5. invitee lands in workspace picker/open flow

Invite constraints:

1. invite must be workspace-scoped
2. invite cannot grant higher role than inviter's grant authority
3. invite acceptance must be audited

---

## Operational Model

### Testing Mode

Allowed:

1. multiple workspace runtimes on one VPS
2. fast iterative provisioning and teardown

Goal: maximize speed and reduce infrastructure cost during development.

### Production Mode

Target:

1. one VPS per paying customer workspace
2. one runtime service per VPS (plus local support services)
3. frontdoor can remain centralized as control/auth plane

Goal: hard customer isolation for credentials, agents, and runtime failure domains.

---

## Provisioning Lifecycle (Operator-Managed)

Canonical sequence:

1. create workspace record (frontdoor)
2. provision runtime host/service (VPS + runtime config + systemd)
3. register runtime endpoint metadata in frontdoor
4. create workspace owner membership(s)
5. issue invite(s) for customer admins/members
6. customer logs in and lands in workspace

Deprovision sequence:

1. disable workspace in frontdoor (stop new tokens)
2. revoke active refresh/session tokens for workspace members
3. stop runtime service
4. archive/export data per policy
5. destroy runtime host when safe

---

## Required Admin UX Surfaces

Frontdoor admin plane must support:

1. list/create/disable workspaces
2. list workspace memberships
3. invite/revoke invites
4. force-remove member from workspace
5. set default workspace for user
6. view runtime health per workspace
7. audit trail for membership/invite/workspace lifecycle actions

---

## Security Invariants

1. **Membership-gated routing only** — no API may accept caller-provided runtime URL/host.
2. **One token = one workspace** — token claims and runtime descriptor must agree.
3. **No identity spoofing through workspace selection** — entity/roles/scopes derive from membership row, never request payload.
4. **Session-bound active workspace** — active workspace state is server-side.
5. **Auditability** — log workspace selection events and runtime token mint workspace id.
6. **Invite tokens are single-purpose, scoped, expiring, and auditable.**
7. **Workspace role changes immediately affect future token minting.**

---

## Integration with Existing Frontdoor Code (Gap Map)

Current code hotspots requiring redesign:

- `src/types.ts` — `UserConfig` currently has single `tenantId/entityId` (must move to membership model)
- `src/session-store.ts` — session principal currently encodes fixed tenant
- `src/tenant-resolver.ts` — currently `principal.tenantId -> tenant`
- `src/oidc-auth.ts` — mapping currently resolves to one tenant principal
- `src/autoprovision-store.ts` — OIDC account primary key maps to single tenant; must split identity link + memberships
- `src/server.ts` — `/api/auth/session`, `/api/runtime/token` currently assume single fixed tenant per session

---

## Cutover Plan

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
- Per-workspace billing/usage metering model (see `OPERATOR_OWNER_BILLING_DASHBOARD.md`)
- OIDC organization/team mapping strategy beyond membership data model
- Detailed billing/plan enforcement
- Legal/compliance data retention policy details
- Deep sandbox internals beyond IAM role/scope routing
