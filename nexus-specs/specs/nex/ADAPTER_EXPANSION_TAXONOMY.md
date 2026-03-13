# Adapter Expansion Taxonomy

## Customer Experience

When a developer asks for an adapter contract or consumer SDK, the system should answer clearly whether the target is:

1. a real standalone adapter package
2. a provider inside a multi-provider adapter
3. an older non-packaged adapter that must migrate first
4. a missing or not-yet-realized adapter concept

The developer should not get a fake package contract for something that is not actually a standalone adapter package.

## Hard Rules

### Standalone adapter package

If a target has its own `adapter.nexus.json` package root, it is eligible for:

1. central Adapter API OpenAPI publication
2. repo-local consumer SDK generation

Examples:

- `nexus-adapter-qase`
- `nexus-adapter-git`
- `nexus-adapter-telegram`
- `nexus-adapter-whatsapp`
- `nexus-adapter-discord`

### Provider inside a multi-provider adapter

If a target is a provider implementation inside a standalone adapter package, it is **not** its own adapter package contract.

Examples:

- `bitbucket` inside `nexus-adapter-git`
- `github` inside `nexus-adapter-git`
- `gitlab` inside `nexus-adapter-git`

These should be documented and surfaced through the owning adapter package contract, not published as fake standalone adapter package contracts.

### Older non-packaged adapter

If a target exists in the repo but does not have a real package root with `adapter.nexus.json`, it is not yet eligible for per-adapter contract publication.

Examples today:

- `slack`
- `jira`

These require a package migration or package definition hard cut before publication and consumer SDK generation.

### Missing target

If a target does not exist as a real package or implementation, it should not be treated as publishable.

Example today:

- `eve`

## Immediate Expansion Set

The next clean standalone expansion set is:

1. `nexus-adapter-qase`
2. `nexus-adapter-git`

## Go Adapter Publication Rule

Go-based standalone adapters are still eligible for the same publication model.

The difference is source introspection mode:

1. TypeScript adapters may be loaded directly from source
2. Go adapters should be introspected through a locally built binary or `go run`-equivalent CLI invocation

The publication model stays the same:

1. central OpenAPI contract under `contracts/adapters/<adapterId>/`
2. repo-local consumer SDK under `adapters/<adapterId>/sdk/`

The language/runtime of the adapter implementation does not change that ownership model.
