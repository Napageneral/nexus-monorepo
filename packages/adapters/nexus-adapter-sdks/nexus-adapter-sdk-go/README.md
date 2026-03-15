# Nexus Adapter SDK (Go)

This package is the Go runtime SDK for Nex external adapter binaries.

Use it when you are implementing a Go adapter package that needs to:

- expose the canonical adapter CLI operations
- read injected runtime context
- emit canonical `record.ingest`
- implement monitor, backfill, health, send, and delete behavior

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
- [Unified Go Adapter SDK API](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/UNIFIED_GO_ADAPTER_SDK_API.md)

## What This SDK Owns

Shared behavior such as:

- `DefineAdapter(...)` and single-source method declaration
- CLI dispatch for adapter operations
- runtime context parsing
- canonical adapter state-root discovery via `NEXUS_ADAPTER_STATE_DIR`
- canonical serve-session output helpers
- `record.ingest` builders
- delivery target parsing and validation
- send/delete request envelopes
- adapter `methods` declaration on `adapter.info`

It does not own:

- provider-specific field mapping
- provider API behavior
- one adapter package's workplan or validation ladder

## Validation

When changing this SDK:

1. run its local tests
2. run SDK conformance
3. update affected adapter packages
4. rerun those adapter packages' local and hosted validation ladders
