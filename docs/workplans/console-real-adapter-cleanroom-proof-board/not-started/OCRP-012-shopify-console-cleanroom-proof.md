# OCRP-012 Shopify Console Cleanroom Proof

## Goal

Prove Shopify through the real Console UI inside a fresh cleanroom.

## Why

Shopify is one of the important commerce adapters and should use the same
 proof contract as the rest of the suite.

## Scope

- connect Shopify through the Console UI
- run `Test connection`
- run `Backfill now`
- show Shopify-backed rows in Records
- show customer or commerce contact evidence when the current Console surfaces
  expose it

## Acceptance

- one fresh cleanroom run connects Shopify through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Shopify-backed data is visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

