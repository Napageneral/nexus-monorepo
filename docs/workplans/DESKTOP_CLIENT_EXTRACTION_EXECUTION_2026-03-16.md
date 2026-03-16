---
summary: "Execution spec for creating the desktop client monorepo boundary and relocating the macOS companion adapter."
title: "Desktop Client Extraction Execution"
---

# Desktop Client Extraction Execution

## Customer Experience

The customer should see one honest desktop platform story:

1. desktop-native client work lives under `clients/nexus-desktop/`
2. macOS companion adapter work lives beside the desktop app, not inside the generic adapter pool
3. `nex` remains the runtime/CLI core, not the desktop app
4. no repo path should imply that the deleted legacy macOS app still exists inside `nex`

## Research Summary

Current state:

1. `device-macos` is a real companion adapter package and still models a macOS companion pairing flow.
2. there is no surviving live `apps/macos` source tree to extract from `nex`.
3. prior canon explicitly removed the macOS app from target-state scope.
4. `nex/src/macos/*` still exists, but the surviving files are runtime/bootstrap helpers, not a complete desktop app.
5. the mobile extraction proved the right top-level pattern: clients get their own monorepo boundary.

## Canonical Decision

Create a new desktop client home:

```text
clients/nexus-desktop/
  macos/
    app/
    adapter/
```

Rules:

1. `macos/app/` is a greenfield desktop app boundary for new implementation work.
2. `macos/adapter/` is the relocated home of `device-macos`.
3. `nex` is not the desktop client and should not be treated as one.
4. `nex/src/macos/*` stays in `nex` for now unless and until a concrete desktop app implementation rehomes or deletes those helpers.
5. no backward-compatibility alias path is kept for `packages/adapters/device-macos`.

## Scope

### In Scope

1. create `clients/nexus-desktop/`
2. create `clients/nexus-desktop/macos/app/` as an honest placeholder boundary
3. move `packages/adapters/device-macos` to `clients/nexus-desktop/macos/adapter`
4. rewire `nex` adapter discovery/tooling so `device-macos` continues to participate in OpenAPI and SDK generation
5. update active docs/specs that teach the old adapter location

### Out Of Scope

1. rebuilding the macOS app itself
2. moving `device-headless`
3. moving `nex/src/macos/*` runtime/bootstrap helpers in this pass
4. redesigning `device-macos` commands or pairing semantics

## Implementation Plan

### 1. Create Desktop Repo Boundary

Create:

1. `clients/nexus-desktop/README.md`
2. `clients/nexus-desktop/.gitignore`
3. `clients/nexus-desktop/macos/app/README.md`

The app README must state clearly:

1. the old macOS app was deleted from `nex`
2. this is the new target home for desktop client work
3. no app source has been reintroduced yet

### 2. Move The Adapter

Move:

1. `packages/adapters/device-macos` -> `clients/nexus-desktop/macos/adapter`

During move:

1. remove nested build outputs like `bin/` and `dist/` if present
2. preserve package manifest, docs, tests, API artifacts, and scripts
3. update package-local docs to the new path

### 3. Rewire Nex Tooling

Update:

1. `nex/scripts/contracts/generate-openapi.ts`
2. `nex/scripts/sdk/generate-adapter-sdk-ts.ts`

So adapter discovery includes:

1. `packages/adapters/*`
2. `clients/nexus-mobile/ios/adapter`
3. `clients/nexus-mobile/android/adapter`
4. `clients/nexus-desktop/macos/adapter`

### 4. Clean Active Docs

Update active docs/specs/workplans that still teach:

1. `packages/adapters/device-macos`
2. `device-macos` as an orphan outside the new desktop client home

## Validation

Implementation must prove:

1. `packages/adapters/device-macos` no longer exists
2. `clients/nexus-desktop/macos/adapter` exists and passes `go test ./...`
3. `nex` OpenAPI generation still works for `device-macos`
4. `nex` adapter SDK generation still works for `device-macos`
5. active docs no longer point to the old `packages/adapters/device-macos` path where the new location should be taught instead
6. `nexus status` still works after the move

## Follow-On Work

After this extraction:

1. decide whether any `nex/src/macos/*` helpers should later move into `clients/nexus-desktop/macos/app`
2. design and implement the actual macOS app surface inside `clients/nexus-desktop/macos/app`
3. decide whether desktop-shared code should grow a `DesktopKit` style shared library or stay app-local
