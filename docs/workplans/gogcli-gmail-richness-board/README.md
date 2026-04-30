# GOGCLI Gmail Richness Board

This board tracks the hard-cut expansion of the `gog` adapter from a thin Gmail
wrapper into a rich Gmail adapter built on the latest upstream `gogcli`.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/HANDOFF.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-validation-proof-ladder.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/specs/ADAPTER_SPEC_GOG.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/validation/GOG_ADAPTER_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/not-started/AFEA-006-gog-gmail-monitor-efficiency.md`

## Purpose

Make Gmail a first-class rich Nex adapter:

- package the current upstream `gogcli` binary with the adapter
- preserve full message body, header, thread, label, and attachment richness
- expose the useful Gmail-native upstream method surface
- make monitor state durable, incremental, and loss-safe
- keep fallback polling explicitly degraded, bounded, and benchmarked
- prove install/connect, backfill/monitor, and agent-use lanes in cleanroom

## Status Snapshot

GGR-001 through GGR-010 are implemented and validated. The adapter now
bundles upstream `gogcli v0.14.0`, preserves rich Gmail message/thread/header
and attachment metadata, exposes rich send/forward/draft and guarded native
Gmail methods, and has safer incremental monitor and fallback polling behavior.
GGR-010 adds the long-term live-sync seam: Gmail history remains the durable
cursor, Pub/Sub notifications can wake `gmail.pubsub.sync`, watch state is
started/renewed when a topic is configured, and fallback polling remains the
degraded path.

GGR-009 has green package cleanroom, full live Gmail cleanroom, and hosted
MoonSleep install/restart proofs. The live proof backfilled `98,243` unique
`tnapathy@gmail.com` records and forced a self-send that the monitor emitted as
one rich record. A local live dogfood proof also sent from a `moonsleep.co`
Gmail account into `tnapathy@gmail.com` and verified the running Nex Gmail
monitor ingested the message. The hosted runtime currently exposes the legacy
Gmail-root connection count but not a stable public connection id for that row,
so hosted restart proof records count preservation rather than id hash
preservation.

## Ticket Order

1. [GGR-001 Bundle Current Upstream Gogcli Runtime](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-001-bundle-current-upstream-gogcli-runtime.md)
2. [GGR-002 Rich Message Body And Header Projection](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-002-rich-message-body-and-header-projection.md)
3. [GGR-003 Thread Conversation And Attachment Metadata Projection](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-003-thread-conversation-and-attachment-metadata-projection.md)
4. [GGR-004 Attachment Download And Artifact Methods](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-004-attachment-download-and-artifact-methods.md)
5. [GGR-005 Rich Send Reply Forward And Draft Methods](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-005-rich-send-reply-forward-and-draft-methods.md)
6. [GGR-006 Gmail Watch History Event Richness](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-006-gmail-watch-history-event-richness.md)
7. [GGR-007 Fallback Polling Loss Safety And Benchmarks](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-007-fallback-polling-loss-safety-and-benchmarks.md)
8. [GGR-008 Gmail Native Method Catalog And Guardrails](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-008-gmail-native-method-catalog-and-guardrails.md)
9. [GGR-009 Cleanroom And Hosted Validation Signoff](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-009-cleanroom-and-hosted-validation-signoff.md)
10. [GGR-010 Gmail Pub/Sub History Live Sync](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-010-gmail-pubsub-history-live-sync.md)

## Status

- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/blocked/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/in-progress/README.md)
- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/not-started/README.md)
