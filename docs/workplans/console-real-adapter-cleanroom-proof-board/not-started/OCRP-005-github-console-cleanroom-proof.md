# OCRP-005 GitHub Console Cleanroom Proof

## Goal

Prove GitHub through the real Console UI inside a fresh cleanroom.

## Why

GitHub is part of the real review and PR workflow and needs the same Console
 cleanroom proof path.

## Scope

- connect GitHub through the Console UI
- run `Test connection`
- run `Backfill now`
- show GitHub-backed rows in Records
- show repository or channel evidence in Channels when exposed
- show GitHub-backed contacts when present

## Acceptance

- one fresh cleanroom run connects GitHub through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- GitHub-backed records are visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

