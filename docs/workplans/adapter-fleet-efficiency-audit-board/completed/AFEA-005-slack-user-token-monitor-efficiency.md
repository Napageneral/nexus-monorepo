# AFEA-005 Slack User Token Monitor Efficiency

Status: completed by validation closeout on 2026-05-01.

## Goal

Stop Slack user-token live sync from turning into a broad workspace sweep.

## Current Gap

The user-token monitor can list all readable conversations every poll and then
read history for each conversation since its cursor. On large workspaces this
does repeated broad discovery and many empty reads.

Primary file:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack/cmd/slack-adapter/read_ingest.go`

## Scope

- add conversation allowlists or workspace-scale discovery budgets
- cache conversation discovery with TTL and explicit refresh controls
- persist empty-channel cursors as "seen through now" rather than reseeding
  repeatedly
- enforce per-cycle API budgets and backoff behavior
- add a large-workspace benchmark with request counts and emitted records

## Acceptance

1. no-change monitor cycles avoid scanning every readable conversation
2. empty channels are not repeatedly re-read as new work
3. API request budgets are visible in benchmark artifacts
4. restart behavior preserves per-conversation cursors

## Closeout

This ticket is closed as a product and validation decision, not as a claim that
every original optimization was implemented.

The current Slack user-token monitor still performs broad conversation
discovery and per-conversation cursor checks on each poll. That remains a
possible future optimization area, but it is no longer a blocker for the fleet
efficiency pass because the current implementation is cursor-backed,
rate-limit-aware, and has current large-workspace proof.

Evidence:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack/docs/validation/SLACK_ADAPTER_VALIDATION.md`
  records the 2026-04-28 full user-token backfill and live-monitor proof.
- The proof covered all 72 readable conversations and emitted 39,123 records
  across 62 containers.
- The proof captured 23,239 thread replies, 1,529 records with Slack file
  metadata, and 3,436 records with reactions.
- The proven request budget is `conversations.history` at 200 requests/minute,
  `conversations.replies` at 50 requests/minute, and 4 bounded reply workers.
- No Slack `429`, `rate_limited`, retry, deadline, timeout, or adapter error
  lines were observed during the successful proof.
- The monitor seeded durable per-conversation cursors and emitted an injected
  live bot-DM validation message.

Accepted residuals:

- Conversation discovery TTL, explicit allowlists, and no-change-cycle
  suppression are deferred until Slack workspace scale or provider pressure
  makes them necessary.
- Page-level emission and resumable per-conversation backfill cursors remain
  future hardening work for full-history backfill polish, not a live-monitor
  blocker.
