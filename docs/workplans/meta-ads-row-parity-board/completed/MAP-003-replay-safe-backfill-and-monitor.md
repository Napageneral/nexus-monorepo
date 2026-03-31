# MAP-003 Replay-Safe Backfill And Monitor

## Goal

Align Meta backfill and monitor behavior around replay-safe immutable-arrival
semantics.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/proposals/attribution-adapters/meta-ads-record-mapping.md`

## Current Gap

- the current monitor relies on the polling cursor alone
- replay windows for late or restated Meta data are not explicit
- backfill and monitor parity is not yet proven across all row families

## Acceptance

1. backfill and monitor emit the same row families and payload structure
2. daily families replay recent days safely
3. hourly families replay recent hours safely
4. restated provider rows append rather than disappearing under dedupe
