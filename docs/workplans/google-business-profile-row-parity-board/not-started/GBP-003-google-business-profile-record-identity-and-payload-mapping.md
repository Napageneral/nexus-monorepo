# GBP-003 Google Business Profile Record Identity And Payload Mapping

## Goal

Implement revision-aware GBP record identity and canonical payload mapping for
immutable-arrival ingest.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md`

## Acceptance

1. each family uses stable logical-row identity plus revision hash
2. unchanged retries deduplicate in `records.db`
3. changed provider rows append as new immutable arrivals
4. payload metadata preserves `row`, `provider_ids`, `raw_provider_payload`,
   and `source_request`
