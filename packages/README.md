# Packages

This directory is the top-level home for Nex package families.

It contains:

- `apps/` - product/application packages built for Nex
- `adapters/` - integration/provider/device packages built for Nex
- `docs/` - shared package-system documentation and navigation
- `scripts/` - shared package-audit and package-ops helpers

## Repo Boundary Model

Every real package under `packages/` is expected to live here in the tree while
also being its own standalone git repo with its own remote tracking.

The umbrella repo should mount real package repos as submodules in place.

Canonical reference:

- `packages/docs/PACKAGE_STANDALONE_REPO_MODEL.md`

## Package Shape

All Nex packages are expected to be package-shaped.

Apps:
- own one or more `app.nexus.json` manifest roots
- own one package-local `SKILL.md` per manifest root
- are released through `nex package release <manifest-root>`

Adapters:
- own one `adapter.nexus.json` manifest root at the package root
- own one package-local `SKILL.md` at the package root
- are released through `nex package release <package-root>`

## Hard Rules

1. `nex package init` is the only blessed way to create new packages.
2. Non-package-shaped repos are not production-ready.
3. Publish/install tooling assumes package shape only.
4. Package-attached `SKILL.md` is required package contract for apps and adapters.
5. Central OpenAPI publication lives under `/Users/tyler/nexus/home/projects/nexus/contracts/`.
6. Repo-local consumer SDKs live under each package's `sdk/` directory.
7. Real package directories under `packages/` must be standalone repos mounted
   into the umbrella repo as submodules.

## Notes On Shared Scripts

Per-package wrapper scripts are optional ergonomics, not the source of truth.

Canonical shared entrypoints are:
- `nex package release <manifest-root>`
- `/Users/tyler/nexus/home/projects/nexus/packages/scripts/publish-package.sh <manifest-root-or-package-root>`
- `node --import tsx /Users/tyler/nexus/home/projects/nexus/nex/scripts/contracts/generate-openapi.ts ...`
- `node --import tsx /Users/tyler/nexus/home/projects/nexus/nex/scripts/sdk/generate-adapter-sdk-ts.ts <adapter-id>`

Canonical publish flow should also converge under `packages/scripts/` rather
than package-local bespoke Frontdoor wrappers.

Adapters can use package-local `scripts/generate-sdk.sh` wrappers if that improves ergonomics.
Apps should not invent ad hoc wrappers until app consumer SDK generation exists.
