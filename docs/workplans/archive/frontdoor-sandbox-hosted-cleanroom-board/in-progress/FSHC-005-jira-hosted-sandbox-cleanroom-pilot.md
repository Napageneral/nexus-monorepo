# FSHC-005 Jira Hosted Sandbox Cleanroom Pilot

## Archive Status

This ticket is no longer an active board lane.
Its suite-specific follow-on belongs with the hosted cleanroom integration
board rather than a separate Frontdoor substrate board.

## Goal

Move the current Jira-first hosted adapter proof onto the Docker executor plus
sandbox-backed hosted target substrate and capture the first real end-to-end
proof bundle there.

## Acceptance

1. one command runs the full Jira hosted proof from Docker
2. Frontdoor provisions and destroys a sandbox-backed hosted target
3. connection setup, health, write, backfill, and ingest proof all pass
4. the proof bundle is durable and reviewable

## Current Status

The substrate dependency is closed.

The active work is now:

1. local pilot harness that publishes the Jira adapter into a local Frontdoor
   store and runs the fresh-server adapter cleanroom from the Docker executor
2. live credentialed Jira proof on top of that harness

The remaining blocker after the harness lands is no longer Frontdoor or
sandbox lifecycle plumbing. It is the real Jira credentialed proof run, which
should now be tracked with the hosted integration suites.
