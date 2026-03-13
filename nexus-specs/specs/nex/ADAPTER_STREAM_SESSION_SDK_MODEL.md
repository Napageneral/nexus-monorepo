# Adapter Stream Session SDK Model

## Customer Experience

A developer who needs to use an adapter's long-lived operations should have a clear second-wave SDK story.

They should be able to:

1. distinguish ordinary request/response adapter methods from long-lived session/stream operations
2. use a dedicated stream/session helper layer for the latter
3. avoid pretending that JSONL session flows are ordinary HTTP request/response calls

## Core Decision

Per-adapter consumer SDK generation happens in two waves:

1. **Wave 1:** ordinary JSON request/response methods
2. **Wave 2:** long-lived stream/session operations with a dedicated helper layer

Wave 2 is not a fake OpenAPI request/response projection.
It is a typed session helper layer built on top of the shared adapter protocol contract.

## Covered Wave-2 Operations

The second-wave stream/session SDK layer covers:

1. `adapter.monitor.start`
2. `records.backfill`
3. `adapter.control.start`
4. `channels.stream`

## Source Of Truth

The source of truth for the second-wave stream/session SDK layer is:

1. the shared adapter protocol schema contract
2. the shared adapter runtime/session semantics in the authoring SDK
3. the adapter package's declared support for these operations

Canonical protocol source today:

- `adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts/src/protocol.ts`
- `adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts/src/run.ts`

## Why This Is Separate

These operations are not ordinary request/response methods.

They are long-lived session or stream flows that emit frames or status events over time.
Trying to flatten them into plain OpenAPI request/response methods would be misleading.

## Wave-2 SDK Shape

The second-wave SDK layer should expose typed helpers such as:

1. monitor session start helpers
2. backfill session helpers
3. control session helpers
4. delivery stream helpers
5. typed frame/event parsers for control and stream status payloads

## Contract Boundary

Wave 1 remains generated from per-adapter OpenAPI.
Wave 2 is generated or projected from the shared adapter protocol contract plus adapter capability metadata.

That means:

1. ordinary adapter consumer SDK package remains the main request/response client
2. stream/session helpers layer either lives alongside it or as a sibling package/module

## Recommended Package Shape

For an adapter package:

- `sdk/<adapter-id>-sdk-ts/` for ordinary request/response methods
- later either:
  - `sdk/<adapter-id>-sdk-ts/src/stream.ts`
  - or `sdk/<adapter-id>-stream-sdk-ts/`

The exact packaging choice can be finalized later.
The important hard rule is that wave-2 semantics remain distinct from wave-1 request/response clients.

## Validation Requirements

Any second-wave stream/session SDK path must prove:

1. it uses the shared protocol schema as the source of truth
2. it exposes typed frame/event contracts
3. it does not misrepresent long-lived flows as simple request/response APIs
