---
title: "Adapter SDK Workplan"
summary: "Execution plan for aligning the shared adapter SDK workspace to the method-first truthful outward contract."
---

# Adapter SDK Workplan

## Purpose

This workplan turns the current SDK gap audit into an execution sequence.

It covers:

- the concrete gaps between the shared SDKs and the canonical adapter/platform
  specs
- what belongs in the shared SDK workspace versus Nex runtime versus package
  repos
- the propagation order for rolling the shared changes through real adapters

## Customer Experience First

The target author experience is:

1. canonical specs change once
2. shared SDKs absorb the shared contract updates
3. adapter packages update against one shared implementation layer
4. validation proves the shared contract first, then package behavior

The author should not have to:

- patch provider packages one by one for the same outward-contract change
- guess whether a change belongs in the SDK or in Nex runtime
- discover late that shared conformance tests were not actually proving SDK
  compatibility

## Current-State Research

What is materially drifting from the canonical model:

1. the shared SDKs still encode old outward `channels.*` concepts
2. the SDK authoring docs still teach a `delivery` model
3. tests still normalize provider mutation through bundled outward shapes
4. TS and Go are not equivalent in their remaining old-world support

## Ownership Boundary

### Shared SDK Workspace Must Own

- method-first outward authoring
- truthful outward method descriptor types/schemas
- runtime context helpers
- stronger contract/conformance tests
- package-kit staging rules for shared package contract assets

### Nex Runtime Must Own

- package activation and manifest/runtime integration
- `adapters.methods`
- discovery/catalog integration
- invocation convergence
- IAM connection restrictions and authorization behavior

### Individual Adapter Packages Must Own

- truthful provider/platform method declarations
- provider-specific field mapping
- provider-specific validation ladders
- adoption of new SDK helpers once they exist

## Execution Plan

### Phase 1: Lock the shared SDK contract

Goal:

- bring both SDKs into explicit alignment with the current canonical
  method-first outward contract

Implementation:

- align SDK types/docs around truthful namespaced outward methods
- remove `delivery` as target-state outward authoring
- remove `channels.*` as target-state outward execution vocabulary
- align contract fixtures/examples to method-first outward execution only

### Phase 2: Fix conformance and contract testing

Goal:

- make outward contract drift impossible to miss

Implementation:

- strengthen TS and Go contract tests around the method-first outward model
- remove old bundled-outward test assumptions
- add explicit negative coverage that rejects bundled outward channel-operation
  nouns as outward truth

### Phase 3: Cut TS SDK implementation

Goal:

- make the TS SDK method-first in implementation, not just docs

Implementation:

- remove top-level `delivery` authoring from the target-state API
- remove outward dispatch through `channels.*`
- drive discovery and invocation from `methods` only

### Phase 4: Cut Go SDK implementation

Goal:

- make the Go SDK method-first in implementation, not just docs

Implementation:

- remove `OpChannels*` as target-state outward execution vocabulary
- remove `DeliveryHandlers` as target-state outward authoring
- drive discovery and invocation from truthful namespaced methods

### Phase 5: Propagate through package fleet

Goal:

- migrate packages only after the shared SDK contract and implementation are
  stable

Implementation:

- migrate communication adapters first
- migrate provider/work/content adapters second
- finish namespace-truth and duplicate-surface cleanup last
