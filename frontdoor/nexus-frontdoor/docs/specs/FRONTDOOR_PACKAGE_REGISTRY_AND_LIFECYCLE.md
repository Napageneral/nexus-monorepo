# Frontdoor Package Registry And Lifecycle

**Status:** CANONICAL
**Last Updated:** 2026-03-10
**Related:**
- `FRONTDOOR_ARCHITECTURE.md`
- `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
- `FRONTDOOR_RELEASE_DEPENDENCY_METADATA_AND_INSTALL_PLANNING.md`
- `../../nex/docs/specs/platform/package-registry-and-release-lifecycle.md`
- `../../nex/docs/specs/platform/package-operator-api-and-hosted-cutover.md`
- `../../nex/docs/specs/apps/app-manifest-and-package-model.md`

---

## Purpose

This document defines the frontdoor-specific package registry and lifecycle model.

It covers what frontdoor owns for:

- package publishing and durable storage
- release metadata and dependency metadata
- server package install state
- install, uninstall, and upgrade orchestration
- staged delivery to hosted runtimes

---

## Frontdoor Responsibility Boundary

Frontdoor owns:

1. registry metadata
2. durable blob storage pointers
3. package publish ingest
4. dependency resolution
5. install and upgrade plan construction
6. server-level desired and active package state
7. staging package artifacts on target servers
8. invoking runtime operator lifecycle endpoints

The runtime owns validation, activation, health checks, and rollback execution.

---

## Package Kinds

Frontdoor manages one registry for all installable package kinds:

- `runtime`
- `app`
- `adapter`

Customer-facing purchases are usually app-scoped, but install orchestration is package-scoped.

---

## Product Catalog vs Registry

Frontdoor keeps two related but separate systems:

### Product catalog

Used for:

- branded listing pages
- plans
- billing
- entitlements

### Package registry

Used for:

- installable package identity
- immutable releases
- target-platform variants
- dependency edges
- staged install inputs

Apps may map to product catalog records, but the product catalog is not the release registry.

---

## Canonical Frontdoor Data Model

### Registry metadata

```sql
CREATE TABLE frontdoor_packages (
  package_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  publisher_id TEXT,
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE frontdoor_package_releases (
  release_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES frontdoor_packages(package_id),
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  changelog TEXT,
  channel TEXT NOT NULL DEFAULT 'stable',
  status TEXT NOT NULL DEFAULT 'published',
  published_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(package_id, version)
);

CREATE TABLE frontdoor_registry_blobs (
  blob_id TEXT PRIMARY KEY,
  storage_backend TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(storage_backend, storage_key),
  UNIQUE(sha256)
);

CREATE TABLE frontdoor_release_variants (
  variant_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES frontdoor_package_releases(release_id),
  target_os TEXT NOT NULL,
  target_arch TEXT NOT NULL,
  package_format TEXT NOT NULL,
  tarball_blob_id TEXT NOT NULL REFERENCES frontdoor_registry_blobs(blob_id),
  manifest_blob_id TEXT,
  signature_blob_id TEXT,
  sbom_blob_id TEXT,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(release_id, target_os, target_arch)
);

CREATE TABLE frontdoor_release_dependencies (
  release_id TEXT NOT NULL REFERENCES frontdoor_package_releases(release_id),
  dependency_kind TEXT NOT NULL,
  dependency_package_id TEXT NOT NULL REFERENCES frontdoor_packages(package_id),
  version_constraint TEXT NOT NULL,
  required_for_activate INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, dependency_kind, dependency_package_id)
);
```

`dependency_kind` is the logical dependency class from the manifest
(`app`/`adapter`), not a second hidden package taxonomy. Install planning must
resolve the actual package kind from `frontdoor_packages` before invoking
runtime operator install.

### Server package state

```sql
CREATE TABLE frontdoor_server_package_installs (
  server_id TEXT NOT NULL REFERENCES frontdoor_servers(server_id),
  package_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  desired_release_id TEXT,
  active_release_id TEXT,
  status TEXT NOT NULL,
  install_reason TEXT NOT NULL,
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (server_id, kind, package_id)
);

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

---

## Publish Flow

Publish is push-based.

Frontdoor publish ingest:

1. receives a manifest snapshot and one or more target-platform tarballs
2. validates package identity and version
3. writes blobs to durable storage
4. writes release and dependency metadata
5. marks the release published

Frontdoor learns about new versions when publish succeeds. It does not poll the filesystem.

Release variants are meaningful only if install planning selects them correctly.
Frontdoor must resolve the target server runtime platform and choose an exact
`target_os` and `target_arch` match for install and upgrade.

---

## Install Planning

When a user installs an app on a server, frontdoor:

1. verifies account entitlement
2. resolves the desired app release
3. resolves the target server runtime platform
4. resolves all required adapter and dependent-app releases
5. chooses exact target-platform release variants for that server
6. writes desired server package state
7. stages the needed tarballs on the target server
8. invokes runtime operator install endpoints in dependency order

Typical order:

1. app dependencies that provide shared backend behavior
2. adapters
3. top-level app

Frontdoor may expose app-focused public APIs, but the execution model underneath is package-plan based.

The focused dependency metadata and planning rules for this behavior are defined
in
[Frontdoor Release Dependency Metadata And Install Planning](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_RELEASE_DEPENDENCY_METADATA_AND_INSTALL_PLANNING.md).

If no exact release variant exists for the target runtime platform, Frontdoor
must fail planning before operator install with a concrete variant-missing
error.

---

## Install, Uninstall, And Upgrade Orchestration

Customer-facing app install APIs may remain app-shaped, but they must project
onto package-backed release and server state underneath. Frontdoor must not keep
an app-only hosted install system in parallel with the package lifecycle system.

### Install

Frontdoor:

1. resolves release and dependencies
2. stages tarballs
3. calls runtime operator install
4. records package state transitions

### Uninstall

Frontdoor:

1. removes direct install intent
2. removes dependency requirement edges for the uninstalling package
3. calls runtime operator uninstall
4. leaves shared dependencies installed until nothing requires them

### Upgrade

Frontdoor:

1. resolves target release and dependent package changes
2. stages new tarballs
3. calls runtime operator upgrade
4. records desired and active release transitions
5. exposes lifecycle state to the UI

Frontdoor does not perform in-place extraction logic itself. The runtime owns staged activation and rollback.

---

## Provisioning Integration

When a newly provisioned server becomes ready:

1. frontdoor resolves all packages that should be present on that server
2. frontdoor builds the dependency-aware install plan
3. frontdoor stages artifacts
4. frontdoor executes installs in dependency order

Auto-install on provisioning is therefore the same lifecycle system as manual install, not a special one-off path.

---

## Durable Storage Model

Frontdoor metadata lives in the database.

Artifact bytes live in durable storage referenced by `frontdoor_registry_blobs`.

Supported storage classes:

- durable filesystem volume
- object storage

The registry does not rely on process memory or ad hoc local tarball directories as the system of record.

---

## Non-Negotiable Frontdoor Rules

1. Frontdoor is the registry system of record.
2. Releases are immutable.
3. Install orchestration is package-based, not app-only.
4. Shared dependencies survive unrelated app uninstalls.
5. Frontdoor stages and plans; the runtime validates and activates.
6. Upgrades are staged and rollback-capable.
