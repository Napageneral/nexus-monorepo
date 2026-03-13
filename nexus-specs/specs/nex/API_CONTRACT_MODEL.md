# API Contract Model

**Status:** CANONICAL
**Last Updated:** 2026-03-12

---

## Purpose

This document defines the canonical API contract split across the Nex platform.

It exists to keep four different concerns cleanly separated:

1. frontdoor-owned platform APIs
2. the Nex runtime API
3. adapter-owned bridge APIs
4. app-owned product APIs

This separation is foundational for:

1. runtime taxonomy clarity
2. transport projection clarity
3. OpenAPI generation
4. SDK generation
5. hosted routing ownership

---

## Customer Experience

A customer, operator, or app developer should be able to answer four simple
questions:

1. am I talking to frontdoor, the runtime, an app, or an adapter?
2. what methods or endpoints exist there?
3. how do I authenticate?
4. can I discover the schema quickly?

The system should not require them to reverse-engineer:

1. whether a browser route is secretly an operation
2. whether a compatibility route is secretly part of the Nex core API
3. whether HTTP and WebSocket expose different capabilities
4. whether a callback belongs to frontdoor, an app, or an adapter

The target state is:

1. one clear API owner per endpoint or method
2. one clear schema source of truth
3. one clear OpenAPI and SDK projection path

---

## The Four API Contracts

### 1. Frontdoor API

The Frontdoor API owns:

1. account and identity surfaces
2. billing and provisioning
3. hosted server lifecycle
4. hosted package publish/install orchestration
5. shell rendering and shell-profile launch
6. hosted platform metadata and runtime token minting

Examples:

1. server provisioning
2. server listing
3. runtime access token minting
4. hosted product-control-plane fulfillment

Frontdoor API is not the Nex runtime API.

It is the hosted platform API.

### 2. Nex API

The Nex API is the canonical runtime operation taxonomy.

It owns:

1. runtime methods
2. the shared request pipeline
3. auth and IAM at the runtime boundary
4. runtime database-backed behaviors
5. transport-neutral schemas

Examples:

1. `status`
2. `runtime.health`
3. `records.*`
4. `agents.*`
5. `jobs.*`
6. `skills.*`

The Nex API is the source of truth for what the runtime can do.

### 3. Adapter API

The Adapter API owns generic provider and protocol bridge contracts.

It exists when the system needs a reusable bridge that is not product-specific.

Examples:

1. reusable provider auth/setup callbacks
2. generic inbound provider webhook bridges
3. generic external protocol normalization owned by a shared adapter package

The Adapter API is not a grab-bag for arbitrary external routes.

Use Adapter API only when:

1. the behavior is reusable across apps
2. the behavior is bridge/protocol/provider oriented
3. the ownership belongs to a shared adapter package, not a product app

### 4. App API

The App API owns product-specific API extensions and product-specific external
HTTP surfaces.

An app extends the runtime by declaring app methods and, where needed,
product-specific routes.

Examples:

1. `aix.sources.list`
2. `spike.repos.list`
3. product-specific callbacks
4. product-specific compatibility endpoints
5. product-specific setup flows

If the behavior is product-specific, it belongs in an app.

---

## Contract Ownership Rules

When adding a method or route, ownership must resolve in this order:

1. **Frontdoor API**
   - if it is platform/account/server/hosted-shell behavior
2. **Nex API**
   - if it is generic runtime behavior available independent of a specific app
3. **Adapter API**
   - if it is a reusable generic protocol/provider bridge
4. **App API**
   - if it is product-specific behavior

Do not introduce a fifth top-level category to avoid making this decision.

In particular:

1. browser document routing is not an API contract
2. transport is not an API contract
3. `productControlPlane` is a hosted relay concept, not a fifth API contract

---

## Transport Model

Transport projects an API contract. It does not define one.

For the Nex API and App API:

1. HTTP and WebSocket are the public transports
2. `stdio` is the canonical internal child-process transport
3. `grpc` is reserved for a future distributed-service model

For the Frontdoor API:

1. HTTP is primary
2. browser document delivery is route/document behavior, not an operation

For the Adapter API:

1. transport depends on the adapter bridge contract
2. runtime-managed child processes may use `stdio`
3. external adapter-owned routes may use HTTP

See [TRANSPORT_SURFACE_MODEL.md](./TRANSPORT_SURFACE_MODEL.md).

---

## Browser Routes Are Not Operations

These are not runtime methods:

1. `/app/<appId>/`
2. `/app/<appId>/...`

They are browser document and browser-route concerns.

If the system needs app launch/readiness metadata, that belongs in:

1. Frontdoor API
2. Nex API
3. App API

It does not justify pseudo-operations such as `apps.open.*`.

`apps.open.*` is not part of the canonical target state.

The built-in Nex browser/operator surface is the **operator console**. It is a
browser application, not a special API category.

---

## Compatibility Endpoints, Callbacks, And Webhooks

Compatibility routes, callbacks, and webhook-style entrypoints must belong to
an existing API contract.

Examples:

1. **App API**
   - AIX setup/upload endpoints
   - product-specific webhook endpoints
   - product-specific OpenAI/OpenResponses-compatible surface, if owned by a
     product app
2. **Adapter API**
   - reusable provider callbacks
   - reusable protocol bridges shared across multiple apps
3. **Frontdoor API**
   - hosted provisioning callbacks
   - platform account/auth flows

They must not be modeled as a standalone cross-cutting taxonomy.

If a compatibility endpoint ultimately normalizes into a Nex runtime method,
that normalization is an implementation detail. It does not change public
contract ownership.

---

## OpenAPI And Schema Generation

The long-term source-of-truth model is:

1. canonical contract definitions live with the owning API contract
2. HTTP OpenAPI is generated from that canonical contract
3. WebSocket protocol documentation is generated from that same contract
4. SDKs are generated from that same contract

### OpenAPI projections

#### Frontdoor API OpenAPI

Describes:

1. public frontdoor HTTP endpoints
2. auth/session/token endpoints
3. server and hosted platform APIs

#### Nex API OpenAPI

Describes the HTTP projection of the Nex runtime method taxonomy.

#### App API OpenAPI

Describes app-owned HTTP surfaces and app methods projected onto HTTP.

#### Adapter API OpenAPI

Describes adapter-owned external HTTP bridge contracts where they exist.
