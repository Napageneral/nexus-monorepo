# Workstream 2 Handoff: AIX -> NEX Unified Session Ingestion

**Status:** READY FOR HANDOFF  
**Last Updated:** 2026-02-11  
**Related:** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/runtime/ui/COMMAND_CENTER.md`

---

## Objective

Deliver a reliable ingestion path so external harness history (Cursor, Codex, Claude Code, etc.) lands in the **NEX unified session plane** and becomes visible/resumable in Command Center.

Core intent:
1. Command Center session view is ledger-backed.
2. AIX is an ingestion adapter, not a second source of truth for UI.
3. Imported sessions feel native in `nex` chat UX.

---

## Architecture Decision (Locked)

1. **Agents Ledger is source of truth** for Command Center sessions.
2. **NEX owns ledger writes** and data invariants.
3. **AIX does not write Agents Ledger directly**; it calls NEX ingestion API.
4. `sessions.import` is the ingestion boundary for backfill + tail sync.

Rationale:
1. Single write authority reduces split-brain and schema drift.
2. NEX can enforce identity/session aliasing and routing invariants centrally.
3. AIX can evolve parsers independently while keeping an explicit contract.

---

## Current State Snapshot

## AIX capabilities (good baseline)

1. Multi-source parsers exist for Cursor/Codex/Claude Code/Claude/OpenCode/Nexus.
2. Incremental sync exists (Cursor rowid watermarks via `sync_state`).
3. Live tail mode exists (`aix live`) for continuous Cursor updates.
4. Strong lineage fields already modeled:
   - session parent/child
   - tool call child-session linkage
   - turn parent pointers

Reference files:
1. `/Users/tyler/nexus/home/projects/aix/cmd/aix/main.go`
2. `/Users/tyler/nexus/home/projects/aix/internal/sync/cursor_db.go`
3. `/Users/tyler/nexus/home/projects/aix/internal/db/db.go`
4. `/Users/tyler/nexus/home/projects/aix/internal/models/session.go`
5. `/Users/tyler/nexus/home/projects/aix/internal/models/tool_call.go`
6. `/Users/tyler/nexus/home/projects/aix/internal/models/turn.go`

## NEX capabilities

1. Agents Ledger schema has required core tables:
   - `sessions`, `turns`, `threads`, `messages`, `tool_calls`, `session_aliases`, `session_history`.
2. No `sessions.import` gateway method exists yet.
3. Runtime still has hybrid file-store/transcript paths in many areas; workstream 1 is handling migration.

Reference files:
1. `/Users/tyler/nexus/home/projects/nexus/nex/src/db/agents.ts`
2. `/Users/tyler/nexus/home/projects/nexus/nex/src/gateway/server-methods/sessions.ts`
3. `/Users/tyler/nexus/home/projects/nexus/nex/src/gateway/server-methods-list.ts`

---

## Workstream Scope

## In scope

1. Define and implement `sessions.import` contract.
2. Implement idempotent backfill + tail ingestion semantics.
3. Preserve lineage fidelity from AIX payload into NEX session plane.
4. Ensure imported sessions appear in standard `sessions.list`/chat flows.
5. Add provenance fields and diagnostics for imported data.

## Out of scope

1. Browser multi-select context injection UX.
2. Desktop packaging decisions.
3. Replacing all runtime file-store codepaths (handled in workstream 1).

---

## Proposed Ingestion Contract

## Method

`sessions.import`

## Transport

Start with JSON payload over existing Gateway WS RPC (batch-friendly).  
Optional file-path ingestion can be added later.

## Request shape (draft)

```ts
type SessionsImportRequest = {
  source: "aix";
  runId?: string;                 // ingestion run correlation id
  mode: "backfill" | "tail";
  idempotencyKey: string;         // request-level dedupe key
  items: ImportSessionItem[];     // bounded batch
};

type ImportSessionItem = {
  sourceProvider: string;         // "cursor" | "codex" | "claude-code" | ...
  sourceSessionId: string;
  sourceSessionFingerprint: string; // stable content hash from AIX side
  importedAtMs: number;

  session: {
    labelHint?: string;           // optional preferred label
    createdAtMs?: number;
    updatedAtMs?: number;
    model?: string;
    provider?: string;
    workspacePath?: string;
    project?: string;
    isSubagent?: boolean;
    parentSourceSessionId?: string;
    parentSourceMessageId?: string;
    spawnToolCallId?: string;
    taskDescription?: string;
    taskStatus?: string;
    metadata?: Record<string, unknown>;
  };

  turns: Array<{
    sourceTurnId: string;
    parentSourceTurnId?: string;
    startedAtMs: number;
    completedAtMs?: number;
    model?: string;
    provider?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    responseMessageSourceId?: string;
    queryMessageSourceIds?: string[];
    metadata?: Record<string, unknown>;
  }>;

  messages: Array<{
    sourceMessageId: string;
    sourceTurnId?: string;
    role: "user" | "assistant" | "system" | "tool";
    content?: string;
    sequence: number;
    createdAtMs: number;
    thinking?: string;
    contextJson?: unknown;
    metadataJson?: unknown;
  }>;

  toolCalls?: Array<{
    sourceToolCallId: string;
    sourceTurnId?: string;
    sourceMessageId?: string;
    toolName: string;
    toolNumber?: number;
    paramsJson?: unknown;
    resultJson?: unknown;
    status?: "pending" | "running" | "completed" | "failed";
    spawnedSourceSessionId?: string;
    startedAtMs: number;
    completedAtMs?: number;
    sequence: number;
    error?: string;
  }>;
};
```

## Response shape (draft)

```ts
type SessionsImportResponse = {
  ok: true;
  runId: string;
  imported: number;
  upserted: number;
  skipped: number;
  failed: number;
  results: Array<{
    sourceProvider: string;
    sourceSessionId: string;
    sessionLabel?: string;
    status: "imported" | "upserted" | "skipped" | "failed";
    reason?: string;
  }>;
};
```

---

## Idempotency Strategy

## Requirements

1. Replaying same backfill batch must not duplicate rows.
2. Tail sync retries must be safe.
3. Partial failures must allow rerun at item granularity.

## Recommended keys

1. Request-level: `idempotencyKey` on `sessions.import`.
2. Item-level: tuple `(source, sourceProvider, sourceSessionId, sourceSessionFingerprint)`.
3. Optional turn-level: `sourceTurnId` uniqueness within imported session.
4. Optional message-level/tool-level source ids persisted in metadata for reconciliation.

## Behavior

1. Same session id + same fingerprint => `skipped`.
2. Same session id + different fingerprint => `upserted` (incremental update).
3. Unknown session id => `imported`.

---

## Backfill + Tail Sync Model

## Backfill

1. AIX emits historical sessions in bounded batches.
2. NEX imports batches idempotently.
3. AIX records last successful export cursor per provider/source.

## Tail

1. AIX watches source-specific tails (already done for Cursor live mode).
2. AIX emits only changed/new sessions with updated fingerprint.
3. NEX applies idempotent upsert and returns per-item status.
4. AIX retries transient failures with jitter/backoff.

---

## Lineage Fidelity Requirements

Must preserve:
1. Session parent/child relationships (`is_subagent`, parent session/message, spawn tool call).
2. Turn parent chains.
3. Tool call -> spawned session linkage.
4. Message order and timestamps.

Acceptance rule:
Imported lineage must allow reconstructing same conversation topology as source harness.

---

## Mapping Notes (AIX -> NEX)

High-level mapping:
1. AIX `Session` -> NEX `sessions`
2. AIX `Turn` -> NEX `turns` + `threads`
3. AIX `Message` -> NEX `messages`
4. AIX `ToolCall` -> NEX `tool_calls`

Important:
1. Source IDs should be preserved in metadata/provenance fields for debug and reimport reconciliation.
2. `origin`/`origin_session_id` style fields should identify harness source cleanly.
3. Session label generation must be deterministic enough to avoid alias churn.

---

## Observability + Ops

Minimum telemetry:
1. Import throughput (sessions/sec)
2. `imported/upserted/skipped/failed` counts
3. Retry count and retry reasons
4. Tail lag (source event time vs import completion time)
5. Dedup hit rate

Operational artifacts:
1. Backfill runbook
2. Tail-sync runbook
3. Recovery runbook for poison payloads

---

## Test Plan (Must-Have)

1. Idempotency replay test: same batch twice => no duplicate data.
2. Incremental update test: same source session, changed fingerprint => update only changed records.
3. Partial failure test: one bad item does not block entire batch.
4. Lineage test: parent/child session and turn chains preserved.
5. Tail test: live updates from AIX appear in `sessions.list` and open in chat.
6. Mixed-provider test: Cursor + Codex + Claude Code ingestion in same run.

---

## Open Questions For Assignee

1. Exact storage location for source IDs/fingerprints in NEX ledger model.
2. Final session label/routing key generation for imported sessions.
3. Whether import applies directly to core ledger tables or to a staging table + merger job.
4. Whether `sessions.list` should expose provenance inline or behind optional flags.

---

## Suggested Execution Sequence

1. Finalize `sessions.import` schema + validation in Gateway protocol.
2. Implement minimal importer path (single item) with idempotency.
3. Add batch ingestion + per-item result reporting.
4. Add provenance fields to session listing output.
5. Wire AIX exporter client to call `sessions.import`.
6. Run backfill dry-run, then tail sync smoke tests.

---

## Handoff Checklist (for New Agent)

1. Confirm contract fields with NEX session/ledger owners.
2. Implement protocol schema + gateway handler + tests.
3. Implement idempotency storage/check logic.
4. Implement AIX export payload builder + gateway client call path.
5. Validate with real sample data from at least Cursor and Claude Code.
6. Document runbooks and known failure modes.

