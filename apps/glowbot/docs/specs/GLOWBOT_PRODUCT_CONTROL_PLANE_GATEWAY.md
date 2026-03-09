# GlowBot Product Control Plane Gateway

> Canonical target-state transport model for clinic-facing GlowBot app calls to
> the dedicated GlowBot product control plane.

---

## Purpose

This document defines how the clinic-facing GlowBot app reaches
`glowbot-hub` without direct hub URLs or tenant-local hub credentials.

It exists to make six things explicit:

1. what the clinic app calls
2. what the runtime calls
3. what frontdoor authenticates and routes
4. how frontdoor recognizes the correct GlowBot control plane
5. what the hub receives
6. which direct-call patterns are not canonical

Related canon:

- [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)
- [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
- [HOSTED_PRODUCT_CONTROL_PLANES.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_PRODUCT_CONTROL_PLANES.md)
- [HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md)

---

## Customer Experience

The intended experience is:

1. the clinic uses GlowBot normally inside the tenant app
2. GlowBot can publish benchmark snapshots and fetch peer benchmark data
3. the clinic app does not know or care where the GlowBot control plane is
   deployed
4. the clinic app does not ship a direct hub base URL or a product-control-plane
   secret into the tenant runtime
5. frontdoor remains the one hosted gateway for product-control-plane traffic
   from tenant runtimes

From the clinic's perspective, this is just GlowBot working.

From the platform perspective, the routing and trust boundaries stay clean.

---

## Non-Negotiable Design Rules

1. The clinic-facing GlowBot app does not call `glowbot-hub` directly by base
   URL.
2. Browser code does not call `glowbot-hub` directly.
3. The tenant runtime is the only tenant-side caller of product-control-plane
   APIs.
4. Frontdoor is the only runtime-facing gateway for clinic app ->
   product-control-plane traffic.
5. Frontdoor authenticates the runtime before any relay happens.
6. Frontdoor verifies that the requesting app is actually installed on the
   server before routing a request.
7. Frontdoor resolves the product control plane route by authoritative `app_id`
   routing metadata.
8. The hub authenticates frontdoor as a private caller.
9. The tenant runtime must not persist a long-lived token that directly grants
   access to `glowbot-hub`.

---

## Canonical Call Path

The call path is:

1. clinic UI calls a normal GlowBot app method
2. the GlowBot app method calls a runtime-facing product-control-plane gateway
3. the runtime sends a private request to frontdoor
4. frontdoor authenticates the runtime and resolves:
   - `server_id`
   - `tenant_id`
   - `entity_id`
   - `app_id`
5. frontdoor verifies the app is installed on that server
6. frontdoor resolves the product control plane route by `app_id`
7. frontdoor relays the request to `glowbot-hub`
8. `glowbot-hub` executes the product operation and returns JSON
9. frontdoor returns that result to the runtime
10. the GlowBot app method returns the shaped result to the clinic UI

---

## Canonical Routing Model

Frontdoor recognizes the owning product control plane from product control plane
route metadata keyed by `app_id`.

Canonical route fields:

- `app_id`
- `base_url`
- `auth_token_ref`
- `status`

Meaning:

- `app_id`
  - the installed app whose clinic-runtime traffic should route to the product
    control plane
- `base_url`
  - the private base URL for the product control plane service
- `auth_token_ref`
  - frontdoor-side secret pointer used for frontdoor -> product-control-plane
    calls
- `status`
  - route health/availability state

GlowBot's canonical route key is `app_id = "glowbot"`.

---

## Canonical GlowBot Operations

The clinic app should consume hub-backed product behavior through the gateway
for operations such as:

```text
glowbotHub.clinicProfiles.resolve
glowbotHub.benchmarks.publishSnapshot
glowbotHub.benchmarks.query
glowbotHub.productFlags.list
```

The exact runtime-facing method name for the generic gateway is owned by the
hosted/runtime canon, not by GlowBot.

GlowBot's locked requirement is behavioral:

- clinic app calls a runtime-facing product-control-plane gateway
- runtime calls frontdoor
- frontdoor resolves the route by `app_id`
- frontdoor relays to `glowbot-hub`

GlowBot must not bypass that path.

---

## Canonical Forwarded Context

Frontdoor must forward authoritative hosted context to `glowbot-hub`.

Required context:

- `server_id`
- `tenant_id`
- `entity_id`
- `app_id`
- operation identity
- request payload

When relevant, forwarded context may also include:

- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- `scope`
- `managed_profile_id`

The hub trusts frontdoor's authenticated context, not self-declared browser or
tenant payload fields.

---

## Why Direct Hub URLs Are Not Canonical

The following are explicitly non-canonical for the clinic-facing app:

- `GLOWBOT_HUB_BASE_URL` in clinic runtime env
- browser -> hub direct fetches
- clinic runtime -> hub direct bearer token calls
- per-clinic co-installation of `glowbot-hub`

Reasoning:

- the clinic app should not need hub route knowledge
- tenant runtimes should not own product-control-plane auth secrets
- frontdoor already owns authoritative hosted routing and install truth

`glowbot-admin` may call the co-installed hub locally through
`ctx.app.service("hub")` on the dedicated control-plane server. That
operator-side local service bridge is valid for admin-only workflows. It is
not the target model for the clinic-facing app.

---

## Relationship To Managed Connection Relays

This gateway model intentionally mirrors the managed-connection gateway model.

Common pattern:

1. runtime authenticates to frontdoor
2. frontdoor resolves authoritative hosted context
3. frontdoor resolves the product control plane route by `app_id`
4. frontdoor relays to the product control plane

Difference:

- managed connection relays are for adapter auth/profile operations
- product-control-plane gateway calls are for product APIs such as benchmark
  publication, benchmark query, clinic-profile resolution, and product flags

The route metadata and trust boundary should be reused rather than reinvented.

---

## Validation Expectations

This model is not considered real until all of these are true:

1. the clinic app can publish benchmark snapshots without direct hub URLs
2. the clinic app can query peer benchmark data without direct hub URLs
3. frontdoor verifies installed-app context before relaying
4. frontdoor resolves the GlowBot control plane route by `app_id`
5. `glowbot-hub` rejects unauthenticated private requests
6. clinic runtimes do not hold long-lived hub auth secrets
