# ACSM-001 Shared Setup Descriptor Contract

## Goal

Define one shared adapter setup descriptor contract that can be produced by
adapter packages, stored by Frontdoor, merged by the local runtime, and rendered
by the Operator Console.

## Why

The same setup metadata currently exists only inside live adapter source and
runtime `adapter.info` responses. Published catalog entries cannot drive setup
without a stable release-scoped descriptor.

## Scope

- reuse the existing adapter SDK auth method model
- define the release-scoped setup descriptor shape
- add schema validation in the shared runtime or package contract layer
- add fixtures for single-method and multi-method adapters
- document which fields are operator-facing and which are forbidden

## Acceptance

- setup descriptor schema exists in a shared location used by package publish,
  Frontdoor tests, and runtime catalog tests
- schema accepts current `oauth2`, `api_key`, `file_upload`, and `custom_flow`
  method types
- schema rejects descriptors containing credential values
- schema fixtures cover Slack, Google, Eve, and one custom-flow adapter
- no manual duplicate setup schema is introduced in Console-only code

## Completion Notes

- Added Frontdoor setup descriptor validation for `adapter-catalog-setup.v1`.
- Reused the adapter SDK auth method model instead of creating Console-local
  setup schemas.
- Package release and Frontdoor publish paths now reject unsupported setup
  method and field types before catalog publication.
