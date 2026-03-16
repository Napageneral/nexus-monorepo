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
