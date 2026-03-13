# Hosted Runtime Profile

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:**
- `HOSTED_APP_PLATFORM_CONTRACT.md`
- `HOSTED_OBJECT_TAXONOMY.md`
- `HOSTED_PLATFORM_ACCESS_AND_ROUTING.md`
- `HOSTED_ACCOUNT_AND_SERVER_ACCESS.md`
- `HOSTED_TENANT_ORIGIN_RUNTIME_ACCESS.md`

---

## Purpose

This document defines the target-state runtime behavior for hosted Nex servers.

It answers one question:

what must the runtime enforce when it is running as the hosted runtime on a
frontdoor-managed server?

---

## Hosted Customer Experience

From the customer's perspective:

1. frontdoor authenticates the human or client
2. frontdoor resolves the target server/runtime
3. the runtime accepts authorized traffic for that server only
4. apps, adapters, callbacks, and upgrades run inside that runtime boundary

The runtime is strict and predictable. It does not guess identity, trust local
shortcuts, or silently widen access in hosted mode.

---

## Hosted Runtime Invariants

When running in hosted mode, the runtime must enforce all of the following:

1. every runtime HTTP, WebSocket, and SSE request is authenticated
2. principal identity comes from verified token claims, not request body hints
3. tenant pinning is mandatory
4. IAM authorization applies before method execution
5. local-direct hosted-platform bypasses are disabled
6. reusable adapter callbacks and reusable adapter webhooks route through the runtime-owned adapter surfaces
7. private package lifecycle mutation is available only through trusted operator endpoints

---

## Request Classes

Hosted runtime traffic falls into two classes.

### 1. Public runtime access

Used for:

- app UI runtime calls
- WebSocket transport
- direct tenant-origin browser or machine access
- runtime-owned adapter auth/setup callbacks
- runtime-owned reusable adapter webhooks

Authenticated with:

- runtime access token, or
- provider-specific callback verification where the route is a provider callback/webhook surface

### 2. Private operator access

Used for:

- package install
- package uninstall
- package upgrade
- health probes for lifecycle operations
- other frontdoor-only operator traffic

Authenticated with:

- runtime trusted token

---

## Token Verification Requirements

### Runtime access token

The runtime must verify:

- signature
- issuer
- audience
- expiry and issued-at
- `tenant_id`
- `entity_id`

Recommended:

- replay mitigation for `jti`
- bounded clock skew
- explicit role and scope claim validation

On success, the runtime binds:

- principal entity id
- roles
- scopes
- optional session/client metadata

### Runtime trusted token

The runtime must separately verify trusted operator credentials used by
frontdoor.

Rules:

1. trusted operator credentials are never a browser contract
2. trusted operator credentials do not bypass tenant pinning
3. trusted operator credentials authorize operator endpoints only

---

## Hosted Transport Behavior

### Shell-profile traffic

For traffic proxied through frontdoor:

1. frontdoor resolves the target server/runtime
2. frontdoor forwards the request or socket
3. the runtime still verifies runtime access for the target tenant/runtime

### Tenant-origin traffic

For direct `t-<tenantId>.nexushub.sh` traffic:

1. the runtime accepts direct HTTP/WS/SSE
2. runtime access token verification is still mandatory
3. allowed browser origins must be explicit

The protocol is the same in both profiles. Only the transport path changes.

---

## Callback And Webhook Ownership

The runtime owns reusable adapter ingress under:

- `/auth/<service>/...`
- `/adapters/<service>/webhooks/...`

Rules:

1. provider auth/setup logic for shared adapters lives here
2. reusable provider webhook verification lives here
3. app-specific business callbacks do not live here

App-specific external callbacks remain under app-owned paths:

- `/app/<appId>/callbacks/...`
- `/app/<appId>/webhooks/...`

---

## Private Operator Endpoint Boundary

Hosted lifecycle mutation is runtime-owned but private.

Canonical operator endpoints:

- `POST /api/operator/packages/install`
- `POST /api/operator/packages/uninstall`
- `POST /api/operator/packages/upgrade`
- `GET /api/operator/packages/<kind>/<packageId>`
- `GET /api/operator/packages/<kind>/<packageId>/health`

Rules:

1. these endpoints require trusted operator auth
2. they are not part of the browser/client contract
3. they must enforce tenant pinning and package validation

---

## Hosted Configuration Surface

Canonical runtime behavior requires configuration for:

- hosted mode enablement
- tenant id pinning
- runtime access token verification
- trusted operator credential verification
- explicit allowed browser origins for direct tenant-origin access

Illustrative shape:

```json
{
  "runtime": {
    "hostedMode": true,
    "tenantId": "tenant_clinic_a_prod",
    "auth": {
      "accessToken": {
        "issuer": "https://frontdoor.nexushub.sh",
        "audience": "nex-runtime"
      },
      "trustedOperator": {
        "issuer": "https://frontdoor.nexushub.sh",
        "audience": "nex-operator"
      }
    },
    "allowedBrowserOrigins": [
      "https://frontdoor.nexushub.sh",
      "https://t-tenant_clinic_a_prod.nexushub.sh"
    ]
  }
}
```

Exact field names may change. The required behavior does not.

---

## Validation Matrix

Required checks:

1. valid runtime access token + matching tenant -> allow subject to IAM
2. valid token + tenant mismatch -> deny
3. invalid signature -> deny
4. missing auth on runtime HTTP/WS/SSE -> deny
5. browser origin outside allowlist for direct tenant-origin access -> deny
6. runtime-owned adapter callback route enforces correct flow completion and tenant derivation
7. private operator endpoint without trusted auth -> deny
8. operator endpoint with trusted auth but wrong tenant context -> deny

---

## Non-Negotiable Rules

1. hosted mode is a strict runtime security profile
2. the runtime never trusts frontdoor session cookies directly
3. the runtime never treats `workspace` as the public hosted selection unit
4. provider callbacks do not move into app namespaces just to satisfy one app
5. package lifecycle mutation does not leak into public client APIs
