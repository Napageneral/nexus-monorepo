---
title: "Adapters Workspace"
summary: "Discovery entrypoint for adapter authors working inside the Nex monorepo."
---

# Adapters Workspace

This directory contains Nex adapter packages and adapter-related support code.

Use this file when you are working on an adapter package and need to know:

- where adapter-local docs should live
- which canonical platform and adapter docs govern the work
- how the SDKs fit into the package authoring flow
- what validation path an adapter must clear before it is production-ready

## What Belongs Here

Each real adapter package should live in its own package root under this directory.
That package root should also be the root of the adapter's standalone git repo,
mounted into the umbrella repo as a submodule.

Typical package shape:

```text
adapters/<adapter-id>/
  adapter.nexus.json
  docs/
    specs/
    workplans/
    validation/
  scripts/
```

This directory also contains shared SDKs and packaging helpers:

- [nexus-adapter-sdks](/Users/tyler/nexus/home/projects/nexus/packages/adapters/nexus-adapter-sdks)

Repo-boundary reference:

- [Package Standalone Repo Model](/Users/tyler/nexus/home/projects/nexus/packages/docs/PACKAGE_STANDALONE_REPO_MODEL.md)

## Important Distinction

This workspace currently contains both:

- real adapter package repos
- older or spec-only folders used during planning or migration

When implementing or validating runtime behavior, prefer the real package repo
that carries:

- `adapter.nexus.json`
- package code
- local docs
- release scripts
- package-local `SKILL.md`

## Canonical References

Start here for package-author rules:

- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)
- [Generated SDKs and Shared Package Kit](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/generated-sdks-and-shared-package-kit.md)
- [Hosted Package Ownership and Validation Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-ownership-and-validation-model.md)
- [Adapter Package Distribution and Install](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md)
- [Apps, Adapters, and Method Surfaces](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/apps-adapters-and-method-surfaces.md)
- [Package Method Catalog and IAM](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-method-catalog-and-iam.md)
- [Authorization Compiler](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/identity/authorization-compiler.md)

Adapter-specific canonical references:

- [Adapters Index](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/index.md)
- [Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md)
- [Adapter Connections](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-connections.md)

For hosted validation:

- [Frontdoor Hosted Package Live Testing](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)

## SDK Flow

The correct long-term change order for adapters is:

1. update canonical spec docs
2. update shared adapter SDKs and packaging helpers
3. propagate the changes into actual adapter packages
4. rerun shared hosted lifecycle proof
5. rerun package-specific ladders

Do not treat package-by-package divergence from the SDK as the primary source of truth.

## What Every Adapter Package Must Carry

At minimum:

- local spec
- local workplan
- local validation ladder
- `adapter.nexus.json`
- package-local `SKILL.md`
- repeatable package-release flow

## Validation Path

Every adapter should clear:

1. local contract/build/test proof
2. shared hosted lifecycle proof
3. adapter-specific ladder
4. authorization exposure proof

The adapter-specific ladder should prove the correct surface for that adapter:

- connection setup and health
- ingest
- communication only where appropriate
- typed provider methods where exposed
- write-read coherence where applicable

## Shared SDKs

The shared SDK and packaging workspace is:

- [nexus-adapter-sdks](/Users/tyler/nexus/home/projects/nexus/packages/adapters/nexus-adapter-sdks)

Use it when:

- the canonical adapter contract changes
- CLI/runtime context semantics change
- package-release expectations change
- multiple adapters would otherwise implement the same protocol glue by hand

## Consumer SDKs

Every adapter should publish:

1. a package-owned OpenAPI artifact under `packages/adapters/<adapter-id>/api/`
2. a centrally generated consumer SDK from that published contract

The shared adapter SDK is for authoring adapters.
The generated per-adapter consumer SDK is for apps, agents, and tools that want to call that adapter's package contract.
Adapter repos should not own SDK publication logic.
