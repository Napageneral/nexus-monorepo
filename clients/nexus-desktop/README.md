# Nexus Desktop

Desktop client monorepo for Nex platform surfaces.

## Layout

```text
clients/nexus-desktop/
  macos/
    app/
    adapter/
```

## Current State

- `macos/adapter/` is the live home of the `device-macos` companion adapter package.
- `macos/app/` is the new target boundary for a future native macOS client.
- The old macOS app that previously lived inside `nex` was deleted during the earlier hard cut.

This repo boundary is the replacement home for desktop client work.
