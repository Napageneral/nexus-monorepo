# API And Artifact Layout Alignment Review 2026-03-15

## Purpose

Record which active specs now align to the hard-cut layout model:

1. package-owned OpenAPI under package-local `api/`
2. platform-owned OpenAPI under top-level `api/`
3. generated outputs under top-level `artifacts/`
4. no long-term top-level `contracts/` ownership model

## Canonical Decision

Canonical source:

- `packages/docs/API_AND_ARTIFACT_LAYOUT_MODEL.md`

This is the controlling filesystem and publication model.

## Aligned Canonical Docs

These active docs now tell the same story:

1. `packages/docs/API_AND_ARTIFACT_LAYOUT_MODEL.md`
2. `packages/README.md`
3. `packages/docs/PACKAGE_SYSTEM.md`
4. `packages/docs/SDK_PUBLICATION_MODEL.md`
5. `packages/docs/PACKAGE_ENFORCEMENT.md`
6. `packages/adapters/INDEX.md`
7. `nex/docs/specs/platform/openapi-contract-artifact-model.md`
8. `nex/docs/specs/platform/nex-api-capture-and-publication-model.md`
9. `nex/docs/specs/platform/generated-sdks-and-shared-package-kit.md`
10. `packages/apps/spike/docs/specs/SPIKE_DOWNSTREAM_API_AND_SDK_CONTRACT.md`

## Remaining Stale References In Specs/Docs

These are not yet aligned and should be treated as follow-up:

### Active workplans

1. `nex/docs/workplans/orientation-contract-alignment-workplan.md`
2. `nex/docs/workplans/cli-runtime-projection-and-agent-orientation-cutover-workplan.md`
3. `nex/docs/workplans/role-configs-agent-configs-and-orientation-workplan.md`

Why stale:

1. they still point at `contracts/...`
2. they predate the package-local `api/` hard cut

### Package-local README and TESTING docs

Examples:

1. `packages/adapters/jira/README.md`
2. adapter package READMEs and `TESTING.md` files

Why stale:

1. they previously described repo-local SDK generation
2. they previously described SDK paths under package-local `sdk/`

Implementation result:

1. adapter operational docs now point to package-local `api/openapi.yaml`
2. consumer SDK generation/publication now points to central `artifacts/sdk/...`
3. repo-local SDK ownership language has been removed

### Generated SDK README files

Implementation result:

1. package-local adapter `sdk/` trees were removed during the hard cut
2. centralized generated SDKs now live under `artifacts/sdk/...`

## Remaining Stale References In Code

These were the implementation files that encoded the old layout:

1. `nex/scripts/contracts/generate-openapi.ts`
2. `nex/scripts/sdk/generate-adapter-sdk-ts.ts`
3. `nex/scripts/sdk/generate-nex-sdk-ts.ts`
4. `nex/scripts/sdk/generate-nex-sdk-go.ts`
5. `nex/src/nex/runtime-api/server-methods/orientation.ts`
6. `nex/src/nex/runtime-api/server-methods/orientation.test.ts`

Implementation result:

1. they now point to package-local `api/`, top-level `api/`, and `artifacts/`
2. package-local generated SDK publication was removed

## Existing Filesystem State That Is Now Transitional

The following were transitional artifacts during planning:

1. top-level `contracts/`
2. package-local adapter `sdk/` trees
3. package-local adapter `generate-sdk` wrappers

Implementation result:

1. package-local adapter `sdk/` trees are removed
2. package-local adapter `generate-sdk` wrappers are removed
3. `contracts/` should be deleted as part of the hard cut implementation

## Bottom Line

The canonical spec stack is now aligned around the new model.

Implementation is now largely complete:

1. package OpenAPI lives in package-local `api/`
2. platform OpenAPI lives in top-level `api/`
3. generated SDK outputs live in `artifacts/`
4. repo-local SDK ownership has been removed from package repos

Remaining cleanup is only final deletion of the old `contracts/` tree and any stale historical references that should no longer appear in active docs.
