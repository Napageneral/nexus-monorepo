---
summary: "Hard-cut workplan to remove legacy per-method transport surface declarations from the shared adapter SDKs and examples."
title: "Adapter SDK Surface Model Hard Cut 2026-03-13"
---

# Adapter SDK Surface Model Hard Cut 2026-03-13

**Status:** ACTIVE

## Customer Experience First

The target adapter-author experience is:

1. define an adapter method once
2. declare behavior, schema, and mutability once
3. let Nex project that method over the appropriate runtime transports
4. never think about `ws.control` or `http.control`

Adapter authors should not have to decide how a normal typed method is mounted.
That is runtime API behavior, not package-authoring behavior.

## Problem

The shared adapter SDKs still encode the deleted surface model:

1. TypeScript SDK accepts `surfaces` on declared methods
2. TypeScript SDK defaults missing surfaces to `["ws.control", "http.control"]`
3. TypeScript protocol schema validates those literals
4. Go SDK accepts `Surfaces` on declared methods
5. Go SDK defaults missing surfaces to `[]string{"ws.control", "http.control"}`
6. SDK docs and tests still teach these fields as canonical authoring input

This directly contradicts the runtime/API hard cut.

## Hard-Cut Decisions

1. remove `surfaces` from shared adapter method authoring
2. remove `surfaces` from shared adapter protocol method descriptors emitted by the SDKs
3. remove all `ws.control` / `http.control` examples from SDK docs and tests
4. update any live adapter package still setting method surfaces
5. do not preserve backward compatibility

## Scope

In scope:

1. `adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts`
2. `adapters/nexus-adapter-sdks/nexus-adapter-sdk-go`
3. SDK docs under `adapters/nexus-adapter-sdks/docs/`
4. live adapter packages using the stale field
5. stray GlowBot root `SPEC.md` cleanup in the same slice

Out of scope:

1. archive trees
2. broader OpenAPI regeneration rollout
3. unrelated adapter package cleanup

## Implementation Plan

### Phase 1: TS SDK hard cut

1. remove `surfaces` from `DeclaredAdapterMethod`
2. remove `surfaces` from `AdapterMethodSchema`
3. stop emitting `surfaces` from derived method descriptors
4. rewrite TS SDK tests to assert the new descriptor shape

### Phase 2: Go SDK hard cut

1. remove `Surfaces` from `DeclaredMethod`
2. remove `Surfaces` from `AdapterMethod`
3. stop deriving or defaulting any method-surface field
4. rewrite Go SDK tests accordingly

### Phase 3: Live adapter cleanup

1. remove stale `Surfaces` declarations from any active adapter package still using them
2. confirm those packages still build/test against the shared SDK

### Phase 4: Documentation cleanup

1. rewrite `UNIFIED_ADAPTER_SDK_API.md`
2. rewrite `UNIFIED_GO_ADAPTER_SDK_API.md`
3. remove stale references from any supporting SDK docs if needed
4. delete `apps/glowbot/SPEC.md` if nothing active references it

## Validation

Minimum validation bar:

1. TypeScript SDK focused tests pass
2. Go SDK tests pass
3. Slack adapter tests pass
4. one additional Go adapter using the shared SDK still builds/tests cleanly
5. residue scan finds no active `ws.control` / `http.control` references inside the shared adapter SDK workspace
