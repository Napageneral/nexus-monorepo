# AFEA-005 Slack User Token Monitor Efficiency

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
