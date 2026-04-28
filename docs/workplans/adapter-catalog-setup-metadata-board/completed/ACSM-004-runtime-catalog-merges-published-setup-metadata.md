# ACSM-004 Runtime Catalog Merges Published Setup Metadata

## Goal

Make `adapters.catalog.list` preserve Frontdoor setup metadata for published
adapters while still preferring live registered adapter info when available.

## Why

The local runtime is the Console's canonical local surface. It must show setup
metadata for published adapters even before those adapters are installed.

## Scope

- update Frontdoor catalog evidence loading to parse setup descriptors
- merge published setup metadata into local adapter catalog entries
- keep live registered `adapter.info` as the highest-precedence source
- add drift diagnostics when live setup metadata disagrees with published
  metadata for the same release
- add runtime catalog tests for published-only, installed, and registered cases

## Acceptance

- published-only adapters include setup methods in `adapters.catalog.list`
- registered adapters use live setup metadata
- installed but stopped adapters preserve package descriptor metadata
- conflicting live and published descriptors produce diagnostics
- Console no longer needs local connection rows to discover setup options

## Completion Notes

- Runtime catalog loading parses setup metadata from Frontdoor `auth` and
  `setup_descriptor.auth`.
- Registered live `adapter.info` remains highest precedence for setup metadata.
- Published-only adapters preserve setup methods in `adapters.catalog.list`.
- Catalog entries now include diagnostics when registered and published
  versions or setup methods drift.
