# Hosted Workspace UX + Lifecycle

**Status:** DESIGN (review before implementation)  
**Last Updated:** 2026-02-23  
**Related:**
- `HOSTED_FRONTDOOR_PER_TENANT_RUNTIME.md`
- `HOSTED_FRONTDOOR_MULTI_WORKSPACE.md`
- `HOSTED_DIRECT_BROWSER_RUNTIME_CONTRACT.md`
- `SINGLE_TENANT_MULTI_USER.md`

---

## Purpose

Define the product UX and operating model for hosted Nexus before implementation:

1. account signup/login
2. workspace (tenant) creation policy
3. invite and membership lifecycle
4. multi-workspace switching
5. infra/service topology for test and production

---

## Core Definitions (Explicit)

### VPS

A virtual server (machine) from Hetzner/DigitalOcean/etc.

Example now:

- `oracle-1` is one VPS.

### Service

A running process on a VPS, usually managed by `systemd`.

Example now on `oracle-1`:

- `nexus-frontdoor.service`
- `nex-tenant-dev.service`

### Runtime (Nexus runtime service)

One long-running Nexus daemon process that owns one workspace’s data + execution.

### Tenant / Workspace

For hosted mode, these are treated as the same routing/security unit:

- one workspace == one tenant == one runtime target

(We may keep both claim names temporarily; `workspace_id` canonical, `tenant_id` mirrored for compatibility.)

---

## Live Snapshot (As Of 2026-02-23)

Current hosted deployment shape:

1. VPS count: **1** (`oracle-1`)
2. Frontdoor services: **1** (`nexus-frontdoor.service`)
3. Runtime services: **1** (`nex-tenant-dev.service`)
4. Configured workspaces/tenants in frontdoor: **1** (`tenant-dev`)

So: one machine, multiple services, one active tenant/runtime today.

---

## Product Surfaces

### 1) Frontdoor Backend (stateful)

Canonical responsibilities:

1. auth (Google/password now; OIDC providers extensible)
2. session management
3. workspace membership resolution
4. runtime token mint/refresh/revoke
5. runtime routing metadata

Canonical domain example:

- `frontdoor.nexushub.sh`

### 2) Shell Frontends (stateless)

Any number of branded frontends can exist and call the same frontdoor backend.

Examples:

- `shell.nexushub.sh` (platform shell)
- future product shells (`glowbot.com`, `oracle-tree.com`, etc.)

---

## Identity + Access Model

### Global account

A frontdoor user identity (OIDC subject or local account).

### Workspace membership

A mapping from user -> workspace with workspace-scoped principal projection:

- `entity_id`
- `roles`
- `scopes`

### Active workspace

Session-bound selected workspace used for token mint + runtime connect.

---

## UX Flows

## 1) Signup/Login

Primary flow:

1. user lands on shell
2. signs up/logs in with Google
3. frontdoor creates or resolves account
4. user sees workspace selection state

Operator fallback:

- username/password remains supported but hidden by default in customer-facing shell.

## 2) First-Time User States

After login, exactly one of:

1. no workspace memberships  
   - show “No workspace access yet”
   - show “Contact workspace admin” and invite code/link redemption CTA
2. one membership  
   - auto-select workspace
   - show “Open Workspace”
3. multiple memberships  
   - require explicit workspace selection
   - persist active workspace in session

## 3) Workspace Switching

UX requirement:

- top-level workspace switcher visible when membership count > 1

Behavior:

1. switching updates session active workspace
2. next token mint/connect targets selected workspace
3. no mixed-workspace state in one token/session call path

## 4) Workspace Creation

Policy (initial):

1. **owner-only** workspace creation in production
2. optional **dev override** for your operator account for testing speed
3. customer self-serve workspace creation disabled initially

Rationale:

- matches paid onboarding model
- keeps provisioning and billing/risk centralized while platform stabilizes

## 5) Invite Flow

### Workspace admin invites member

1. admin creates invite scoped to workspace + role
2. invitee opens invite link
3. invitee logs in or signs up
4. membership is attached to that workspace
5. invitee lands in workspace picker/open flow

### Invite constraints

1. invite must be workspace-scoped
2. invite cannot grant higher role than inviter’s grant authority
3. invite acceptance must be audited

---

## Role Model (Initial)

Initial workspace roles:

1. `workspace_owner`
2. `workspace_admin`
3. `workspace_member`
4. optional `workspace_viewer`

Permissions are enforced via IAM scopes/roles projected per workspace membership.

---

## Operational Model

## Testing Mode

Allowed:

1. multiple workspace runtimes on one VPS
2. fast iterative provisioning and teardown

Goal:

- maximize speed and reduce infrastructure cost during development.

## Production Mode

Target:

1. one VPS per paying customer workspace
2. one runtime service per VPS (plus local support services)
3. frontdoor can remain centralized as control/auth plane

Goal:

- hard customer isolation for credentials, agents, and runtime failure domains.

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

1. no client-chosen runtime host/tenant/workspace routing
2. one runtime token maps to exactly one workspace
3. workspace switch is server-side session state
4. invite tokens are single-purpose, scoped, expiring, and auditable
5. workspace role changes immediately affect future token minting

---

## Decisions Locked By This Spec

1. Keep both backend frontdoor domain and shell domain(s); this is expected and correct.
2. Owner-only workspace creation initially, with optional dev override for your account.
3. Workspace-scoped invite lifecycle with customer-admin delegated invites.
4. Multi-workspace switcher UX is first-class before broader self-serve onboarding.
5. Testing may multiplex tenants on one VPS; production targets one VPS per paying workspace.

---

## Out Of Scope (This Spec)

1. detailed billing/plan enforcement
2. legal/compliance data retention policy details
3. deep sandbox internals beyond IAM role/scope routing
4. cross-workspace shared memory/federation

