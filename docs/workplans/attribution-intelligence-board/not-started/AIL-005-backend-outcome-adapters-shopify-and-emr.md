# AIL-005 Backend Outcome Adapters Shopify And EMR

## Goal

Land shared backend outcome adapters beginning with Shopify and one EMR-family
target so the attribution intelligence app can reconcile website intent to
business truth.

## Required Capabilities

- credential setup and ingestion
- connection health
- backfill
- live sync or webhook-driven refresh
- canonical business outcome records
- preservation of source-native outcome ids and bridge fields

## Current Gap

- MoonSleep proves ecommerce outcome modeling through Shopify only
- the generic backend outcome contract for ecommerce and healthcare workflows is
  not yet implemented as shared Nexus package behavior

## Acceptance

1. Shopify adapter parity covers the core attribution fields needed by the app
2. one EMR-family lane proves the generic backend outcome model is not
   ecommerce-specific
3. backend records preserve the bridge data required for attribution joins
4. cleanroom validation proves backfill and live sync for supported lanes
