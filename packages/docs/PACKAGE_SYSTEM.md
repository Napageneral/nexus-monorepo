# Nex Package System

## Customer Experience

The package system should feel default and unavoidable.

For any new Nex package:
1. scaffold it with `nex package init`
2. get a manifest by default
3. get a release script by default
4. attach one package-local `SKILL.md` by default
5. publish its contract by default
5. optionally generate its consumer SDK from the same contract

The package layer is not an optional cleanup step.

## Top-Level Families

There are two package families under `packages/`:

- `packages/apps/`
- `packages/adapters/`

And two shared support areas:

- `packages/docs/`
- `packages/scripts/`

## Package Shape

### Apps

App packages may contain one or more app manifest roots.

Examples:
- `packages/apps/aix/app/app.nexus.json`
- `packages/apps/spike/app/app.nexus.json`
- `packages/apps/spike/admin/app.nexus.json`

This means the package repo root and the manifest root are not always the same directory.

Canonical release path:
- `nex package release <manifest-root>`

### Adapters

Adapter packages generally own one manifest at the package root.

Examples:
- `packages/adapters/slack/adapter.nexus.json`
- `packages/adapters/jira/adapter.nexus.json`

Canonical release path:
- `nex package release <package-root>`

## Hard Rules

1. `nex package init` is the only blessed package creation path.
2. All package repos must be package-shaped.
3. All real package roots under `packages/` must also be standalone git repos.
4. The umbrella repo should mount those package repos as submodules.
5. Publish/install tooling should assume package shape only.
6. CI should reject non-package-shaped repos.
7. Central contract publication lives under `contracts/`.
8. Repo-local consumer SDKs live under package-local `sdk/` directories.

## Required Files

### Apps

Required at each app manifest root:
- `app.nexus.json`
- `SKILL.md`
- `scripts/package-release.sh` or an equivalent shared invocation path documented in the package

### Adapters

Required at the package root:
- `adapter.nexus.json`
- `SKILL.md`
- `scripts/package-release.sh` or an equivalent shared invocation path documented in the package

## Shared vs Package-Local Scripts

Not every package needs its own bespoke `scripts/generate-sdk.sh`.

The correct split is:

### Shared canonical tools

These should remain the real entrypoints:
- `nex package release ...`
- `nex/scripts/contracts/generate-openapi.ts`
- `nex/scripts/sdk/generate-adapter-sdk-ts.ts`

Publication is a separate concern from release.

Until the CLI owns a first-class `nex package publish`, the canonical publish
path should live under `packages/scripts/` and package-local wrappers should
delegate to it.

### Package-local wrappers

These are optional ergonomics only.
They are useful when:
- a package has a common one-command local workflow
- the package wants a stable local shortcut for contributors

They are not required if the shared command is already clear.

## Consumer SDK Rule

Adapters:
- should publish central OpenAPI under `contracts/adapters/<id>/openapi.yaml`
- may generate a repo-local consumer SDK under `sdk/`

Apps:
- should publish central OpenAPI under `contracts/apps/<id>/openapi.yaml`
- should only grow repo-local consumer SDKs once the app SDK generation model is locked

## Artifact Repository Model

The workspace already acts as its own package and contract publication system.

- package artifacts: package-local `dist/`
- published contracts: central `contracts/`
- package sources: central `packages/`

## Attached Skill Contract

Every app and adapter manifest root under `packages/` is expected to carry one
package-attached `SKILL.md` declared through the manifest `skill` field.

Package completeness under `packages/` includes:

- manifest
- attached skill
- release path
- package-local docs

This is the beginning of the Nex artifact repository model.

## Repo Boundary Rule

The `packages/` directory is the canonical filesystem home for package repos.

That does not make the umbrella repo the owner of package git history.

Instead:

- every real package under `packages/apps/` or `packages/adapters/` should be
  its own standalone git repo
- the umbrella repo should mount those package repos as submodules
- shared support workspaces under `packages/` that are not packages are exempt

Canonical reference:

- `packages/docs/PACKAGE_STANDALONE_REPO_MODEL.md`
