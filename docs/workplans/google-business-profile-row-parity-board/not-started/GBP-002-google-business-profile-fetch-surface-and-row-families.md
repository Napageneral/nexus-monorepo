# GBP-002 Google Business Profile Fetch Surface And Row Families

## Goal

Expand the dedicated GBP package into the required provider row families.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md`

## Current Gap

- Nex has no dedicated GBP package today
- account, location, performance, and review truth are not preserved as shared
  immutable arrivals

## Acceptance

1. the package fetches `account_snapshot`, `location_snapshot`,
   `location_performance_daily`, and `review_snapshot`
2. each family has a concrete row builder
3. required ids and provider payloads survive the mapping
4. the package documents whether `search_keyword_monthly` lands in the first
   slice or as a scoped follow-up
