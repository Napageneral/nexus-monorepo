# AIL-006 Attribution Intelligence App Schema Jobs And UI

## Goal

Build the attribution intelligence app package with its own database, jobs,
reconciliation state, aggregate marts, and operator UI.

## Scope

- input bindings
- canonical facts
- aggregate marts
- reconciliation jobs
- freshness and gap detection
- operator-facing UI for paid performance, source mix, funnel, and attributed
  outcomes

## Current Gap

- Nexus does not yet have the generic attribution intelligence app layer above
  shared acquisition, website, and backend inputs
- the app-owned persistence boundary is not yet implemented

## Acceptance

1. the app owns a dedicated database rather than relying on memory-first
   persistence
2. app jobs materialize canonical facts and aggregate marts from ingested
   records
3. the app UI reads app-owned marts instead of individual adapter payloads
4. the app can work with different backend outcome providers through the same
   generic model
