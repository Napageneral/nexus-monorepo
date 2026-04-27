# OCRP-004 Bitbucket Console Cleanroom Proof

## Goal

Prove Bitbucket through the real Console UI inside a fresh cleanroom.

## Why

Bitbucket is one of the core source-control adapters already used in lived-in
 dogfood and needs cleanroom proof parity.

## Scope

- connect Bitbucket through the Console UI
- run `Test connection`
- run `Backfill now`
- show Bitbucket-backed rows in Records
- show repository or container evidence in Channels when exposed
- show Bitbucket-backed contacts when present

## Acceptance

- one fresh cleanroom run connects Bitbucket through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Bitbucket-backed records are visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

