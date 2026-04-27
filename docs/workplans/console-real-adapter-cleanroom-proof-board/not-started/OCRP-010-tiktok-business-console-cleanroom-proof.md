# OCRP-010 TikTok Business Console Cleanroom Proof

## Goal

Prove TikTok Business through the real Console UI inside a fresh cleanroom.

## Why

TikTok Business is part of the important provider set and should have the same
 UI-first proof lane as the other production adapters.

## Scope

- connect TikTok Business through the Console UI
- run `Test connection`
- run `Backfill now`
- show TikTok Business-backed rows in Records
- show advertiser or campaign evidence through the runtime-backed Console
  surfaces

## Acceptance

- one fresh cleanroom run connects TikTok Business through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- TikTok Business-backed data is visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

