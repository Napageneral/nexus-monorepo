# Spike App And Package Model

**Status:** CANONICAL
**Last Updated:** 2026-03-05

---

## Purpose

This document defines the target-state app/package contract for Spike.

It covers:

- the customer-facing app boundary
- the Spike package boundary
- the execution model Spike uses inside Nex
- the runtime transport rules Spike must obey
- the separation between Spike-owned behavior and shared hosted platform behavior

Shared hosted rules come from:

- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/packages-and-control-planes.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/runtime-access-and-routing.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/apps/app-manifest-and-package-model.md`
- `SPIKE_PRODUCT_CONTROL_PLANE.md`
- `SPIKE_OBJECT_TAXONOMY.md`

This document does not redefine those platform contracts. It applies them to
Spike.

---

## Customer Experience

The intended hosted Spike experience is:

1. a user signs into frontdoor
2. frontdoor provisions and manages the server
3. frontdoor installs Spike as an app package on that server
4. the user launches Spike through the frontdoor shell profile
5. the Spike UI talks to the hosted runtime over the canonical runtime transport
6. Spike-specific operations, callbacks, and webhooks resolve without URL or ownership ambiguity

Spike is not a special hosting mode. It is an app package living inside the
same hosted runtime contract as other Nex apps.

---

## Package Boundary

Spike is an app package.

Spike owns:

- the Spike app manifest
- the Spike browser UI
- the Spike domain methods under `spike.*`
- Spike-specific lifecycle hooks
- Spike-specific data and domain behavior

Spike does not own:

- the hosted routing model
- the artifact registry model
- the package install/upgrade lifecycle
- frontdoor session or billing behavior
- the runtime transport protocol definition

Those behaviors belong to the canonical hosted/platform specs.

---

## Repository Structure

The Spike repository area is organized into distinct concerns:

```text
apps/spike/
  app/       # installable Spike app package
  service/   # build source for Spike services/binaries
  hub/       # Spike product control-plane app
  product/   # Spike marketing/onboarding surface
  admin/     # Spike-specific admin package(s)
  docs/      # active specs, workplans, validation, archive
```

### `app/`

`app/` is the package root consumed by the Nex runtime and hosted install
system.

It contains package-local artifacts only:

- `app.nexus.json`
- `dist/`
- `assets/`
- `bin/`
- `hooks/`

### `service/`

`service/` is source, not the package contract.

It may contain:

- Go source
- tests
- build scripts
- local development assets

The package contract is defined by what is emitted into `app/`, not by the
source layout under `service/`.

### `product/`

`product/` is a marketing and onboarding surface. It is not the hosted runtime
origin and it is not the app package root.

### `hub/`

`hub/` is the target-state Spike product control-plane app.

It owns:

- product-wide support and operator APIs
- Spike-managed provider profiles
- Spike GitHub App secret-backed operations
- other shared Spike control-plane behavior that should not live in frontdoor

### `admin/`

`admin/` is the operator-facing Spike admin app package.

It is not implicitly part of the main Spike app package and it is not the
canonical secret owner. It talks to the Spike hub/control plane.

---

## Execution Model

Spike is a service-routed app.

Target-state rules:

1. Spike exposes its public operations under the `spike.*` namespace.
2. Spike runs one or more package-local services declared in the manifest.
3. Runtime auth, IAM, parameter validation, and lifecycle orchestration remain
   runtime-owned.
4. Spike services implement Spike domain behavior; they do not replace runtime
   operator or transport contracts.
5. Spike uses canonical Nex agent/session APIs for ask execution and transcript
   ownership instead of running a private long-lived broker ledger.

Spike may use more than one service when the package needs distinct long-running
process roles, but the manifest contract remains the canonical source of truth.

---

## Manifest Rules

Spike follows the canonical Nex app manifest/package model.

Spike-specific rules:

1. The Spike app manifest lives at `app/app.nexus.json`.
2. Every manifest-referenced path resolves inside the package root.
3. Shared dependencies are declared through `requires`; Spike does not depend on
   unpublished repo-relative escape paths.
4. Spike declares the shared `github` adapter as a dependency instead of
   embedding provider binaries or callback routes inside the app package.
5. Spike exposes app-owned GitHub connection profiles on top of that shared
   adapter rather than redefining GitHub provider auth logic.
6. Product metadata may exist in the manifest, but product metadata does not
   redefine runtime lifecycle behavior.
7. Spike exposes exactly one public browser entry path under `/app/spike/`.
8. Request timeline and inspector experiences are internal Spike routes beneath
   `/app/spike/`; they are not separate top-level UI contracts.

If Spike needs reusable adapters or hidden/shared backend packages, those are
separate installable packages declared as dependencies. They are not filesystem
escapes or hidden runtime assumptions.

---

## Runtime Transport Contract

Spike uses the canonical hosted runtime transport.

Browser transport rules:

- HTTP uses the hosted runtime path contract
- WebSockets use `/runtime/ws`
- the same app must be portable between the frontdoor shell profile and the
  tenant-origin profile

Design rules:

1. Spike must not invent a private transport protocol beside the hosted runtime
   contract.
2. Spike UI clients must not fork runtime frame schemas, client-id vocabularies,
   or handshake semantics in ad hoc ways.
3. Shared runtime transport logic should come from a shared runtime bridge or
   equivalent canonical contract surface, not from one-off HTML copies.
4. Spike does not ship separate browser transport clients or alternate browser
   client ids for main UI versus inspector pages.
5. Historical top-level surfaces such as `/control/ask-inspector` are migration
   residue, not target-state app contract.

This keeps Spike from drifting away from the runtime protocol the platform
actually validates.

---

## Dependency Boundary

Spike may depend on reusable platform packages, but it should not redefine them.

Rules:

1. Product-specific Spike behavior remains app-owned.
2. Reusable external-system connectivity belongs in separately installable
   adapter or app packages.
3. Spike-specific orchestration may compose those dependencies, but the package
   contract records them explicitly.

This keeps the Spike app spec focused on Spike instead of absorbing shared
platform responsibilities.
