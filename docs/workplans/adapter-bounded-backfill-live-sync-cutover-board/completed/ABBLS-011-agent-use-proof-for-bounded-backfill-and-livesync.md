---
summary: "Agent-use proof that workers can discover and use the bounded backfill and live-sync adapter surfaces."
title: "ABBLS-011 Agent-Use Proof For Bounded Backfill And Live Sync"
---

# ABBLS-011 Agent-Use Proof For Bounded Backfill And Live Sync

## Status

Completed.

## Scope

Prove the new adapter surfaces are usable by a worker through the real runtime
capability catalog, not only direct CLI commands.

## Acceptance Criteria

1. Worker discovers adapter connection capability.
2. Worker can inspect live-sync status.
3. Worker can enable or confirm live sync.
4. Worker can request bounded backfill with explicit `since` and `to`.
5. Worker can inspect job status and summarize progress.
6. Worker can read or reference at least one record produced by the bounded
   backfill or monitor.
7. Transcript contains no secrets.

## Evidence To Capture

- agent or worker session id
- runtime capability ids used
- connection id
- bounded backfill job id
- representative record ids
- redacted transcript path

## Evidence Captured

- Proof bundle:
  `/Users/tyler/nexus/state/artifacts/validation/adapter-bounded-backfill-agent-use-proof/20260502T223429Z`
- Worker session: `session:d496471f-317b-4838-8115-457ea5373269`
- Backfill job: `jobrun_9d7feff3-4ddf-4b3e-9012-068335e6140d`
- Connection: `tnapathy@gmail.com`
- `since`: `2026-05-02T21:48:00Z`
- `to`: `2026-05-02T22:34:29.210Z`
- Job status: `completed`
- Records processed: `8`
- Monitor paused: `false`
- Representative record: `gmail:message:19deaaa700a6698f`
- Worker tool path: `local.exec` through `nexus runtime call ...`
- Transcript and job run scan: proof bundle contains no matching raw token/API
  secret patterns from the closeout scan.

## Notes

The first agent-use attempt failed because the canonical primary agent was
still `bootstrap-pending`. Closeout finalized the existing `entity-assistant`
slot as `Nexus Assistant`, removed the stale pending tag through
`entities.tags.remove`, and confirmed `nexus status --json` reported
`defaultAgentPending: false` before rerunning the proof.
