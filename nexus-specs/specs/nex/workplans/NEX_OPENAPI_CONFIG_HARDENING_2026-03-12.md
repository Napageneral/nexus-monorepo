# Nex OpenAPI Config Hardening 2026-03-12

## Customer Experience

A developer reading `contracts/nex/openapi.yaml` should be able to understand the operator-visible config API and its restart side effects without reading runtime e2e tests.

This pass hardens:

1. `config.get`
2. `config.set`
3. `config.patch`
4. `config.apply`

## Research Summary

Stable runtime behavior already exists in:

1. `nex/src/nex/runtime-api/server-methods/config.ts`
2. `nex/src/nex/runtime-api/server.config-patch.e2e.test.ts`
3. `nex/src/nex/runtime-api/server.config-apply.e2e.test.ts`

Existing stable shapes already exist for:

1. config snapshot fields via `ConfigFileSnapshot`
2. config schema response via `ConfigSchemaResponseSchema`
3. restart sentinel payloads via `RestartSentinelPayload`
4. restart scheduling result via `scheduleRuntimeSigusr1Restart`

The contract gap is publication wiring, not ambiguous behavior.

## Hard-Cut Decisions

1. Publish concrete response schemas for `config.get`, `config.set`, `config.patch`, and `config.apply`.
2. Keep `config`/`parsed` payloads broad objects because plugin-expanded config shape is intentionally open-ended.
3. Publish the restart and sentinel wrapper shape explicitly.
4. Validate representative live handler outputs against the published response envelopes.

## Validation

Required:

1. `pnpm contracts:generate:nex`
2. `pnpm exec vitest run src/nex/runtime-api/openapi/nex-contract.test.ts`

Success criteria:

1. the targeted config methods no longer publish generic payload schemas
2. representative handler outputs conform to the published schemas
