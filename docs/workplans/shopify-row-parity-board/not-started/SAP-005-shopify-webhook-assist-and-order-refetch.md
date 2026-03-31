# SAP-005 Shopify Webhook Assist And Order Refetch

## Goal

Define the optional webhook-assisted freshness path for narrow order refetches.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/proposals/attribution-adapters/shopify-record-mapping.md`

## Current Gap

- MoonSleep uses a Shopify paid-order webhook on the attribution sidecar, but
  Nex has no shared adapter posture for webhook-assisted freshness
- we need a clean boundary between authoritative polling and faster refetch
  assists
- this is intentionally optional and does not block the core Shopify adapter
  lane from being complete

## Acceptance

1. webhook support is optional and additive
2. webhook-triggered flows refetch provider truth instead of inventing new row
   contracts
3. polling remains the baseline proof path
