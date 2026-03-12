# GlowBot Hub Service Shell

> Canonical target-state shell for `glowbot-hub` as GlowBot's product control
> plane service.

---

## Purpose

This document defines the reusable service-shell contract for `glowbot-hub`.

It exists to make six things explicit:

1. what `glowbot-hub` is
2. which problems it solves
3. which modules every GlowBot hub deployment must provide
4. which private HTTP contract frontdoor relays into
5. which product objects the shell owns before product-specific benchmark logic
6. which boundaries must stay out of the clinic runtime and out of the admin
   browser

This is a product-specific implementation of the shared hosted shell defined in:

- [Platform Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/platform-model.md)
- [Platform Packages and Control Planes](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/packages-and-control-planes.md)
- [Managed Connection Gateway](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/managed-connection-gateway.md)

This document does not redefine benchmark payloads or admin UI behavior in
detail. Those live in:

- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- [GLOWBOT_ADMIN_SURFACE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_ADMIN_SURFACE.md)

---

## Customer And Operator Experience

The intended experience is:

1. a clinic uses GlowBot inside its tenant runtime
2. the clinic never talks directly to GlowBot-managed provider secrets
3. when the clinic selects a GlowBot-managed connection profile, the runtime
   still talks to frontdoor
4. frontdoor authenticates the runtime and resolves authoritative hosted
   context
5. frontdoor relays the private request to `glowbot-hub` when GlowBot is the
   secret owner
6. `glowbot-hub` performs the secret-backed work and returns only the
   adapter-facing response needed by the runtime
7. GlowBot operators use `glowbot-admin` to inspect and manage the same hub
   state without handling long-lived provider secrets directly in the browser

From the clinic's perspective, GlowBot feels like one coherent product.

From the operator's perspective, GlowBot has:

- one dedicated control-plane server
- one admin app
- one private shared control-plane app

---

## Non-Negotiable Design Rules

1. `glowbot-hub` is GlowBot's product control-plane app.
2. `glowbot-hub` is not a second frontdoor and not a second tenant runtime.
3. `glowbot-hub` is the canonical owner of GlowBot-managed provider secrets.
4. `glowbot-admin` is operator UX over hub state. It is not the canonical
   secret owner.
5. Frontdoor remains the only runtime-facing managed-connection gateway.
6. Long-lived GlowBot-managed secrets must not live in clinic runtimes, app
   manifests, or admin browser code.
7. Shared adapters stay generic. `glowbot-hub` provides secret-backed inputs
   and secret-backed remote operations, not wrapper adapters.
8. Benchmark aggregation and product-control modules plug into the shell. They
   do not replace the shell.
9. The shell must support both managed-provider behavior and non-provider
   product control behavior.
10. The shell must be deployable on GlowBot's dedicated control-plane server as
    a real hosted package. In the current runtime install path that package is
    app-packaged and runs a package-local service.

---

## Problems The Shell Solves

### 1. Product-managed provider secrets

GlowBot-managed profiles need a long-lived secret owner.

That owner must not be:

- the clinic runtime
- the clinic app manifest
- the admin browser
- frontdoor by default

The hub shell provides that owner boundary.

### 2. Frontdoor relay target

The runtime always talks to frontdoor.

Frontdoor needs a product-specific relay target for GlowBot-managed profile
operations. The hub shell provides the stable private ingress for that relay.

### 3. Shared product backend

GlowBot needs shared product-control behavior that should not live in each
clinic server:

- benchmark aggregation
- cohort rules
- seed datasets
- product flags
- operator diagnostics
- audit trail

The hub shell is the home for those product-wide concerns.

### 4. Operator-facing backend

GlowBot operators need one stable backend that the admin app can use for:

- managed profile operations
- diagnostics
- configuration
- benchmark network operations
- support workflows

The shell gives the admin app that single product-control-plane boundary.

---

## Package Role And Deployment

`glowbot-hub` is the dedicated GlowBot control-plane package deployed on the
dedicated GlowBot product-control-plane server described in:

- [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)

It is:

- installed alongside `glowbot-admin` on the dedicated control-plane server
- not installed on normal clinic servers
- not browser-launchable
- privately reachable by frontdoor and locally callable by `glowbot-admin`

---

## Canonical Shell Modules

The GlowBot hub shell is made of six mandatory modules.

### `ingress`

Owns:

- frontdoor-authenticated private HTTP endpoints
- request normalization
- authoritative context parsing
- routing to the correct internal module

### `managedProfiles`

Owns:

- durable managed-profile registry
- profile lookup by full routing tuple
- profile lifecycle state
- profile status summaries

### `secrets`

Owns:

- secret reference resolution
- secret material retrieval on the server
- secret-backed exchange or token-minting operations
- rotation metadata

### `diagnostics`

Owns:

- hub process health summaries
- recent relay activity
- recent failures
- profile health
- operator-safe status surfaces

### `config`

Owns:

- product flags
- product-wide thresholds
- cohort configuration
- other GlowBot-wide support/configuration values

### `audit`

Owns:

- immutable record of private relay requests
- operator actions on managed profiles and config
- success/failure outcomes
- enough metadata to support incident review and operator diagnostics

---

## Private HTTP Contract

The hub shell must provide the private frontdoor relay contract defined by the
shared hosted shell.

Canonical endpoints:

```text
GET  /api/internal/frontdoor/managed-connections/profile
POST /api/internal/frontdoor/managed-connections/profile/exchange
```

### Request context

Every frontdoor relay request must carry authoritative hosted context:

- `server_id`
- `tenant_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- optional `managed_profile_id`

The hub must not trust app/profile headers on their own. It trusts frontdoor's
authenticated authoritative context.

### Auth model

The hub must authenticate frontdoor as a private caller.

Target-state expectations:

- frontdoor uses a private service-to-service auth credential
- the hub rejects unauthenticated or malformed private requests
- the hub records the authenticated caller context in audit data

### Response contract

The hub returns only the adapter-facing response needed to continue the shared
adapter flow.

The hub does not return:

- long-lived client secrets
- private keys
- reusable raw secret material for browser/runtime storage

---

## Canonical Managed Profile Objects

### Managed profile

```typescript
interface GlowbotManagedProfile {
  managedProfileId: string
  appId: string
  adapterId: string
  connectionProfileId: string
  authMethodId: string
  owner: "glowbot"
  status: "active" | "disabled" | "archived"
  displayName: string
  secretRefIds: string[]
  config: Record<string, unknown>
  createdAtMs: number
  updatedAtMs: number
}
```

This is the canonical routing and lifecycle object for GlowBot-managed
connection profiles.

### Secret reference

```typescript
interface GlowbotSecretRef {
  secretRefId: string
  kind: "env" | "aws_secrets_manager" | "kms_encrypted" | "vault"
  locator: string
  rotationPolicy: "manual" | "scheduled"
  status: "active" | "rotating" | "disabled"
  createdAtMs: number
  updatedAtMs: number
}
```

The hub stores secret references, not browser-visible secret payloads.

### Relay audit event

```typescript
interface GlowbotRelayAuditEvent {
  auditEventId: string
  requestKind: "profile_lookup" | "profile_exchange"
  serverId: string
  tenantId: string
  appId: string
  adapterId: string
  connectionProfileId: string
  authMethodId: string
  managedProfileId?: string
  resolvedProfileId?: string
  outcome: "success" | "rejected" | "failed"
  errorCode?: string
  createdAtMs: number
}
```

This is the minimum audit shape needed for diagnostics and incident review.

---

## Canonical Internal Service Methods

The hub shell should expose stable internal method families for the
admin app and future local modules.

Canonical method families:

```text
glowbotHub.managedProfiles.list
glowbotHub.managedProfiles.get
glowbotHub.managedProfiles.create
glowbotHub.managedProfiles.update
glowbotHub.managedProfiles.archive
glowbotHub.diagnostics.summary
glowbotHub.audit.list
glowbotHub.productFlags.list
glowbotHub.productFlags.update
```

GlowBot-specific benchmark methods are defined separately in
[GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md).

---

## Canonical Package Shape

Target-state shell layout:

```text
hub/
  app.nexus.json
  src/
    ingress/
    managed-profiles/
    secrets/
    diagnostics/
    config/
    audit/
    benchmarks/
    shared/
  tests/
```

Rules:

- shell modules live under `src/`
- product-specific benchmark logic plugs into the shell under a dedicated
  module, not inside `ingress` or `secrets`
- tests must cover both private relay behavior and operator-facing service
  behavior

---

## Validation Expectations

The shell is not considered real until all of these are true:

1. frontdoor can authenticate to the private relay endpoints
2. malformed or unauthenticated relay requests are rejected
3. managed profiles can be resolved by full tuple
4. secret-backed operations run server-side without leaking long-lived secret
   material
5. audit events are written for relay success and failure
6. diagnostics can report recent relay failures and profile health
7. `glowbot-admin` can call the shell through stable internal methods

---

## Explicit Non-Goals

- The shell does not replace frontdoor.
- The shell does not ingest raw adapter events as its public product boundary.
- The shell does not make the admin browser the secret owner.
- The shell does not install on each clinic server.
- The shell does not require product-specific wrapper adapters.
