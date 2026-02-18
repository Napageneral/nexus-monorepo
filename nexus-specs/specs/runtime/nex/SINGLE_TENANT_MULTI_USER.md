# Single-Tenant, Multi-User Runtime

**Status:** PARTIALLY IMPLEMENTED (control-plane IAM authz + password login)  
**Last Updated:** 2026-02-18  
**Related:** `CONTROL_PLANE.md`, `../iam/ACCESS_CONTROL_SYSTEM.md`, `../iam/POLICIES.md`, `../adapters/INTERNAL_ADAPTERS.md`, `../adapters/INBOUND_INTERFACE.md`

---

## Summary

Nexus is a **single-tenant** system: one shared workspace (team/family/business) with shared ledgers/state/config.

Inside that tenant, Nexus is **multi-user**:

- multiple **operator principals** (Control UI + CLI users)
- optional **customer/untrusted principals** (webhooks, API-compat clients, customer webchat)

All agent work MUST enter the NEX pipeline as a `NexusEvent` and be authorized/audited by IAM.

This spec defines:

1. trust zones (control-plane vs ingress)
2. the canonical identity model (Option 2: identity mapping via `(delivery.channel, delivery.sender_id)`)
3. the concrete implementation changes required to support "hosted UI login -> per-user IAM" with no spoofing.

---

## Current Implementation Status (2026-02-18)

Implemented in `nex`:

- Control-plane IAM authorization via a centralized action/resource taxonomy (Option A, not `NexusEvent`).
- WS dispatcher enforcement for `path=iam` methods + audit logging with first-class control-plane operation columns.
- Control-plane HTTP `GET /health` + `GET /api/events/stream` are authenticated + IAM-authorized.
- Password-based control-plane login (`POST /api/auth/login`) issuing DB-backed `auth_tokens` (audience `control-plane`).
- Control-plane user management WS methods:
  - `auth.users.list`
  - `auth.users.create`
  - `auth.users.setPassword`
- System ingress channels reduced to the minimal internal set (`clock`, `boot`, `restart`).

Still required (not yet implemented):

- OIDC auth provider (pluggable AuthN backends beyond username/password).
- First-class “customer ingress credential” issuance UX (API keys / webchat sessions) beyond the CLI (`nexus acl tokens create --audience ingress`).
- Adapter ingress integrity hardening (daemon-stamped fields + adapter channel claims validation).
- Customer sandbox enforcement verification (tool/credential/data enforcement tests and remaining enforcement gaps).

---

## Goals

- **Single-tenant, multi-user** is a core invariant (shared state, per-principal IAM).
- **No spoofing**: clients cannot choose their principal; principals are derived from verified auth or trusted upstream identities.
- **Canonical identity mapping**:
  - `resolveIdentity` produces a real principal for all non-system ingress.
  - `delivery.sender_id` is stable and meaningful for IAM policy matching + audit.
- **Explicit trust zones**:
  - control-plane is privileged (operators)
  - ingress surfaces are adapter-managed (may be external/untrusted)
- **One IAM boundary**:
  - any request that can run an agent is IAM-authorized inside the NEX pipeline
  - control-plane operations are also IAM-authorized + audited (even if they are not `NexusEvent`s).

---

## Non-Goals

- True multi-tenant hosting (many unrelated orgs/workspaces served by one daemon process).
- Backward compatibility with upstream gateway/god-token behaviors.
- Treating a compromised adapter process as "untrusted"; adapters are part of the runtime's trusted computing base. (We still add integrity checks to prevent accidental impersonation.)

---

## Definitions

- **Tenant**: a single Nexus workspace with shared ledgers/config/state.
- **Principal**: identity making a request (owner/operator/member/customer/integration/system).
- **Operator**: privileged principals that can access control-plane surfaces (UI/CLI/admin APIs).
- **Customer / untrusted principal**: a principal allowed to send ingress events but sandboxed by IAM (persona routing + tool/credential/data restrictions).
- **Control-plane**: management surface (UI + CLI + WS RPC + health + bus stream).
- **Ingress**: any surface that can trigger work (adapters + event sources).

---

## Trust Zones (One Daemon, Two Surfaces)

This split is a *network/surface boundary*, not "two IAM systems". IAM remains one spectrum of permissions.

### A) Control-Plane Listener (privileged)

Responsibilities:

- Control UI hosting + avatars/media
- WS RPC for UI/CLI/nodes (management + chat UX)
- health + metrics + bus SSE stream
- privileged services (example: tools invoke as a control-plane operation)

Defaults:

- bound to loopback
- authenticated
- IAM-authorized for every operation

### B) Ingress Surfaces (adapter-managed)

All external protocol bridges are adapters (process or internal adapters) and MUST emit `NexusEvent`:

- webhook bridges
- OpenAI/OpenResponses compatibility APIs
- customer webchat
- clock/timer event source
- channel integrations (Discord/Telegram/WhatsApp/iMessage/etc)

Network-facing ingress should be hosted by an internal adapter (example: `http-ingress`) with its own bind/port, separate from control-plane. See `../adapters/INTERNAL_ADAPTERS.md`.

---

## Canonical Identity Model (Option 2)

**Identity is resolved from `(delivery.channel, delivery.sender_id)`** using the identity ledger.

Normative requirements:

1. For any network-facing ingress (HTTP/WS/webchat/OpenAI-compat/webhooks), `delivery.sender_id` MUST be **daemon-derived** from verified auth. It MUST NOT be user-controlled.
2. For channel adapters, `delivery.sender_id` MUST be derived from the upstream platform identity (Discord user id, Telegram user id, phone number, etc).
3. Any user-provided identity fields (example: OpenAI `user`) are metadata only and MUST NOT affect principal resolution.
4. `resolveIdentity` MUST NOT default to "system" based on channel except for explicit internal event sources.

### Identity ledger mapping

The identity ledger maps:

- `contacts(channel, identifier)` (observed senders)
- `identity_mappings(channel, identifier) -> entities(id)`
- `entities(id)` (people/personas/orgs)

Resolution is:

```
principal = resolve(channel, sender_id)
```

If no mapping exists:

- principal is `unknown`
- runtime applies `unknown_sender_policy` (default: deny)

---

## System Principal (Minimal)

"System principal" exists only for internal, non-user event sources:

- `clock` (timer ticks)
- `boot` (startup automation)
- `restart` (restart sentinel)

Everything else MUST resolve to a real principal via identity mapping:

- `control-plane` (operators)
- `webchat` (customer webchat, or operator chat if explicitly scoped)
- `openai`, `openresponses`
- `hooks` (webhooks/integrations)
- `node` (paired nodes/devices)
- channel adapters (`discord`, `telegram`, `whatsapp`, `imessage`, ...)

Cron is non-canonical; use the clock adapter + automations.

---

## Canonical Channel Semantics (How Sender IDs Are Derived)

This table defines the required source of truth for `delivery.sender_id` by ingress type.

### Control-plane WS (UI/CLI)

- `delivery.channel`: `control-plane`
- `delivery.sender_id`: stable user subject from auth
  - recommended: `oidc:<sub>` (OIDC) or `user:<uuid>` (local user DB)
- `delivery.sender_name`: display name from mapped identity entity

Auth requirement:

- WS handshake authenticates a user and binds the connection to a subject.
- WS methods that emit `NexusEvent` MUST use the authenticated user subject, not hardcoded `owner`.

### Local owner-only default (bootstrap mode)

Default mode can remain "local owner only", but it must still behave like the canonical model:

- local owner connections map to a stable owner identity (seeded mapping is OK)
- hosted mode MUST disable any local-direct auth bypasses

### Node events (paired nodes/devices)

- `delivery.channel`: `node`
- `delivery.sender_id`: stable node id derived from pairing (example: `node:<device_id>`)
- principal mapping: `identity_mappings(node, node:<device_id>) -> entity`

Default mapping:

- a newly paired node maps to the pairing operator (often the owner) unless explicitly re-assigned.

### Webhooks / hooks ingress

- `delivery.channel`: `hooks` (or a more specific channel like `webhook`)
- `delivery.sender_id`: derived from verified secret/signature, not headers/body
  - example: `hook:<hook_id>` or `integration:<integration_id>`
- principal mapping: `identity_mappings(hooks, hook:<hook_id>) -> entity`
  - entity can represent an integration principal, or a specific customer principal if desired

### OpenAI / OpenResponses compatibility

- `delivery.channel`: `openai` or `openresponses`
- `delivery.sender_id`: derived from the presented credential (API key / JWT), not request JSON
  - example: `api_key:<key_id>`
- request fields like `user` are metadata only

### Customer webchat

- `delivery.channel`: `webchat`
- `delivery.sender_id`: derived from a daemon-issued session token, not from request JSON
  - anonymous sessions: `webchat:<session_id>`
  - logged-in sessions: `user:<uuid>` (or `oidc:<sub>`) if the customer authenticates

---

## Preventing Spoofing (Integrity Rules)

Spoofing opportunities are primarily at network-facing ingress surfaces (HTTP + WS), not platform adapters.

Normative rules:

1. Network-facing ingress MUST derive `delivery.sender_id` from verified auth and MUST ignore any caller-provided identity claims.
2. Control-plane connections MUST authenticate per-user (not shared-secret) in hosted mode.
3. Adapter monitor ingress MUST enforce channel integrity:
   - adapter events may only claim `delivery.channel` values declared for that adapter
   - adapters may never claim privileged internal channels (`control-plane`, `runtime`, etc)
4. "System by channel" shortcuts are prohibited except for the minimal internal sources listed above.

---

## Current Implementation (What Is Missing Today)

This section reflects the current code shape in `nex` as of this spec date.

### A) Control-plane auth is a shared runtime secret, not per-user identity

Today:

- WS and control-plane HTTP are authenticated using a runtime token/password (plus optional device pairing).
- This does not produce a per-user subject for IAM.

Needed:

- add a per-user authentication system for the control-plane (OIDC and/or local username+password)
- authenticate every WS connection and bind it to a stable user subject
- make every WS method + control-plane HTTP endpoint authorize via IAM using that principal

### B) Several ingress channels are forcibly treated as "system"

Today:

- multiple channels are considered "system ingress" (including `openai`, `openresponses`, `node`, `hooks`, etc)
- identity resolution short-circuits to a system principal for these channels

Needed:

- reduce "system ingress" channels to: `clock`, `boot`, `restart` (and optionally internal-only `runtime`)
- ensure `openai/openresponses/node/hooks/webchat/control-plane` resolve via identity mapping
- remove cron as a system ingress concept

### C) Owner default is hardcoded for control-plane chat/webchat

Today:

- control-plane/webchat event emission often uses `sender_id: "owner"` via bootstrapped identity mapping

Needed:

- keep owner-only bootstrap mode for local default, but:
  - hosted mode must require real per-user auth and use that user subject for sender_id

### D) HTTP OpenAI/OpenResponses/tools invoke/hooks are authenticated as operator, not as customer/users

Today:

- OpenAI/OpenResponses endpoints use runtime auth and may incorporate caller-provided identity fields
- hooks uses a shared hook token and is treated as system ingress
- tools invoke is privileged and uses runtime auth (fine for control-plane, not for customer ingress)

Needed:

- define per-principal credential types for ingress:
  - API keys for OpenAI/OpenResponses compat
  - webhook secrets/signatures for hooks/webhooks
  - webchat session tokens (and optionally customer login)
- derive sender_id from those credentials
- keep tools invoke as a control-plane operation (loopback by default)

---

## Required Work (Implementation Checklist)

### 1) Control-plane per-user auth + principal binding

- Add a control-plane AuthN system:
  - hosted: OIDC (Google/Apple/etc) and/or local username+password
  - local bootstrap: owner-only loopback mode (explicitly configured)
- Issue session tokens (HTTP cookie + bearer token for CLI/WS).
- WS handshake must validate a session token and set a stable subject (sender_id).
- Persist/resolve identity:
  - ensure identity mapping exists for `(control-plane, <subject>)`
  - if not, follow a provisioning policy (invite-only or auto-provision as `unknown`/restricted until approved)
- Authorize control-plane operations with IAM:
  - map each method to an IAM action/resource and evaluate policies/grants
  - audit all operations (not just agent runs)

### 2) Remove system-by-channel shortcuts

- Reduce system ingress channels to minimal set (`clock`, `boot`, `restart` [+ internal-only `runtime` if kept]).
- Ensure `resolveIdentity` always consults identity mapping for all other channels.
- Delete/retire cron ingress and replace with clock adapter + automations.

### 3) Fix network-facing ingress identity derivation

- OpenAI/OpenResponses:
  - introduce API keys bound to principals
  - derive `sender_id` from the key, not request payload
  - treat OpenAI `user` as metadata only
- Webhooks/hooks:
  - support per-integration secrets/signatures
  - derive `sender_id` from verified secret/signature
  - map to integration/customer entities as needed
- Webchat:
  - issue daemon-managed session tokens
  - optionally support customer login (OIDC) for stable identity mapping

### 4) Adapter ingress integrity checks

- Enforce that adapter-emitted `delivery.channel` matches the adapter definition.
- Forbid adapters from emitting privileged internal channels.
- Optionally normalize `delivery.account_id`/`delivery.peer_kind` based on adapter config.

### 5) Customer sandbox enforcement (IAM is necessary but not sufficient)

- Ensure IAM decisions are enforced in runtime:
  - tool allow/deny is applied to actual tool availability/execution
  - credentials access is enforced (not just recorded)
  - `data_access` is enforced in context assembly (history/memory boundaries)

---

## Migration Strategy (Big Bang)

1. Land control-plane per-user auth (subject-bearing sessions), keep local bootstrap mode for owner.
2. Remove system-ingress classification for `openai/openresponses/node/hooks/webchat/control-plane`.
3. Implement ingress credentials (API keys, webhook secrets, webchat sessions) and derive sender_id exclusively from them.
4. Add adapter ingress integrity checks.
5. Tighten customer sandbox enforcement (tools/credentials/data).

---

## Open Questions

1. Provisioning policy for new control-plane users:
   - invite-only (operators pre-created)
   - or auto-provision with a restricted default role/tag requiring approval
2. Node identity semantics in multi-user:
   - nodes as separate principals vs nodes acting "on behalf of" a paired operator
3. Customer identity model:
   - anonymous sessions vs always-authenticated customers vs hybrid
