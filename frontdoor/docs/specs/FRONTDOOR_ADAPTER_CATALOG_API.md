# Frontdoor Adapter Catalog API

**Status:** CANONICAL
**Last Updated:** 2026-04-07
**Related:**
- `FRONTDOOR_ARCHITECTURE.md`
- `FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`
- `../../nex/docs/specs/platform/package-registry-and-release-lifecycle.md`

---

## Purpose

This document defines the canonical public read API for the published adapter
catalog.

It exists so runtime and operator clients can source the published adapter set
from Frontdoor directly instead of inferring it from local registry databases,
workspace scans, or connection inventory.

---

## Responsibility Boundary

Frontdoor owns the published adapter catalog because Frontdoor owns:

1. package registry metadata
2. immutable adapter releases
3. release variants
4. publish state

Nex local runtime may still merge additional local facts such as:

1. installed adapters
2. runtime-registered adapters
3. workspace adapter manifests

But the **published** slice must come from Frontdoor's public adapter catalog
API.

---

## Canonical Route

Frontdoor must expose:

- `GET /api/adapters/catalog`

The route is public read-only.

It returns the latest published release for every adapter package that:

1. has `frontdoor_packages.kind = 'adapter'`
2. has an active package row
3. has a latest published release
4. has at least one published release variant

---

## Response Shape

```json
{
  "ok": true,
  "items": [
    {
      "adapter_id": "slack",
      "display_name": "Slack",
      "description": "Slack adapter",
      "latest_version": "1.2.3",
      "release_id": "rel-slack-1.2.3"
    }
  ]
}
```

Rules:

1. `adapter_id` is the canonical adapter package id.
2. `display_name` is the published package display name.
3. `description` may be `null`.
4. `latest_version` is the latest published version visible in the registry.
5. `release_id` is the concrete latest published release id.

This route is intentionally package-registry-backed. It is not a product
catalog route and it is not a runtime-install inventory route.

---

## Consumer Contract

Consumers such as the Nex Operator Console must use this route only for the
**Published catalog** section.

They must not use this route to infer:

1. installed local adapters
2. workspace-supported adapters
3. current connection rows

Those remain separate local/runtime concerns.

---

## Operator Console Assembly Model

The Connectors add-flow assembles three sections:

1. `Published catalog`
   Sourced from `GET /api/adapters/catalog`
2. `Installed locally`
   Sourced from runtime registration and local install state
3. `Workspace adapters`
   Sourced from workspace adapter manifests

The add-flow must remain draft-first:

1. choosing an adapter creates a fresh connection draft
2. existing durable connections do not block draft creation
3. multi-account platforms may create any number of connection rows

Frontdoor catalog membership must never be reduced to "adapters that already
have connections."
