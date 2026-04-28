# AFEA-004 Google Business Profile And Legacy Google Cleanup

## Goal

Bring Google Business Profile to the paid-adapter live-monitor standard and
remove legacy Google split-brain residue.

## Current Gap

`google-business-profile` uses process-local polling and replays accounts,
locations, performance, and reviews without durable family cursors or revision
suppression. Its health path also performs inventory-style account/location
enumeration. The legacy `google` package still emits records for Google
domains now owned by canonical packages.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-business-profile/cmd/google-business-profile-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/adapter.nexus.json`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/cmd/google-adapter/ads.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/cmd/google-adapter/places.go`

## Scope

- add durable family monitor state for accounts, locations, performance, and
  reviews
- add revision suppression before durable emission
- move inventory counts out of health into explicit methods
- make health a cheap credential/single-probe check
- quarantine, hide, or remove the legacy `google` install path after migration
  coverage is clear

## Acceptance

1. monitor restart resumes from persisted family state
2. unchanged reviews and performance rows do not create durable churn
3. health is safe for UI/runtime polling
4. canonical Google domains have one adapter owner in catalog and runtime docs

