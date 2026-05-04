# Adapter Fleet Efficiency Audit Board

This board tracks the fleet-wide follow-up from the April 27, 2026 adapter
efficiency audit.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-validation-proof-ladder.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-live-sync-efficiency-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`

## Purpose

Make every adapter prove the same production posture now expected from the
MoonSleep attribution adapters:

- exhaustive backfill is correctness-first and can be expensive when explicitly
  requested
- live monitor is incremental, durable, bounded, and cheap
- monitors do not use broad replay windows as the steady-state sync strategy
- unchanged provider rows are suppressed before durable Nex records are emitted
- health and setup checks are lightweight and safe to poll
- benchmark artifacts show request counts, emitted records, runtime cost, and
  restart behavior

The current execution pass is intentionally narrower than the full audit. It
focuses on adapters whose backfill and live-monitor posture needs direct
review or hardening before we trust them in real client runtimes.

Current narrowed execution order:

1. `zenoti-emr` Devenir hot-monitor/reconcile and hosted rollout proof complete
2. `github`, `gitlab`, and `bitbucket`
3. `web-journey` and `web-rum`, if Devenir/MoonSleep web volume makes the
   web-signals lane materially important

Previously completed lanes remain closed:

- `tiktok-display`
- `gog` Gmail history polling
- `slack` user-token monitor

Deferred lanes are still tracked below, but they are not in the current
user-prioritized pass:

- `jira`
- `confluence`
- `google-business-profile`
- `qase`
- secondary messaging/resource-health cleanups

## Audit Summary

No P0 findings were found.

Adapters already close to the desired model:

- `shopify`: family lanes, durable monitor state, revision suppression, current
  MoonSleep package-local benchmark proof
- `tiktok-business`: bounded monitor lanes and revision suppression after the
  MoonSleep hardening pass
- `meta-ads`: bounded monitor lanes and revision suppression after the
  MoonSleep hardening pass
- `google-ads`: bounded monitor lanes, access-snapshot cadence reduction, and
  current MoonSleep hosted proof
- `eve`: strong durable watermark and bounded live-sync model; keep as an
  implementation exemplar
- `git`: retired tombstone, no active monitor surface

Highest-priority gaps:

- `zenoti-emr`: Devenir-critical outcome adapter now separates hot polling from
  full reconcile replay, is published as `0.1.4`, and has hosted Devenir
  install/restart proof; the remaining upper-bound gap is in the deployed
  core-runtime `adapters.connections.backfill` RPC path, not the package
- `tiktok-display`: smart polling implementation, copied-package cleanroom
  proof, and hosted MoonSleep runtime proof are complete
- `google-business-profile`: monitor lacks durable family lanes and revision
  suppression; health performs inventory-style work
- `google`: legacy compatibility adapter still preserves split-brain ownership
  for Google domains now owned by canonical packages
- `jira`: monitor watermarks are process-local
- `qase`: monitor scans all project families and overlap dedupe can re-emit
  unchanged rows
- `github`, `gitlab`, `bitbucket`: forge monitors still do broad PR comment
  scans; GitLab and Bitbucket historical backfills over-fetch PR artifacts

Secondary gaps:

- `web-journey`: dedupe path opens SQLite and runs schema setup per event; no
  bounded pruning proof
- `web-rum`: duplicate browser sends are not adapter-deduped before ingest
- `twilio`, `callrail`, `patient-now-emr`: aggregate monitor loops need durable
  watermarks and revision suppression
- `telegram`: monitor offset is process-local
- `discord`: live edits/deletes are not represented as revisions
- `whatsapp`: media capability is overstated relative to send behavior
- `device-headless`: command stdout/stderr buffers are unbounded
- `apple-maps`: backfill accepts `since` but ignores it
- `confluence`, `qase`: health checks can enumerate more than a cheap health
  probe should

## Ticket Order

1. [AFEA-002 Zenoti Durable Live Monitor](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/AFEA-002-zenoti-durable-live-monitor.md)
2. [AFEA-016 Zenoti Devenir Hot Monitor And Reconcile Lanes](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/AFEA-016-zenoti-devenir-hot-monitor-and-reconcile-lanes.md)
3. [AFEA-017 Hosted Runtime Backfill Upper Bound Rollout](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-017-hosted-runtime-backfill-upper-bound-rollout.md)
4. [AFEA-003 TikTok Display Live Monitor](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/AFEA-003-tiktok-display-live-monitor.md)
5. [AFEA-015 TikTok Display Smart Polling And Snapshot Ledger](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/AFEA-015-tiktok-display-smart-polling-and-snapshot-ledger.md)
6. [AFEA-006 GOG Gmail Monitor Efficiency](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/AFEA-006-gog-gmail-monitor-efficiency.md)
7. [AFEA-005 Slack User Token Monitor Efficiency](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/AFEA-005-slack-user-token-monitor-efficiency.md)
8. [AFEA-007 Forge Adapter Monitor And Backfill Efficiency](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-007-forge-adapter-monitor-and-backfill-efficiency.md)
9. [AFEA-010 Web Signals Ingestion Efficiency](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-010-web-signals-ingestion-efficiency.md)
10. [AFEA-008 Jira Durable Monitor Watermarks](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-008-jira-durable-monitor-watermarks.md)
11. [AFEA-014 Confluence Backfill And Monitor Efficiency](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-014-confluence-backfill-and-monitor-efficiency.md)
12. [AFEA-001 Fleet Efficiency Proof Harness](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-001-fleet-efficiency-proof-harness.md)
13. [AFEA-004 Google Business Profile And Legacy Google Cleanup](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-004-google-business-profile-and-legacy-google-cleanup.md)
14. [AFEA-009 Qase Monitor Efficiency](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-009-qase-monitor-efficiency.md)
15. [AFEA-011 Secondary Outcome Adapter Efficiency](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-011-secondary-outcome-adapter-efficiency.md)
16. [AFEA-012 Messaging Adapter Idempotency And Revisions](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-012-messaging-adapter-idempotency-and-revisions.md)
17. [AFEA-013 Small Resource And Health Probe Cleanups](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-013-small-resource-and-health-probe-cleanups.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/blocked/README.md)
