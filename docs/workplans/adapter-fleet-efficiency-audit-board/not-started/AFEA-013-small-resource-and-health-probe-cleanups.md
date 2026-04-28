# AFEA-013 Small Resource And Health Probe Cleanups

## Goal

Close small resource-safety and health-probe issues found during the fleet
audit.

## Current Gap

Several adapters are not large live-sync risks but still have avoidable
resource or proof gaps.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/device-headless/cmd/device-headless-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/apple-maps/cmd/apple-maps-adapter/main.go`

## Scope

- enforce stdout/stderr byte caps in `device-headless system.run`
- make `apple-maps` backfill honor `since`
- add repeat-backfill idempotency proof for Apple Maps
- collect these into one low-risk cleanup batch unless any item blocks another
  board

## Acceptance

1. command output cannot grow memory/result payloads without bound
2. Apple Maps repeat backfill can prove incremental or idempotent behavior
3. tests and docs are updated for each cleanup
