# Nexus (iOS)

This is an **alpha** iOS app that connects to an Nexus Runtime as a `role: node`.

Expect rough edges:

- UI and onboarding are changing quickly.
- Background behavior is not stable yet (foreground app is the supported mode right now).
- Permissions are opt-in and the app should be treated as sensitive while we harden it.

## What It Does

- Connects to a Runtime over `ws://` / `wss://`
- Pairs a new device (approved from your bot)
- Exposes phone services as node commands (camera, location, photos, calendar, reminders, etc; gated by iOS permissions)
- Provides Talk + Chat surfaces (alpha)

## Pairing (Recommended Flow)

If your Runtime has the `device-pair` plugin installed:

1. In Telegram, message your bot: `/pair`
2. Copy the **setup code** message
3. On iOS: Nexus → Settings → Runtime → paste setup code → Connect
4. Back in Telegram: `/pair approve`

## Build And Run

Prereqs:

- Xcode (current stable)
- `pnpm`
- `xcodegen`

From `clients/nexus-mobile`:

```bash
pnpm install
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile
pnpm ios:open
```

Then in Xcode:

1. Select the `Nexus` scheme
2. Select a simulator or a connected device
3. Run

If you're using a personal Apple Development team, you may need to change the bundle identifier in Xcode to a unique value so signing succeeds.

## Build From CLI

```bash
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile
pnpm ios:build
```

## Tests

```bash
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/app
xcodegen generate
xcodebuild test -project Nexus.xcodeproj -scheme Nexus -destination "platform=iOS Simulator,name=iPhone 17"
```

## Shared Code

- `/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit` contains the shared transport/types used by the iOS app.
