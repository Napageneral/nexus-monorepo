# OCRP-009 Google Ads Console Cleanroom Proof

## Goal

Prove Google Ads through the real Console UI inside a fresh cleanroom.

## Why

Google Ads is a core provider lane in the real-adapter set and needs the same
 cleanroom signoff contract.

## Scope

- connect Google Ads through the Console UI
- run `Test connection`
- run `Backfill now`
- show Google Ads-backed rows in Records
- show account, campaign, or inventory evidence through the runtime-backed
  Console surfaces

## Acceptance

- one fresh cleanroom run connects Google Ads through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Google Ads-backed data is visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

