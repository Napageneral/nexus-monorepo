# Nexus Adapter SDK (Go)

This package is the Go runtime SDK for Nex external adapter binaries.

Use it when you are implementing a Go adapter package that needs to:

- expose the canonical adapter CLI operations
- read injected runtime context
- emit canonical `record.ingest`
- implement monitor, backfill, health, setup, and truthful namespaced methods

## Place In The Flow

This SDK is not the source of truth for adapter product behavior.

The correct order is:

1. update canonical specs
2. update this SDK when the shared adapter contract changes
3. update individual adapter packages to consume the new SDK behavior

Canonical references:

- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)
- [Hosted Package Ownership and Validation Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-ownership-and-validation-model.md)
- [Unified Adapter SDK and Authoring Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md)
- [Apps, Adapters, and Method Surfaces](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/apps-adapters-and-method-surfaces.md)
- [Package Method Catalog and IAM](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-method-catalog-and-iam.md)
- [Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md)
- [Unified Go Adapter SDK API](/Users/tyler/nexus/home/projects/nexus/packages/adapters/nexus-adapter-sdks/docs/specs/UNIFIED_GO_ADAPTER_SDK_API.md)

## What This SDK Owns

Shared behavior such as:

- `DefineAdapter(...)` and single-source method declaration
- projection metadata on the same package declaration that owns provider-native
  methods
- CLI dispatch for adapter operations
- runtime context parsing
- canonical adapter state-root discovery via `NEXUS_ADAPTER_STATE_DIR`
- canonical serve-session output helpers
- `record.ingest` builders
- target parsing and validation helpers for communication-shaped methods
- reusable request/result envelopes for communication-shaped methods
- declaration-first capability execution, with runtime reflection emitted from package declarations

It does not own:

- provider-specific field mapping
- provider API behavior
- one adapter package's workplan or validation ladder

The intended package model is:

1. one canonical adapter package per provider or provider family
2. full provider-native methods exposed by default
3. the same package declares projection metadata for:
   - record families
   - backfill and monitor strategy
   - routing metadata
   - record-id and normalization behavior

## Validation

When changing this SDK:

1. run its local tests
2. run SDK conformance
3. update affected adapter packages
4. rerun those adapter packages' local and hosted validation ladders
