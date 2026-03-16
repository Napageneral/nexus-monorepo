# Mobile Client Extraction Execution

**Status:** ACTIVE
**Last Updated:** 2026-03-15

## Customer Experience

The product and repo story should be obvious:

1. the Nex runtime repo owns runtime core
2. mobile client engineers work in a client repo, not in runtime core
3. iOS and Android stay together with their shared client/runtime library
4. the mobile device adapters are colocated with their matching platform apps
5. device adapters remain adapter packages and are not confused with the mobile apps

The hard cut is:

1. `nex` stops owning the mobile client source tree
2. mobile client code moves into one standalone client repo
3. `NexusKit` moves with the mobile repo in the first wave
4. `device-ios` and `device-android` move with the mobile repo in the first wave
5. `nex` keeps runtime protocol generation, but the output target is rewired cleanly

## Purpose

This document defines the execution plan for extracting the current mobile client surfaces out of `nex`.

In scope:

1. `nex/apps/ios`
2. `nex/apps/android`
3. `nex/apps/shared/NexusKit`
4. `packages/adapters/device-ios`
5. `packages/adapters/device-android`

Target repo form:

- `clients/nexus-mobile/`

This is an execution spec only. It does not perform the move.

## Research Summary

### Current ownership model

The current mobile code lives under:

1. `/Users/tyler/nexus/home/projects/nexus/nex/apps/ios`
2. `/Users/tyler/nexus/home/projects/nexus/nex/apps/android`
3. `/Users/tyler/nexus/home/projects/nexus/nex/apps/shared/NexusKit`

These are real client applications and shared client/runtime code.
They are not adapter packages and they do not match the `packages/apps/...` package contract.

### Exact runtime-repo coupling points

#### Root package scripts in `nex/package.json`

`nex` currently owns these mobile commands directly:

1. `android:assemble`
2. `android:install`
3. `android:run`
4. `android:test`
5. `ios:build`
6. `ios:gen`
7. `ios:open`
8. `ios:run`
9. `protocol:check`
10. `protocol:gen:swift`

Important coupling:

- `protocol:check` asserts on `apps/shared/NexusKit/Sources/NexusProtocol/RuntimeModels.swift`

#### Swift protocol generation

`nex/scripts/protocol-gen-swift.ts` writes generated runtime models directly to:

- `apps/shared/NexusKit/Sources/NexusProtocol/RuntimeModels.swift`

That is the most important cross-repo handoff to rewire.

#### iOS -> NexusKit coupling

iOS currently depends on a local Swift package path:

- `apps/ios/project.yml`
- `packages.NexusKit.path: ../shared/NexusKit`

It also consumes:

1. `NexusKit`
2. `NexusChatUI`
3. `NexusProtocol`

The iOS app also carries mobile-release tooling locally:

1. `fastlane/`
2. `project.yml`
3. `SwiftSources.input.xcfilelist`
4. tests under `apps/ios/Tests/`

#### Android -> NexusKit coupling

Android currently depends on `NexusKit` resources by relative path:

- `apps/android/app/build.gradle.kts`
- `assets.srcDir(file("../../shared/NexusKit/Sources/NexusKit/Resources"))`

This means Android is not independent from the shared Swift/client repo root today.

#### Shared library coupling inside `NexusKit`

`NexusKit` currently contains three shared Swift products:

1. `NexusProtocol`
2. `NexusKit`
3. `NexusChatUI`

File:

- `/Users/tyler/nexus/home/projects/nexus/nex/apps/shared/NexusKit/Package.swift`

The library also carries processed resources and generated protocol code.

#### Resource coupling

Concrete shared-resource usage exists in both clients:

1. iOS uses `NexusKitResources.bundle`
2. Android loads `tool-display.json` from assets sourced from `NexusKit/Resources`

Representative files:

- `apps/ios/Sources/Screen/ScreenController.swift`
- `apps/android/app/src/main/java/ai/nexus/android/tools/ToolDisplay.kt`
- `apps/shared/NexusKit/Sources/NexusKit/NexusKitResources.swift`
- `apps/shared/NexusKit/Sources/NexusKit/ToolDisplay.swift`

### Adapter-package coupling

The mobile device adapters are part of the same platform story as the client apps.

Evidence:

1. `packages/adapters/device-ios/cmd/device-ios-adapter/main.go`
   - setup requires companion install + pairing
   - served endpoint is `iOS Companion`
   - capability and command set overlaps the iOS app
2. `packages/adapters/device-android/cmd/device-android-adapter/main.go`
   - setup requires companion install + permissions + pairing
   - served endpoint is `Android Companion`
   - capability and command set overlaps the Android app

This means the extraction should colocate each platform app with its matching device adapter.

### Current repo-level CI/workflow reality

There is no active umbrella GitHub workflow coverage for these mobile surfaces.

Research result:

- no `.github` workflow matches for `apps/ios`, `apps/android`, `NexusKit`, `xcodegen`, `gradlew`, or `protocol:gen:swift`

That means the first extraction wave does not need to preserve existing umbrella CI behavior, because there effectively is none to migrate.

### Current umbrella structure

Current umbrella top level:

- `api/`
- `archive/`
- `artifacts/`
- `docs/`
- `frontdoor/`
- `nex/`
- `packages/`

There is currently no `clients/` family.

So the extraction must create:

- `clients/`
- `clients/nexus-mobile/`

### Non-source build artifacts currently present

These exist in the current mobile tree and should **not** be treated as source to migrate:

1. `apps/android/.gradle/`
2. `apps/android/build/`
3. `apps/shared/NexusKit/.build/`

These should be dropped during extraction, not preserved as repo content.

## Hard Decisions

### 1. Mobile moves as one standalone client repo

Target:

- `clients/nexus-mobile/`

Reason:

1. iOS and Android both depend on `NexusKit`
2. Android depends on `NexusKit` resources by relative path
3. generated Swift protocol models land in `NexusKit`
4. splitting into multiple repos first would create immediate coordination friction

### 2. `NexusKit` moves with the mobile repo in wave 1

Target:

- `clients/nexus-mobile/NexusKit`

Reason:

1. iOS depends on it directly as a local package
2. Android depends on its resources indirectly
3. `protocol-gen-swift.ts` currently writes into it directly

### 3. The mobile device adapters move with the mobile repo in wave 1

Targets:

1. `clients/nexus-mobile/ios/adapter`
2. `clients/nexus-mobile/android/adapter`

Reason:

1. pairing and companion behavior evolve with the client apps
2. the served command surfaces overlap directly
3. the platform story is clearer when each app sits beside its adapter

### 4. Mobile does not move into `packages/apps/`

Reason:

1. mobile has no `app.nexus.json`
2. mobile has no package-attached `SKILL.md`
3. mobile is not installed through Frontdoor package lifecycle
4. mobile is a client surface, not a hosted Nex package

### 5. Mobile does not become device adapters

Reason:

1. `device-ios`, `device-android`, and similar surfaces are adapter packages
2. iOS and Android apps are product/client applications
3. collapsing them into adapters would destroy a real product boundary

### 6. The first wave should adopt an explicit platform-family layout

Target layout:

```text
clients/nexus-mobile/
  NexusKit/
  ios/
    app/
    adapter/
  android/
    app/
    adapter/
```

Reason:

1. each platform owns its app and adapter side by side
2. `NexusKit` stays visibly shared instead of pretending to belong to one app
3. the extra path rewrites are acceptable and bounded

## Exact Extraction Targets

### iOS

Move:

- `nex/apps/ios` -> `clients/nexus-mobile/ios/app`

Includes:

1. app sources
2. tests
3. fastlane
4. project generation
5. local README and build instructions

### Android

Move:

- `nex/apps/android` -> `clients/nexus-mobile/android/app`

Includes:

1. app module
2. Gradle wrapper and build files
3. tests
4. local README and build instructions

Do not carry:

1. `.gradle/`
2. `build/`

### NexusKit

Move:

- `nex/apps/shared/NexusKit` -> `clients/nexus-mobile/NexusKit`

Includes:

1. `Package.swift`
2. `Package.resolved`
3. `Sources/`
4. `Tests/`
5. any real checked-in resources

Do not carry:

1. `.build/`

### Device adapters

Move:

1. `packages/adapters/device-ios` -> `clients/nexus-mobile/ios/adapter`
2. `packages/adapters/device-android` -> `clients/nexus-mobile/android/adapter`

## Required Rewires

### Phase 1 rewire: local paths inside mobile repo

#### iOS project path

Rewrite:

- `../../NexusKit`

This is a small bounded rewrite from the current layout.

#### Android resource path

Rewrite only the repo-root context, not the relative relationship.

Current:

- `../../shared/NexusKit/Sources/NexusKit/Resources`

After extraction under the proposed layout, this can remain the same relative path from `android/app/`.

After the new layout, rewrite to:

- `../../../NexusKit/Sources/NexusKit/Resources`

This is a small bounded rewrite and keeps Android on local repo resources.

### Phase 2 rewire: `nex` root tooling

Remove from `nex/package.json`:

1. `android:*`
2. `ios:*`

Rework:

1. `protocol:check`
2. `protocol:gen:swift`

These commands should no longer assume the mobile tree lives inside `nex`.

### Phase 3 rewire: Swift protocol generation handoff

Current behavior:

- `nex/scripts/protocol-gen-swift.ts` writes directly into `nex/apps/shared/NexusKit/...`

Target behavior for first extraction wave:

1. keep generation in `nex`
2. rewrite the output path to target `clients/nexus-mobile/NexusKit/Sources/NexusProtocol/RuntimeModels.swift`

This preserves current ownership of the runtime protocol contract while allowing client code to live outside `nex`.

A later improvement can publish generated client artifacts more formally, but that is out of scope for this extraction wave.

## Documentation Cut

Docs that must move or be rewritten as part of extraction:

1. `nex/apps/ios/README.md`
2. `nex/apps/android/README.md`
3. any `nex/docs` references that present mobile as in-repo runtime-core ownership
4. the umbrella extraction docs under `docs/workplans/`

## Validation Model

### Source-boundary validation

After extraction:

1. `nex` should no longer contain `apps/ios`
2. `nex` should no longer contain `apps/android`
3. `nex` should no longer contain `apps/shared/NexusKit`
4. `packages/adapters` should no longer contain `device-ios`
5. `packages/adapters` should no longer contain `device-android`
4. `clients/nexus-mobile/` should contain those moved sources

### Build validation

From the new mobile repo root:

1. iOS project generation succeeds
2. iOS build succeeds
3. Android debug build succeeds
4. Android unit tests succeed

### Runtime protocol validation

After rewire:

1. `nex/scripts/protocol-gen-swift.ts` still generates `RuntimeModels.swift`
2. the generated file lands in the new `clients/nexus-mobile/shared/NexusKit/...` location
3. `nex` no longer hardcodes the old in-repo mobile path

## Execution Order

### Phase 1: prepare target repo boundary

1. create `clients/`
2. create `clients/nexus-mobile/`
3. decide standalone git boundary for `clients/nexus-mobile`

### Phase 2: move source trees

1. move `apps/ios`
2. move `apps/android`
3. move `apps/shared/NexusKit`
4. do not move `.gradle`, `build`, or `.build`

### Phase 3: rewire local tooling

1. update iOS local package path if needed
2. update Android resource path if needed
3. update local README/build instructions

### Phase 4: rewire Nex ownership

1. remove root mobile scripts from `nex/package.json`
2. update `protocol:check`
3. update `protocol-gen-swift.ts`
4. remove stale docs references in `nex`

### Phase 5: validate from the new boundary

1. iOS build
2. Android build
3. Android tests
4. Swift protocol generation handoff

## Done Definition

This extraction is done when:

1. mobile source no longer lives in `nex`
2. `clients/nexus-mobile/` exists as the new mobile home
3. `NexusKit` moved with the mobile repo
4. `nex` no longer exposes root mobile commands
5. protocol generation still feeds the mobile client cleanly
6. mobile is no longer conflated with package apps or device adapters
