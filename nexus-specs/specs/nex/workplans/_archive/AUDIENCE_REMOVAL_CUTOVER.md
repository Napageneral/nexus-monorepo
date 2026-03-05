# Workplan: Remove Token Audience — Unify Auth System

**Status:** COMPLETED — included in WP3, commit e83386a96
**Created:** 2026-03-03
**Scope:** 131 occurrences across 28 files

---

## Goal

Remove the `audience` field from the auth token system entirely. The target is one unified auth system where roles and scopes (evaluated by IAM policies) determine what a token can do — not which HTTP server it was presented to.

**Hard cutover. No backwards compatibility.**

---

## Context

Currently there are TWO separate HTTP servers on different ports:
- Control-plane (default 18789) — accepts `audience: "control-plane"` tokens
- Ingress (default 18790) — accepts `audience: "ingress"` tokens

The audience field creates a network boundary partition: a stolen ingress token can't hit admin endpoints. But this is better achieved by IAM policies + roles/scopes, not by token audience.

The IAM system already has ZERO audience references — policies don't know about audiences. This is purely an auth infrastructure change.

---

## What Audience Currently Does

1. **Token lookup filtering** — `resolveAuthTokenByValue()` filters by audience so a control-plane token can't be used on ingress and vice versa
2. **Loopback bypass gating** — loopback bypass is blocked when `audience === "ingress"`
3. **Hosted mode DB token blocking** — in hosted mode, DB-backed tokens are rejected for `audience === "control-plane"` (only frontdoor JWTs work)
4. **Customer identity derivation** — when `audience === "ingress" && role !== "operator"`, identity hints are ignored (anti-spoofing)

## Target Replacements

1. **Token lookup** — Remove audience filter. All tokens work on all endpoints. IAM policies gate access.
2. **Loopback bypass** — Gate on role/scope instead. Loopback bypass allowed for `role: "operator"` only.
3. **Hosted mode** — Gate on auth method instead of audience. In hosted mode, only trusted tokens work for operator-level operations. DB tokens work for non-operator roles.
4. **Customer identity** — Gate on role. When `role === "customer"`, identity hints are ignored. No audience check needed.

---

## Files to Modify

### Database Schema (1 file)
- `src/db/identity.ts` — Remove `audience` column from auth_tokens table (or add migration to drop it). Remove `AuthTokenAudience` type. Remove `audience` from `resolveAuthTokenByValue`, `hasActiveAuthTokens`, `listAuthTokens`, `normalizeAudience`.

### Core Auth (2 files)
- `src/nex/control-plane/auth.ts` — Remove `audience` from `authenticateRequest`, `authorizeRuntimeConnect`, `RuntimeAuthResult`. Replace audience checks with role/scope checks. Fix loopback bypass logic. Fix hosted mode logic.
- `src/nex/control-plane/server-runtime-config.ts` — Remove audience-specific `hasActiveAuthTokens` checks. Remove ingress auth config separation.

### HTTP Handlers (8 files)
- `src/nex/control-plane/http-control-handlers.ts` — Remove `audience: "control-plane"` from auth calls
- `src/nex/control-plane/http-control-adapter.ts` — Same
- `src/nex/control-plane/http-control-browser-apps.ts` — Same
- `src/nex/control-plane/tools-invoke-http.ts` — Same
- `src/nex/control-plane/http-ingress/openai-http.ts` — Remove `audience: "ingress"`, replace with role check
- `src/nex/control-plane/http-ingress/openresponses-http.ts` — Same
- `src/nex/control-plane/http-ingress/hooks-http.ts` — Same
- `src/nex/control-plane/http-ingress/webchat-session-http.ts` — Same

### WebSocket (1 file)
- `src/nex/control-plane/server/ws-connection/message-handler.ts` — Remove `audience: "control-plane"` from connect/reconnect auth

### Server Infrastructure (2 files)
- `src/nex/control-plane/server-http.ts` — Consider merging the two HTTP servers into one (or keeping as deployment option)
- `src/nex/control-plane/server-runtime-state.ts` — Consider collapsing dual server creation

### Ingress Credentials (1 file)
- `src/nex/control-plane/server-methods/ingress-credentials.ts` — Remove hardcoded `audience: "ingress"`. Make token creation accept role/scopes without audience.

### Config (3 files)
- `src/nex/config/schema.ts` — Remove audience from runtime config schema
- `src/nex/config/types.runtime.ts` — Remove audience type references
- `src/nex/config/zod-schema.ts` — Remove audience validation

### CLI (3 files)
- `src/cli/acl-cli.ts` — Remove `--audience` flag from token commands
- `src/cli/channels-cli.ts` — Remove audience references
- `src/commands/channels/add.ts` — Remove audience references

### Test Files (~7 files)
- `src/nex/control-plane/auth.test.ts`
- Various e2e tests that set audience in configs
- Update test fixtures and assertions

---

## Two-Server Collapse (Optional)

The two-server split can either:

**Option A: Collapse to one server.** All routes on one port. Simpler. IAM policies handle access control. Different bind addresses become a reverse proxy concern.

**Option B: Keep as deployment option.** One server is the default. Two-server mode is opt-in config for deployments that want network-level separation. Both servers share the same auth system (no audience).

Recommendation: **Option A** for simplicity, with the understanding that reverse proxy configuration handles network isolation in production.

---

## Execution Order

1. Remove `AuthTokenAudience` type and `audience` column logic from `db/identity.ts`
2. Update `auth.ts` — replace all audience checks with role/scope equivalents
3. Update all HTTP handlers — remove audience parameters from auth calls
4. Update ingress-credentials.ts — unified token creation
5. Update config schema — remove audience config
6. Update CLI — remove --audience flags
7. Update tests
8. (Optional) Collapse two HTTP servers into one
