# Slack OpenClaw Interaction And Efficient Sync

**Status:** IMPLEMENTED
**Last Updated:** 2026-05-01

## Purpose

This spec captures the Slack-specific follow-up from the OpenClaw comparison.
Nex should keep its durable adapter package and cursor model, then carry over
the OpenClaw patterns that improve Slack responsiveness and native interaction
quality.

## Source Comparison

OpenClaw's Slack monitor is event-first. It subscribes to Slack Socket Mode or
HTTP Events API surfaces for messages, app mentions, channel lifecycle events,
member lifecycle events, reactions, pins, interactive block actions, modal
lifecycle events, and slash commands.

OpenClaw does not use `conversations.list` as the steady-state live discovery
loop. It uses catalog reads mostly for setup, directory, and allowlist
resolution. New active conversations become visible quickly because Slack sends
events for conversations the bot app can see.

Nex Slack has a stronger user-token archival lane. User-token mode can read the
full conversation set visible to the user token and import full historical
records with richer Slack message fidelity. That lane must remain durable and
full-fidelity, but it should not require a broad history sweep on every poll.

## Target Sync Model

Nex Slack uses two complementary live lanes.

### Bot Event Lane

Bot mode is the low-latency collaboration lane.

- Socket Mode events create or update active conversation catalog entries.
- New messages, mentions, interactions, reactions, pins, edits, and deletes are
  handled directly from Slack events.
- New active conversations should appear within seconds when the bot app is
  subscribed and permitted to receive the event.
- This lane is provider-event-first and does not rely on workspace catalog
  polling for responsiveness.

### User-Token Read Lane

User-token mode is the full-fidelity read and repair lane.

- `conversations.list` runs as a lightweight catalog scheduler.
- The catalog scheduler runs frequently enough that small and medium workspaces
  discover new readable conversations within roughly 5-10 seconds.
- Catalog discovery is decoupled from history reads.
- History reads run from a per-conversation priority queue with explicit API
  budgets.
- Durable per-conversation cursors are advanced only after emitted records
  succeed.
- Newly discovered conversations are caught up through history reads rather
  than being silently seeded past their latest message.
- Quiet conversations back off, but remain periodically checked so full
  fidelity is preserved without a broad every-cycle history sweep.
- Thread reply reads are bounded and driven by thread roots returned by history
  pages.

The user-token lane can never guarantee 5-10 second discovery for arbitrarily
large paginated workspaces without exceeding provider budgets. For those
workspaces, the adapter should keep a continuous catalog crawl and rely on the
bot event lane for immediate active-conversation visibility wherever Slack
permissions allow it.

## OpenClaw Interaction Carryovers

Nex Slack should adopt these OpenClaw-inspired capabilities:

1. Interactive reply authoring
   - Agents can express simple options as compact text or explicit structured
     input.
   - The adapter compiles those options into `slack.send.components` buttons or
     selects.
   - Explicit components remain the source of truth for advanced controls.

2. Better interaction feedback
   - Unauthorized or expired controls respond ephemerally.
   - Accepted controls may respond ephemerally with a short confirmation.
   - Non-reusable controls may update the source Slack message to remove or
     replace the completed action row.

3. Approval wiring
   - Slack buttons can carry approval action metadata.
   - The adapter emits accepted or denied interaction records with enough
     metadata for the Nex runtime to resolve approvals, jobs, or agent actions.
   - Runtime approval resolution remains outside the adapter.

4. Richer input parsing
   - Slack button, select, and modal payloads preserve selected users,
     channels, conversations, date, time, number, email, URL, and rich-text
     summaries where Slack supplies them.
   - Existing plain-text modal submission behavior remains compatible.

5. Slash command and argument menu boundary
   - Slash commands are a broader Nex command-gateway decision.
   - The Slack adapter should not invent a Slack-only command runtime.
   - A future command gateway can use the same component, approval, and
     interaction-record surfaces introduced here.

## Validation

Validation must cover:

- unit tests for catalog/history scheduler behavior
- unit tests for interactive authoring compilation
- unit tests for accepted and denied interaction feedback
- unit tests for richer input metadata parsing
- package rebuild and method catalog projection
- cleanroom or live Slack proof for at least one button/select/modal flow
- restart proof that durable interaction state and live-sync intent survive
  runtime restart

Completed validation on 2026-05-01:

- `go test ./...` in the Slack adapter package
- `./scripts/package-release.sh`
- `nexus adapters packages methods slack --json` confirms
  `choice_action_id`, `choices`, `approval_id`, and `approval_decision` in the
  package method catalog
- live Slack agent-use proof through connection `vrtly-slack`: sent a compact
  `components.choices` prompt, clicked `Approve` in Slack Desktop, observed
  source-message cleanup plus ephemeral `Recorded.`, and verified Nex ingested
  the accepted interaction record with approval metadata
