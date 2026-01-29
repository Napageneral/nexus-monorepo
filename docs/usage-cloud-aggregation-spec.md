# Nexus Usage Cloud Aggregation Spec (Draft)

This spec defines the anonymized usage event schema and the local upload
batching mechanism. It is designed to preserve ordering while minimizing
privacy risk.

## Goals

- Aggregate usage patterns across users without storing PII.
- Preserve event order within a session.
- Allow local-only operation by default (opt-in for upload).
- Support backfill from local event logs.

## Non-Goals

- Rich content capture (no args, no file paths).
- Per-user personalization in the cloud.
- Any biometric, location, or personal identifiers.

## Anonymization Model

### Identifiers

- `anon_user_id`: stable random UUID stored locally.
- `anon_session_id`: SHA-256 of `(anon_salt + session_id)`.
- `anon_salt`: local-only random secret. Never uploaded.

### Data Removed

- Command arguments
- File paths
- Freeform text
- Secrets or tokens

### Allowed Fields

- `command_path` (e.g., `status`, `skills search`)
- `tool_name` (e.g., `run_terminal_cmd`)
- `event_type`, `source`, `seq`, `ts`
- `invocation_kind` (optional)

## Upload Event Schema (JSON)

```json
{
  "schema_version": 1,
  "anon_user_id": "uuid",
  "anon_session_id": "sha256",
  "ts": 1712345678901,
  "seq": 12,
  "source": "nexus_cli",
  "event_type": "command_finished",
  "command_path": "status",
  "tool_name": "run_terminal_cmd",
  "tool_phase": "start",
  "invocation_kind": "node_dist",
  "status": "ok"
}
```

## Batch Schema (JSON)

```json
{
  "batch_id": "uuid",
  "generated_at": 1712345680000,
  "schema_version": 1,
  "anon_user_id": "uuid",
  "events": [ ... ]
}
```

## Upload Pipeline (Local)

1. Read `~/nexus/state/events/*.jsonl`
2. Filter to allowed event types:
   - `command_started|finished|failed`
   - `agent_event` with `stream=tool` and `phase=start`
3. Transform into upload events:
   - anonymize `session_id`
   - drop args and freeform content
4. Write to outbox:
   - `~/nexus/state/events-outbox/usage-batch-<ts>-<id>.json`
5. Upload outbox file to cloud endpoint

### Cursor State

An upload state file tracks the last processed event:

```
~/nexus/state/usage/upload-state.json
```

Fields:
- `cursor_ts`
- `cursor_id`
- `anon_id`
- `anon_salt`

## Configuration

Environment variables:

- `NEXUS_USAGE_UPLOAD_URL` (required to upload)
- `NEXUS_USAGE_UPLOAD_TOKEN` (optional bearer token)
- `NEXUS_USAGE_OUTBOX_DIR` (optional override)

Disable upload:
- Do not set `NEXUS_USAGE_UPLOAD_URL`

Disable event log entirely:
- `NEXUS_EVENT_LOG=0`

## CLI Surface

```
nexus usage upload --dry-run --json
nexus usage upload --limit 500
nexus usage upload --only-flush
```

## Server Requirements

The upload endpoint should:
- accept JSON batches
- validate schema_version
- respond 2xx on success

## Privacy Notes

- `anon_user_id` is local-only and never reversible.
- `anon_session_id` is salted; a single session cannot be linked across devices.
- If the user opts out, the outbox remains empty.
