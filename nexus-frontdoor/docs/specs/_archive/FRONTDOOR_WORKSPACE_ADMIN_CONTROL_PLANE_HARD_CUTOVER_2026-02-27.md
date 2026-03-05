# Frontdoor Workspace Admin Control Plane (Hard Cutover)

Date: 2026-02-27
Owners: Nexus Frontdoor
Status: Approved for implementation

> **Terminology note (2026-03-04):** This spec uses "workspace" throughout. In the current system, "workspace" = "server". The canonical terminology is "server" (see FRONTDOOR_ARCHITECTURE.md). Content is still valid.

## 1. Customer Experience Goal

Frontdoor must be a functional control plane, not a thin login shell.
After Google sign-in, a user should be able to:

1. See all workspaces they can access.
2. Select active workspace and launch it when an app exists.
3. See operational state (workspace status, provisioning state, usage, billing).
4. Perform admin actions if they have admin/owner/operator roles:
   - invite collaborators,
   - inspect existing invites,
   - revoke invites,
   - inspect workspace members,
   - edit workspace runtime binding/settings,
   - manage runtime access keys/tokens.
5. Sign out.

## 2. Research Findings (Current State)

### 2.1 Root issue reported by user
`Open Workspace` appears inert because current frontdoor shell does not expose enough context and falls back poorly when no launchable runtime app is available. The current page has minimal controls and minimal diagnostics.

### 2.2 Existing backend capabilities (already implemented)
Frontdoor already supports:

- Session/auth:
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
  - `GET /api/auth/oidc/start`
  - `GET /api/auth/oidc/callback/:provider`
- Workspace access:
  - `GET /api/workspaces`
  - `POST /api/workspaces/select`
  - `POST /api/workspaces` (creator/operator)
  - `GET /api/workspaces/provisioning/status`
- Workspace admin/operator insights:
  - `GET /api/operator/workspaces`
  - `GET /api/workspaces/:id/usage`
  - `GET /api/workspaces/:id/billing/summary`
  - `GET /api/billing/:id/subscription`
  - `GET /api/billing/:id/invoices`
  - `POST /api/billing/:id/checkout-session`
- Invite flow:
  - `GET /api/workspaces/:id/invites`
  - `POST /api/workspaces/:id/invites`
  - `POST /api/invites/redeem`
- Runtime token flow:
  - `POST /api/runtime/token`
  - `POST /api/runtime/token/refresh`
  - `POST /api/runtime/token/revoke`

### 2.3 Current frontdoor shell gaps
Current `public/index.html` exposes only:
- Google sign in,
- Open workspace,
- sign out,
- optional operator password form.

Missing from shell UX:
- workspace inventory UI,
- workspace admin actions (invite lifecycle, member view),
- runtime key management,
- operational telemetry panels.

### 2.4 Data/model support already present
`WorkspaceStore` already persists:
- workspaces,
- memberships,
- invites,
- usage,
- billing.

Missing API surface for UX parity:
- list workspace members,
- revoke invite endpoint,
- workspace settings update endpoint,
- runtime auth token lifecycle endpoints.

## 3. Hard-Cutover Decision

Do not keep the current minimal shell UX. Replace it with a full control-plane shell in frontdoor immediately.

No backward compatibility UI mode.

## 4. Scope

### 4.1 Backend additions
Add these endpoints:

1. `GET /api/workspaces/:workspaceId/members`
- Auth required.
- Allowed for workspace admin/owner/operator.
- Returns member list with identity + roles/scopes + default flag.

2. `PATCH /api/workspaces/:workspaceId`
- Auth required.
- Allowed for workspace admin/owner/operator.
- Supports updating:
  - `display_name`
  - `status` (`active` | `disabled`)
  - `runtime_url`
  - `runtime_public_base_url`
  - `runtime_ws_url`
  - `runtime_sse_url`
- Persists via `WorkspaceStore.upsertWorkspace` and updates in-memory `config.tenants` binding.

3. `DELETE /api/workspaces/:workspaceId/invites/:inviteId`
- Auth required.
- Allowed for workspace admin/owner/operator.
- Revokes invite.

4. Runtime key/token management endpoints:
- `POST /api/workspaces/:workspaceId/runtime-auth-token/rotate`
  - Generates new random token server-side and stores it.
  - Returns generated token once.
- `POST /api/workspaces/:workspaceId/runtime-auth-token/set`
  - Accepts caller-provided token.
  - Stores token.
- `DELETE /api/workspaces/:workspaceId/runtime-auth-token`
  - Clears stored token.

5. `GET /api/workspaces/:workspaceId/settings`
- Auth required.
- Allowed for workspace admin/owner/operator.
- Returns runtime/settings metadata including `has_runtime_auth_token` (without leaking token value).

### 4.2 UI replacement
Replace current frontdoor shell with a full control-plane page that includes:

1. Auth/Header
- signed-in identity pill,
- sign in/out,
- global status/feedback.

2. Workspace Manager
- list/select accessible workspaces,
- set active workspace,
- open workspace app,
- visible reason when launch is unavailable.

3. Provisioning + Runtime Health
- latest provisioning status/stage/error,
- runtime app inventory status for selected workspace.

4. Admin: Members & Invites
- member list for selected workspace,
- create invite (role/scopes/ttl),
- list invites,
- revoke invite,
- redeem invite token.

5. Admin: Access & Keys
- workspace runtime settings form,
- rotate runtime auth token,
- set custom runtime auth token,
- clear runtime auth token.

6. Admin: Usage/Billing/Operator panels
- existing usage/billing summaries surfaced cleanly,
- operator workspace inventory surfaced for operator role.

### 4.3 Launch behavior
`Open Workspace` must no longer appear inert:
- If launchable app exists, route to app path with selected workspace.
- If no app exists, show explicit launch-unavailable reason and keep user in control-plane page.

## 5. Security/Authorization Rules

1. Reuse existing role checks:
- workspace admin set: `workspace_owner`, `workspace_admin`, `operator`.

2. Never expose stored runtime auth token by default in any GET route.

3. Keep same-origin protections and existing rate-limit middleware paths unchanged.

## 6. Non-Goals

1. No tenant runtime UI redesign in this change.
2. No new billing provider behavior changes.
3. No external IAM model redesign.

## 7. Acceptance Criteria

1. Frontdoor page shows workspace inventory and active workspace controls.
2. User can see workspace details and role-gated admin sections.
3. Admin can create/list/revoke invites and redeem invite token flow still works.
4. Admin can list workspace members.
5. Admin can update workspace runtime settings and runtime auth token state.
6. `Open Workspace` either launches app or returns explicit reason; never silent no-op.
7. Existing auth/runtime/billing tests remain green.
8. New endpoint tests pass for members/settings/token/invite-revoke.

## 8. Implementation Plan

1. Backend
- Extend `WorkspaceStore` with member listing query.
- Add server routes for members/settings/update/invite revoke/runtime token management.
- Ensure tenant config map is refreshed after workspace setting mutation.

2. UI
- Replace `public/index.html` with richer control-plane UX (single-file shell, inline script/css).
- Bind UI actions to existing/new API endpoints.
- Add clear in-page status feedback for all actions.

3. Tests
- Add API tests for new routes and permissions.
- Validate launch behavior path for no app and app-present scenarios in shell logic where possible.

## 9. Validation Plan

1. Local
- `pnpm build`
- `pnpm test`
- manual browser run via local frontdoor:
  - sign in,
  - select workspace,
  - create/revoke invite,
  - rotate/set/clear runtime token,
  - update runtime settings,
  - member listing,
  - open workspace behavior.

2. Hosted (Hetzner)
- deploy frontdoor binary/static shell,
- repeat same flow on `frontdoor.nexushub.sh` with real OIDC session.

