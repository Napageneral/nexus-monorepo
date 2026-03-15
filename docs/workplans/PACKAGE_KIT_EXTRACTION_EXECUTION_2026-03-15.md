# Package Kit Extraction Execution

**Status:** ACTIVE
**Last Updated:** 2026-03-15

## Customer Experience

The command surface must not change for package authors.

Package authors should still use:

1. `nex package init`
2. `nex package validate`
3. `nex package release`
4. `nex package smoke`

The hard cut is implementation ownership only:

1. package-system implementation moves out of runtime core
2. the CLI remains the canonical user-facing entrypoint
3. package authors should not need to care where the implementation lives

## Purpose

This document defines the implementation cut for moving `package-kit` out of `nex` and into the umbrella package-system area.

Target state:

- `packages/package-kit/` owns shared package-system implementation and templates
- `nex/src/cli/package-cli/*` becomes a thin wrapper layer
- `nex/package-kit/` disappears

## Exact Current Call Sites

Current direct implementation ownership in `nex`:

1. `nex/package-kit/README.md`
2. `nex/package-kit/templates/*`
3. `nex/src/cli/package-cli/init.ts`
4. `nex/src/cli/package-cli/shared.ts`
5. `nex/src/cli/package-cli/release.ts`
6. `nex/src/cli/package-cli/smoke.ts`
7. `nex/src/cli/package-cli/validate.ts`

Current test surface that must keep passing:

1. `nex/src/cli/package-cli/init.test.ts`
2. `nex/src/cli/package-cli/validate.test.ts`
3. `nex/src/cli/package-cli/release.test.ts`
4. `nex/src/cli/package-cli/smoke.test.ts`

## Hard Decisions

1. `packages/package-kit/` is the new owner.
2. `nex package ...` names stay unchanged.
3. `nex/src/cli/package-cli/register.ts` remains in `nex` because the CLI surface still belongs there.
4. package templates move physically to `packages/package-kit/templates/`.
5. shared implementation moves physically to `packages/package-kit/src/`.
6. `nex/package-kit/` is deleted after rewiring.

## Target Layout

```text
packages/
  package-kit/
    README.md
    src/
      init.ts
      release.ts
      shared.ts
      smoke.ts
      validate.ts
      index.ts
    templates/
      app-ts/
      adapter-ts/
      adapter-go/
```

`nex/src/cli/package-cli/` keeps:

1. `register.ts`
2. wrapper exports used by CLI/tests

## Implementation Model

### Shared package-kit workspace

Move the reusable implementation into `packages/package-kit/src/`.

That workspace owns:

1. template resolution
2. package detection
3. package validation
4. archive assembly
5. Frontdoor smoke orchestration

### Nex CLI wrapper layer

Keep the wrapper layer in `nex/src/cli/package-cli/`.

Those files should only:

1. import shared functions from `packages/package-kit/src/`
2. expose the same local function names used by tests and command registration
3. avoid owning package-system logic directly

## Documentation Cut

Minimum docs to update in this slice:

1. `packages/README.md`
2. `packages/docs/PACKAGE_SYSTEM.md`
3. active references that still point to `nex/package-kit/`
4. `packages/package-kit/README.md`

## Validation

The cut is valid when:

1. `nex package init` still scaffolds packages
2. `nex package validate` still validates package shape
3. `nex package release` still emits the archive and checksum
4. `nex package smoke` tests still pass
5. `nex/package-kit/` no longer exists
6. active docs no longer present `nex/package-kit/` as the owner

## Test Plan

Run:

1. `pnpm exec vitest run src/cli/package-cli/init.test.ts src/cli/package-cli/validate.test.ts src/cli/package-cli/release.test.ts src/cli/package-cli/smoke.test.ts`
2. one direct CLI command check for `nex package init --kind app --id <tmp>`
3. one direct CLI command check for `nex package validate <tmp>`
