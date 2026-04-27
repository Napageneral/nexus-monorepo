# OCRP-013 Zenoti Console Cleanroom Proof

## Goal

Prove Zenoti through the real Console UI inside a fresh cleanroom.

## Why

Zenoti is an important operations adapter and should be covered by the same
 cleanroom Console signoff path.

## Scope

- connect Zenoti through the Console UI
- run `Test connection`
- run `Backfill now`
- show Zenoti-backed rows in Records
- show customer, practitioner, or location identity evidence when the current
  Console surfaces expose it

## Acceptance

- one fresh cleanroom run connects Zenoti through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Zenoti-backed data is visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary

