# App Package API Completion Model

**Status:** CANONICAL
**Last Updated:** 2026-03-15

## Purpose

This document defines the hard-cut model for app package API ownership under
`packages/apps/`.

It answers:

1. which app package roots must own package-local OpenAPI
2. where that OpenAPI lives
3. how app package OpenAPI is generated
4. how weak manifest schemas are supplemented
5. how package validation should enforce the rule

## Customer Experience

The intended developer experience is simple:

1. each installable app package root owns its own API contract
2. the contract is always found in `api/openapi.yaml` inside that package root
3. downstream consumers do not guess whether an app has an API; they inspect the package-local `api/`
4. package validation fails if an API-owning app package root does not publish its OpenAPI artifact

A package family root is not the API unit.
The manifest root is the API unit.

Examples:

- `packages/apps/aix/app/api/openapi.yaml`
- `packages/apps/dispatch/app/api/openapi.yaml`
- `packages/apps/glowbot/app/api/openapi.yaml`
- `packages/apps/glowbot/admin/api/openapi.yaml`
- `packages/apps/glowbot/hub/api/openapi.yaml`
- `packages/apps/spike/app/api/openapi.yaml`
- `packages/apps/spike/admin/api/openapi.yaml`

## Core Rules

1. every app package manifest root under `packages/apps/` owns package-local `api/openapi.yaml`
2. every app package manifest root under `packages/apps/` owns package-local `api/openapi.lock.json`
3. app package OpenAPI is generated from the package-owned app contract, not hand-maintained centrally
4. manifest-declared method params are part of the canonical app API source
5. package-local `openapi/response-schemas.ts` is the canonical supplement when manifest response schemas are missing or too weak
6. top-level `api/` is only for platform-owned APIs such as Nex and Frontdoor, not app packages
7. package validation must fail if an app package root is missing its package-local API artifact
8. no app package publishes into a top-level `contracts/` registry

## Package Inventory

### Implemented app package roots

1. `packages/apps/aix/app`
2. `packages/apps/dispatch/app`
3. `packages/apps/glowbot/app`
4. `packages/apps/glowbot/admin`
5. `packages/apps/glowbot/hub`
6. `packages/apps/spike/app`
7. `packages/apps/spike/admin`

These are the current app package API units.

## Surface Inventory

### AIX

Root:
- `packages/apps/aix/app`

Current state:
1. package-local OpenAPI already exists
2. package-local response supplement already exists
3. AIX is the reference implementation for rich app response schemas

### Dispatch

Root:
- `packages/apps/dispatch/app`

Current state:
1. method surface is declared in `app.nexus.json`
2. request schemas are already present in manifest params
3. response schemas are present but broadly generic (`{ "type": "object" }`)
4. package-local OpenAPI artifact does not yet exist

Decision:
1. Dispatch must publish package-local OpenAPI now
2. manifest response schemas are accepted as the current package truth for this cut
3. richer response supplements can be added later without changing the ownership model

### Glowbot App

Root:
- `packages/apps/glowbot/app`

Current state:
1. method handlers exist in `methods/`
2. manifest declares the method inventory and request params
3. response schemas are mostly absent from the manifest
4. package-local OpenAPI artifact does not yet exist

Decision:
1. Glowbot App must publish package-local OpenAPI now
2. missing responses must be supplied through package-local `openapi/response-schemas.ts`
3. if a response is not yet deeply typed, the supplement may publish a broad object schema, but the supplement file is still the owning surface for later tightening

### Glowbot Admin

Root:
- `packages/apps/glowbot/admin`

Current state:
1. method handlers exist in `methods/`
2. manifest declares the method inventory and partial request params
3. response schemas are absent from the manifest
4. package-local OpenAPI artifact does not yet exist

Decision:
1. Glowbot Admin must publish package-local OpenAPI now
2. package-local `openapi/response-schemas.ts` owns the response supplement

### Glowbot Hub

Root:
- `packages/apps/glowbot/hub`

Current state:
1. the package exposes a real manifest method surface
2. it is not just a shell; it owns callable `glowbotHub.*` methods
3. response schemas are absent from the manifest
4. package-local OpenAPI artifact does not yet exist

Decision:
1. Glowbot Hub is an app API surface and must publish package-local OpenAPI
2. package-local `openapi/response-schemas.ts` owns the response supplement

### Spike App

Root:
- `packages/apps/spike/app`

Current state:
1. method surface is declared in `app.nexus.json`
2. current canonical Spike docs already require `packages/apps/spike/app/api/openapi.yaml`
3. response schemas are present but broadly generic (`{ "type": "object" }`)
4. package-local OpenAPI artifact does not yet exist

Decision:
1. Spike App must publish package-local OpenAPI now
2. current manifest response schemas are accepted as the current package truth for this cut
3. richer Spike downstream schema work can continue later inside the same package-local API ownership model

### Spike Admin

Root:
- `packages/apps/spike/admin`

Current state:
1. the package root exists and is installable
2. current manifest method inventory is empty
3. package-local OpenAPI artifact does not yet exist

Decision:
1. Spike Admin still owns a package-local API artifact
2. if the manifest method inventory is empty, the generated OpenAPI may have zero operation paths
3. zero-operation package-local OpenAPI is still required because the package root is an installable app package unit

## Generation Model

App package OpenAPI generation works like this:

1. discover every `app.nexus.json` manifest root under `packages/apps/`
2. parse the manifest method inventory
3. project each method into `/runtime/operations/<method>`
4. use manifest `params` as the request schema source
5. use manifest `response` when present
6. merge package-local `openapi/response-schemas.ts` when present
7. write `api/openapi.yaml` and `api/openapi.lock.json` into that same package root

## Supplement Contract

When an app package needs richer response schemas than the manifest provides, it
must own:

- `openapi/response-schemas.ts`

Canonical exports:

- `appOpenApiComponents`
- `appResponseSchemasByMethod`

This keeps response enrichment adjacent to the owning app package.

## Validation Rule

`package validate` must require for app package roots:

1. `api/openapi.yaml`
2. `api/openapi.lock.json`

This is a hard requirement, not an optional enhancement.

## Implementation Targets For This Cut

This cut is complete only when:

1. all 7 app package roots publish package-local `api/openapi.yaml`
2. all 7 app package roots publish package-local `api/openapi.lock.json`
3. package validation fails if those files are missing
4. generated outputs no longer rely on any top-level `contracts/` app path
5. active docs stop describing app API publication as AIX-only

