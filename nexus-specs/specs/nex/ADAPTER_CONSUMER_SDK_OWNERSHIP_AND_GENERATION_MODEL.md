# Adapter Consumer SDK Ownership And Generation Model

## Customer Experience

An engineer integrating an adapter into an app, agent, or tool should be able to:

1. pick an adapter package
2. import its consumer SDK from that adapter's own repo-local `sdk/` directory
3. discover the adapter's ordinary request/response methods immediately
4. understand which surfaces are available without reading adapter internals
5. inject those methods into an agent tool catalog directly

The engineer should not need to:

1. reverse-engineer `adapter.info`
2. scrape handwritten docs to learn params and responses
3. depend on the shared adapter authoring SDK to call adapter package methods

## Core Decision

Every adapter publishes its own OpenAPI contract.
Every adapter can generate its own consumer SDK from that contract.
The shared adapter SDK remains separate and is only for authoring adapters.
Central `contracts/` remains the publication registry.
Repo-local `sdk/` directories are the owning home for per-adapter consumer SDKs.

That is the canonical long-term path.

## Ownership Split

### Shared adapter SDK

The shared adapter SDK exists for **adapter authors**.

It owns:

1. `defineAdapter(...)`
2. runtime context helpers
3. record/control/session protocol helpers
4. shared request/response schema definitions used by adapter package contracts
5. adapter package authoring ergonomics

Canonical home today:

- `adapters/nexus-adapter-sdks/`

The shared adapter SDK is **not** the consumer SDK for a specific adapter package.

### Per-adapter consumer SDK

A per-adapter consumer SDK exists for **apps, agents, tools, and external callers** that want to use a specific adapter package contract.

It owns:

1. typed client functions for the adapter package's ordinary request/response operations
2. request and response types generated from the adapter package's published OpenAPI contract
3. package-local usage helpers for that adapter's contract

The per-adapter consumer SDK is **not** the adapter authoring SDK.

## Source Of Truth

The source of truth for a per-adapter consumer SDK is:

1. the adapter package contract source in the adapter package repo
2. the generated adapter package OpenAPI artifact under `contracts/adapters/<adapterId>/openapi.yaml`
3. the shared SDK codegen infrastructure that projects OpenAPI into typed SDK clients

The source of truth is not:

1. handwritten SDK code copied from docs
2. the shared adapter authoring SDK surface
3. the Nex runtime adapter wrapper API

## Publication And Ownership Model

### Central publication registry

Canonical published artifacts remain under:

- `contracts/adapters/<adapterId>/openapi.yaml`

These are the machine-readable published contracts.

### Repo-local owning SDK home

The owning home for a per-adapter consumer SDK is inside the adapter package repo:

- `adapters/<adapterId>/sdk/<adapterId>-sdk-ts/`
- later optionally `adapters/<adapterId>/sdk/<adapterId>-sdk-go/`

The central `contracts/` tree is the publication registry.
The adapter repo's `sdk/` directory is the SDK ownership home.

## Package-Local Operation Identity Rule

Per-adapter OpenAPI artifacts are already adapter-scoped by file path.
Therefore, operation IDs inside a per-adapter contract should be **package-local**, not package-qualified.

Examples:

- `adapter.info`
- `adapter.accounts.list`
- `adapter.health`
- `channels.send`

Not:

- `nexus-adapter-telegram:adapter.info`
- `nexus-adapter-whatsapp:channels.send`

Reason:

1. the contract artifact path already scopes the adapter identity
2. package-qualified operation IDs pollute generated type and client names
3. consumer SDKs should expose the adapter package contract cleanly

## First-Wave SDK Scope

First-wave per-adapter consumer SDKs should generate only **ordinary JSON request/response methods** from the adapter package contract.

Included:

1. `adapter.info`
2. `adapter.accounts.list`
3. `adapter.health`
4. `adapter.setup.*` when present
5. `channels.send`
6. adapter-specific declared methods

Excluded from first wave:

1. `adapter.monitor.start`
2. `records.backfill`
3. `adapter.control.start`
4. `channels.stream`

Reason:

1. those are long-lived session/stream protocol operations
2. they belong to the shared adapter protocol contract first
3. they should get a dedicated stream/session SDK layer later rather than pretending to be ordinary request/response methods

## Agent And Tool Injection Expectations

The per-adapter consumer SDK should make agent/tool injection straightforward.

An agent runtime should be able to:

1. import an adapter package SDK
2. inspect or statically know its available ordinary methods
3. inject those methods into an agent tool catalog
4. call those methods with typed request/response contracts

That means the per-adapter consumer SDK should expose:

1. a typed client factory
2. typed request/response aliases for published operations
3. nested method access that follows the adapter package operation namespace

Example shape:

```ts
const client = createTelegramAdapterClient({ baseUrl, headers });
await client.adapter.info();
await client.adapter.health({ connection_id: "default" });
await client.channels.send({
  connection_id: "default",
  target: { container_id: "group:123" },
  content: { text: "hello" },
});
```

## Generation Source

Per-adapter consumer SDK generation should reuse the shared codegen infrastructure already used for Frontdoor and Nex SDKs.

Canonical codegen source today:

- `nex/sdk/sdk-codegen/`

The correct model is:

1. central shared codegen implementation
2. adapter-specific generation entrypoints
3. adapter-local generated SDK package output

This avoids inventing a second SDK generation stack.

## Repo Layout

### Shared codegen

- `nex/sdk/sdk-codegen/`

### Adapter-local generation entrypoint

One of:

- adapter-local wrapper script under `adapters/<adapterId>/scripts/`
- or a shared generator script in `nex/scripts/sdk/` that writes into the adapter-local `sdk/` path

The important invariant is the output location, not the exact script location.

### Adapter-local generated SDK package

- `adapters/<adapterId>/sdk/<adapterId>-sdk-ts/package.json`
- `adapters/<adapterId>/sdk/<adapterId>-sdk-ts/tsconfig.json`
- `adapters/<adapterId>/sdk/<adapterId>-sdk-ts/src/`
- `adapters/<adapterId>/sdk/<adapterId>-sdk-ts/dist/`

## Rollout Order

### Wave 1

Generate TypeScript consumer SDKs for adapters whose contracts are already published and whose package definitions are loadable without side effects.

Recommended first-wave adapters:

1. `nexus-adapter-telegram`
2. `nexus-adapter-whatsapp`

### Wave 2

Expand to additional SDK-backed adapters after contract publication is stable.

Examples:

1. `nexus-adapter-discord` after top-level import side effects are removed
2. additional adapters that cleanly export loadable adapter definitions

### Wave 3

Define the stream/session helper SDK layer for long-lived adapter protocol operations.

## Validation Requirements

Any per-adapter consumer SDK generation path must prove:

1. the adapter's published OpenAPI artifact exists and parses cleanly
2. the generated SDK source compiles
3. consecutive generation is deterministic
4. the generated client exposes the expected ordinary request/response method inventory
5. the generated SDK does not include long-lived session/stream operations in first wave

## Exit Criteria

The first wave is complete when:

1. this canonical model is documented
2. the adapter publication model is aligned to package-local operation IDs
3. the first repo-local consumer SDK packages are generated for `telegram` and `whatsapp`
4. those SDKs compile and expose the expected ordinary request/response methods
