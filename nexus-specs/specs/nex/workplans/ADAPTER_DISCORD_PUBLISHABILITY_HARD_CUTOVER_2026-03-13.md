# Adapter Discord Publishability Hard Cutover 2026-03-13

## Customer Experience

`nexus-adapter-discord` should behave like the other published adapters:

1. its adapter definition can be imported safely without executing the CLI
2. its package contract can be published centrally under `contracts/adapters/`
3. its repo-local consumer SDK can be generated under `adapters/nexus-adapter-discord/sdk/`

## Current Problem

Today `nexus-adapter-discord/src/index.ts` mixes two responsibilities:

1. adapter definition export
2. CLI process bootstrap via `await runAdapter(discordAdapter)`

That makes the module unsafe to import for contract publication and SDK generation.

## Hard-Cut Decision

Split the adapter definition from the CLI entrypoint.

Target shape:

- `src/adapter.ts` owns `discordAdapter`
- `src/index.ts` is the executable wrapper that imports `discordAdapter` and calls `runAdapter(...)`

No compatibility shim beyond the new package-internal import split.

## Implementation Steps

1. move the adapter definition into `src/adapter.ts`
2. reduce `src/index.ts` to a thin executable wrapper
3. extend adapter contract generation to include `nexus-adapter-discord`
4. generate the repo-local TypeScript consumer SDK package
5. validate build and generated method inventory

## Validation

Required validation:

1. `nexus-adapter-discord` still builds
2. adapter contract generation can load the adapter definition without side effects
3. published Discord adapter OpenAPI parses cleanly
4. generated Discord consumer SDK compiles successfully
