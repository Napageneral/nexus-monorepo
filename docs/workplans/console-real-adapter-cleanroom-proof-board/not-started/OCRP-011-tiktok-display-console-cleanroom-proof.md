# OCRP-011 TikTok Display Console Cleanroom Proof

## Goal

Prove TikTok Display through the real Console UI inside a fresh cleanroom.

## Why

TikTok Display is already part of the adapter set you care about and should be
 proved through the same cleanroom Console story.

## Scope

- connect TikTok Display through the Console UI
- run `Test connection`
- run `Backfill now`
- show TikTok Display-backed rows in Records
- show advertiser or campaign evidence through the runtime-backed Console
  surfaces

## Acceptance

- one fresh cleanroom run connects TikTok Display through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- TikTok Display-backed data is visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

