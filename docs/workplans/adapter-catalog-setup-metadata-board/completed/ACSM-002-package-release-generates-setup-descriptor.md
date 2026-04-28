# ACSM-002 Package Release Generates Setup Descriptor

## Goal

Update adapter package release tooling so every adapter release includes a
sanitized setup descriptor generated from the adapter runtime declaration.

## Why

`adapter.nexus.json` is install metadata. It does not carry setup questions or
method options, and hand-maintaining that data there would create drift.

## Scope

- extend adapter package kit release flow
- generate a catalog setup descriptor from `adapter.info` or SDK metadata
- package the descriptor alongside the install manifest
- fail release when required setup metadata cannot be extracted
- add package-release tests for generated descriptor artifacts

## Acceptance

- package release output contains a setup descriptor for adapters with auth
  declarations
- package release output omits secret values
- release fails with a clear error when setup metadata is missing unexpectedly
- tests prove descriptor generation for Go and TypeScript adapters
- release tooling keeps `adapter.nexus.json` focused on install metadata

## Completion Notes

- Canonical `nexus package release` now generates
  `dist/<adapter>-<version>.adapter.catalog.json` from `adapter.info`.
- Adapter release archives include `adapter.catalog.json` at package root.
- Release fails when adapter auth metadata is missing unless the explicit
  setup-free escape hatch is set.
- Added package release tests for descriptor generation and archive contents.
