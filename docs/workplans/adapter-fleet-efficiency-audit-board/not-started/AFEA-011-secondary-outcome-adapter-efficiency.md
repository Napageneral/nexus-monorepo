# AFEA-011 Secondary Outcome Adapter Efficiency

## Goal

Bring CallRail, Twilio, and PatientNow up to the same durable monitor standard
before they become live attribution dependencies.

## Current Gap

These adapters use slower cadences than the hot paid-media adapters, but they
still rely on broad aggregate windows, in-memory polling, or missing revision
suppression.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/callrail/cmd/callrail-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/twilio/cmd/twilio-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/patient-now-emr/cmd/patient-now-emr-adapter/main.go`

## Scope

- add durable company/practice/account-scoped monitor state
- cache provider discovery where discovery is not the actual live signal
- track provider cursors and stable tie-breakers per metric lane
- suppress unchanged aggregate metric rows before emission
- require setup fields needed for live monitor activation

## Acceptance

1. steady-state monitor cycles emit zero unchanged aggregate rows
2. provider discovery does not repeat every cycle without reason
3. health truthfully reports missing setup fields that monitor/backfill require
4. each adapter has a package-local benchmark proof

