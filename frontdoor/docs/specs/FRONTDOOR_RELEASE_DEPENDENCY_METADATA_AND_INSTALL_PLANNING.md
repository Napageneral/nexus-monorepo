# Frontdoor Release Dependency Metadata And Install Planning

**Status:** CANONICAL
**Last Updated:** 2026-03-12
**Related:**
- `FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`
- `FRONTDOOR_SERVER_ADAPTER_INSTALL_API.md`
- `../../nex/docs/specs/platform/package-registry-and-release-lifecycle.md`
- `../../nex/docs/specs/apps/app-manifest-and-package-model.md`
- `../../nex/docs/specs/platform/apps-adapters-and-method-surfaces.md`

---

## Purpose

This document defines the missing hosted package slice between:

- published package manifests and release artifacts
- logical dependency declarations such as `requires.adapters` and
  `requires.apps`
- concrete server install execution through Frontdoor and the runtime operator

It exists because hosted package lifecycle is only complete when Frontdoor can:

1. persist release dependency metadata at publish time
2. resolve a requested package into a dependency-ordered install plan
3. execute that plan against one target server platform
4. persist requirement edges so uninstall and upgrade stay coherent

---

## Customer Experience

The intended hosted experience is:

1. an operator installs one top-level package such as `glowbot-admin`
2. Frontdoor resolves the release and its dependencies
3. Frontdoor installs those dependencies in a stable order
4. the runtime validates and activates each package
5. the operator sees one coherent install result

The operator should not need to:

- manually install dependency packages in the right order
- know which package was semantically a hidden backend dependency versus the
  top-level app
- reason about target-platform variant selection

---

## Core Decision

Frontdoor must treat package dependencies as release metadata over the canonical
package kinds:

1. `app`
2. `adapter`

There is no separate `service` dependency class. Headless backends and product
control planes are modeled as app dependencies.

---

## Scope

This spec covers:

- release dependency metadata
- publish-time dependency extraction
- dependency graph resolution
- variant resolution for dependencies
- dependency-ordered install execution
- server requirement-edge persistence
- uninstall and upgrade planning implications

This spec does not redefine:

- runtime package activation
- runtime lifecycle hooks
- adapter connection flows
- product control plane routing

---

## Dependency Source Of Truth

Dependency metadata comes from the package manifest snapshot stored with the
release.

Canonical source groups are:

- `requires.apps`
- `requires.adapters`

There is no canonical `requires.services` group.

Rules:

1. dependency edges are part of release metadata, not inferred from repo layout
2. dependency metadata is immutable per release
3. dependency metadata is extracted at publish time and stored durably
4. dependency resolution uses stored release metadata, not the live filesystem

---

## Canonical Dependency Record

Each release dependency record must preserve:

- `release_id`
- `dependency_class`
- `dependency_package_id`
- `version_constraint`
- `required_for_activate`
- `sort_order`

`dependency_class` means the logical declaration class from the manifest:

- `app`
- `adapter`

Illustrative SQL:

```sql
CREATE TABLE frontdoor_release_dependencies (
  release_id TEXT NOT NULL REFERENCES frontdoor_package_releases(release_id),
  dependency_class TEXT NOT NULL,
  dependency_package_id TEXT NOT NULL REFERENCES frontdoor_packages(package_id),
  version_constraint TEXT NOT NULL,
  required_for_activate INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, dependency_class, dependency_package_id)
);
```

---

## Publish-Time Behavior

When Frontdoor publishes a release it must:

1. parse the manifest snapshot
2. extract dependency declarations from `requires`
3. validate that dependency package ids are well-formed
4. persist release dependency rows
5. reject invalid publish inputs before the release is marked published

Publish must not require every referenced dependency package to already have a
published compatible release, but it must persist the declared requirement
faithfully.

Publish-time validation should reject:

- duplicate dependency rows after normalization
- self-dependencies
- unsupported dependency classes
- malformed version constraints

---

## Install Planning

When Frontdoor receives an install request for a top-level package:

1. verify entitlement and caller authority for the requested package
2. resolve the requested release
3. resolve the target server runtime platform
4. recursively resolve dependency releases using stored release dependency
   metadata
5. for each dependency package id, look up the package's actual published kind
6. choose an exact target-platform variant for every package in the plan
7. topologically sort the plan in dependency order
8. write desired server package state
9. write server requirement edges
10. stage and install packages in dependency order

The canonical install execution order is still:

1. app dependencies that provide shared backend behavior
2. adapter dependencies
3. requested top-level package

---

## Variant Resolution

Dependency planning must resolve variants against the target server runtime
platform for every package in the plan.

Rules:

1. a plan fails before install if any required package lacks an exact
   `target_os` / `target_arch` match
2. Frontdoor must report which dependency package caused the failure
3. Frontdoor must not partially install a dependency plan after variant
   resolution has already failed

---

## Server Requirement Edges

Frontdoor must persist server-level requirement edges when a plan is written.

These edges answer:

- which package directly requested another package
- which dependency class that requirement came from
- whether a shared package may be removed safely later

At minimum, each requirement edge must preserve:

- `server_id`
- `requiring_kind`
- `requiring_package_id`
- `required_kind`
- `required_package_id`
- `version_constraint`

For execution correctness, `required_kind` is the **published package kind**
used for operator install, not the logical dependency class.

---

## Uninstall Planning

Uninstall must be requirement-edge aware.

When uninstalling a package:

1. remove its direct install intent
2. remove requirement edges where it is the requiring package
3. uninstall that package
4. only garbage-collect dependency packages that now have no remaining
   requirement edges and no direct install intent

This prevents a shared dependency from being removed while another installed
package still requires it.

---

## Upgrade Planning

Upgrade uses the same dependency metadata model as install.

Rules:

1. Frontdoor must resolve the target release and its dependency graph
2. dependency upgrades must be planned against the target release metadata, not
   the currently active dependency graph alone
3. upgrade execution remains dependency ordered
4. requirement edges must be updated to reflect the target release graph

---

## GlowBot Validation Case

The primary proving case for this slice is:

1. `glowbot-admin` is published as an app package
2. `glowbot-admin` declares `glowbot-hub` under `requires.apps`
3. `glowbot-hub` is published as a headless app package that runs a
   package-local `hub` service process
4. installing `glowbot-admin` on the dedicated control-plane server causes
   Frontdoor to install `glowbot-hub` first
5. uninstalling `glowbot-admin` removes its requirement edge and only removes
   `glowbot-hub` if nothing else requires it

This proves the long-term architecture without waiting on a second package-kind
cutover for headless backend packages.

---

## Non-Negotiable Rules

1. Frontdoor must not keep a second app-only dependency planner in parallel
2. dependency metadata must come from release metadata, not repo layout
3. dependency planning must be package-based even when the public route is
   app-shaped
4. the planner must preserve declared dependency metadata from the release
   manifest and execute it against canonical package kinds
5. GlowBot must not special-case its control-plane install outside the hosted
   package planner
