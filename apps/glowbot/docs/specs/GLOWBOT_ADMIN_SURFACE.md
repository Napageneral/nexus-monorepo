# GlowBot Admin Surface

> Canonical operator-facing surface contract for `glowbot-admin`.

---

## Purpose

This document defines the target-state operator surface for GlowBot.

It exists to make five things explicit:

1. who `glowbot-admin` is for
2. which product-control-plane capabilities it exposes
3. what it is allowed to do directly
4. what it must delegate to `glowbot-hub`
5. which pages and method families are part of the canonical admin surface

This document does not define frontdoor operator UX and it does not replace the
hub control-plane shell.

Related canon:

- [Product Control Plane Servers and Admin Apps](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/product-control-plane-servers-and-admin-apps.md)
- [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
- [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)

---

## Operator Experience

The intended operator experience is:

1. a GlowBot operator signs into the dedicated GlowBot control-plane server
2. they launch `glowbot-admin`
3. the admin app provides one coherent operator console for:
   - managed profiles
   - clinics
   - diagnostics
   - benchmark network health
   - cohorts and seeds
   - product flags/config
   - audit/support views
4. every meaningful operator action is executed through `glowbot-hub`
5. the admin app never needs to expose or locally store long-lived provider
   secrets in browser code

The admin app is an operator tool, not a clinic surface.

---

## Non-Negotiable Design Rules

1. `glowbot-admin` is operator-facing only.
2. `glowbot-admin` is not customer-visible in normal product app inventory.
3. `glowbot-admin` is an inline-handler nex app installed on the dedicated
   GlowBot control-plane server.
4. `glowbot-admin` is not the canonical secret owner.
5. `glowbot-admin` must call `glowbot-hub` for managed profiles, diagnostics,
   benchmarks, and config state.
6. `glowbot-admin` may initiate secret-management workflows, but the hub
   resolves and uses the secrets server-side.
7. The old `glowbot-admin.credentials` concept is not target-state canon.

---

## Canonical Sections

The admin app should expose a stable operator navigation shape.

### Overview

Shows:

- high-level product-control-plane health
- benchmark network status
- recent relay failures
- rollout or incident banners

### Managed Profiles

Shows:

- list of GlowBot-managed profiles
- status and health
- profile metadata
- rotation/archive actions

### Clinics

Shows:

- clinic participation status
- benchmark freshness
- product version / rollout state
- support-safe clinic summaries

### Diagnostics

Shows:

- relay activity
- recent failures
- managed profile resolution failures
- product-control-plane app health

### Benchmark Network

Shows:

- benchmark coverage by cohort
- sample-size health
- stale publishing clinics
- seed-vs-peer balance

### Cohorts And Seeds

Shows:

- cohort definitions
- seed dataset inventory
- cohort/seed edit and publication workflows

### Product Flags

Shows:

- product rollout flags
- thresholds
- operator-controlled product configuration

### Audit And Support

Shows:

- recent operator actions
- recent relay audit events
- incident context for support workflows

---

## Canonical Method Families

The admin app owns operator-facing method names, but those methods are thin app
surfaces over `glowbot-hub`.

Canonical method families:

```text
glowbotAdmin.overview.get
glowbotAdmin.managedProfiles.list
glowbotAdmin.managedProfiles.get
glowbotAdmin.managedProfiles.create
glowbotAdmin.managedProfiles.update
glowbotAdmin.managedProfiles.archive
glowbotAdmin.clinics.list
glowbotAdmin.clinics.get
glowbotAdmin.diagnostics.summary
glowbotAdmin.benchmarks.networkHealth
glowbotAdmin.benchmarks.seed.publish
glowbotAdmin.cohorts.list
glowbotAdmin.cohorts.update
glowbotAdmin.productFlags.list
glowbotAdmin.productFlags.update
glowbotAdmin.audit.list
```

### Method intent

- admin methods are operator-facing app methods
- the app methods should call `glowbot-hub`, not duplicate hub logic locally
- the admin app may aggregate or format hub data for UX, but not replace the
  underlying hub contract

---

## Canonical Package Shape

Target-state admin layout:

```text
admin/
  app.nexus.json
  hooks/
  methods/
  ui/
  dist/
```

Rules:

- `app.nexus.json` declares the operator-facing admin app
- the admin app may declare `glowbot-hub` as a local app dependency because
  both run on the dedicated control-plane server
- admin hooks and methods remain thin application surfaces over the hub app

---

## Visibility And Access Rules

`glowbot-admin` must be:

- visible only in the operator context
- hidden from normal clinic-user product inventory
- protected by operator access rules

The admin surface must not appear as a customer-launchable companion app on
clinic servers.

---

## Secret-Handling Rules

The admin app may allow an operator to:

- create or update a managed profile
- attach or rotate a secret reference
- disable or archive a managed profile

The admin app must not:

- render long-lived provider secrets in browser code
- become the canonical persistence layer for secret material
- bypass the hub shell for secret-backed operations

If a workflow requires secret creation or rotation, the admin app submits the
operator request to the hub, and the hub performs the secret-backed change.

---

## Relationship To Frontdoor

The admin app is not a replacement for frontdoor operator surfaces.

Frontdoor still owns:

- platform accounts
- servers
- package lifecycle
- billing
- routing

`glowbot-admin` owns product-specific operator workflows only.

---

## Validation Expectations

The admin surface is not considered real until all of these are true:

1. operator-only access is enforced
2. the app is hidden from normal customer app inventory
3. managed profile views are backed by real hub data
4. diagnostics views are backed by real hub audit and health data
5. benchmark and cohort views are backed by real hub methods
6. no long-lived provider secret is exposed in browser-facing responses

---

## Explicit Non-Goals

- The admin surface is not a second frontdoor.
- The admin surface is not the canonical secret owner.
- The admin surface does not run on clinic servers.
- The admin surface does not duplicate hub logic in local app handlers.
