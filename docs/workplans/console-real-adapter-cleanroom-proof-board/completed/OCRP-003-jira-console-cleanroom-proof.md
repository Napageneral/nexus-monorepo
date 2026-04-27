# OCRP-003 Jira Console Cleanroom Proof

## Goal

Prove Jira through the real Console UI inside a fresh cleanroom.

## Outcome

Completed.

Passing host-visible proof bundle:

- [result.json](/Users/tyler/nexus/state/sandboxes/f547f92b-2412-4761-a999-6c271b35810e/artifacts/validation/ocrp-003-jira-console-cleanroom/20260407T030845Z/result.json)
- [jira-ingest-summary.json](/Users/tyler/nexus/state/sandboxes/f547f92b-2412-4761-a999-6c271b35810e/artifacts/validation/ocrp-003-jira-console-cleanroom/20260407T030845Z/jira-ingest-summary.json)
- [full-session.webm](/Users/tyler/nexus/state/sandboxes/f547f92b-2412-4761-a999-6c271b35810e/artifacts/validation/ocrp-003-jira-console-cleanroom/20260407T030845Z/videos/full-session.webm)

Observed counts from the passing run:

- records: `8124`
- contacts: `34`
- channels: `960`

Backfill completion from the passing run:

- started: `2026-04-07T03:10:31.104Z`
- completed: `2026-04-07T03:16:54.004Z`
- processed: `8204`

Minimum thresholds enforced for this signoff run:

- records: `5000`
- contacts: `20`
- channels: `100`

## Acceptance

- one fresh cleanroom run connects Jira through the UI
- `Test connection` passes
- `Backfill now` is accepted
- the ingest or backfill lane reaches `completed` before the proof passes
- the bundle records observed counts or equivalent runtime-backed inventory totals
- ticket-owned minimum thresholds are satisfied and reviewable in the bundle
- Jira-backed records are visible in the Console
- the proof emits one full-session recording, screenshots, and a green summary
