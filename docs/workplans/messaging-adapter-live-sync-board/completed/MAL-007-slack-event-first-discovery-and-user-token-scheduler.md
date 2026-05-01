# MAL-007 Slack Event-First Discovery And User-Token Scheduler

## Goal

Make Slack live sync responsive to new active conversations while preserving
the full-fidelity user-token read lane.

## Current Gap

Nex Slack user-token monitoring currently couples frequent conversation
discovery to per-conversation history checks. That is correct but can turn a
monitor cycle into a broad workspace sweep.

OpenClaw's Slack monitor is event-first for conversations the bot app can see.
Nex should keep that event-first posture for bot mode and make the user-token
lane a budgeted catalog/history scheduler rather than a full scan every cycle.

## Scope

- document bot-event versus user-token read responsibilities
- persist a user-token conversation catalog beside per-conversation cursors
- run frequent lightweight catalog discovery
- run history checks from a bounded due-conversation queue
- catch up newly discovered conversations instead of seeding past their latest
  message
- keep thread reply reads bounded by current history roots
- validate request budgets and no-change behavior with unit coverage

## Acceptance

1. small and medium workspaces can discover new readable conversations within
   roughly 5-10 seconds without forcing a full history sweep
2. no-change monitor cycles limit history checks to a visible per-cycle budget
3. newly discovered conversations emit catch-up records instead of silently
   dropping the latest message
4. restart preserves per-conversation cursors and scheduler metadata
5. validation records the remaining large-workspace caveat honestly

## Completion Notes

Implemented in `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack`
on 2026-05-01:

- user-token monitor catalog poll interval is 5 seconds
- `conversations.list` limit is 1000
- catalog state persists type-group cursors, completed catalog passes, and
  discovered conversation ids
- history checks run from a due-conversation queue capped at 12 checks per
  cycle
- newly discovered conversations are caught up from history instead of seeded
  past the latest message
- active conversations stay hot at 5 seconds, then quiet conversations back off
  to 30 seconds and finally 60 seconds
- large-workspace caveat remains: full catalog pass time depends on Slack
  pagination and provider budgets, with bot Socket Mode remaining the immediate
  event lane where permissions allow it

Validation completed:

- `go test ./...`
- `./scripts/package-release.sh`
- scheduler unit tests for catalog pagination, due queue ordering/limits, and
  newly discovered catch-up emission
