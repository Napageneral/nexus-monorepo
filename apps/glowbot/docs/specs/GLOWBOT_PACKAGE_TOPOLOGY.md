# GlowBot Package Topology

**Status:** CANONICAL
**Last Updated:** 2026-03-06

---

## Purpose

This document defines the target-state package topology for the GlowBot monorepo
inside:

`/Users/tyler/nexus/home/projects/nexus/apps/glowbot`

It answers four questions:

1. what user-facing surfaces GlowBot has
2. which top-level packages own those surfaces
3. how those packages relate to the hosted Nex package model
4. where shared contracts and implementation boundaries live

This is a target-state package and ownership spec. It does not describe legacy
folder names or transitional layouts.

---

## Customer Experience First

GlowBot has three user-facing UI surfaces and one shared product service:

1. a public GlowBot landing site in front of frontdoor
2. the clinic-facing GlowBot app that runs through frontdoor and the tenant
   runtime
3. a GlowBot admin panel used by the product operator on the hub side
4. a shared GlowBot hub service that publishes benchmarks and product control
   data to GlowBot installations

Those are different surfaces with different responsibilities and they should be
represented explicitly in the package topology.

---

## Top-Level Monorepo Layout

The target-state GlowBot monorepo layout is:

```text
apps/glowbot/
  app/
  admin/
  hub/
  website/
  shared/
  docs/
```

Top-level ownership:

- `app/` owns the clinic-facing hosted GlowBot app package
- `admin/` owns the operator-facing admin app package
- `hub/` owns the shared GlowBot service package
- `website/` owns the public landing and signup surface
- `shared/` owns shared contracts, schemas, and package-local libraries used by
  multiple GlowBot packages
- `docs/` owns the GlowBot documentation tree under the canonical artifact split

The target-state package topology does not use top-level names such as
`consumer/` or `consumer-ui/`.

---

## Package Roles

### `app/`

The clinic-facing GlowBot app package.

This is the package that frontdoor installs for a clinic server and that users
launch through the hosted shell.

It owns:

- `app.nexus.json`
- runtime hooks
- method handlers
- built clinic-facing UI assets
- app-owned static assets
- app-owned job and pipeline code

It does not own:

- shared adapter packages
- shared benchmark service logic
- public marketing pages

Execution model:

- the clinic-facing GlowBot app is an inline-handler nex app
- it owns hooks, method handlers, UI assets, and app-local computation modules
- it is not a service-routed product package by default

Canonical internal layout:

```text
app/
  app.nexus.json
  hooks/
  methods/
  assets/
  dist/
  ui/
```

Rules:

- `ui/` is source code used to produce the built clinic UI
- `dist/` is the packaged build output mounted by the hosted runtime
- if the clinic app requires internal service code, that code still belongs to
  the `app/` package boundary rather than becoming a separate top-level
  product-facing package
- the presence of app-local helper or worker code does not change the execution
  model; the clinic-facing package still remains one inline-handler app package

### `admin/`

The operator-facing GlowBot admin app package.

This package exists for the product owner and support/operator workflows. It is
not installed as the clinic-facing product and it is not the shared benchmark
service itself.

It owns:

- `app.nexus.json`
- operator-only UI
- operator method handlers
- operator hooks

It depends on the `hub/` package for shared benchmark and product control data.

Deployment model:

- `admin/` is installed on the dedicated GlowBot product control plane server
- it is operator-facing and not part of the normal customer-visible app set on
  clinic servers

Execution model:

- the admin package is an inline-handler nex app
- it is not the shared service itself

### `hub/`

The shared GlowBot service package.

This package owns:

- benchmark publishing and retrieval
- product control/configuration data
- product-wide support-safe diagnostic surfaces
- any shared service APIs used by the GlowBot app and admin app

It is not a second hosted platform control plane.

Deployment model:

- `hub/` is deployed on the dedicated GlowBot product control plane server
- it is not co-installed on clinic servers as part of the normal clinic app
  package set
- its deployment model is defined in
  [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)

### `website/`

The public GlowBot landing site.

This package owns:

- public marketing pages
- signup/onboarding entry surfaces
- frontdoor handoff entry points

It does not own:

- hosted runtime app methods
- clinic-local product state
- shared benchmark service state

### `shared/`

Shared code used by more than one GlowBot package.

This package owns:

- method names
- request/response contracts
- shared schemas
- shared domain types
- clinic-profile and benchmark publication contracts
- package-local helper code that is genuinely reused across GlowBot packages

It does not become a runtime product surface by itself.

---

## Relationship To The Hosted Package Model

GlowBot follows the hosted Nex package model defined in:

- [NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md)
- [HOSTED_APP_PLATFORM_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_APP_PLATFORM_CONTRACT.md)

Canonical hosted package roles:

- `glowbot` → clinic-facing app package, implemented in `app/`
- `glowbot-admin` → operator-facing app package, implemented in `admin/`
- `glowbot-hub` → shared service package, implemented in `hub/`

Shared adapters remain separate packages outside the GlowBot monorepo package
set. The GlowBot app package depends on them via `requires.adapters`; it does
not vendor them into the `app/` package or reference them via filesystem escape
paths.

The clinic-facing `glowbot` package does not imply that `glowbot-hub` is
co-installed on every clinic server. The dedicated control-plane deployment
model is defined separately in
[GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md).

---

## UI And Service Ownership

The clinic-facing GlowBot product is one app package, not two separate product
packages.

This means:

- the clinic-facing UI source belongs under `app/ui/`
- the packaged UI build belongs under `app/dist/`
- clinic-facing hooks and methods belong under `app/hooks/` and `app/methods/`

The app may have internal service code if needed, but that does not change the
top-level package topology. It still belongs to `app/` as part of the clinic app
package boundary.

The clinic-facing app is intentionally not a Spike-style service-routed app by
default.

Reasoning:

- GlowBot's long-term persistence and orchestration belong to nex core
  primitives rather than to an app-local backend service
- GlowBot's shared product backend belongs in the separate `hub/` package
- GlowBot's clinic-facing package mainly orchestrates nex runtime APIs and
  app-owned product logic, which fits the inline-handler model cleanly
- adding a clinic-side service boundary by default would create extra process and
  deployment complexity without introducing a distinct product boundary

By contrast:

- the hub is a separate top-level package because it is a distinct shared service
- the admin panel is a separate top-level package because it is a distinct
  operator-facing app
- the public landing site is a separate top-level package because it is not the
  hosted clinic app itself

### Execution Model Summary

| Package | Execution model |
|---|---|
| `app/` | inline-handler nex app |
| `admin/` | inline-handler nex app |
| `hub/` | shared service package |
| `website/` | public web package |
| `shared/` | shared library package |

---

## Shared Contract Ownership

The shared request/response and method contract surface belongs in `shared/`.

Canonical shared artifacts include:

- method constants
- request/response schemas
- domain object interfaces
- shared serialization contracts

The target-state specs should treat the shared package as the implementation home
of cross-package contract code, while keeping the authoritative conceptual
contract definitions in `docs/specs/`.

---

## Naming Rules

Use:

- `app/`
- `admin/`
- `hub/`
- `website/`
- `shared/`

Avoid in target-state docs:

- `consumer/`
- `consumer-ui/`
- ad hoc package names for the clinic-facing app surface

The package topology should reflect user-facing product ownership, not leftover
implementation history.

---

## Package Boundaries Summary

| Package | Surface | Primary user | Package type |
|---|---|---|---|
| `app/` | clinic-facing product UI + runtime app | clinic user | hosted app package |
| `admin/` | operator admin UI | GlowBot operator | hosted app package |
| `hub/` | shared benchmark/control service | GlowBot app + admin | shared service package |
| `website/` | public landing/signup site | prospective customer | public web package |
| `shared/` | shared contracts and schemas | internal package reuse | shared library package |

---

## Consequences For GlowBot Docs And Workplans

1. active target-state specs should refer to `app`, `admin`, `hub`, `website`,
   and `shared` as the package topology
2. code/workplan artifacts may reference current legacy folder names only when
   explaining the gap to be closed
3. package-model cutover work should converge the repo and manifests toward this
   topology instead of preserving the current `consumer` / `consumer-ui` split
