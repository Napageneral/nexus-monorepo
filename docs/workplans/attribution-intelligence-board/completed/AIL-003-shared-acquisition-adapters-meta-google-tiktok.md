# AIL-003 Shared Acquisition Adapters Meta Google TikTok

## Status

Complete for the current attribution intelligence board scope.

## Goal

Land the shared paid acquisition adapters needed for the attribution
intelligence layer, starting with Meta Ads, Google Ads, and TikTok Business.

## Required Capabilities

- credential setup and ingestion
- connection health
- backfill
- live monitoring or sync
- canonical record ingest for paid hierarchy and performance

## Current Gap

- MoonSleep has provider-specific working code, but the shared Nexus adapters
  are not yet proven to collect the same core attribution fields
- hosted and local cleanroom proof for real provider credentials is not yet
  established for this domain
- detailed provider specs and burn-down tickets now live under:
  - `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/`
  - `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/README.md`

## Acceptance

1. each acquisition adapter exposes setup, health, backfill, and live sync
2. each adapter emits canonical records with provider-native ids preserved
3. the parity matrix for core fields is satisfied or explicit gaps are recorded
4. cleanroom validation proves real credentialed ingest for each supported
   provider lane

## Resolution

This ticket is treated as complete for the current board.

Provider-specific depth and follow-on gaps now belong in the shared adapter
package specs and their own package-level workplans rather than on the
umbrella attribution intelligence board.
