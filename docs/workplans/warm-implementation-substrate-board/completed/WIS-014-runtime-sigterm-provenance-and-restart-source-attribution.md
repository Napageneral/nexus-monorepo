# WIS-014 Runtime SIGTERM Provenance And Restart-Source Attribution

## Goal

Make every runtime shutdown attributable so validation failures can be
distinguished from product defects.

## Scope

- trace the source of repeated runtime `SIGTERM` events across local dogfood
  sessions
- capture lifecycle provenance for restart paths triggered by CLI commands,
  supervisors, package activation, update flows, or external process managers
- persist enough restart metadata to tell whether a shutdown was operator
  initiated, self-initiated, supervisor initiated, or externally imposed
- surface the restart provenance in logs without requiring manual correlation
  across multiple files

## Acceptance

- every runtime shutdown writes a concrete provenance record or explicit
  `unknown_external_sigterm` classification
- operators can tell whether a validation-stage interruption came from user
  action, CLI restart, supervisor reconciliation, or another external source
- repeated `SIGTERM` events are no longer invisible lifecycle noise during
  dogfood runs

## Current Evidence

- live `SPEC-259` lineage `dagrun_08c25142-1249-4b1a-9005-55f0b3a708c4` failed
  in `validating` because the runtime received `SIGTERM` and restarted mid-run
- [runtime.log](/Users/tyler/nexus/state/logs/runtime.log) shows repeated
  `signal SIGTERM received` events throughout April 1-2, 2026, including the
  validation window at `2026-04-02T16:37:46Z`
- current logs do not identify the sender or restart source, so validation
  interruption still looks like product failure unless manually reconstructed
