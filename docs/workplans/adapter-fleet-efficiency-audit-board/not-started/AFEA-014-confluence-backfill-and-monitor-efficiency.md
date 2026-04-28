# AFEA-014 Confluence Backfill And Monitor Efficiency

## Goal

Verify and harden Confluence backfill and live monitor behavior against the
same reasonable production sync standard as the other priority adapters.

## Current Gap

Confluence appears closer to the desired model than many adapters: it has
per-space watermark files, a monitor-specific freshness path, and a date-bounded
backfill path. The remaining gap is proof and cleanup: the monitor/backfill
posture needs a focused efficiency pass, and health currently risks doing more
pagination than a cheap probe should.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/confluence/internal/backfill/backfill.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/confluence/internal/monitor/monitor.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/confluence/internal/monitor/watermark.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/confluence/internal/atlassian/client.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/confluence/cmd/confluence-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/confluence/docs/validation/CONFLUENCE_ADAPTER_VALIDATION.md`

## Scope

- verify backfill is date-bounded, paginated safely, and not used as the
  freshness path
- verify monitor uses durable per-space watermarks and stops pagination once
  older pages prove the remaining page set is irrelevant
- add or refresh tests for restart resume and no-change monitor cycles
- add request-count and emitted-record-count benchmark evidence
- make health a cheap credential or single-page probe rather than an inventory
  scan

## Acceptance

1. backfill and monitor responsibilities are clearly separated in code and docs
2. monitor restart resumes from persisted per-space watermarks
3. no-change monitor cycles emit zero records and avoid unnecessary pagination
4. health is safe for repeated UI/runtime polling
5. validation docs include a retained efficiency proof artifact
