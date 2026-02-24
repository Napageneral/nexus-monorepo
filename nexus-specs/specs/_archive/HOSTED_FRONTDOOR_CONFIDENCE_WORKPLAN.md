# Hosted Frontdoor Confidence Workplan

**Status:** ACTIVE  
**Last Updated:** 2026-02-20  
**Related:**
- `HOSTED_FRONTDOOR_PER_TENANT_RUNTIME.md`
- `HOSTED_RUNTIME_PROFILE.md`
- `SINGLE_TENANT_MULTI_USER.md`
- `INGRESS_INTEGRITY.md`
- `CONTROL_PLANE_AUTHZ_TAXONOMY.md`

---

## Goal

Raise confidence from scaffold-level integration to production-like, repeatable validation for hosted frontdoor + per-tenant runtime.

---

## Current Baseline

Already passing:

1. Frontdoor scaffold tests (login, runtime token lifecycle, HTTP proxy, WS proxy).
2. Runtime hosted-mode tests (trusted token, tenant pinning).
3. Ingress credential/integrity bootstrap policy tests.

Main remaining gap: frontdoor tests currently proxy to a runtime stub rather than a real Nexus runtime process.

---

## Implementation Progress (2026-02-20)

1. Phase 1 — **COMPLETED**
2. Phase 2 — **COMPLETED**
3. Phase 3 — **COMPLETED**
4. Phase 4 — **COMPLETED**
5. Phase 5 — **COMPLETED**

Evidence:

1. New live-stack e2e in NEX:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server.frontdoor-live-stack.e2e.test.ts`
2. Frontdoor anti-spoof regression coverage:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/server.test.ts`
3. OIDC JWK verification coverage:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/oidc-auth.test.ts`
4. Browser smoke coverage:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server.frontdoor-browser-smoke.e2e.test.ts`
5. Path rewrite + runtime execution fixes in frontdoor:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/server.ts`

---

## Phased Workplan

## Phase 1 — Live-Stack E2E (Real Runtime + Real Frontdoor)

Build automated tests that run:

1. A real Nexus runtime server in hosted mode (`trusted_token`, tenant pinning enabled).
2. A real frontdoor server process configured to route to that runtime.
3. Real HTTP login flow + proxied runtime health request.
4. Real WS connect through frontdoor to runtime, proving trusted token propagation works end-to-end.

Acceptance:

1. Login succeeds and sets frontdoor session cookie.
2. `GET /runtime/health` through frontdoor returns runtime response.
3. WS connect/handshake through frontdoor succeeds without direct runtime token from browser.

---

## Phase 2 — Cross-Tenant Isolation E2E

Run one frontdoor with two tenant runtimes and prove no cross-tenant bleed.

Scenarios:

1. User/session for tenant A cannot reach tenant B runtime.
2. User/session for tenant B cannot reach tenant A runtime.
3. HTTP and WS paths both honor tenant routing.

Acceptance:

1. Runtime-visible tenant claims always match authenticated frontdoor session tenant.
2. Cross-tenant access attempts fail.

---

## Phase 3 — Proxy Integrity / Anti-Spoof Tests

Add explicit tests that caller-supplied headers cannot override frontdoor-stamped runtime identity headers.

Scenarios:

1. Client sends forged `Authorization` to frontdoor; runtime still sees frontdoor-minted token.
2. Client sends forged `x-nexus-frontdoor-tenant`; runtime still sees true session tenant.
3. Client sends forged `x-nexus-frontdoor-session`; runtime still sees frontdoor session id.

Acceptance:

1. Runtime receives only frontdoor-derived identity/routing headers.
2. No spoofed header can alter principal/tenant routing.

---

## Phase 4 — OIDC Hardening

Upgrade OIDC implementation from flow hooks to verified identity assertions.

Tasks:

1. Verify ID tokens using provider JWKs.
2. Enforce issuer/audience/nonce/exp checks.
3. Add tests with mock OIDC issuer keys and failure cases.

Acceptance:

1. Unverified/invalid ID token claims cannot mint sessions.
2. Verified claims map to configured frontdoor principal mappings only.

---

## Phase 5 — Browser Smoke

Automate a browser-level smoke test for the frontdoor shell path.

Scenarios:

1. User logs in from browser.
2. User triggers proxied runtime request.
3. UI shows success from live runtime.

Acceptance:

1. End-to-end UX works in real browser context.
2. No manual test-only assumptions required for hosted happy path.

---

## Validation Matrix

Minimum recurring suite:

1. `nexus-frontdoor` unit/integration tests.
2. `nex` hosted-mode + ingress e2e suites.
3. New live-stack e2e suite (Phase 1/2/3).

Release-gate additions:

1. OIDC verification suite (Phase 4).
2. Browser smoke suite (Phase 5).

---

## Execution Order

1. Phase 1 (highest confidence gain, lowest architecture risk).
2. Phase 2.
3. Phase 3.
4. Phase 4.
5. Phase 5.

---

## Decision Log

1. Keep per-tenant runtime architecture as canonical hosted model.
2. Use frontdoor as sole public entrypoint for hosted mode.
3. Prioritize hard runtime+proxy validation before broader UI/OIDC polish.
