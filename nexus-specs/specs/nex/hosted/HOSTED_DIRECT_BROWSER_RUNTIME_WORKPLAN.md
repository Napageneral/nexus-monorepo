# Hosted Direct Browser Runtime Workplan

**Status:** ACTIVE (direct-mode profile plan)  
**Last Updated:** 2026-02-27  
**Depends On:**
- `HOSTED_DIRECT_BROWSER_RUNTIME_CONTRACT.md`
- `HOSTED_RUNTIME_PROFILE.md`
- `../ingress/SINGLE_TENANT_MULTI_USER.md`
- `../ingress/INGRESS_INTEGRITY.md`

---

## Goal

Implement the direct-mode hosted profile:

1. user logs in at frontdoor
2. frontdoor issues short-lived runtime token + runtime endpoint descriptor
3. browser connects directly to tenant runtime HTTP/WS/SSE
4. runtime enforces trusted-token auth + IAM

Alignment note:

1. This workplan targets direct mode as one supported profile.
2. Product app onboarding/launch flows may remain frontdoor-routed by canonical architecture.

---

## Scope

In scope:

- frontdoor auth/session + token APIs
- runtime direct connection bootstrap contract
- runtime hosted CORS/origin enforcement for cross-origin browser access
- UI client bootstrap and token refresh behavior
- e2e validation for direct mode
- rollout/cutover plan from proxy mode

Out of scope:

- true multi-tenant-in-one-runtime architecture
- tenant sandboxing beyond existing IAM/policy controls
- adapter/channel migration work (separate stream)

---

## Current Baseline

Already implemented:

- hosted runtime trusted-token mode and tenant pinning
- frontdoor login/session/token/refresh/revoke APIs
- frontdoor runtime proxy (`/runtime/*`, `/app/*`) + tests
- runtime hosted-mode auth guards (HTTP/WS/SSE)
- ingress integrity and control-plane IAM taxonomy

Main gap:

- direct browser -> runtime data path is not yet integrated where this profile is enabled.

---

## Workstreams

## WS1 — Contract + Config Finalization

Deliverables:

1. Freeze runtime descriptor schema returned by frontdoor token APIs.
2. Freeze frontdoor tenant config schema for direct-mode routing metadata.
3. Freeze runtime hosted CORS/origin config keys.

Required schema changes:

Frontdoor tenant config (extend current `runtimeUrl`):

```ts
type TenantConfig = {
  id: string;
  runtimeUrl: string; // existing; may remain for internal ops compatibility
  runtimePublicBaseUrl: string; // new canonical browser target
  runtimeWsUrl?: string; // optional override; default from runtimePublicBaseUrl
  runtimeSseUrl?: string; // optional override; default `${runtimePublicBaseUrl}/api/events/stream`
};
```

Runtime token response (from `/api/runtime/token*`) must include:

```ts
type RuntimeDescriptor = {
  tenant_id: string;
  base_url: string;
  http_base_url: string;
  ws_url: string;
  sse_url: string;
};
```

Acceptance:

1. Contract doc + config docs are consistent and complete.
2. No ambiguous field naming remains between proxy and direct modes.

---

## WS2 — Frontdoor Direct Bootstrap APIs

Code touchpoints (expected):

- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/types.ts`
- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/config.ts`
- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/server.ts`
- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/server.test.ts`

Implementation:

1. Extend `/api/runtime/token` and `/api/runtime/token/refresh` to return `runtime` descriptor.
2. Ensure tenant resolution returns canonical runtime public endpoints for browser clients.
3. Keep `/runtime/*` + `/app/*` available for frontdoor-routed product flows.
4. Add explicit version marker in response:
   - `runtime.connection_mode: "direct"` for new clients.

Acceptance:

1. Direct bootstrap payload returned for all authenticated sessions.
2. Frontdoor tests cover descriptor generation and tenant routing correctness.
3. No client-controlled fields can alter runtime descriptor or tenant selection.

---

## WS3 — Runtime Hosted CORS + Origin Enforcement

Code touchpoints (expected):

- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-http.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/origin-check.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/config/types.runtime.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/config/zod-schema.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/config/schema.ts`

Implementation:

1. Add hosted CORS allowlist config (if not already explicit) for control-plane HTTP:
   - allowed origins list
   - allowed methods
   - allowed headers (`Authorization`, `Content-Type`, etc.)
2. Support OPTIONS preflight for control-plane HTTP endpoints in hosted mode.
3. Reuse/extend existing WS origin checks to accept configured UI origins.
4. Reject wildcard origins in hosted mode.

Acceptance:

1. Browser calls from approved UI origins succeed.
2. Calls from unapproved origins fail (HTTP + WS).
3. Automated tests cover CORS preflight + deny/allow matrix.

---

## WS4 — Control UI Client Direct Runtime Mode

Code touchpoints (expected):

- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/public/index.html` (scaffold demo)
- Hosted control UI client package (where WS/HTTP runtime client is initialized; exact file path depends on current UI wiring)
- Runtime client connect flow (`connect.auth.token` path)

Implementation:

1. Frontdoor UI login flow calls `/api/runtime/token`.
2. Client stores runtime access token in memory (not localStorage).
3. Client connects directly to runtime:
   - HTTP: bearer token header
   - WS: `connect.auth.token`
   - SSE: bearer token header
4. Implement automatic refresh on:
   - `401` HTTP/SSE responses
   - WS connect auth failures / token expiry reconnect loop
5. Enable direct runtime transport for clients that opt into this profile.

Acceptance:

1. User can login once and interact with runtime directly from browser.
2. Token refresh happens without full re-login in normal expiry cycles.
3. Browser network panel shows runtime host direct traffic for control-plane calls.

---

## WS5 — Security + Audit Hardening

Code touchpoints (expected):

- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/server.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/auth.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-http.ts`

Implementation:

1. Add/propagate request correlation id:
   - frontdoor generated/request-forwarded ID
   - runtime logs include same correlation id
2. Ensure token endpoint rate limits remain strict in direct mode.
3. Add explicit key rotation runbook and compatibility tests for `kid` rollover.
4. Confirm no identity fallback paths:
   - no owner-default for hosted browser flows
   - principal comes from verified token claims

Acceptance:

1. Security logs can trace one request across frontdoor and runtime.
2. Key rotation can occur without dropping active sessions abruptly.
3. Hosted auth bypass regressions are blocked by tests.

---

## WS6 — End-To-End Validation

Required test suites:

1. Frontdoor unit/integration tests:
   - login/session/token lifecycle
   - runtime descriptor schema
   - tenant resolution correctness
2. Runtime hosted-mode tests:
   - trusted-token checks
   - tenant pinning
   - CORS + origin checks
3. Live-stack e2e:
   - frontdoor + real runtime, direct mode
   - browser login -> token -> direct health/WS/SSE
4. Cross-tenant isolation e2e:
   - token/runtime mismatch fails
   - no cross-tenant leakage

Success criteria:

1. All direct-mode suites pass consistently.
2. Direct-mode behavior is validated without regressing frontdoor-routed product flows.

---

## WS7 — Deployment And Cutover

Infrastructure requirements:

1. Frontdoor TLS endpoint (`app.<domain>`).
2. Per-tenant runtime TLS endpoints (`rt-<tenant>.<domain>` or equivalent).
3. DNS and certificate automation for runtime hostnames.
4. Runtime security groups/firewall rules suitable for direct browser access.

Cutover sequence:

1. Deploy frontdoor descriptor fields behind feature flag.
2. Deploy runtime CORS/origin allowlist.
3. Roll out UI client direct mode for internal tenants first.
4. Observe auth errors/reconnect behavior.
5. Promote direct mode where profile policy requires it.
6. Keep frontdoor-routed proxy paths for product onboarding/launch flows unless a separate canonical decision supersedes them.

Rollback:

1. UI falls back to proxy mode (temporary compatibility route) if direct mode fails.
2. Keep feature flag to disable direct mode per tenant.

---

## Implementation Order (Recommended)

1. WS1 (contract/config freeze)
2. WS2 (frontdoor descriptor APIs)
3. WS3 (runtime CORS/origin)
4. WS4 (UI direct-mode client)
5. WS6 (full e2e matrix)
6. WS5 (hardening polish if anything remains)
7. WS7 (progressive rollout/cutover)

---

## Definition Of Done

All are true:

1. Hosted UI login produces runtime token + descriptor.
2. Browser talks directly to tenant runtime for control-plane HTTP/WS/SSE.
3. Runtime validates trusted tokens + tenant pinning and enforces IAM.
4. Hosted cross-origin access is explicitly allowlisted (HTTP + WS).
5. Cross-tenant isolation is proven by automated tests.
6. Direct mode can coexist with frontdoor-routed product app flows without ambiguity.
