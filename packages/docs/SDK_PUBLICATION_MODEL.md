# SDK Publication Model

## Customer Experience

The package author experience should be:

1. define the package contract
2. publish the package OpenAPI artifact
3. stop

The package consumer experience should be:

1. find the package-owned OpenAPI contract in the package `api/` directory
2. install a generated SDK from the shared artifact system
3. trust that the SDK came from the same canonical OpenAPI contract

Package repos should not carry their own SDK publication logic.

## Hard Rules

1. Package repos own OpenAPI contracts, not SDK publication.
2. SDK generation is centralized.
3. SDK publication is centralized.
4. OpenAPI is the source of truth for package consumer SDKs.
5. Package-local generated `sdk/` directories are not part of the long-term model.
6. Package-local `generate-sdk` wrappers are not part of the long-term model.

## Source Of Truth

For package consumer SDKs:

1. package manifest defines the installable package
2. package-local OpenAPI artifact defines the callable contract
3. shared SDK generator defines the generated client shape

The package repo should never become a second source of truth for the consumer SDK.

## Canonical Flow

1. package repo defines or updates its OpenAPI source inputs
2. package OpenAPI is generated or maintained in package-local `api/`
3. shared SDK generator produces SDK artifacts from those package-owned contracts
4. shared artifact/package publication publishes those SDKs

## Why This Rule Exists

If package repos own local SDK publication, the workspace accumulates:

1. duplicated generated code
2. duplicated wrapper scripts
3. duplicated package metadata
4. review noise from generated churn
5. drift between contract publication and SDK publication

The hard cut is:

1. package repos think about OpenAPI
2. the shared system thinks about SDKs

## Shared Tooling

Shared SDK tooling belongs under Nex shared tooling, not package repos.

Current examples:

- `nex/scripts/sdk/`
- `nex/sdk/sdk-codegen/`

Those should remain the only canonical generation surfaces.

## Package Repo Responsibilities

Every package repo is responsible for:

1. manifest correctness
2. package validation
3. package release artifact
4. package docs
5. OpenAPI correctness

Every package repo is not responsible for:

1. SDK codegen implementation
2. SDK packaging policy
3. SDK publication mechanics
4. SDK wrapper script ergonomics

## Artifact System

The workspace should act as its own artifact system:

1. package artifacts published from package release flow
2. package-owned OpenAPI artifacts under package-local `api/`
3. platform-owned OpenAPI artifacts under top-level `api/`
4. consumer SDK artifacts published centrally from shared SDK generation under `artifacts/`

That keeps ownership simple:

1. packages own contracts
2. the platform owns generated SDK distribution
