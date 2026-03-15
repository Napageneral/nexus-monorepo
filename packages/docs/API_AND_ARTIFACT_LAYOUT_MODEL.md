# API And Artifact Layout Model

## Customer Experience

The filesystem story should be obvious:

1. every package owns its own API contract locally
2. platform APIs live in one top-level `api/` area
3. generated outputs live in one top-level `artifacts/` area
4. no one has to guess whether a file is authored source or generated output

The hard cut is:

1. packages own package API contracts
2. the platform owns platform API contracts
3. the shared system owns generated artifacts

## Core Rule

OpenAPI remains a projection of the owning contract model.

But filesystem ownership must match product ownership:

1. package API contracts live with the package
2. platform API contracts live with the platform
3. generated SDKs and related outputs do not live in package repos

## Layout

### Package-Owned API Contracts

Adapters:

- `packages/adapters/<adapter-id>/api/openapi.yaml`
- `packages/adapters/<adapter-id>/api/openapi.lock.json`

Apps:

- `packages/apps/<family>/<manifest-root>/api/openapi.yaml`
- `packages/apps/<family>/<manifest-root>/api/openapi.lock.json`

The package repo owns these files.

### Platform-Owned API Contracts

Platform APIs are not package repos.
They live in the top-level `api/` tree:

- `api/frontdoor/openapi.yaml`
- `api/frontdoor/openapi.lock.json`
- `api/nex/openapi.yaml`
- `api/nex/openapi.lock.json`

### Generated Artifact Area

Generated outputs live under `artifacts/`.

Examples:

- `artifacts/sdk/ts/<sdk-id>/`
- `artifacts/sdk/go/<sdk-id>/`

This area is for generated publication outputs, not authored package source.

## What Replaces `contracts/`

The old `contracts/` tree mixed three concerns:

1. package-owned contracts
2. platform-owned contracts
3. generated-publication assumptions

That is no longer the right model.

The replacement is:

1. `packages/.../api/` for package-owned contracts
2. `api/` for platform-owned contracts
3. `artifacts/` for generated outputs

## Ownership Rules

### Packages

Package repos own:

1. manifest
2. package docs
3. package release artifact
4. package-local OpenAPI under `api/`

Package repos do not own:

1. shared SDK generation logic
2. shared SDK publication mechanics
3. generated SDK artifact storage

### Platform

The platform owns:

1. Nex API OpenAPI under `api/nex/`
2. Frontdoor API OpenAPI under `api/frontdoor/`
3. shared SDK generation toolchains
4. generated SDK publication under `artifacts/`

## Generation Model

1. package code or platform code defines the contract inputs
2. OpenAPI is generated into the owning `api/` location
3. shared SDK generation reads from those `api/` locations
4. shared artifact publication writes generated SDK outputs into `artifacts/`

## Hard Rules

1. package repos own package-local `api/`, not top-level package contracts
2. platform APIs use top-level `api/`, not package-local `api/`
3. generated SDKs do not live under package repos
4. top-level `contracts/` is not part of the long-term layout

## Why This Model Is Better

It removes ambiguity:

1. package source stays with the package
2. platform source stays with the platform
3. generated artifacts stay out of authored source trees

It also lowers maintenance burden:

1. fewer duplicated generated files
2. fewer wrapper scripts
3. cleaner repo ownership boundaries
