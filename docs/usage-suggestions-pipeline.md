# Nexus Usage Event Log + Suggestions (Local Spec)

This document captures the local ingestion, analysis, and suggestion pipeline
for Nexus CLI usage. The goal is to make the system concrete and testable
locally before any cloud aggregation.

## Goals

- Persist ordered usage events for every Nexus CLI invocation.
- Track tool and skill usage from agent event streams.
- Provide deterministic, local suggestions based on real sequences.
- Keep the system simple to backfill and audit.

## Non-Goals (for now)

- Cloud aggregation or anonymization.
- ML-driven recommendation models.
- Cross-device sync of usage data.

## Data Sources

### CLI Events (Nexus Core)

Captured by the CLI entrypoint and command hooks:
- `cli_session_start`
- `command_started`
- `command_finished`
- `command_failed`
- `cli_session_end`

### Agent Tool/Skill Events

Agent tool lifecycle events are persisted via the existing `emitAgentEvent`
stream and a log listener.

## Storage (Local)

Events are written as JSONL in the Nexus state directory:

```
~/nexus/state/events/events-YYYY-MM-DD.jsonl
```

Configuration:
- `NEXUS_EVENT_LOG=0|false|off` disables event logging
- `NEXUS_EVENT_LOG_DIR=/custom/path` overrides the event log directory

## Event Schema (JSONL)

Each line is a single JSON object. Minimal shape:

```json
{
  "id": "uuid",
  "ts": 1712345678901,
  "seq": 12,
  "session_id": "uuid",
  "source": "nexus_cli",
  "event_type": "command_finished",
  "command_path": "status",
  "argv": ["nexus", "status", "--json"],
  "cwd": "/Users/tyler/nexus",
  "status": "ok",
  "data": { "version": "2026.1.5-3" },
  "schema_version": 1
}
```

Notes:
- `seq` is monotonic per session.
- `session_id` groups all events for a single CLI run.
- `argv` is sanitized (sensitive flags are redacted).

## Analysis Pipeline (Local)

We use an n-gram style transition table built from ordered events.

### Key Extraction

- CLI usage key: `source:cli:<command_path>`
- Tool usage key: `source:tool:<tool_name>` from agent tool stream

### Transition Table

For each session sequence:
```
key[i] -> key[i+1] (count)
```

### Ranking

Scores are proportional to transition frequency:
```
score = count / total_transitions_from_last_key
```

### Fallbacks

If no transitions exist for the last key, fall back to global top keys
by frequency.

## Suggestion Scope

- **global**: use all local sessions (default)
- **session**: restrict to a specific session

## Surfaces (Current)

- `nexus suggestions` CLI command with JSON output

Potential future surfaces:
- Inline suggestion after command completion
- Suggestions in `nexus status`

## Comms Import (Optional Consumer)

The Comms adapter can import `~/nexus/state/events/*.jsonl` into
`comms.events` for analysis or cross-source correlation.

## Next Steps

- Add `invocation_kind` (direct vs wrapper vs cargo) if needed.
- Add richer tool/skill metadata in `data` for better ranking.
- Add optional gating on `status` (only successful commands).

See `docs/usage-cloud-aggregation-spec.md` for the cloud schema and upload plan.
