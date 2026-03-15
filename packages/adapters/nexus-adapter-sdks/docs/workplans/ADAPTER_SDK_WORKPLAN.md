---
title: "Adapter SDK Workplan"
summary: "Gap analysis and execution plan for aligning the shared adapter SDK workspace to the current Nex package, method, and validation model."
---

# Adapter SDK Workplan

## Purpose

This workplan turns the current SDK gap audit into an execution sequence.

It covers:

- the concrete gaps between the shared SDKs and the canonical adapter/platform specs
- what belongs in the shared SDK workspace versus Nex runtime versus package repos
- the propagation order for rolling the shared changes through real adapters

## Customer Experience First

The target author experience is:

1. canonical specs change once
2. shared SDKs and package-kit absorb the shared contract updates
3. adapter packages update against one shared implementation layer
4. validation proves the shared contract first, then package behavior

The author should not have to:

- patch provider packages one by one for the same CLI/runtime-context change
- guess whether a change belongs in the SDK or in Nex runtime
- discover late that shared conformance tests were not actually proving SDK compatibility

## Current-State Research

### What is already correct

- both SDK workspaces know the canonical adapter protocol path
- both SDKs support canonical `record.ingest` emission
- both SDKs support `channels.send`
- Go SDK supports `channels.delete`
- both SDKs support runtime context with `connection_id`
- shared package-kit exists for Go adapter release assembly

### What is now drifting from the canonical model

#### Gap 1: Go SDK `AdapterInfo` is missing `methods`

Canonical contract:

- adapter protocol schema requires `adapter.info` to include `methods`

Current Go SDK:

- [types.go](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/types.go)
  defines `AdapterInfo` without a `Methods` field

Observed proof:

- `go test ./...` currently fails in
  [contract_test.go](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/contract_test.go)
  with:
  - missing required property `methods`

Impact:

- Go adapters cannot truthfully round-trip canonical `adapter.info`

#### Gap 2: TypeScript SDK protocol is also missing `methods`

Canonical contract:

- adapter protocol schema requires `methods`

Current TS SDK:

- [protocol.ts](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts/src/protocol.ts)
  defines `AdapterInfoSchema` without `methods`

Why tests still pass:

- [contract.test.ts](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts/src/contract.test.ts)
  validates the fixture directly against the canonical schema and parses it with
  the TS schema, but does not round-trip through a TS `AdapterInfo` object and
  back into the canonical schema

Impact:

- TS SDK is also behind the canonical contract, but the test suite is not catching it

#### Gap 3: SDKs do not expose the canonical adapter writable state root

Canonical contract:

- adapters should treat `NEXUS_ADAPTER_STATE_DIR` as the canonical writable state location

Current SDKs:

- neither Go nor TS SDK exposes a helper for `NEXUS_ADAPTER_STATE_DIR`
- adapter packages still have to implement state-root handling themselves

Impact:

- state-path behavior remains inconsistent across packages

#### Gap 4: SDK docs still under-express the new package/method/IAM model

Canonical model now includes:

- package-native methods
- narrow communication surface
- shared hosted lifecycle proof
- authorization-aware readiness

Current SDK docs:

- were historically more protocol-only
- now improved, but still need the implementation work below to make the docs fully true

Impact:

- author expectations can drift from actual SDK capability

#### Gap 5: Package kit only stages `adapter.nexus.json` and `bin/`

Canonical model now includes:

- package-local method declarations and/or method catalog source references
- potential package-authored assets beyond the binary and manifest

Current package kit:

- [package-release.sh](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/adapter-package-kit/package-release.sh)
  only stages:
  - `adapter.nexus.json`
  - `bin/<binary>`

Impact:

- if `adapter.nexus.json` grows to reference package-local method catalog assets,
  the package kit will under-package the release

#### Gap 6: Shared SDKs do not yet provide a normalized adapter-method helper layer

Canonical model:

- adapters expose typed package-native methods
- those methods should remain distinct from communication operations

Current SDKs:

- focus on communication operations and ingress/delivery helpers
- do not yet provide a shared helper model for authoring or validating the
  typed `methods` block on `adapter.info`

Impact:

- each adapter package will otherwise invent its own method descriptor glue

#### Gap 7: SDK conformance is not strong enough

Current state:

- Go SDK round-trips canonical fixtures and correctly caught the `methods` drift
- TS SDK only validates fixtures directly against schema and local parsers

Impact:

- TS SDK can silently drift from the canonical contract

## Ownership Boundary

### Shared SDK Workspace Must Own

- `AdapterInfo.methods` shape
- canonical adapter method descriptor types/schemas
- runtime context helpers, including state-dir support
- stronger contract/conformance tests
- package-kit staging rules for shared package contract assets

### Nex Runtime Must Own

- adapter manifest schema and runtime package activation for method declarations
- `adapters.methods`
- `tools.catalog`
- `tools.invoke` convergence
- IAM connection restrictions and compiled authorization behavior

### Individual Adapter Packages Must Own

- provider-native method declarations
- provider-specific field mapping
- provider-specific validation ladders
- adoption of new SDK helpers once they exist

## Execution Plan

### Phase 1: Lock the shared SDK contract

Goal:

- bring both SDKs into explicit alignment with the current canonical adapter protocol

Implementation:

- add canonical adapter method descriptor types to the Go SDK
- add canonical adapter method descriptor schemas/types to the TS SDK
- extend `AdapterInfo` / `AdapterInfoSchema` to include `methods`
- update examples and README snippets to show `methods`

Exit criteria:

- both SDKs can represent the canonical `adapter.info` fixture without loss

### Phase 2: Fix conformance and contract testing

Goal:

- make contract drift impossible to miss in both SDKs

Implementation:

- keep the Go round-trip fixture validation
- strengthen TS contract tests to round-trip through TS SDK types/schemas
- add explicit tests for `methods`
- add tests for runtime context helpers after state-dir support is added

Exit criteria:

- both SDKs fail fast on contract drift
- both SDKs pass conformance against the current canonical schema

### Phase 3: Add canonical state-dir helpers

Goal:

- stop adapter packages from hand-rolling runtime-owned writable state discovery

Implementation:

- add Go helper for `NEXUS_ADAPTER_STATE_DIR`
- add TS helper for `NEXUS_ADAPTER_STATE_DIR`
- document the rule that adapters must treat this as the canonical writable state location

Exit criteria:

- adapter packages can consume a shared helper for runtime-owned state paths

### Phase 4: Add shared adapter-method helper layer

Goal:

- make typed adapter methods a first-class shared SDK concept

Implementation:

- define shared adapter method descriptor structs/schemas in Go and TS
- add helper constructors or validators for method descriptors
- update `adapter.info` examples to show package-native methods alongside communication operations

Exit criteria:

- adapter packages no longer need to invent their own method descriptor shape

### Phase 5: Update package-kit for method-catalog-era manifests

Goal:

- ensure package releases remain complete as adapter manifests evolve

Implementation:

- audit the current and expected `adapter.nexus.json` asset references
- extend the package kit to stage additional package-authored assets when declared
- keep default behavior simple for current binary-only packages

Exit criteria:

- package kit can package the full adapter release shape required by the canonical manifest

### Phase 6: Propagation pass across concrete adapters

Goal:

- roll the shared SDK changes through real adapter packages in a controlled order

Recommended order:

1. `confluence`
2. `git`
3. `qase`
4. remaining real adapter package repos

Implementation:

- update package SDK dependency or vendored SDK copy
- add `methods` declarations where the package already has provider-native methods or can declare an empty list if the contract requires presence
- adopt state-dir helpers
- rerun local tests
- rerun shared hosted lifecycle proof when applicable
- rerun package-specific validation ladders

Exit criteria:

- real adapter packages are consuming the updated shared SDK contract

## Validation Ladder

### Shared SDK Validation

1. Go SDK `go test ./...`
2. TS SDK `pnpm test`
3. shared conformance script in
   [adapter-conformance.sh](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/scripts/adapter-conformance.sh)

### Propagation Validation

For each adapter package:

1. local build and tests pass
2. package release script still succeeds
3. shared hosted lifecycle proof still succeeds where hosted deployment applies
4. package-local validation ladder still succeeds

## Recommended Next Sequence

The best next implementation order is:

1. fix `methods` support in both SDKs
2. strengthen TS conformance to match Go's round-trip rigor
3. add state-dir helpers
4. extend package-kit as needed
5. propagate into real adapter packages

This keeps the first changes tightly aligned to the hard contract failures we already observed.
