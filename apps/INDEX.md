---
title: "Apps Workspace"
summary: "Discovery entrypoint for app authors working inside the Nex monorepo."
---

# Apps Workspace

This directory contains Nex app packages.

Use this file when you are working on an app package and need to know:

- where app-local docs should live
- which canonical platform docs govern app authoring
- what validation path an app must clear before it is production-ready

## What Belongs Here

Each real app package should live in its own package root under this directory.

Typical package shape:

```text
apps/<app-id>/
  app.nexus.json
  docs/
    specs/
    workplans/
    validation/
  scripts/
```

Package-local docs define the app itself.
Canonical cross-cutting platform docs still live under `nex/docs/specs/`.

## Canonical Authoring References

Start here for package-author rules:

- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)
- [Hosted Package Ownership and Validation Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-ownership-and-validation-model.md)
- [Apps, Adapters, and Method Surfaces](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/apps-adapters-and-method-surfaces.md)
- [Package Method Catalog and IAM](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-method-catalog-and-iam.md)
- [Authorization Compiler](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/identity/authorization-compiler.md)

For hosted validation:

- [Frontdoor Hosted Package Live Testing](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md)

## What Every App Package Must Carry

At minimum:

- local spec
- local workplan
- local validation ladder
- `app.nexus.json`
- repeatable package-release flow

## Validation Path

Every app should clear:

1. local contract/build/test proof
2. shared hosted lifecycle proof
3. app-specific ladder
4. authorization exposure proof

Do not claim an app is production-ready until all four are green.

## Current App Packages

Examples in this workspace:

- [aix](/Users/tyler/nexus/home/projects/nexus/apps/aix)
- [dispatch](/Users/tyler/nexus/home/projects/nexus/apps/dispatch)
- [glowbot](/Users/tyler/nexus/home/projects/nexus/apps/glowbot)
- [spike](/Users/tyler/nexus/home/projects/nexus/apps/spike)
