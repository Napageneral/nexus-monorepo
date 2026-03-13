# Package Standalone Repo Model

## Customer Experience

Every real Nex package should have one obvious filesystem home and one obvious
git home.

For apps and adapters, that means:

1. the package lives under `packages/`
2. the package directory is the root of its own git repo
3. that git repo tracks its own canonical remote
4. the umbrella repo mounts that package repo in place as a submodule

Package authors should not have to choose between "the real package path" and
"the real package repo." They are the same directory.

## Hard Rules

1. Every real package under `packages/apps/` or `packages/adapters/` must be a
   standalone git repo.
2. Every standalone package repo must have its own `origin` remote.
3. The umbrella repo must track package repos as submodules.
4. New package creation is not complete until the repo boundary exists.
5. Shared support workspaces under `packages/` that are not themselves
   packages are exempt.

## What Counts As A Package

Apps:
- directories under `packages/apps/`

Adapters:
- real adapter package directories under `packages/adapters/`

Not packages:
- `packages/docs/`
- `packages/scripts/`
- shared SDK/tooling workspaces such as `packages/adapters/nexus-adapter-sdks/`

## Canonical Layout

```text
packages/
  apps/
    spike/        # standalone repo, mounted as umbrella submodule
    glowbot/      # standalone repo, mounted as umbrella submodule
  adapters/
    git/          # standalone repo, mounted as umbrella submodule
    jira/         # standalone repo, mounted as umbrella submodule
  docs/
  scripts/
```

## Authoring Expectation

For every new app or adapter:

1. create the package in the correct `packages/` family directory
2. initialize or attach the package's own git repo immediately
3. attach the package's canonical remote immediately
4. register it in the umbrella repo as a submodule
5. continue with package implementation only after that boundary is in place

The standalone repo boundary is part of package shape, not a later cleanup.
