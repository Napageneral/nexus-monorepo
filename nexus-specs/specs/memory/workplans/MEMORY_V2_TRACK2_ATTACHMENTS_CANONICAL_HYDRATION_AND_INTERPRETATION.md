# MEMORY V2 Track 2: Attachments Canonical Hydration and Interpretation

## Status
Ready for implementation

## Objective
Make attachments reliably available to the memory writer/consolidator by hard-cutting episode hydration to the normalized `attachments` table, while keeping attachments colocated inside each event object in agent payloads.

## Customer Experience Goal
1. When reviewing a retain payload, each event visibly includes its attachments in-place.
2. Attachments from historical data are always present to the agent.
3. Facts/entities are extracted from event content + attachments, never metadata.

## Hard Cutover Principle
No compatibility mode for memory pipeline reads.
- Canonical source for episode attachment hydration is `events.db.attachments`.
- `events.attachments` is not trusted as the canonical read path for retain/backfill.

## Current Problem
Two attachment representations exist:
1. `events.attachments` (inline JSON array)
2. `attachments` (normalized table)

Runtime data is divergent:
- Most historical events have rows in `attachments` but empty `events.attachments`.
- Retain/live + backfill currently read `events.attachments`, so writer payloads miss most attachments.

## Decisions
1. **Canonical read path** for episode hydration: `attachments` table.
2. **Payload shape**: attachments stay colocated under each event (`event.attachments[]`).
3. **Terminology**: only `attachments` (no `artifacts` language in memory payloads).
4. **Extraction rule**: content + attachments only; metadata is context/disambiguation only.

## Contract: Episode Event Attachments (Writer Payload)
Each event includes:
```json
{
  "event_id": "...",
  "sender_id": "...",
  "datetime_local": "...",
  "content": { "type": "text", "value": "..." },
  "reply_to_event_id": "...",
  "attachments": [
    {
      "id": "...",
      "filename": "...",
      "mime_type": "...",
      "media_type": "image|video|audio|document|file",
      "size_bytes": 12345,
      "local_path": "...",
      "url": "...",
      "metadata": {}
    }
  ]
}
```

## Interpretation Data Model (Track 2 phase)
Add a separate table for attachment interpretations:

```sql
CREATE TABLE IF NOT EXISTS attachment_interpretations (
  attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  interpretation_text TEXT NOT NULL,
  interpretation_model TEXT,
  interpretation_status TEXT NOT NULL, -- pending|success|failed|skipped
  updated_at INTEGER NOT NULL
);
```

Design intent:
- Runtime autofills `attachment_id`, `interpretation_model`, `interpretation_status`, `updated_at`.
- Agent-facing write surface only needs `interpretation_text` (plus target attachment).

## Implementation Plan

### Phase A (immediate, required before further memory validation)
1. Update retain live/backfill event queries to hydrate attachments from normalized `attachments` table.
2. Preserve attachments in retain episode payload parsing (writer automation parser must not drop them).
3. Keep attachments colocated under each event in payload JSON.

### Phase B
1. Add `attachment_interpretations` table + schema bootstrap.
2. Add write/read API surface for interpretation text.
3. Update writer/consolidator role/task guidance to inspect attachments and persist interpretation when useful.

### Phase C (hard reliability cutover for real runtime)
1. Stage out-of-sandbox attachment files into writer sandbox workspace before retain dispatch payload assembly.
2. Rewrite attachment `local_path` to sandbox-relative path (`media/inbound-memory/...`) for tool compatibility.
3. Strip `local_path` from payload when source file cannot be staged (avoid guaranteed tool failures on impossible paths).
4. Emit staging counters in retain logs for QA (`staged`, `stripped`).

## Files in Phase A
- `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-live.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/memory-backfill-cli.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.ts`
- tests:
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-live.test.ts`
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.test.ts`

## Validation Plan (Phase A)
1. Unit test: event with empty `events.attachments` but populated `attachments` rows is hydrated with attachments in episode output.
2. Unit test: writer retain parser preserves `event.attachments` in task payload.
3. DB validation query after run:
   - count events with attachment rows vs payload-visible attachments for sampled episodes.
4. Backfill smoke run and inspect at least one attachment-heavy episode payload in `agents.db`.

## Acceptance Criteria (Phase A)
1. Attachment-heavy historical episodes show attachments in writer payloads.
2. No attachment loss between `loadEpisodesForTrigger`/backfill and writer task payload.
3. Existing retain behavior remains functional.

## Acceptance Criteria (Phase C)
1. Writer no longer receives absolute host paths that escape sandbox root.
2. Runtime logs do not show `Path escapes sandbox root` errors for staged attachments.
3. Attachment tool calls operate on sandbox-local paths when source files exist.
4. Missing/unreadable attachment files fail cleanly via stripped `local_path` (no repeated sandbox-path tool failures).
