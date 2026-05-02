---
summary: "Cleanroom proof for Jira, Confluence, and Qase bounded backfill upper-bound behavior."
title: "ABBLS-007 Atlassian And Qase Bounded Backfill Cleanroom"
---

# ABBLS-007 Atlassian And Qase Bounded Backfill Cleanroom

## Status

Completed 2026-05-02.

## Scope

Prove upper-bound behavior for:

- Jira JQL backfill
- Confluence CQL backfill
- Qase API backfill

## Acceptance Criteria

1. Jira cleanroom proves `updated <= to` is included in JQL and issue-family
   records after `to` are excluded.
2. Confluence cleanroom proves CQL includes `lastModified <= to`.
3. Qase cleanroom proves cases, runs/results, and defects after `to` are
   excluded.
4. Docs and skills show monitor-first bounded backfill order.
5. Restart preserves connection and live-sync state where monitor exists.

## Current Evidence

- Jira bounded-window Docker smoke:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-jira-cleanroom/20260502T212725Z`

## Evidence To Capture

- cleanroom bundle path
- Jira project, Confluence space, Qase project aliases
- bounded window
- query strings or redacted query summaries
- emitted record ids and excluded-record assertions

## Evidence

- Jira bounded-window Docker smoke:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-jira-cleanroom/20260502T212725Z`
- Docker package matrix:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z`
- Passed lanes:
  - `jira`
  - `confluence`
  - `qase`

## Notes

- This closes the package-level upper-bound proof for Jira, Confluence, and
  Qase. Hosted restart preservation is covered by ABBLS-010.
