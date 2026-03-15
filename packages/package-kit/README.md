# Package Kit

This directory owns shared package scaffolding and release behavior for Nex
packages.

The first concrete slice currently covers:

- `nex package init`
- `nex package validate`
- `nex package release`
- `nex package smoke`

Templates currently exist for:

- app + TypeScript
- adapter + TypeScript
- adapter + Go

The package-kit is intentionally separate from generated Nex and Frontdoor SDKs.
SDKs project canonical APIs. The package-kit handles authoring, packaging, and
shared hosted lifecycle entrypoints.

Its canonical workspace home is:

- `/Users/tyler/nexus/home/projects/nexus/packages/package-kit/`
