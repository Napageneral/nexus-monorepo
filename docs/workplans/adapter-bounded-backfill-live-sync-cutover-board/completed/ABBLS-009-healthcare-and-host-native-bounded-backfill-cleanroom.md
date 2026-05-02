---
summary: "Cleanroom or host-native-equivalent proof for Eve, Zenoti, and Patient Now bounded backfill behavior."
title: "ABBLS-009 Healthcare And Host-Native Bounded Backfill Cleanroom"
---

# ABBLS-009 Healthcare And Host-Native Bounded Backfill Cleanroom

## Status

Completed 2026-05-02.

## Scope

Prove bounded backfill behavior for:

- Eve
- Zenoti EMR
- Patient Now EMR

## Acceptance Criteria

1. Eve bounds message, reaction, membership, and update warehouse queries.
2. Zenoti uses `to` as the staged/projection upper bound rather than defaulting
   to current time.
3. Patient Now passes or filters by the upper bound for metric records.
4. Host-native exceptions are explicitly documented where Docker cleanroom
   cannot truthfully access required local provider substrate.
5. Cleanroom or host-native-equivalent bundles retain record counts and sample
   ids.

## Evidence To Capture

- proof bundle path
- host-native exception rationale if used
- bounded windows
- staged manifest path for Zenoti
- emitted record ids and excluded-record assertions

## Captured So Far

- Docker package matrix for Eve package, Zenoti EMR, and Patient Now EMR:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z`
- Eve local watcher host-native proof:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-eve-host-native-livewatch/20260502T214436Z`

## Host-Native Exception

Eve `internal/livewatch` validates local WAL and SHM filesystem watcher
behavior. It timed out in the Docker package matrix, while the focused
host-native watcher proof passed. Keep package-level Eve tests in the Docker
matrix and retain the watcher proof as host-native evidence.

## Notes

- Docker package proof covers Eve adapter/config/ETL/migration paths, Zenoti
  EMR, and Patient Now EMR.
- Host-native watcher proof covers Eve WAL and SHM change detection.
