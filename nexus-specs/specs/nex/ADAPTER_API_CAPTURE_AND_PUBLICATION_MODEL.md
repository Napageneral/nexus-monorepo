# Adapter API Capture And Publication Model

## Customer Experience

A developer working with adapters should be able to answer these questions quickly:

1. what is the Adapter API for a given adapter package
2. what part of that contract belongs to the adapter package versus the Nex runtime
3. where is the canonical machine-readable contract published
4. which adapter operations are ordinary request/response methods versus long-lived stream/session protocol operations

The developer should not need to guess whether a method belongs to:

- the Nex runtime wrapper API
- the shared adapter protocol
- the adapter package itself
- a generated SDK artifact

## Core Decision

The Adapter API is the **adapter-owned package contract**.

It is **not**:

1. the Nex runtime `adapter.*` wrapper surface
2. the Nex runtime `adapters.connections.*` surface
3. the generic shared adapter transport/session protocol in isolation

The Nex runtime wrapper surface belongs to the **Nex API**.
The adapter-owned package contract belongs to the **Adapter API**.

## Ownership Boundary

### Nex API owns

The Nex API owns runtime-level adapter management and projection surfaces such as:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.monitor.start`
- `adapter.serve.start`
- `adapter.setup.*`
- `adapters.connections.*`
- `adapters.methods`

These are runtime methods exposed by the Nex runtime.
They are documented in `contracts/nex/openapi.yaml`.

### Adapter API owns

The Adapter API owns the adapter package contract itself:

1. adapter package metadata
2. the adapter-owned shared protocol operations the package actually implements
3. any adapter-specific declared methods exposed by the package
4. adapter package auth/setup metadata
5. adapter package delivery and connection request/response shapes

These are documented in `contracts/adapters/<adapterId>/openapi.yaml`.

## Source Of Truth

The source of truth for Adapter API publication is:

1. adapter package contract source in the adapter package/repo
2. shared SDK/protocol schemas in the adapter SDK workspace
3. generated OpenAPI publication in `contracts/adapters/`

The source of truth is not:

1. handwritten OpenAPI YAML
2. Nex runtime wrapper methods
3. generated SDK clients

## Package-Local Operation Identity

Per-adapter OpenAPI artifacts are already adapter-scoped by file path.
Therefore, operation IDs inside a per-adapter contract should be package-local:

- `adapter.info`
- `adapter.accounts.list`
- `adapter.health`
- `channels.send`

Not package-qualified:

- `nexus-adapter-telegram:adapter.info`

Reason:

1. the artifact path already scopes the adapter identity
2. package-local operation IDs keep generated consumer SDKs clean
3. package-qualified IDs create unnecessary noise in type and client names

## Shared Contract Inputs

Adapter API publication may draw from three sources:

1. **Adapter package manifest**
   - `adapter.nexus.json`
2. **Adapter SDK definition**
   - `defineAdapter(...)`
   - package-exported adapter definition metadata
3. **Shared adapter SDK protocol schemas**
   - request/response/control/record schema types

The correct generation order is:

1. load adapter package definition if available
2. derive implemented operations and declared methods from the adapter definition
3. reuse shared SDK protocol schemas for common operation request/response bodies
4. publish per-adapter OpenAPI artifacts centrally

## First-Wave Publication Rule

First-wave per-adapter OpenAPI should publish only **ordinary JSON request/response operations**.

These include:

- `adapter.info`
- `adapter.accounts.list`
- `adapter.health`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`
- `channels.send`
- adapter-specific declared methods

These do **not** include the long-lived stream/session operations yet:

- `adapter.monitor.start`
- `records.backfill`
- `adapter.control.start`
- `channels.stream`

Reason:

1. those operations are long-lived JSONL/session flows, not ordinary request/response methods
2. the shared adapter protocol contract already documents them canonically
3. forcing them into fake HTTP-style request/response OpenAPI right now would be misleading

## Long-Lived Protocol Boundary

The following shared protocol/session contracts remain canonical outside first-wave per-adapter OpenAPI:

1. adapter control session frames
2. monitor/backfill `record.ingest` streams
3. streaming delivery status/events

These remain owned by the shared adapter protocol/schema contract until a separate publication model is defined for stream/session contracts.

## Publication Shape

Per-adapter OpenAPI artifacts are **publication projections** of the adapter package contract.

They are not a promise that the adapter itself is a public HTTP server.

That means:

1. the OpenAPI artifact documents the package contract shape
2. it may use a neutral `POST /operations/<operation>` path model for publication consistency
3. it must not pretend that unsupported transports are directly live

## Discovery Modes

### Mode A: SDK-introspected adapter packages

Preferred first-wave mode.

Requirements:

1. adapter package exports a loadable adapter definition
2. generation can call adapter-owned `adapter.info`
3. operation inventory and declared method metadata come directly from the adapter definition

This mode produces the richest first-wave publication.

### Mode B: Manifest-only adapter packages

Fallback mode.

Requirements:

1. package has `adapter.nexus.json`
2. no richer adapter definition can be loaded yet

This mode may publish only a thin artifact or may be deferred until richer contract metadata exists.

## First-Wave Recommendation

Use Mode A first.

Recommended first-wave adapters:

1. `nexus-adapter-telegram`
2. `nexus-adapter-whatsapp`

Reason:

1. both export loadable `defineAdapter(...)` definitions
2. both publish real shared adapter operations today
3. both can be introspected without inventing package-local OpenAPI files first

## Central Publication Root

Canonical publication root:

- `/Users/tyler/nexus/home/projects/nexus/contracts/adapters/`

First-wave target shape:

- `contracts/adapters/nexus-adapter-telegram/openapi.yaml`
- `contracts/adapters/nexus-adapter-whatsapp/openapi.yaml`

## Validation Requirements

Any published Adapter API artifact must prove:

1. the adapter definition/manifest was loaded successfully
2. the generated operation inventory matches the adapter definition's `adapter.info.operations`
3. shared request/response schemas used for the published operations parse cleanly
4. generated artifacts are deterministic across consecutive runs

## Completion Criteria

The first wave is complete when:

1. the canonical capture/publication model is documented
2. the first per-adapter OpenAPI artifacts are generated into `contracts/adapters/`
3. those artifacts are generated from real adapter package contract sources, not handwritten YAML
