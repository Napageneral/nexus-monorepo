---
summary: "Cleanroom proof for Twilio, CallRail, and Apple Maps bounded backfill behavior."
title: "ABBLS-008 Voice Local And Manual Adapter Bounded Backfill Cleanroom"
---

# ABBLS-008 Voice Local And Manual Adapter Bounded Backfill Cleanroom

## Status

Completed 2026-05-02.

## Scope

Prove bounded backfill behavior for:

- Twilio
- CallRail
- Apple Maps

## Acceptance Criteria

1. Twilio uses the provided upper bound as the API `EndTime<=` value.
2. CallRail uses the provided upper bound as `end_date` and filters call
   records after `to`.
3. Apple Maps manual metrics after `to` are excluded.
4. Package-local tests pass in cleanroom.
5. Evidence records the exact bounded windows used.

## Evidence To Capture

- cleanroom bundle path
- redacted credential source or fixture mode
- bounded windows
- query parameters or fixture assertions
- emitted record ids and excluded-record assertions

## Evidence

- Docker package matrix:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z`
- Passed lanes:
  - `twilio`
  - `callrail`
  - `apple-maps`

## Notes

- Package tests cover Twilio `EndTime<=`, CallRail `end_date` plus returned
  call filtering, and Apple Maps manual metric suppression after `to`.
