# OCRP-008 Meta Ads Console Cleanroom Proof

## Goal

Prove Meta Ads through the real Console UI inside a fresh cleanroom.

## Why

Meta Ads is one of the important provider adapters you already brought to the
 right spec and it should have the same proof lane as the collaboration set.

## Scope

- connect Meta Ads through the Console UI
- run `Test connection`
- run `Backfill now`
- show Meta Ads-backed rows in Records
- show account, campaign, or ad-set evidence through the runtime-backed
  Console surfaces

## Acceptance

- one fresh cleanroom run connects Meta Ads through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Meta Ads-backed data is visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

