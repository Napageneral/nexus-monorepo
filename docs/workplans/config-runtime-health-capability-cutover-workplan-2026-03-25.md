# Config / Runtime-Health Capability Cutover Workplan

## Goal

Move canonical capability authoring and schema ownership for:

- `config.get`
- `config.schema`
- `config.set`
- `config.patch`
- `config.apply`
- `runtime.health`
- `update.run`

from the OpenAPI/protocol-local surfaces into `src/capabilities`, following the existing agents/browser/memory pattern.

## User Experience

The runtime should behave exactly as it does today from the caller’s perspective:

- `config.*` still validates and responds with the same payloads.
- `runtime.health` still returns the same health snapshot shape.
- `update.run` still returns the same restart/sentinel payload shape.

The change is ownership, not feature behavior.

## Design

### Capability ownership

Create capability modules under `src/capabilities` for:

- `config`
- `runtime-health`
- `update`

Each module owns:

- canonical capability descriptor(s)
- request schema(s)
- response schema(s)
- runtime operation descriptor(s)
- `listCanonical…` and `resolveCanonical…` helpers

### Registry wiring

Update the aggregated capability/runtime registry so these canonical descriptors are sourced from `src/capabilities`, not from ad hoc objects in `src/api/runtime-operations.ts`.

Preserve the current runtime operation ids, actions, and resources exactly.

### Protocol/OpenAPI projection

Update the protocol schema bridge files so the contract layer re-exports the capability-owned schemas instead of defining duplicate local schema objects.

Update `src/api/openapi/nex-contract.ts` to consume the capability-owned schemas where possible.

Do not add aliases, fallback behavior, or alternate names.

### Handler boundary

Do not move handler execution logic in this slice.

- `config.*` handlers remain in `src/api/server-methods/config.ts`
- `runtime.health` handler remains in `src/api/server-methods/health.ts` / `src/commands/health.ts`
- `update.run` handler remains in `src/api/server-methods/update.ts`

Only the canonical schema and descriptor ownership changes.

## Files Expected

Likely changes:

- `src/capabilities/config.ts`
- `src/capabilities/runtime-health.ts`
- `src/capabilities/update.ts`
- `src/capabilities/core-runtime.ts`
- `src/capabilities/index.ts`
- `src/api/protocol/schema/config.ts`
- `src/api/protocol/schema/runtime-health.ts`
- `src/api/protocol/schema/update.ts`
- `src/api/protocol/schema.ts`
- `src/api/protocol/schema/types.ts`
- `src/api/protocol/schema/protocol-schemas.ts`
- `src/api/protocol/index.ts`
- `src/api/runtime-operations.ts`
- `src/api/openapi/nex-contract.ts`
- `src/api/openapi/nex-contract.schema-registry.test.ts`
- `src/api/runtime-operations.conformance.test.ts`
- `src/capabilities/core-runtime.test.ts`
- focused capability tests for the new modules

## Validation Ring

Run only the targeted ring after implementation:

- capability ownership tests for config/runtime-health/update
- runtime-operations conformance test
- OpenAPI schema registry test
- focused OpenAPI contract test(s) for representative config/runtime-health/update payloads

## Residue

Acceptable residue after this cut:

- existing handler execution code still lives in `src/api/server-methods/*`
- unrelated capability families remain untouched
- no fallback or compatibility layer is introduced

