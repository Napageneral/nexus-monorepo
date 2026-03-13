# Nex API Capture And Publication Model

## Purpose

Define how the Frontdoor API and Nex API are captured in code, projected into OpenAPI, and published as canonical machine-readable contracts.

This document exists because OpenAPI artifacts alone are not enough. We also need a stable code-facing contract layer so the published specs are generated from an explicit owner instead of scraped from scattered handlers.

## Customer Experience

A developer working in Nexus should be able to answer these questions quickly:

1. What APIs exist?
2. Who owns each API?
3. Where is each API defined in code?
4. Where is each API published as OpenAPI?
5. How do HTTP and WebSocket relate to the same runtime methods?

The answer must be obvious and stable.

## Top-Level API Contracts

Nexus has four top-level API contracts:

1. Frontdoor API
2. Nex API
3. App API
4. Adapter API

These are the only top-level API categories.

## Core Rule

Every top-level API contract must have:

1. An explicit code-facing contract layer
2. A canonical published OpenAPI artifact where applicable
3. A deterministic generation path from code-facing contract layer to published artifact
4. Conformance tests that prove published contract and live behavior remain aligned

OpenAPI is a projection of the contract layer.
It is not the source of truth by itself.

## Why OpenAPI Alone Is Not Enough

If the only canonical artifact is `contracts/<family>/openapi.yaml`, then the implementation still has no clear code-facing owner.
That causes three failures:

1. Runtime handlers drift independently from published API artifacts.
2. Discovery and generation logic become ad hoc.
3. Future contributors cannot tell which file to update when adding or changing an API method.

So the system needs both:

1. a code-facing contract owner
2. a published machine-readable artifact

## Contract Ownership Model

### Frontdoor API

The Frontdoor API should have a dedicated contract layer in code.

Recommended code home:

- `nexus-frontdoor/src/api/`

Recommended internal structure:

- `nexus-frontdoor/src/api/routes/`
- `nexus-frontdoor/src/api/schemas/`
- `nexus-frontdoor/src/api/openapi/`

The route contract layer should define:

1. route path
2. HTTP method
3. request schema
4. success schema
5. known error schemas
6. security scheme
7. operation id
8. tags

`server.ts` should become an implementation consumer of that route layer, not the primary place where the public API contract is inferred.

### Nex API

The Nex API should have a dedicated contract layer in code.

Canonical code home:

- `nex/src/nex/runtime-api/`

Canonical internal structure:

- `nex/src/nex/runtime-api/runtime-operations.ts`
- `nex/src/nex/runtime-api/protocol/`
- `nex/src/nex/runtime-api/http-runtime-api-routes.ts`
- `nex/src/nex/runtime-api/http-runtime-api-operation-resolver.ts`
- `nex/src/nex/runtime-api/openapi/`

This contract layer should own:

1. canonical operation ids
2. operation kind/category
3. action
4. request schema
5. response schema
6. IAM resource
7. protocol/bootstrap classification where applicable
8. projection metadata for HTTP and WebSocket

The Nex API is one API.
HTTP and WebSocket are projections of that API.

### App API

Each app owns its own App API contract.

Code home should remain colocated with the app package.

Recommended shape:

- `apps/<appId>/app/openapi/`
- `apps/<appId>/app/methods/`

Published artifact location remains centralized under:

- `contracts/apps/<appId>/openapi.yaml`

### Adapter API

Each adapter that exposes a reusable external HTTP contract owns its own Adapter API contract.

Code home should remain colocated with the adapter.

Published artifact location remains centralized under:

- `contracts/adapters/<adapterId>/openapi.yaml`

Not every adapter needs an OpenAPI artifact.
Only adapters with a real reusable external HTTP contract should publish one.

## Dedicated Router-Facing Interface

### Frontdoor

Yes, Frontdoor should have a dedicated router-facing contract interface.

That does not mean a giant monolithic router file.
It means there should be one coherent route contract layer that the runtime HTTP server consumes.

The route contract layer should be the public API inventory.
Handlers can still live in domain files.

### Nex

Yes, Nex should also have a dedicated router-facing contract interface.

But in Nex, the concept is slightly different.
Nex is fundamentally operation-oriented, not route-oriented.

So the dedicated interface should be:

1. a canonical operation registry
2. plus transport projections

That means:

- operation registry is primary
- HTTP route mapping is secondary
- WS dispatch mapping is secondary

The canonical code-facing API owner for Nex is therefore the `runtime-api/` operation contract layer, not a giant HTTP router.

## Current Reality

Today the code is still too scattered.

### Frontdoor current state

Public routes are still mostly embedded in:

- `nexus-frontdoor/src/server.ts`

The first-wave OpenAPI work introduced a contract file:

- `nexus-frontdoor/src/openapi/frontdoor-contract.ts`

That is a step in the right direction, but it is still not the full dedicated API layer.

### Nex current state

Nex runtime operation ownership is split across:

- `nex/src/nex/runtime-api/runtime-operations.ts`
- `nex/src/nex/runtime-api/http-runtime-api-operation-resolver.ts`
- `nex/src/nex/runtime-api/server/ws-connection/message-handler.ts`
- `nex/src/nex/runtime-api/server-methods/`

That is now the dedicated API capture layer.

The remaining cleanup is inside that layer:

1. taxonomy
2. transport routing
3. handler dispatch
4. schema richness

## Long-Term Target State

### Frontdoor

Frontdoor should expose one explicit public API layer in code:

- `nexus-frontdoor/src/api/`

This layer should drive:

1. HTTP route registration
2. OpenAPI generation
3. API discovery docs
4. conformance tests

### Nex

Nex should expose one explicit public API layer in code:

- `nex/src/nex/runtime-api/`

This layer should drive:

1. operation discovery
2. HTTP projection
3. WebSocket projection
4. OpenAPI generation for HTTP projection
5. runtime method catalogs
6. conformance tests

## Publication Model

Published machine-readable artifacts remain centralized under:

- `contracts/frontdoor/openapi.yaml`
- `contracts/nex/openapi.yaml`
- `contracts/apps/<appId>/openapi.yaml`
- `contracts/adapters/<adapterId>/openapi.yaml`

This central publication tree is for consumers.
It is not the authoring location.

## Recommended Sequence

### Phase 1

Harden the first two published contracts:

1. Frontdoor API
2. AIX App API

### Phase 2

Continue hardening the dedicated Nex API contract layer:

- `nex/src/nex/runtime-api/`

Then publish:

- `contracts/nex/openapi.yaml`

### Phase 3

Migrate Frontdoor from `src/server.ts`-embedded route ownership to:

- `nexus-frontdoor/src/api/`

### Phase 4

Decide which adapters deserve published OpenAPI artifacts.

## Design Principles

1. One owner in code per API contract
2. One published artifact per API contract
3. OpenAPI is generated, not hand-maintained
4. HTTP and WebSocket are projections, not separate Nex APIs
5. App and adapter contracts stay colocated with their owning package code
6. Published artifacts stay centralized in `contracts/`

## Hard Cutover Policy

This should be a hard cutover.

Do not preserve old scattered ownership patterns once the dedicated contract layers are established.
Do not leave pseudo-canonical mirrors behind.

When a contract layer becomes canonical:

1. route/operation inventory must move there
2. generators must read from there
3. tests must validate against there
4. older ad hoc inventories should be removed
