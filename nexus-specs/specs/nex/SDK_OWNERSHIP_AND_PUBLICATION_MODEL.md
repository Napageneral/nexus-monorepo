# SDK Ownership And Publication Model

## Customer Experience

A developer building against the platform should be able to:

1. find the published machine-readable API contracts in one central place
2. find the ergonomic SDK for a given system in that system's owning repository
3. trust that the SDK and the published OpenAPI contract come from the same source contract
4. avoid guessing whether the source of truth is code, YAML, or a generated client

This model separates publication from ownership without creating drift.

## Problem

There are two valid needs that can be confused if they are not modeled explicitly:

1. a central workspace-level publication surface for all public contracts
2. repo-local SDKs that evolve with their owning implementation

If we centralize only the contracts, SDK authors lose locality and release discipline.
If we keep only repo-local specs, there is no single obvious place to inspect the platform.
If we make SDKs the source of truth, the contracts drift and the system becomes opaque.

## Hard-Cut Rules

1. OpenAPI artifacts are generated, not handwritten.
2. SDKs are generated from the same owning contract source as the published OpenAPI artifacts.
3. The central `contracts/` tree is the publication registry, not the authoring home.
4. The owning repo remains the only place where contract logic is defined.
5. Generated SDKs are not the canonical source of truth.
6. No backward-compatibility shim layer between contract source, OpenAPI publication, and SDK generation.

## Ownership Model

### 1. Frontdoor API

Owning repo:
- `nexus-frontdoor/`

Owning contract source:
- route-contract definitions inside the Frontdoor repo

Published artifact:
- `contracts/frontdoor/openapi.yaml`

Owning SDK location:
- `nexus-frontdoor/sdk/` or equivalent repo-local package path

### 2. Nex API

Owning repo:
- `nex/`

Owning contract source:
- `nex/src/nex/runtime-api/`

Published artifact:
- `contracts/nex/openapi.yaml`

Owning SDK location:
- `nex/sdk/` or equivalent repo-local package path

### 3. App API

Owning repo/package:
- the app package itself

Owning contract source:
- app manifest method contracts + app-local schema supplements

Published artifact:
- `contracts/apps/<appId>/openapi.yaml`

Owning SDK location:
- inside the app's owning package/repo if that app warrants an SDK

### 4. Adapter API

Owning repo/package:
- the adapter package itself

Owning contract source:
- adapter-owned HTTP/compatibility contract definitions

Published artifact:
- `contracts/adapters/<adapterId>/openapi.yaml`

Owning SDK location:
- inside the adapter SDK repo/package or adapter repo, depending on language/release model

## Central Publication Registry

Canonical publication root:
- `/Users/tyler/nexus/home/projects/nexus/contracts/`

This directory exists to answer:

1. what are the currently published contracts
2. where can tooling/docs/readers find them centrally
3. what should downstream documentation, portal rendering, and external inspection consume

It does not answer:

1. where contract logic is authored
2. where SDK ergonomics live
3. where handler code is implemented

## Source Of Truth Pipeline

The required pipeline is:

1. code-facing contract source in the owning repo
2. OpenAPI generation from that source
3. publication of generated OpenAPI into `contracts/`
4. SDK generation from the same owning contract source or generated OpenAPI
5. tests/conformance against the real handlers/routes

The prohibited pipeline is:

1. handwritten YAML
2. manual SDK editing
3. SDK-first contract definition
4. central `contracts/` edits as authoring

## Why Repo-Local SDKs Are Correct

Repo-local SDK ownership is correct because:

1. release cadence belongs to the owning system
2. tests should live next to the implementation
3. auth ergonomics and helper abstractions are system-specific
4. generated code should be reviewed and versioned with the code that owns the API

This is true even though the published OpenAPI artifacts are centralized.

## Why Central Contracts Are Still Required

Central publication is still required because:

1. the workspace needs one obvious contract registry
2. docs/discovery/portal tooling needs one stable root
3. product teams should not need to hunt across repos to inspect the current public contract
4. cross-system comparison becomes much easier

## Non-Conflict Rule

There is no conflict between central contracts and repo-local SDKs if the following rule is obeyed:

- the source of truth is the owning contract layer in the owning repo
- both the central OpenAPI artifact and the repo-local SDK are generated projections of that same source

## First-Wave SDK Recommendation

The first SDKs should follow the same sequence as the OpenAPI rollout:

1. Frontdoor SDK in `nexus-frontdoor/`
2. Nex SDK in `nex/`
3. App-specific SDKs only when a given app clearly benefits from one
4. Adapter SDKs only where there is a stable adapter-facing external contract worth packaging

## Recommended Repo Layouts

Suggested layouts:

### Frontdoor

- `nexus-frontdoor/src/openapi/` — contract source / OpenAPI builder
- `nexus-frontdoor/sdk/` — repo-local generated SDK(s)

### Nex

- `nex/src/nex/runtime-api/openapi/` — contract source / OpenAPI builder
- `nex/sdk/` — repo-local generated SDK(s)

### Apps

- `apps/<appId>/app/openapi/` — app-local schema support
- `apps/<appId>/sdk/` — only if that app warrants a dedicated SDK

### Adapters

- adapter-local contract source in the adapter repo/package
- generated SDK only when that adapter exposes a reusable external API contract

## Validation Requirements

Any SDK publication path must prove:

1. the published OpenAPI artifact is current
2. the generated SDK is generated from the same contract revision
3. representative SDK calls pass against real handlers/routes
4. the repo-local SDK can be regenerated deterministically

## Completion Criteria

This model is considered adopted when:

1. the central `contracts/` tree remains the publication registry
2. the first repo-local SDKs are generated from the same contract sources as the published OpenAPI artifacts
3. no system treats a generated SDK as the canonical source of truth
