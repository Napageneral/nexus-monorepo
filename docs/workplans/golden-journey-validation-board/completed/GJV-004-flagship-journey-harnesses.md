# GJV-004 Flagship Journey Harnesses

## Goal

Build the first 2-3 flagship end-to-end journeys that will grow into the
cumulative golden journey.

## Initial candidates

- onboarding and first agent finalization
- adapter connection, health, and backfill
- job or automation setup and execution

## Acceptance

- at least one truthful flagship journey runs end to end in a fresh sandbox
- the run yields one reviewable primary demo artifact
- the harness shape is reusable for future cumulative extension

## Closure Notes

The first flagship direction is now explicit:

- owner bootstrap
- first-agent finalization in place
- console verification on the finalized runtime

Landed:

- a first harness scaffold exists in
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/golden-journey-owner-console-proof.sh`
- the Docker cleanroom wrapper exists in
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/golden-journey-owner-console-cleanroom-docker.sh`

Validated:

- live cleanroom proof:
  `/Users/tyler/nexus/home/projects/nexus/state/artifacts/validation/cleanroom/gjv-004-owner-console/20260330T163141Z`
- the run emitted:
  - one primary whole-session recording
  - `validation-script.md`
  - pending and finalized orientation snapshots
  - console catalog confirmation on the finalized runtime

Next flagship journeys still remain:

- adapter connection / backfill / interaction
- job or automation setup and execution
