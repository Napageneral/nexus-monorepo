# Hosted Install And Upgrade Lifecycle

**Status:** CANONICAL
**Last Updated:** 2026-03-05

---

## Purpose

This document defines how hosted runtimes install, uninstall, and upgrade packages.

It covers:

- hosted-platform responsibilities
- operator API boundaries
- server-side release layout
- dependency-aware install behavior
- upgrade sequencing
- rollback
- user-visible lifecycle states

---

## Responsibilities

### Frontdoor owns

- entitlement checks
- release selection
- dependency resolution
- install and upgrade planning
- staging package artifacts onto the server
- recording desired and active release state

### Runtime owns

- validating staged packages
- unpacking releases
- managing active release pointers
- lifecycle hooks
- process startup and shutdown
- health verification
- rollback execution

Frontdoor decides what should be installed. The runtime decides whether the package can be activated safely on that server.

---

## Operator API Boundary

### Public client/runtime APIs

Public runtime APIs are for:

- app method invocation
- app discovery
- app health and status

They do not mutate package lifecycle state.

### Private operator APIs

Private operator APIs are trusted frontdoor-to-runtime endpoints.

Canonical operator endpoints:

- `POST /api/operator/packages/install`
- `POST /api/operator/packages/uninstall`
- `POST /api/operator/packages/upgrade`
- `GET /api/operator/packages/<kind>/<packageId>`
- `GET /api/operator/packages/<kind>/<packageId>/health`

These endpoints are authenticated with the runtime trusted token, not browser credentials.

---

## Server Filesystem Layout

Packages, releases, and data are separate.

```text
/opt/nex/
  staging/
    <operationId>/
  packages/
    <kind>/
      <packageId>/
        releases/
          <version>/
        active -> releases/<version>
  data/
    <kind>/
      <packageId>/
  backups/
    <operationId>/
```

Examples:

- `/opt/nex/packages/app/spike/releases/1.2.0/`
- `/opt/nex/packages/adapter/github/releases/1.4.0/`
- `/opt/nex/data/app/spike/`

Rules:

1. release contents are immutable after unpack
2. mutable state lives only under `/opt/nex/data/...`
3. upgrades never overwrite the active release in place

---

## Frontdoor Install-State Model

Hosted installs need server-level state for all package kinds, not just apps.

### `frontdoor_server_package_installs`

```sql
CREATE TABLE frontdoor_server_package_installs (
  server_id TEXT NOT NULL REFERENCES frontdoor_servers(server_id),
  package_id TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- app | adapter | service | runtime
  desired_release_id TEXT,
  active_release_id TEXT,
  status TEXT NOT NULL,                     -- pending | staging | installing | active | upgrading | failed | uninstalling | removed | rolled_back
  install_reason TEXT NOT NULL,             -- direct | dependency | system
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (server_id, kind, package_id)
);
```

### `frontdoor_server_package_requirements`

```sql
CREATE TABLE frontdoor_server_package_requirements (
  server_id TEXT NOT NULL REFERENCES frontdoor_servers(server_id),
  requiring_kind TEXT NOT NULL,
  requiring_package_id TEXT NOT NULL,
  required_kind TEXT NOT NULL,
  required_package_id TEXT NOT NULL,
  version_constraint TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (
    server_id,
    requiring_kind,
    requiring_package_id,
    required_kind,
    required_package_id
  )
);
```

This is what lets an adapter remain installed after one app is removed while still being garbage-collectable later when nothing requires it.

---

## Install Flow

### 1. Frontdoor resolves the release plan

Frontdoor:

1. verifies entitlement
2. resolves the target package release
3. resolves dependency releases from the registry
4. writes desired state for every package in the plan
5. stages the required tarballs onto the server

### 2. Frontdoor executes the plan in dependency order

Dependencies install before dependents.

Typical order:

1. shared services
2. adapters
3. apps

### 3. Runtime performs package install

Canonical install sequence:

1. verify operator auth
2. validate the staged tarball checksum
3. unpack the tarball into a new release directory
4. validate the manifest and package contents
5. create the data directory if needed
6. run `onInstall`
7. start declared services
8. wait for service health checks
9. run `onActivate`
10. point `active` at the installed release
11. mark the package active

If a step fails before activation completes, the runtime marks the install failed and does not advance the active release pointer.

---

## Uninstall Flow

### Direct uninstall

When a user uninstalls an app, frontdoor:

1. removes the app's direct install intent
2. removes dependency requirement edges for that app
3. asks the runtime to uninstall the app package

The runtime then:

1. runs `onDeactivate`
2. stops services
3. runs `onUninstall`
4. removes the active release pointer
5. marks the package removed

### Shared dependency behavior

Dependencies are not removed just because one app is removed.

A dependency can be removed only when:

1. it was directly uninstalled, or
2. it has no remaining requirement edges on that server

That means:

- uninstalling Spike can leave the GitHub adapter installed
- later installs can reuse the existing adapter package

---

## Upgrade Flow

### Upgrade principles

1. never overwrite the live release in place
2. separate code from data
3. stage and validate before switching
4. snapshot mutable data before destructive migrations
5. health-gate activation
6. rollback quickly on failure

### Canonical upgrade sequence

1. frontdoor resolves the target release and dependency plan
2. frontdoor stages the new tarball on the server
3. runtime validates the staged tarball
4. runtime unpacks the new release into an inactive release directory
5. runtime snapshots the package data directory into `/opt/nex/backups/<operationId>/`
6. runtime runs `onDeactivate` on the active release
7. runtime stops the old services
8. runtime switches the `active` pointer to the new release
9. runtime runs `onUpgrade` for the new release
10. runtime starts the new services
11. runtime waits for health checks
12. runtime runs `onActivate`
13. runtime marks the new release active

### Rollback behavior

If any critical step fails after the active pointer is switched:

1. runtime stops the new services
2. runtime switches `active` back to the last healthy release
3. runtime restores the data snapshot if the upgrade mutated data
4. runtime starts the previous release
5. runtime marks the operation `rolled_back`
6. frontdoor records the failure and exposes the error

Rollback is part of the intended hosted UX, not an optional extra.

---

## User-Visible Lifecycle States

These states should be available to frontdoor and the UI:

- `pending`
- `staging`
- `installing`
- `upgrading`
- `migrating`
- `starting`
- `verifying`
- `active`
- `failed`
- `rolled_back`
- `uninstalling`
- `removed`

These states exist so the UX can show clear progress instead of a binary spinner.

---

## Health Contract

Health is package-specific but follows one rule:

- a package is not active until required health checks pass

For service-routed apps:

- each long-running service may declare a `healthCheck` path
- all required services must pass health before the package is marked active

For inline apps:

- activation success is based on handler and hook initialization, not service health

---

## Best-Practice Defaults

### Data safety

For SQLite-backed apps, snapshotting the app data directory before `onUpgrade` is the default rollback mechanism.

### Downtime

Short explicit maintenance windows are acceptable. Reliable rollback is more important than pretending upgrades are seamless.

### Dependency upgrades

Frontdoor should treat dependency upgrades as explicit plan items, not hidden side effects.

---

## Non-Negotiable Lifecycle Contract

1. Frontdoor plans and stages; runtime validates and activates.
2. Releases are immutable and versioned.
3. Data lives outside the release directory.
4. Dependencies install before dependents.
5. Shared dependencies survive unrelated app uninstalls.
6. Upgrades are staged, health-gated, and rollback-capable.
