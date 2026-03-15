# Package Kit And Mobile Extraction Target Model

**Status:** ACTIVE
**Last Updated:** 2026-03-15

## Customer Experience

The filesystem and repo model should make two things obvious:

1. package authors use one shared package system
2. mobile/client engineers do not have to work inside the Nex runtime repo

The intended user experience is:

1. package authors create and validate packages through one canonical package toolchain
2. Frontdoor publishes and installs packages, but does not own package scaffolding
3. adapter SDKs own adapter protocol authoring, but do not own app packaging
4. mobile apps live with their own client code and shared client libraries, not inside runtime core

## Purpose

This document defines the extraction targets and repo forms for:

1. `nex/package-kit/`
2. `nex/apps/ios`
3. `nex/apps/android`
4. `nex/apps/shared/NexusKit`

It does **not** implement the extraction. It locks the target-state placement model first.

## Research Summary

### `package-kit/` is shared package-system infrastructure

`package-kit/` currently owns the package scaffolding and package lifecycle shell for both apps and adapters.

Evidence:

- `nex/package-kit/README.md`
- `nex/src/cli/package-cli/init.ts`
- `nex/src/cli/package-cli/shared.ts`
- `nex/src/cli/package-cli/release.ts`
- `nex/src/cli/package-cli/smoke.ts`
- `nex/src/cli/package-cli/register.ts`

What it actually does:

1. scaffolds package templates for:
   - app + TypeScript
   - adapter + TypeScript
   - adapter + Go
2. validates package shape:
   - manifest
   - `SKILL.md`
   - docs roots
   - release script presence
   - package-local paths
3. creates release archives
4. runs hosted smoke validation against Frontdoor + runtime package health

This is broader than adapter SDK authoring and broader than Frontdoor publication.

### Frontdoor is a publication and install boundary, not an authoring home

Evidence:

- `frontdoor/nexus-frontdoor/src/publish-app-release.ts`
- `frontdoor/nexus-frontdoor/src/publish-adapter-release.ts`
- `frontdoor/nexus-frontdoor/scripts/package-app.sh`

Frontdoor owns:

1. ingesting release tarballs
2. registering package metadata
3. install and upgrade orchestration
4. runtime token minting and hosted lifecycle checks

Frontdoor does **not** own:

1. package scaffolding
2. package-shape validation as a general authoring concern
3. shared package templates for both apps and adapters

### Adapter SDKs are too narrow to own `package-kit/`

Evidence:

- `packages/adapters/nexus-adapter-sdks/README.md`
- `packages/adapters/nexus-adapter-sdks/adapter-package-kit/README.md`

The adapter SDK workspace already contains an adapter-only `adapter-package-kit/` helper.

That helper is intentionally adapter-specific:

1. it packages adapter release artifacts only
2. it does not own app scaffolding
3. it does not own package-system validation for app manifests

That makes it the wrong home for the shared `package-kit/`.

The correct long-term direction is the opposite:

1. shared package-kit becomes the canonical package-system workspace
2. adapter-only package helpers get absorbed into that shared package system or deleted

### The umbrella `packages/` tree is already the package ecosystem home

Evidence:

- `packages/README.md`
- `packages/docs/PACKAGE_SYSTEM.md`
- `packages/docs/PACKAGE_STANDALONE_REPO_MODEL.md`
- `packages/docs/PACKAGE_PUBLISH_AND_SKILL_CUTOVER.md`
- `packages/scripts/publish-package.sh`

The umbrella `packages/` tree already declares:

1. package families live under `packages/apps/` and `packages/adapters/`
2. shared support workspaces under `packages/` are allowed and exempt from standalone package-repo rules
3. `nex package init|validate|release|smoke` is the canonical package-author flow

This means the package ecosystem already has the right structural home for shared package tooling.

### The mobile apps are real client apps, not adapter packages

Evidence:

- `nex/apps/ios/README.md`
- `nex/apps/android/README.md`
- `nex/apps/shared/NexusKit/Package.swift`
- `nex/apps/ios/project.yml`
- `nex/apps/android/app/build.gradle.kts`
- `nex/scripts/protocol-gen-swift.ts`
- `nex/package.json`

What the current mobile code actually is:

1. `apps/ios` is an iOS client app
2. `apps/android` is an Android client app
3. `apps/shared/NexusKit` is a shared Swift client/runtime transport and UI library
4. Android currently consumes resources out of `apps/shared/NexusKit`
5. iOS currently links `NexusKit` as a local package dependency
6. generated Swift runtime protocol models are written into `NexusKit`

These are not Nex app packages in the `packages/apps/.../app.nexus.json` sense.
They are product/client applications.

### The mobile apps do not belong under `packages/apps/`

The package-system canon under `packages/` is for Nex package repos with manifests, attached skills, release packaging, and hosted installation semantics.

Examples:

- `packages/apps/aix/app/app.nexus.json`
- `packages/apps/spike/app/app.nexus.json`
- `packages/apps/glowbot/app/app.nexus.json`

The mobile apps do not match that contract:

1. no `app.nexus.json`
2. no package-attached `SKILL.md`
3. no Frontdoor install lifecycle
4. no hosted app-package release contract

So they should not be forced into `packages/apps/` just because they are called “apps.”

## Decisions

### 1. `package-kit/` should not move into Frontdoor

Reason:

1. Frontdoor is the hosted publication/install plane
2. `package-kit/` is package authoring and package lifecycle infrastructure
3. putting authoring infrastructure inside Frontdoor would invert the ownership model

### 2. `package-kit/` should not move into the adapter SDK workspace

Reason:

1. `package-kit/` serves apps and adapters
2. adapter SDKs are only one package family
3. the adapter SDK workspace already proves the narrower scope with its adapter-only helper

### 3. `package-kit/` should move into the umbrella `packages/` support area

Target:

- `packages/package-kit/`

Reason:

1. it is shared package-system tooling
2. it sits next to `packages/docs/` and `packages/scripts/`
3. it serves the package ecosystem, not the runtime core
4. shared support workspaces under `packages/` are already explicitly allowed by canon

### 4. The canonical command surface remains `nex package ...`

This is important.

The target-state move is about implementation ownership, not command renaming.

We should keep:

- `nex package init`
- `nex package validate`
- `nex package release`
- `nex package smoke`

But the implementation and templates should no longer live inside runtime core.

### 5. Mobile apps should extract as one client monorepo, not as separate adapter repos

Target form:

- one standalone repo mounted under a new umbrella client area

Recommended target path:

- `clients/nexus-mobile/`

With internal layout:

```text
clients/nexus-mobile/
  ios/
  android/
  shared/
    NexusKit/
```

Reason:

1. iOS and Android both depend on shared client/runtime code
2. `NexusKit` currently couples directly to iOS and indirectly to Android assets/resources
3. `protocol-gen-swift.ts` currently writes generated Swift models directly into `NexusKit`
4. splitting these into separate repos immediately would create unnecessary coordination churn

### 6. `NexusKit` should move with the mobile repo in the first extraction wave

It should **not** be split out first.

Reason:

1. it is tightly coupled to current iOS ownership
2. Android already depends on its resources
3. generated protocol output already targets it directly

A separate shared-client library repo can be considered later if there is a second real consumer beyond the mobile client family.

## Target-State Layout

### Package System

```text
packages/
  package-kit/
  apps/
  adapters/
  docs/
  scripts/
```

`packages/package-kit/` owns:

1. templates
2. package-shape validation helpers
3. package archive assembly helpers
4. hosted smoke helpers
5. shared package authoring docs for the tool itself

`nex` keeps only the CLI command surface that calls into that shared workspace.

### Mobile Client Surface

```text
clients/
  nexus-mobile/
    ios/
    android/
    shared/
      NexusKit/
```

The `clients/` top-level family is the right home because these are client applications, not Nex package repos.

## Extraction Form By Surface

### `package-kit/`

Extraction form:

1. shared support workspace
2. not a package repo
3. not part of runtime core
4. owned by the umbrella package system

### `apps/ios`

Extraction form:

1. move into `clients/nexus-mobile/ios`
2. keep as part of one mobile repo
3. keep its Xcode project generation and fastlane config with the client repo

### `apps/android`

Extraction form:

1. move into `clients/nexus-mobile/android`
2. keep as part of one mobile repo
3. preserve access to shared `NexusKit` resources through the new relative layout

### `apps/shared/NexusKit`

Extraction form:

1. move into `clients/nexus-mobile/shared/NexusKit`
2. remain colocated with iOS and Android in the first wave
3. continue to receive generated Swift protocol models there until a later client-SDK split is justified

## Required Follow-On Changes

### For `package-kit/` extraction

1. `nex/src/cli/package-cli/*` must stop resolving templates from `nex/package-kit`
2. package CLI implementation should import or delegate to `packages/package-kit`
3. package-system docs under `packages/docs/` should become the primary docs for package-kit ownership
4. adapter-only `adapter-package-kit/` should be reviewed for absorption or deletion

### For mobile extraction

1. `nex/package.json` must lose `ios:*` and `android:*` scripts
2. `nex/scripts/protocol-gen-swift.ts` must target the new mobile repo path or publish generated artifacts in a cleaner handoff
3. docs in `nex` must stop presenting mobile clients as runtime-core ownership
4. CI and local developer instructions must move with the mobile repo

## Execution Order

### Phase 1: `package-kit` extraction

1. create `packages/package-kit/`
2. move templates and shared package lifecycle implementation there
3. rewire `nex package ...` implementation to call the new shared workspace
4. update package docs to point at the new ownership
5. review and collapse adapter-only package-kit duplication

### Phase 2: mobile extraction planning hard cut

1. create `clients/nexus-mobile/` as a standalone repo target
2. map all `nex` references to `apps/ios`, `apps/android`, and `apps/shared/NexusKit`
3. decide whether generated Swift protocol output remains direct-write or becomes published artifact input

### Phase 3: mobile extraction execution

1. move `ios/`, `android/`, and `shared/NexusKit/`
2. remove root mobile scripts from `nex/package.json`
3. clean remaining `nex` docs and CI references
4. validate mobile builds from the new repo boundary

## Done Definition

This extraction program is done when:

1. `package-kit` no longer lives inside `nex`
2. `nex package ...` still works with the same canonical names
3. mobile apps no longer live inside `nex`
4. mobile apps are not mislabeled as adapter packages
5. runtime core ownership is cleaner and easier to port or replace later
