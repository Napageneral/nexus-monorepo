# Nex OpenAPI Sessions Read Hardening 2026-03-12

## Customer Experience

A developer reading `contracts/nex/openapi.yaml` should be able to understand the core session read surfaces without reading handler code or runtime e2e tests.

This pass hardens the stable read operations only:

1. `agents.sessions.list`
2. `agents.sessions.preview`
3. `agents.sessions.resolve`

These are customer-visible, already have stable runtime behavior, and are the most useful next slice after the initial Nex domain hardening pass.

## Scope

In scope:

1. publish nongeneric response schemas for the three read methods
2. keep existing request schemas
3. validate representative live handler outputs against the published response envelopes

Out of scope:

1. `agents.sessions.create|get|fork|history|transfer`
2. `agents.sessions.import*`
3. mutation methods like `patch`, `reset`, `archive`, `compact`, `send`

## Research Summary

### Existing request coverage

These methods already have stable request schemas in the protocol layer:

1. `SessionsListParamsSchema`
2. `SessionsPreviewParamsSchema`
3. `SessionsResolveParamsSchema`

### Existing live payload shapes

Source files:

1. `nex/src/nex/runtime-api/server-methods/sessions.ts`
2. `nex/src/nex/runtime-api/session-utils.types.ts`
3. `nex/src/nex/runtime-api/server.sessions.runtime-server-sessions-a.e2e.test.ts`

#### `agents.sessions.list`

Payload shape:
- `{ ts, path, count, defaults, sessions }`

Where:
- `defaults` includes `{ modelProvider, model, contextTokens }`
- `sessions` is an array of runtime session rows with stable core fields and many optional derived fields

#### `agents.sessions.preview`

Payload shape:
- `{ ts, previews }`

Where each preview entry includes:
- `key`
- `status`
- `items`

Each preview item includes:
- `role`
- `text`

#### `agents.sessions.resolve`

Payload shape:
- `{ ok: true, key }`

## Hard-Cut Decisions

1. Publish concrete response schemas for the three read methods now.
2. Use the stable runtime session/read result types as the contract source, not generic objects.
3. Keep optional session row fields optional rather than overfitting to one runtime snapshot.
4. Validate live handler outputs directly in the OpenAPI conformance test.

## Implementation Plan

### 1. Contract builder

File: `nex/src/nex/runtime-api/openapi/nex-contract.ts`

Add local component schemas for:

1. runtime sessions defaults
2. runtime session row
3. sessions list result
4. session preview item
5. sessions preview entry
6. sessions preview result
7. sessions resolve result

Then map:

1. `agents.sessions.list`
2. `agents.sessions.preview`
3. `agents.sessions.resolve`

to those local response schemas.

### 2. Conformance test

File: `nex/src/nex/runtime-api/openapi/nex-contract.test.ts`

Add representative live-output validation for:

1. `agents.sessions.list`
2. `agents.sessions.preview`
3. `agents.sessions.resolve`

using seeded ledger data and the real session handlers.

### 3. Publication

1. regenerate `contracts/nex/openapi.yaml`
2. confirm the three read methods are no longer generic on payload

## Validation

Required:

1. `pnpm contracts:generate:nex`
2. `pnpm exec vitest run src/nex/runtime-api/openapi/nex-contract.test.ts`

Success criteria:

1. the three read methods publish nongeneric payload schemas
2. representative live handler outputs conform to the published schemas
3. the generated contract remains deterministic
