# Adapter Consumer SDK First Wave Workplan 2026-03-12

## Customer Experience

The first wave should let a developer:

1. open an adapter package repo
2. import a generated consumer SDK from that adapter's own `sdk/` directory
3. call the adapter package's ordinary request/response methods immediately
4. inject those methods into agents without inspecting adapter implementation code

## Scope

First-wave adapters:

1. `nexus-adapter-telegram`
2. `nexus-adapter-whatsapp`

First-wave SDK language:

1. TypeScript

First-wave operations:

1. `adapter.info`
2. `adapter.accounts.list`
3. `adapter.health`
4. `channels.send`
5. `adapter.setup.*` when present
6. adapter-specific declared methods when present

Out of scope:

1. `adapter.monitor.start`
2. `records.backfill`
3. `adapter.control.start`
4. `channels.stream`
5. Go SDK generation

## Sources

Canonical publication spec:

- `nexus-specs/specs/nex/ADAPTER_CONSUMER_SDK_OWNERSHIP_AND_GENERATION_MODEL.md`

Published adapter contracts:

- `contracts/adapters/nexus-adapter-telegram/openapi.yaml`
- `contracts/adapters/nexus-adapter-whatsapp/openapi.yaml`

Shared codegen:

- `nex/sdk/sdk-codegen/typescript.ts`
- `nex/sdk/sdk-codegen/shared.ts`

Generation entrypoint:

- `nex/scripts/sdk/generate-adapter-sdk-ts.ts`

## Hard-Cut Decisions

1. Per-adapter consumer SDKs are generated from per-adapter published OpenAPI contracts.
2. Per-adapter OpenAPI operation IDs are package-local, not package-qualified.
3. Repo-local `sdk/` directories are the owning home for generated consumer SDK packages.
4. The shared adapter authoring SDK remains separate and untouched.
5. First wave is TypeScript only.

## Implementation Steps

### 1. Contract alignment

Update per-adapter OpenAPI generation so operation IDs are package-local and all first-wave published operations are SDK-public.

### 2. Shared codegen alignment

Ensure the shared TypeScript SDK codegen can consume adapter package contracts cleanly.

### 3. Shared generator entrypoint

Add a generic adapter consumer SDK generation script under `nex/scripts/sdk/`.

### 4. Repo-local package scaffolding

Generate or maintain repo-local SDK packages:

- `adapters/nexus-adapter-telegram/sdk/nexus-adapter-telegram-sdk-ts/`
- `adapters/nexus-adapter-whatsapp/sdk/nexus-adapter-whatsapp-sdk-ts/`

### 5. Adapter package scripts

Expose a local generation/build script path from each adapter package.

## Validation

Required validation:

1. regenerate adapter contracts successfully
2. generate both adapter consumer SDKs successfully
3. compile both generated SDK packages successfully
4. verify the generated method inventory excludes long-lived stream/session ops

## Exit Criteria

This workplan is complete when:

1. both first-wave adapter SDK packages exist in their owning adapter repos
2. both SDKs compile successfully
3. both SDKs expose the expected ordinary request/response methods
4. the canonical spec and workplan are indexed in the active Nex spec tree
