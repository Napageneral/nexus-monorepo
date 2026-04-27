# OCRP-007 Google Console Cleanroom Proof

## Goal

Prove the current Google adapter lane through the real Console UI inside a
 fresh cleanroom.

## Why

Google-backed data is important enough to need the same UI-first cleanroom
 signoff as the rest of the suite.

## Scope

- connect the Google adapter through the Console UI
- run `Test connection`
- run `Backfill now`
- show Google-backed rows in Records
- show Contacts or Channels when the current Google lane exposes them
- otherwise prove account or resource inventory through the runtime-backed
  Console surfaces

## Acceptance

- one fresh cleanroom run connects Google through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Google-backed data is visible in the right Console surfaces
- the proof emits one full-session recording, screenshots, and a green summary

