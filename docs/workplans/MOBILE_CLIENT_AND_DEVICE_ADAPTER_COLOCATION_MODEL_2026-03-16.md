# Mobile Client And Device Adapter Colocation Model

**Status:** ACTIVE
**Last Updated:** 2026-03-16

## Customer Experience

The filesystem should make the platform story obvious:

1. native mobile clients live with their platform-specific shared code
2. mobile device adapters live near the clients they pair with
3. clients and adapters stay separate products with separate release contracts
4. Nex runtime core does not own mobile app development

The user experience goal is:

1. one place for iOS + Android client engineering
2. one place for iOS + Android device-companion integration work
3. no confusion between user-facing apps and installable Nex adapter packages
4. no forcing mobile clients into the package-app model

## Purpose

This document decides whether the device adapters for iOS and Android should be colocated with the mobile clients during extraction from `nex`.

It does not implement the move.

## Research Summary

### Mobile clients are real client apps

Current client surfaces in `nex`:

1. `nex/apps/ios`
2. `nex/apps/android`
3. `nex/apps/shared/NexusKit`

They are native client apps with local UI, onboarding, permissions, and runtime sessions.

Evidence:

1. `nex/apps/ios/README.md`
   - pairs a device, exposes phone services, and provides Talk + Chat surfaces
2. `nex/apps/android/README.md`
   - runs as a foreground Android node app with UI, discovery, and runtime connection
3. `nex/apps/ios/project.yml`
   - application target depending on local `NexusKit`
4. `nex/apps/android/app/build.gradle.kts`
   - Android application consuming shared `NexusKit` resources
5. `nex/apps/shared/NexusKit/Package.swift`
   - shared client/runtime transport, protocol, and chat UI library

### Device adapters are real adapter packages

Current package surfaces under `packages/adapters`:

1. `packages/adapters/device-ios`
2. `packages/adapters/device-android`
3. `packages/adapters/device-macos`
4. `packages/adapters/device-headless`

These are package-shaped adapter products.

Evidence:

1. each has `adapter.nexus.json`
2. each has package release scripts
3. each has generated `api/openapi.yaml`
4. each is built as a standalone Go adapter binary

### The mobile clients and mobile device adapters are tightly related in domain

The pairing and command stories overlap directly.

Evidence from iOS:

1. `nex/apps/ios/README.md`
   - pairing flow uses setup code and approval
   - exposes camera, location, photos, calendar, reminders, chat/talk
2. `packages/adapters/device-ios/cmd/device-ios-adapter/main.go`
   - setup flow confirms companion installed and paired
   - serves endpoint `iOS Companion`
   - declares overlapping capabilities/commands: camera, location, photos, contacts, calendar, reminders, talk, canvas

Evidence from Android:

1. `nex/apps/android/README.md`
   - connects to runtime, exposes Canvas + Chat + Camera, approves pairing
2. `packages/adapters/device-android/cmd/device-android-adapter/main.go`
   - setup flow confirms companion installed, permissions granted, and paired
   - serves endpoint `Android Companion`
   - declares overlapping capabilities/commands: canvas, camera, location, screen, sms

Conclusion:

1. the iOS app and `device-ios` adapter are two sides of one platform story
2. the Android app and `device-android` adapter are two sides of one platform story
3. they should be developed close together

### They are still different products

Despite the domain overlap, the contracts are different.

Mobile clients:

1. no `adapter.nexus.json`
2. not installed through Frontdoor package lifecycle
3. own native UI, permissions, discovery, and local runtime session behavior

Device adapters:

1. have `adapter.nexus.json`
2. are installed/released as adapter packages
3. expose adapter setup/health/serve contract
4. publish OpenAPI and consumer SDK artifacts

Conclusion:

They should be colocated, but not merged.

### Not every device adapter belongs in the mobile repo

`device-macos` and `device-headless` do not match the same extraction target.

Evidence:

1. `device-macos` is a macOS companion adapter, not part of the iOS/Android mobile app family
2. `device-headless` is an automation/host adapter exposing system/browser commands, not a mobile companion

Conclusion:

1. `device-ios` and `device-android` fit the mobile client monorepo
2. `device-macos` and `device-headless` should stay outside it for now

## Decisions

### 1. Colocate mobile clients with the mobile device adapters

This is the right move.

Reason:

1. pairing, permissions, served command surface, and companion behavior evolve together
2. keeping them in separate repos would create unnecessary coordination overhead
3. runtime core should not own either side long term

### 2. Keep app and adapter boundaries explicit inside the monorepo

Do not collapse them into one surface.

Reason:

1. native clients and Nex adapters have different contracts
2. app release and adapter release are different pipelines
3. package manifests and native app metadata should not be mixed

### 3. The first extraction target should be a platform-family monorepo under `clients/`

Recommended target:

- `clients/nexus-mobile/`

Recommended internal layout:

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

### 4. Do not move `device-macos` or `device-headless` into `clients/nexus-mobile/`

Reason:

1. they are different platform families
2. mobile extraction should stay coherent and bounded
3. dragging them in would turn a clean mobile extraction into a broader device-platform reshuffle

## Implications

### What moves out of `nex`

1. `nex/apps/ios`
2. `nex/apps/android`
3. `nex/apps/shared/NexusKit`

### What should be copied or moved alongside from `packages/adapters`

1. `packages/adapters/device-ios`
2. `packages/adapters/device-android`

### What stays where it is for now

1. `packages/adapters/device-macos`
2. `packages/adapters/device-headless`
3. the rest of the adapter package ecosystem

### Boundary rule after extraction

Inside `clients/nexus-mobile/`:

1. `NexusKit/` is shared client/runtime code
2. `ios/app` and `android/app` are native client apps
3. `ios/adapter` and `android/adapter` are still package-shaped adapter products

That boundary must remain explicit in docs, build, and release flows.

## Recommendation

Proceed with the mobile extraction as a combined mobile-platform monorepo:

1. move the shared Swift/client layer into `clients/nexus-mobile/NexusKit`
2. move the iOS app into `clients/nexus-mobile/ios/app`
3. move the Android app into `clients/nexus-mobile/android/app`
4. colocate `device-ios` under `clients/nexus-mobile/ios/adapter`
5. colocate `device-android` under `clients/nexus-mobile/android/adapter`
3. leave `device-macos` and `device-headless` outside the mobile monorepo
4. keep the app and adapter contracts separate even though they share a repo
