---
summary: "Workboard for proving the bounded backfill plus durable live-sync cutover across the adapter fleet."
title: "Adapter Bounded Backfill Live Sync Cutover Board"
---

# Adapter Bounded Backfill Live Sync Cutover Board

## Purpose

Close the bounded backfill and durable live-sync cutover all the way through
reviewable cleanroom, hosted install/restart, and agent-use proof.

This board exists because implementation and focused tests are not enough for
the adapter fleet. Each changed runtime, SDK, and adapter lane needs a durable
proof ticket with evidence.

## Canonical Inputs

- [Messaging Adapter Live Sync And Interactions](/Users/tyler/nexus/home/projects/nexus/docs/specs/platform/messaging-adapter-live-sync-and-interactions.md)
- [Messaging Adapter Live Sync Validation Ladder](/Users/tyler/nexus/home/projects/nexus/docs/validation/messaging-adapter-live-sync-validation-ladder.md)
- [Adapter Backfill As Durable Work](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/adapter-backfill-as-durable-work.md)
- [Adapter Backfill Execution And Honesty](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/adapter-backfill-execution-and-honesty.md)
- [Unified Adapter SDK And Authoring Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md)

## Target Semantics

1. Live sync is enabled first when a connection supports monitors.
2. The runtime captures a monitor-start anchor.
3. Initial historical reconciliation is bounded from requested `since` to the
   captured `to` anchor.
4. Bounded backfill runs while the monitor remains active.
5. Unbounded replay is explicitly maintenance mode and may pause monitors.
6. SDK backfill handlers receive both boundaries through a window object.
7. Adapter packages preserve provider fidelity and honor `to` where the
   provider exposes or returns a usable timestamp.
8. Hosted install and restart preserve package, connection, live-sync
   preference, monitor state, and bounded backfill behavior.

## Matrix

| Lane | Ticket | Scope | Proof |
| --- | --- | --- | --- |
| Runtime and SDK closeout | [ABBLS-001](completed/ABBLS-001-runtime-sdk-and-adapter-implementation-closeout.md) | Nex runtime, TS SDK, Go SDK, touched adapter compile surface | Completed targeted tests plus cleanroom smoke receipt |
| Matrix harness | [ABBLS-002](completed/ABBLS-002-cleanroom-matrix-harness-and-artifact-index.md) | Shared command shape, artifact bundle schema, matrix runner notes | Fresh cleanroom bundles indexed by lane |
| Gmail/GOG | [ABBLS-003](completed/ABBLS-003-gog-gmail-bounded-backfill-and-live-sync-cleanroom.md) | GOG Gmail rich records, tnapathy Gmail path, live sync | Real Gmail cleanroom proof |
| Slack | [ABBLS-004](completed/ABBLS-004-slack-bounded-backfill-and-live-sync-cleanroom.md) | Slack history/replies with `to`, live monitor | Real or synthetic Slack cleanroom proof |
| Attribution adapters | [ABBLS-005](completed/ABBLS-005-attribution-adapter-bounded-backfill-cleanroom.md) | Shopify, Google Ads, Meta Ads, TikTok Business, TikTok Display, Google Business Profile, legacy Google | Provider-row bounded backfill proof |
| Git forge adapters | [ABBLS-006](completed/ABBLS-006-git-forge-bounded-backfill-cleanroom.md) | GitHub, GitLab, Bitbucket | Commit, PR, comment upper-bound proof |
| Atlassian and Qase | [ABBLS-007](completed/ABBLS-007-atlassian-and-qase-bounded-backfill-cleanroom.md) | Jira, Confluence, Qase | JQL/CQL/API upper-bound proof |
| Voice/local business adapters | [ABBLS-008](completed/ABBLS-008-voice-local-and-manual-adapter-bounded-backfill-cleanroom.md) | Twilio, CallRail, Apple Maps | Query/filter upper-bound proof |
| Healthcare and host-native adapters | [ABBLS-009](completed/ABBLS-009-healthcare-and-host-native-bounded-backfill-cleanroom.md) | Eve, Zenoti EMR, Patient Now EMR | Host-native or cleanroom-equivalent proof |
| Hosted install/restart | [ABBLS-010](completed/ABBLS-010-hosted-install-restart-and-livesync-rehydration-proof.md) | MoonSleep hosted runtime, package install, restart, rehydration | Hosted receipt bundle |
| Agent-use | [ABBLS-011](completed/ABBLS-011-agent-use-proof-for-bounded-backfill-and-livesync.md) | Worker capability discovery and adapter use | Agent/worker transcript |
| Closeout | [ABBLS-012](completed/ABBLS-012-full-matrix-artifact-review-and-closeout.md) | All lanes | Final signoff with artifact index |

## Artifact Index

- [Artifact Index](artifact-index.md)

## Completion Standard

This board is closed only when:

- every ticket above is completed or explicitly descoped with rationale
- every lane has a cleanroom or documented host-native-equivalent proof bundle
- hosted install/restart has a retained receipt
- a worker/agent-use proof demonstrates the new adapter surface through runtime
  capability discovery
- final docs link the retained artifact paths and commit/package versions

## Status

- Completed: ABBLS-001 through ABBLS-012
- In progress: none
- Not started: none
- Blocked: none

## Closeout Notes

- Hosted GOG install/restart proof retained at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/abbls-010-gog-hosted-install-restart/20260502T215941Z/proof/gog-hosted-install-restart-proof.json`.
- Agent-use proof retained at
  `/Users/tyler/nexus/state/artifacts/validation/adapter-bounded-backfill-agent-use-proof/20260502T223429Z`.
- The live local runtime was repaired during closeout by checkpointing and
  truncating a 70 GB `agents.db-wal`; `PRAGMA integrity_check` returned `ok`,
  `nexus status --json` reported reachable, and Gmail live sync remained
  running.
