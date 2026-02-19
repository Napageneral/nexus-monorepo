# Ingress + Control-Plane Unification Plan

**Status:** IN PROGRESS  
**Last Updated:** 2026-02-19  
**Related:** `CONTROL_PLANE.md`, `SINGLE_TENANT_MULTI_USER.md`, `INGRESS_CREDENTIALS.md`, `INGRESS_INTEGRITY.md`, `CONTROL_PLANE_AUTHZ_TAXONOMY.md`, `../adapters/INTERNAL_ADAPTERS.md`

---

## Purpose

Lock the concrete build plan for two decisions:

1. **Control-plane management operations use direct IAM authorization** (not `NexusEvent` pipeline).
2. **HTTP protocol ingress is consolidated into one internal `http-ingress` adapter** with pluggable submodules.

This plan is the execution bridge from current runtime shape to one uniform model:

- control-plane = authenticated admin/control API
- ingress = adapter-managed event ingress to `NexusEvent -> nex.processEvent(...)`
- IAM/ACL = single authorization system across both

Implementation snapshot (2026-02-19):

- Phase 1 implemented in `nex`: control-plane WS methods for ingress credentials (`list/create/revoke/rotate`) with IAM taxonomy + runtime tests.
- Operator control UI now includes ingress credential management in the Approvals tab (filter/create/list/rotate/revoke) with browser tests.
- Phase 2 scaffold started: ingress HTTP route dispatch now runs through a dedicated internal `http-ingress` adapter boundary module with explicit submodules.
- `/api/ingress/webchat/session` moved into the `http-ingress` adapter (`webchat-session` submodule), removing direct handling from `server-http.ts`.
- Hook HTTP parsing/auth/mapping handler moved out of `server-http.ts` into dedicated `hooks-http.ts` ingress module; `server-http.ts` now delegates through `http-ingress` adapter.

---

## Scope

In scope:

- Control-plane token/credential management for ingress (`create/list/revoke/rotate`)
- Control-plane action/resource taxonomy updates for new methods
- `http-ingress` internal adapter framework and cutover targets
- Validation and enforcement tests

Out of scope:

- OIDC provider integration (future; password auth remains for now)
- Full channel adapter migration (Discord/Telegram/etc handled separately)
- Deep sandbox runtime isolation model beyond IAM/tool/credential/data/routing enforcement

---

## Decision 1: Control-Plane Ops Use Direct IAM Authorization

### Why

Control-plane methods are mostly administrative CRUD/read operations, not conversational/agent work.  
Running those methods through the full pipeline adds complexity without security gain.

### Chosen model

- Control-plane operations remain direct RPC/HTTP handlers.
- Every handler is AuthN + IAM-authorized using the canonical taxonomy (`control.<resource>.<action>`).
- Every decision is auditable through existing ACL audit logs.
- Any operation that runs an agent still enters the pipeline via `NexusEvent`.

### Tradeoff

- **Pros:** lower latency/overhead for CLI/UI admin actions; cleaner handler semantics.
- **Cons:** two execution paths exist (control-plane direct vs event pipeline), so taxonomy and tests must stay strict.

---

## Decision 2: Internal `http-ingress` Adapter

### Why

Ingress bridges (OpenAI/OpenResponses/webhooks/webchat) should be managed like adapters and must not be special-case daemon routes.

### Chosen model

- One supervised internal adapter: `http-ingress`.
- Submodules mounted inside that adapter:
  - `webchat-session`
  - `openai-compat`
  - `openresponses-compat`
  - `webhooks` (hooks/mappings)
- Submodules normalize inbound requests to `NexusEvent` and emit through `nex.processEvent(...)`.
- Daemon stamps integrity fields per `INGRESS_INTEGRITY.md`.

### Tradeoff

- **Pros:** uniform ingress model, centralized auth/integrity/rate-limit hooks, simpler ops surface.
- **Cons:** larger adapter module initially; requires careful routing cutover.

---

## Target Runtime Shape

1. One daemon process.
2. Two listener roles (same process):
   - **control-plane listener:** UI/CLI/admin API (IAM-authorized direct ops)
   - **ingress listener:** adapter-owned ingress (`http-ingress`), event-only
3. One IAM system for both:
   - control-plane: direct authorize
   - ingress event work: pipeline authorize

---

## Implementation Phases

## Phase 1: Ingress Credential Control-Plane Methods

Deliver:

- New WS methods:
  - `ingress.credentials.list`
  - `ingress.credentials.create`
  - `ingress.credentials.revoke`
  - `ingress.credentials.rotate`
- Taxonomy entries and IAM permissions:
  - `control.ingress.credentials.read`
  - `control.ingress.credentials.admin`
- Protocol schemas + validation
- Tests:
  - method coverage in taxonomy test
  - WS e2e happy path + IAM deny/allow
  - rotation behavior (old revoked, new active)

Notes:

- v1 targets `audience=ingress`.
- `create` returns token once; `list` never returns token value.

Status:

- Done (runtime methods, IAM taxonomy, protocol schemas, e2e tests, control UI wiring).

## Phase 2: `http-ingress` Internal Adapter Scaffolding

Deliver:

- Internal adapter definition and lifecycle hooks for `http-ingress`.
- Adapter-level route registration API for ingress submodules.
- Runtime supervision visibility (`status`, `health`, restart) through adapter manager.

Notes:

- Keep existing route behavior functionally equivalent during scaffold phase.

## Phase 3: Ingress Route Cutover

Deliver:

- Move route ownership from control-plane server module into `http-ingress` adapter submodules.
- Ensure each ingress path emits `NexusEvent` only (no direct run shortcuts).
- Preserve current auth modes while enforcing credential-derived principal model.

Progress:

- `webchat-session` cut over.
- Remaining major cutover targets: OpenAI compat, OpenResponses compat, hooks/mappings ownership cleanup.

## Phase 4: Hardening + Defaults

Deliver:

- Ingress integrity invariants fully enforced at adapter boundary.
- Default policy bundles validated end-to-end for `operator/member/customer/unknown`.
- Regression tests for:
  - no principal spoofing
  - token credential lifecycle
  - customer-safe restrictions

---

## Acceptance Criteria

1. Operators can manage ingress credentials from control-plane methods without CLI-only workflows.
2. All ingress HTTP bridges are adapter-owned (or behind adapter facade) and visible in adapter supervision.
3. Any agent-triggering ingress path is `NexusEvent -> nex.processEvent(...)`.
4. IAM policy/grant decisions are consistently enforceable and auditable for both control-plane and ingress.
5. Integrity violations are observable in audit + bus and covered by tests.

---

## Open Follow-Ups (Not Blocking This Plan)

1. OIDC provider plugin behind current auth interface.
2. Hosted control-plane session management UX (login/session refresh/logout flows).
3. Advanced API key UX (self-service, scoped templates, optional expirations by policy).
