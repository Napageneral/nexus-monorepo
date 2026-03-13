# Transport Surface Model

**Status:** CANONICAL
**Last Updated:** 2026-03-12

---

## Purpose

This document defines the canonical transport surface model for the Nex
runtime.

It exists to hard-cut the remaining ambiguity between:

1. transport protocols
2. API contracts
3. caller types
4. internal dispatch sources
5. route families
6. product/platform relays

The target state is simple:

- Nex API operations are defined once
- app methods extend that same runtime API model
- auth and IAM decide who may call them
- transport decides only how requests are carried
- browser document launch is routing, not an operation

Transport must not fragment the runtime API.

---

## Customer Experience

The customer and app developer experience should feel boring:

1. a Nex API operation or app method exists once
2. it has one schema and one IAM contract
3. callers choose HTTP or WebSocket based on ergonomics
4. they do not need to know whether a method was "mounted" on a surface
5. they do not need to reason about a second browser-only pseudo API

Examples:

1. a browser UI may call `aix.runs.list`
2. a machine client may call `aix.runs.list`
3. a service binary may call `aix.runs.list`

They are all calling the same operation.

The runtime must not create artificial capability differences such as:

- works over WebSocket
- 404s over HTTP
- exists in the taxonomy but is unreachable from one normal core transport

That state is not acceptable.

---

## Design Rules

1. Core operations are transport-neutral.
2. Auth and IAM decide access. Transport does not decide capability.
3. Transport surfaces are real wire protocols only.
4. Internal dispatch sources are not surfaces.
5. Caller classes are not surfaces.
6. Browser document routes are not generic core operations.
7. App manifests define operations and schemas, not transport reachability, for
   ordinary Nex-facing app methods.
8. Frontdoor API, Nex API, Adapter API, and App API are separate contracts.
9. Route families and compatibility endpoints must be owned by one of those API
   contracts. They are not a fifth contract category.
10. `productControlPlane` is a hosted-platform relay concept, not a Nex API
    transport concept.

---

## Naming Locks

Canonical names in this model are:

1. `runtime API`
   - the Nex API transport boundary for runtime methods
2. `operator console`
   - the built-in browser/operator app surface for Nex
3. `productControlPlane`
   - retained as the hosted platform relay concept between frontdoor and
     product-specific behavior

The following are legacy residue and not canonical target-state terms for the
runtime API model:

1. `control-plane` when referring to the ordinary Nex API boundary
2. `control-ui` for the built-in browser/operator experience
3. `http.control`
4. `ws.control`
5. `adapter.cli`
6. `internal.clock`
7. `apps.open.*`

---

## API Contract Split

Nex has four top-level API contracts:

1. **Frontdoor API**
   - account, billing, provisioning, shell, and hosted platform APIs
2. **Nex API**
   - the canonical runtime operation taxonomy
3. **Adapter API**
   - adapter-owned provider/protocol bridge contracts
4. **App API**
   - product-specific API extensions owned by an installed app

Transport sits beneath those contracts.

Transport must not create new API categories.

This means:

1. HTTP is not an API category
2. WebSocket is not an API category
3. browser document launch is not an API category
4. webhook/callback ownership must resolve to frontdoor, app, or adapter

---

## Canonical Taxonomy

### Transport surfaces

These are the only canonical transport surfaces:

1. `ws`
   - persistent bidirectional core transport
2. `http`
   - stateless request/response transport
3. `stdio`
   - canonical internal child-process transport for runtime-managed child
     processes
4. `grpc`
   - reserved future transport for a distributed service model

These are protocols.

They are not:

- auth levels
- caller identities
- route names
- operation allowlists

### Internal dispatch sources

These are not surfaces:

1. scheduler
2. hookpoint dispatcher
3. job runner
4. internal agent dispatch
5. lifecycle/bootstrap dispatch

These mechanisms dispatch directly into the runtime pipeline without an external
transport boundary.

The runtime may record their source in tracing and audit metadata, but they do
not belong in the transport surface taxonomy.

### Caller classes

These are not surfaces:

1. CLI
2. browser UI
3. app UI
4. app service
5. adapter binary
6. machine client
7. external integration

Callers use transports.

Callers are not transports.

### Route families

These are not surfaces either:

1. `/runtime/operations/<method>`
2. `/health`
3. `/app/<appId>/`
4. `/api/<appId>/...`
5. webhook/callback endpoints

These are HTTP route families.

They are transport entrypoints or document paths, not operation-surface
categories.

---

## Runtime API Projection Model

### Nex API operations

All ordinary Nex API operations are available over all normal external Nex
transports.

In the canonical target state that means:

1. HTTP may invoke them
2. WebSocket may invoke them
3. stdio may invoke them when a runtime-managed child process uses the runtime
   SDK

The operation definition does not change by transport.

Each transport projects the same:

1. operation name
2. request schema
3. response schema
4. access semantics
5. tracing identity

What differs by transport is only wire behavior:

1. request framing
2. session lifecycle
3. streaming semantics
4. connection persistence

### App methods

App methods extend the Nex runtime API.

They follow the same projection rule:

1. one method definition
2. one schema contract
3. one IAM model
4. transport-neutral reachability over normal Nex transports

App methods are not a parallel transport-specific API.

### Protocol/bootstrap operations

Transport bootstrap mechanics may remain transport-specific.

Examples:

1. WebSocket handshake/bootstrap
2. HTTP bearer token exchange paths
3. browser document fetches

These are transport mechanics, not ordinary Nex API operations.

They do not justify transport-gating ordinary Nex API operations or app
methods.

### Browser document routes

Browser document launch is not an operation.

Examples:

1. `/app/<appId>/`
2. `/app/<appId>/...`

These are document and browser-route concerns.

If the system needs app launch/readiness metadata, that belongs in explicit
runtime, app, or frontdoor APIs. It does not justify pseudo-operations such as
`apps.open.*`.

`apps.open.*` is not part of the canonical target state.

### Compatibility and callback routes

Compatibility endpoints, callbacks, and webhook-style entrypoints must belong to
an existing top-level API contract:

1. **App API**
   - product-specific callbacks and compatibility endpoints
2. **Adapter API**
   - generic provider/protocol bridges and reusable provider callbacks
3. **Frontdoor API**
   - hosted provisioning callbacks and platform account/auth flows

They must not be modeled as a fifth API contract or a special transport
surface.
