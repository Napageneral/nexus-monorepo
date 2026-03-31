# GAP-004 Google Ads Replay-Safe Backfill And Monitor

## Goal

Align Google Ads backfill and monitor behavior around replay-safe
immutable-arrival semantics.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`

## Current Gap

- the current monitor relies on a generic polling cursor and metric fetch path
- replay windows for late or restated Google Ads data are not explicit
- daily and hourly parity between backfill and monitor is not defined as a
  first-class package contract

## Acceptance

1. backfill and monitor emit the same row families and payload structure
2. daily families replay recent days safely
3. hourly families replay recent hours safely
4. account-access or catalog-style families refresh on a durable cadence
5. restated provider rows append rather than disappearing under dedupe
