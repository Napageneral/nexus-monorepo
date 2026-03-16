# Nexus macOS App

This directory is the new home for the native macOS client surface.

## Boundary

- This is a desktop client app boundary, not the Nex runtime itself.
- The legacy macOS app that used to live inside `nex` has already been removed.
- No app source has been restored here yet.

## Relationship To The Adapter

The matching companion adapter lives in:

- `/Users/tyler/nexus/home/projects/nexus/clients/nexus-desktop/macos/adapter`

App and adapter belong in the same desktop monorepo because they are two sides of the same macOS platform story, but they remain separate products.

## Initial Direction

The desktop app should be a native macOS client that:

1. connects to the Nex runtime
2. owns desktop pairing and permissions UX
3. hosts desktop-native chat and canvas surfaces
4. exposes companion-host capabilities through the colocated adapter

The current shared Swift foundation already exists in:

- `/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/NexusKit`

That package already supports `macOS`, so the first desktop app slice should reuse it rather than invent a second Swift foundation.

Detailed planning lives in:

- [/Users/tyler/nexus/home/projects/nexus/docs/workplans/DESKTOP_MACOS_APP_SURFACE_SPEC_2026-03-16.md](/Users/tyler/nexus/home/projects/nexus/docs/workplans/DESKTOP_MACOS_APP_SURFACE_SPEC_2026-03-16.md)
