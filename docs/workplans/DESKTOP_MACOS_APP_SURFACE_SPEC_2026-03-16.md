---
summary: "Target surface spec for the new native macOS client under clients/nexus-desktop."
title: "Desktop macOS App Surface Spec"
---

# Desktop macOS App Surface Spec

## Customer Experience

The customer should experience the macOS desktop surface as a real native companion app, not as a hidden wrapper around `nex`.

That means:

1. install a native macOS app
2. connect it to a Nex runtime
3. complete pairing and permission grants in desktop-native UX
4. see clear local status for:
   - runtime connection
   - pairing state
   - required macOS permissions
   - exposed companion capabilities
5. use desktop-native interaction surfaces where they make sense:
   - chat
   - canvas
   - notifications
   - screen and camera capabilities

The desktop app is a product surface.
It is not the runtime daemon.
It is not the generic `nex` CLI.

## Research Summary

### 1. The adapter already defines the companion contract

The colocated macOS companion adapter currently declares:

- `canvas.present`
- `canvas.hide`
- `canvas.navigate`
- `canvas.eval`
- `canvas.snapshot`
- `canvas.a2ui.push`
- `canvas.a2ui.pushJSONL`
- `canvas.a2ui.reset`
- `camera.list`
- `camera.snap`
- `camera.clip`
- `location.get`
- `screen.record`
- `system.notify`
- `system.which`
- `system.run`

Source:

- [/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter/cmd/device-macos-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter/cmd/device-macos-adapter/main.go)

The adapter still models:

1. a native companion app install
2. explicit permission grant confirmation
3. explicit pairing approval

So the product model is already clear: the desktop app is the human-facing companion surface for that adapter.

### 2. The old macOS app source is gone

There is no live `apps/macos` tree left to restore.
This is a greenfield app build inside the new desktop home.

### 3. Core runtime bootstrap remains in `nex`

The surviving `nex/src/macos/*` files are runtime bootstrap helpers, not the desktop app:

- [/Users/tyler/nexus/home/projects/nexus/nex/src/macos/runtime-daemon.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/macos/runtime-daemon.ts)
- [/Users/tyler/nexus/home/projects/nexus/nex/src/macos/relay.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/macos/relay.ts)

These stay in `nex`.

### 4. The Swift shared foundation already supports macOS

`NexusKit` already declares:

- `.iOS(.v18)`
- `.macOS(.v15)`

And the shared UI layer already contains `#if os(macOS)` branches.

Sources:

- [/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Package.swift](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Package.swift)
- [/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Sources/NexusChatUI/ChatView.swift](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Sources/NexusChatUI/ChatView.swift)
- [/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Sources/NexusChatUI/ChatComposer.swift](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Sources/NexusChatUI/ChatComposer.swift)
- [/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Sources/NexusChatUI/ChatTheme.swift](/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit/Sources/NexusChatUI/ChatTheme.swift)

That means the first desktop slice should reuse `NexusKit`.
It should not invent a second Swift transport/protocol/chat stack.

## Canonical Decision

The initial macOS app should be:

1. a native SwiftUI macOS app
2. located at `clients/nexus-desktop/macos/app`
3. built on the shared `NexusKit` / `NexusProtocol` / `NexusChatUI` foundation
4. connected to the colocated `device-macos` adapter as the companion surface

The app should call into retained `nex` runtime/CLI surfaces where needed.
It should not absorb `nex/src/macos/runtime-daemon.ts` or `nex/src/macos/relay.ts`.

## Target Layout

```text
clients/nexus-desktop/
  macos/
    app/
      README.md
      project.yml
      Sources/
      Tests/
    adapter/
```

## Phase 1 App Surface

Phase 1 should deliver the minimum honest desktop companion experience.

### In Scope

1. runtime endpoint configuration
   - local/manual runtime target
   - discovery if reused from shared stack

2. pairing UX
   - setup code entry
   - pairing approval state
   - companion-installed / permission-granted / paired status presentation

3. permissions dashboard
   - camera
   - screen recording
   - location
   - notifications
   - any additional macOS permission gates needed by the adapter contract

4. runtime connection status
   - connected/disconnected
   - last error
   - endpoint identity
   - advertised capabilities

5. chat and canvas shell
   - use shared `NexusChatUI`
   - use shared canvas/protocol surfaces where possible

6. local notification surface for `system.notify`

### Out Of Scope For Phase 1

1. full implementation of every declared adapter command
2. production-grade `system.run` / `system.which` execution UX
3. background daemon supervision owned by the app
4. packaging/notarization/distribution polish
5. moving runtime bootstrap wrappers out of `nex`

## Capability Mapping

### App should own directly in Phase 1

1. pairing UX
2. permission UX
3. runtime connection UX
4. chat
5. canvas presentation shell
6. notification handling

### Adapter contract may remain stubbed initially

These can remain adapter-declared but app-backed incrementally:

1. `camera.list`
2. `camera.snap`
3. `camera.clip`
4. `location.get`
5. `screen.record`
6. `system.which`
7. `system.run`

The rule is honesty:
the app should not pretend these are fully implemented until they are.

## Shared Swift Strategy

### Keep For Now

Reuse:

- `/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit`

Reason:

1. it already supports macOS
2. it already contains shared protocol and chat/canvas primitives
3. duplicating it now would create immediate drift

### Future Extraction Option

If desktop and mobile both keep growing, the later clean move is:

1. extract `NexusKit` into a neutral Apple-client shared home
2. have both `clients/nexus-mobile` and `clients/nexus-desktop` consume it

But that is a later cleanup, not a blocker for the first desktop app slice.

## Relationship To Nex Runtime Bootstrap

### Keep In `nex`

1. `nex/src/macos/runtime-daemon.ts`
2. `nex/src/macos/relay.ts`

Reason:

These are runtime bootstrap helpers for the Nex runtime and CLI.

### Do Not Rehome Yet

1. `nex/src/macos/relay-smoke.ts`

It is only leftover no-op back-compat behavior and can be deleted or inlined later.

## First Implementation Slice

The first implementation slice for `clients/nexus-desktop/macos/app` should do exactly this:

1. create the native Swift app project
2. add local package dependency on `../../nexus-mobile/NexusKit`
3. build a desktop settings/runtime connection surface
4. build a pairing flow shell
5. show permission and endpoint state
6. render chat/canvas shells using shared primitives

That produces a real desktop app without overcommitting to full device command execution on day one.

## Validation

The first real app implementation should prove:

1. the macOS app builds locally
2. it resolves `NexusKit` successfully
3. it can connect to a runtime target
4. it can display pairing and permission state honestly
5. it does not claim unsupported device actions are implemented
