# AGJV-005 Full Backfill And Freshness Lane

## Goal

Run the full attribution ingest substrate inside the cleanroom and prove that
the relevant data is present before the browser journey begins.

## Scope

- install all relevant adapters
- run initial backfill for acquisition and backend truth
- prove adapter health and recent data presence
- preserve one structured freshness summary in the proof bundle

## Acceptance

1. Meta Ads, Google Ads, TikTok Business, TikTok Display, and Shopify all
   install and backfill successfully inside the cleanroom
2. the proof bundle records row-family counts and freshness markers for each
   provider
3. any provider replay or monitor-start step is explicit in the validation
   script
4. the proof can fail early on missing data before the browser journey starts
