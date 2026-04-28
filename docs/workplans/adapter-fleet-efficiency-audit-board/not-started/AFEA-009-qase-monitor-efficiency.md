# AFEA-009 Qase Monitor Efficiency

## Goal

Make Qase monitor polling incremental and duplicate-safe.

## Current Gap

The Qase monitor lists all cases, runs, and defects for each project every poll.
Its overlap handling can re-emit unchanged rows because it lacks per-entity
revision suppression.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/qase/internal/monitor/monitor.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/qase/internal/monitor/watermark.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/qase/cmd/qase-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/qase/TESTING.md`

## Scope

- persist project/family monitor state
- add per-entity revision fingerprints for overlap suppression
- reduce full project-family scans in no-change cycles
- make health a cheap auth probe rather than full project enumeration
- update testing docs with two-cycle no-duplicate proof

## Acceptance

1. no-change monitor cycles emit zero duplicates
2. overlap windows are safe and bounded
3. health is O(1) enough for UI/runtime polling
4. validation docs include request counts and restart behavior

