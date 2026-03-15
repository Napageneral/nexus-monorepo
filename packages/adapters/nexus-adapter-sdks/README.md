# Nexus Adapter SDKs

This folder contains the SDK monorepo for the Nexus external adapter CLI protocol.

## Packages

- `nexus-adapter-sdk-go/`: Go SDK (`go` module)
- `nexus-adapter-sdk-ts/`: TypeScript SDK (npm package)
- `adapter-package-kit/`: shared packaging helper for adapter release artifacts

## Local Docs

- [Adapter SDK Workspace](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/ADAPTER_SDK_WORKSPACE.md)
- [Unified Adapter SDK API](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/UNIFIED_ADAPTER_SDK_API.md)
- [Unified Go Adapter SDK API](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/UNIFIED_GO_ADAPTER_SDK_API.md)
- [Adapter SDK Workplan](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/workplans/ADAPTER_SDK_WORKPLAN.md)
- [Go Unified Adapter SDK Migration Workplan](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/workplans/GO_UNIFIED_ADAPTER_SDK_MIGRATION_WORKPLAN.md)
- [Adapter Package SDK Gap Analysis](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/ADAPTER_PACKAGE_SDK_GAP_ANALYSIS.md)
- [Adapter Package SDK Propagation Workplan](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/workplans/ADAPTER_PACKAGE_SDK_PROPAGATION_WORKPLAN.md)
- [Adapter Package Readiness Audit](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/ADAPTER_PACKAGE_READINESS_AUDIT.md)
- [Adapter Package Hosted Readiness Workplan](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/workplans/ADAPTER_PACKAGE_HOSTED_READINESS_WORKPLAN.md)

## Role In The Authoring Flow

This workspace sits between canonical adapter specs and concrete adapter packages.

The correct change order for adapters is:

1. update canonical adapter and platform specs
2. update shared SDKs and packaging helpers here
3. propagate the changes into actual adapter packages
4. rerun shared hosted lifecycle validation
5. rerun adapter-specific validation ladders

Current state:

- the shared TS SDK is on the unified `defineAdapter(...)` model
- the shared Go SDK is on the unified `DefineAdapter(...)` model
- the active Go adapter fleet in this monorepo now points at the shared Go SDK
  workspace instead of private SDK forks

Do not treat one adapter package's local behavior as the source of truth when a
contract change really belongs in the shared SDK.

## Canonical References

Start here before changing the SDK:

- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)
- [Hosted Package Ownership and Validation Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-ownership-and-validation-model.md)
- [Apps, Adapters, and Method Surfaces](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/apps-adapters-and-method-surfaces.md)
- [Package Method Catalog and IAM](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-method-catalog-and-iam.md)
- [Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md)
- [Adapter Connections](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-connections.md)

## Contract

The canonical machine-readable adapter protocol contract (JSON Schema + fixtures) lives in:

- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/contract/`

Both SDKs validate against that contract via conformance tests.

The SDKs should also stay aligned with:

- runtime context injection semantics
- delivery target semantics
- canonical `record.ingest` emission
- hosted package authoring and release flow

## Conformance

Run both SDK conformance suites:

```bash
./scripts/adapter-conformance.sh
```

The script exports `NEXUS_ADAPTER_PROTOCOL_CONTRACT_DIR` so tests can locate the schema/fixtures.

## What To Update Here

Changes that usually belong in this workspace:

- adapter CLI/runtime harness behavior
- runtime context parsing
- canonical ingress helpers for `record.ingest`
- shared delivery target parsing
- shared monitor/backfill control helpers
- adapter packaging helpers and release-kit behavior

Changes that usually do **not** belong here:

- one provider's field mapping
- one provider's business rules
- one adapter's package-specific validation ladder
