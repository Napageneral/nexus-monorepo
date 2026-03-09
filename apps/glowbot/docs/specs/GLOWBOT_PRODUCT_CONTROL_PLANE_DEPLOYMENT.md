# GlowBot — Product Control Plane Deployment

> Canonical deployment model for `glowbot-hub` and `glowbot-admin` on the
> hosted Nexus platform.

---

## Purpose

This document defines how GlowBot's product control plane is deployed and
operated in the hosted target state.

It exists to make five things explicit:

1. where `glowbot-hub` runs
2. where `glowbot-admin` runs
3. which servers install those packages
4. who can see and launch those surfaces
5. how this deployment model interacts with frontdoor, tenant runtimes, and the
   shared adapter system

This is the deployment companion to:

- [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
- [GLOWBOT_PACKAGE_TOPOLOGY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PACKAGE_TOPOLOGY.md)
- [HOSTED_PRODUCT_CONTROL_PLANES.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_PRODUCT_CONTROL_PLANES.md)
- [HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md)

---

## Customer And Operator Experience

The intended hosted GlowBot experience is:

1. a clinic uses GlowBot on its own customer server
2. the clinic never installs or launches `glowbot-admin`
3. the clinic never installs a private copy of `glowbot-hub`
4. product operators use a separate dedicated GlowBot control-plane server
5. that server runs:
   - `glowbot-admin` as the operator-facing app
   - `glowbot-hub` as the shared product control plane service
6. frontdoor remains the runtime-facing gateway for managed connection
   operations and relays GlowBot-managed requests to `glowbot-hub`

From the operator's perspective, GlowBot control-plane infrastructure still
feels like a normal hosted deployment managed through frontdoor. It just is not
customer-visible.

---

## Design Rules

1. `glowbot-hub` is deployed on a dedicated product control plane server, not
   on every clinic server.
2. `glowbot-admin` is deployed on that same dedicated product control plane
   server by default.
3. `glowbot-admin` is operator-only and not customer-visible in normal product
   catalog and launch flows.
4. `glowbot-hub` is a service package, not a customer-launchable browser app.
5. The clinic-facing `glowbot` app does not declare `glowbot-hub` as a
   per-server dependency.
6. Clinic runtimes access GlowBot product control-plane behavior through:
   - frontdoor's private managed-connection gateway, and
   - explicit hub-facing product APIs when GlowBot product behavior requires it
7. GlowBot-managed secrets live on the GlowBot product control plane server,
   not on clinic servers and not in frontdoor by default.
8. The product control plane server remains frontdoor-managed infrastructure,
   not a hand-maintained sidecar outside the hosted system.

---

## Canonical Deployment Model

GlowBot uses two distinct hosted deployment classes.

### 1. Clinic deployments

Each clinic server installs:

- `glowbot`
- shared adapter packages needed by that clinic

Each clinic server does **not** install:

- `glowbot-admin`
- `glowbot-hub`

The clinic server owns:

- clinic-local app execution
- clinic-local adapter connections
- clinic-local nex memory/jobs/DAGs/cron
- clinic-local product computation

### 2. GlowBot control plane deployment

GlowBot has a dedicated operator-owned server managed through frontdoor.

That server installs:

- `glowbot-admin`
- `glowbot-hub`

This server owns:

- GlowBot-managed provider profiles
- GlowBot-managed provider secrets
- secret-backed provider operations
- benchmark aggregation
- cohort definitions
- seed dataset management
- product flags/config
- operator diagnostics and support APIs

This is the canonical home of the GlowBot product control plane.

---

## Package Install Model

The package model is intentionally asymmetric.

### Clinic server package set

Canonical clinic package set:

```text
glowbot
google
meta-ads
patient-now-emr
zenoti-emr
callrail
twilio
apple-maps
```

### Control plane server package set

Canonical GlowBot control plane package set:

```text
glowbot-admin
glowbot-hub
```

Implication:

- `glowbot` does not require local installation of `glowbot-hub`
- `glowbot-admin` may require local installation of `glowbot-hub` on the
  control plane server

This is the key package/deployment distinction.

---

## Visibility Rules

### `glowbot`

- customer-facing
- visible to entitled clinic users on their clinic servers
- launched through normal product app flows

### `glowbot-admin`

- operator-facing only
- not visible in normal customer product catalog/launch flows
- visible only to the GlowBot operator context on the dedicated control plane
  server

### `glowbot-hub`

- not browser-launchable
- not customer-visible
- installed as a service package on the control plane server

The operator should still be able to manage this deployment through frontdoor
as hosted infrastructure. Customers should not discover it as part of their
normal app inventory.

---

## Relationship To Frontdoor

Frontdoor remains the platform control plane.

For GlowBot's deployment model, frontdoor owns:

- the dedicated GlowBot control plane server as hosted infrastructure
- package install and upgrade orchestration on that server
- routing and server visibility enforcement
- the private managed-connection gateway used by tenant runtimes

Frontdoor does not become the canonical owner of GlowBot-managed provider
secrets.

For GlowBot-managed profiles:

1. clinic runtime calls frontdoor's private gateway
2. frontdoor authenticates the runtime and resolves authoritative context
3. frontdoor routes the request to the GlowBot control plane server
4. `glowbot-hub` performs the secret-backed operation
5. frontdoor returns the adapter-facing response to the clinic runtime

---

## Relationship To The Clinic App Manifest

Because `glowbot-hub` is not installed on clinic servers in the target state,
the clinic-facing `glowbot` manifest must not declare:

```json
{
  "requires": {
    "services": [
      { "id": "glowbot-hub", "version": "^1.0.0" }
    ]
  }
}
```

That shape incorrectly implies local co-installation on every clinic server.

Target-state rule:

- the clinic app declares shared adapter dependencies
- the control plane deployment installs `glowbot-admin` and `glowbot-hub`
  separately on the dedicated control plane server
- product-control-plane routing is resolved through frontdoor and product
  deployment metadata, not clinic-server `requires.services`

This is a canonical spec change, not a migration note.

---

## Relationship To The Admin App Manifest

The operator-facing `glowbot-admin` app runs on the dedicated control plane
server and may declare `glowbot-hub` as a local service dependency on that
server.

Canonical meaning:

- `glowbot-admin` and `glowbot-hub` are co-installed on the product control
  plane server
- the admin app is the operator-facing nex app
- the hub is the backing service package

That is a valid use of `requires.services` because both packages belong on the
same server.

---

## Why Option 2 Is The Right Model

The chosen deployment model is:

- deploy GlowBot's product control plane on existing frontdoor-managed VPS
  infrastructure
- represent it as normal hosted packages
- keep it operator-only and product-only rather than customer-visible

This is preferable to:

### Rejected: install `glowbot-hub` on every clinic server

Why rejected:

- duplicates product control plane secret ownership across clinic runtimes
- weakens the product-control-plane boundary
- complicates benchmark aggregation and operator workflows
- contradicts the hosted product control plane model

### Rejected: fold GlowBot product control plane into frontdoor

Why rejected:

- turns frontdoor into a bucket for product-specific secrets
- couples GlowBot-specific behavior to platform code
- violates the platform vs product control-plane split

### Rejected: unmanaged external VPS outside the hosted model

Why rejected:

- loses the operational consistency of frontdoor-managed infrastructure
- makes deployment and lifecycle unlike the rest of the hosted platform
- gives up the benefit of using nex-hosted packages and APIs for the operator
  side

---

## Validation Story

The deployment model is correct only if these things are provable.

### Package and visibility validation

- the dedicated GlowBot control plane server exists in frontdoor-managed
  infrastructure
- `glowbot-admin` is installable there
- `glowbot-hub` is installable there
- `glowbot-admin` is not visible in customer-facing app inventory flows
- clinic servers do not install `glowbot-hub`

### Relay validation

- frontdoor can relay managed-profile requests to the GlowBot control plane
  server
- `glowbot-hub` authenticates frontdoor and handles the request
- the runtime receives the correct adapter-facing response shape

### Secret-boundary validation

- long-lived GlowBot-managed provider secrets exist only on the GlowBot control
  plane
- those secrets do not appear in clinic runtimes, app manifests, or admin
  browser code

### Product-control-plane validation

- `glowbot-admin` can manage GlowBot-managed profiles through `glowbot-hub`
- the clinic app can use benchmark/control-plane behavior without co-installing
  the hub locally

---

## Canonical Long-Term Result

In the target state:

- clinic servers run the clinic-facing GlowBot app and shared adapters
- a dedicated GlowBot control plane server runs `glowbot-admin` and
  `glowbot-hub`
- frontdoor manages all of that infrastructure through the hosted platform
- GlowBot gets the benefits of hosted nex packaging and APIs
- product-managed secrets remain in the product control plane, not in clinic
  runtimes and not in frontdoor by default

That is the canonical deployment model GlowBot should now build toward.
