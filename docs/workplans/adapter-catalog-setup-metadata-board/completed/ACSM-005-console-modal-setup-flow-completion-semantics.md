# ACSM-005 Console Modal Setup Flow Completion Semantics

## Goal

Finish the Operator Console Add App flow so catalog selection stays inside the
modal and durable rows appear only after setup succeeds.

## Why

Selecting an app should not create a connection row. The Console needs to match
the reference Add App design while supporting single-method and multi-method
adapter setup.

## Scope

- render Published catalog, Installed locally, and Workspace adapters sections
- render method picker only when an adapter exposes multiple setup methods
- skip directly to configuration when an adapter exposes one setup method
- submit OAuth, API key, file upload, and custom setup through runtime
  operations
- always allow another setup attempt for adapters with existing connections
- show setup failures inside the modal without creating durable rows

## Acceptance

- selecting Slack or Google does not add a connection row by itself
- multi-method adapters show method cards first
- single-method adapters skip method cards
- setup success refreshes durable connection rows
- setup failure keeps the modal open with actionable error details
- browser proof covers add-another-account behavior for an adapter with
  existing connections

## Completion Notes

- Console catalog selection no longer preselects the first method for
  multi-method adapters.
- Multi-method adapters render method cards before setup questions.
- Single-method adapters still skip straight to the configure screen.
- File-upload methods render local file path setup fields and submit through
  `adapters.connections.upload`.
- Existing durable connections no longer block another setup attempt.
- Live browser proof is deferred to ACSM-008 because it depends on deployed
  Frontdoor catalog publication.
