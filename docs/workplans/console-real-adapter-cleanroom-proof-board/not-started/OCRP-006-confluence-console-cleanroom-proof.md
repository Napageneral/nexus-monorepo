# OCRP-006 Confluence Console Cleanroom Proof

## Goal

Prove Confluence through the real Console UI inside a fresh cleanroom.

## Why

Confluence is already working in local dogfood and should be included in the
 real-adapter cleanroom suite.

## Scope

- connect Confluence through the Console UI
- run `Test connection`
- run `Backfill now`
- show Confluence-backed rows in Records
- show space or page container evidence in Channels when exposed
- show Confluence-backed contacts when present

## Acceptance

- one fresh cleanroom run connects Confluence through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Confluence-backed records are visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

