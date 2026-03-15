---
summary: "Canonical Frontdoor API and runtime delivery model for server-scoped adapter package install."
read_when:
  - You are exposing adapter install through Frontdoor
  - You are validating local hosted server flows before production VPS provisioning
title: "Frontdoor Server Adapter Install API"
---

# Frontdoor Server Adapter Install API

## Purpose

This document defines the canonical Frontdoor surface for installing shared
adapter packages on a server.

It covers:

- the customer-facing hosted experience
- the public Frontdoor API shape
- how Frontdoor delivers adapter packages to runtimes
- the local hosted stepping-stone path versus production VPS delivery

## Customer Experience

The customer experience should be:

1. create or select a server in Frontdoor
2. install an adapter on that server from Frontdoor
3. see install status and package health from Frontdoor
4. create a connection against the installed adapter inside the runtime
5. ingest records and use outbound adapter actions from that server

The customer should not need to:

- call raw runtime operator package endpoints
- know where the adapter tarball lives on disk
- care whether Frontdoor is talking to a local runtime or a provisioned VPS

## Non-Negotiable Rules

1. Frontdoor is the public hosted control plane for server-scoped adapter install
2. installed adapters are shared packages, not app-private binaries
3. Frontdoor owns install intent and server package state
4. the runtime still owns package validation, activation, rollback, and health
5. local hosted validation must use the same Frontdoor API shape as production
6. local delivery shortcuts are allowed only below the API boundary

## Public API

Frontdoor must expose adapter routes parallel to app routes:

- `GET /api/servers/:serverId/adapters`
- `GET /api/servers/:serverId/adapters/:adapterId/install-status`
- `POST /api/servers/:serverId/adapters/:adapterId/install`
- `POST /api/servers/:serverId/adapters/:adapterId/upgrade`
- `DELETE /api/servers/:serverId/adapters/:adapterId/install`

## Install Semantics

Installing an adapter from Frontdoor means:

1. verify the caller is a server admin
2. resolve the adapter package release variant from the Frontdoor registry
3. record server package state as `installing`
4. deliver the release artifact to the runtime
5. call runtime operator install
6. persist active server package state as `installed`

Frontdoor must write durable state into `frontdoor_server_package_installs`.

## Delivery Model

Frontdoor supports two delivery transports under one API:

### Production VPS delivery

Use SSH/SCP staging plus runtime operator install.

This is the current hosted production shape.

### Local hosted stepping-stone delivery

When Frontdoor and the runtime share one filesystem and the target runtime is a
local development runtime, Frontdoor may call runtime operator install directly
using the local tarball path as `staged_artifact.server_path`.

This is allowed because:

1. the public API is unchanged
2. the runtime still validates and activates the package
3. only the transport implementation differs

This local direct path must be treated as a delivery transport optimization, not
as a separate install model.

## Package Health Versus Connection Health

Frontdoor server adapter install routes report package state, not provider
credential health.

Package health answers:

- is the adapter package installed on this server
- did activation succeed
- what is the last package-level error

Connection health remains a runtime adapter concern after installation.

## Relationship To Existing Canonical Specs

- [Frontdoor Architecture](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_ARCHITECTURE.md)
- [Frontdoor Package Registry And Lifecycle](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md)
- [Adapter Package Distribution and Install](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md)

## Validation Target

The stepping-stone green bar is:

1. local Frontdoor creates or selects a server
2. local Frontdoor installs `confluence` through the public server adapter route
3. the runtime activates the adapter package
4. a live Confluence connection is created against that installed adapter
5. records, contacts, and channels ingest correctly
6. `channels.send` and `channels.delete` work through that server/runtime

## Current Implementation State

As of March 11, 2026, the public Frontdoor adapter lifecycle slice described
above is implemented in `server.ts`:

- `GET /api/servers/:serverId/adapters`
- `GET /api/servers/:serverId/adapters/:adapterId/install-status`
- `POST /api/servers/:serverId/adapters/:adapterId/install`
- `POST /api/servers/:serverId/adapters/:adapterId/upgrade`
- `DELETE /api/servers/:serverId/adapters/:adapterId/install`

The runtime delivery layer is also implemented in both supported transport
modes:

- local hosted direct runtime install via `installPackageViaRuntimeHttp`
- production VPS SSH/SCP delivery via `installPackageViaSSH`

The remaining hosted stepping-stone work is not route creation. It is the live
end-to-end proof that:

1. Frontdoor server creation/select and adapter install work together
2. the installed Confluence adapter can complete the canonical custom setup flow
3. backfill and monitor ingest materialize records, channels, and contacts
4. adapter package upgrade/uninstall behave cleanly on real hosted servers
5. `channels.send` and `channels.delete` preserve write-read coherence
