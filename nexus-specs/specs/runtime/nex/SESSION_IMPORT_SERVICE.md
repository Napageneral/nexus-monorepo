# NEX Session Import Service

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-12  
**Related:** NEX.md, DAEMON.md, BUS_ARCHITECTURE.md, ADAPTER_SYSTEM.md

---

## Overview

This spec defines the NEX-native session import architecture after Gateway removal.

`aix` ingestion is modeled as an **import adapter**:

1. Same operational patterns as adapters (monitoring, backfill/tail lifecycle, supervision).
2. Different sink and side effects (writes to Agents Ledger import path, not normal inbound event pipeline).

---

## Locked Decisions

1. **Gateway is out of scope**. Treat this as a fresh NEX repo with no gateway dependency for import.
2. **IPC is required** for AIX ingestion because NEX runtime (TypeScript) and AIX parsers (Go) are separate processes.
3. **NEX initiates AIX ingestion**. NEX owns the lifecycle and invokes AIX worker process via local IPC.
4. **Execution model**:
   - `tail` imports are synchronous requests
   - `backfill` imports are asynchronous jobs
5. **Auth model**: no token auth for this path; rely on locality and process ownership.
6. **Persona** remains optional; NEX resolves default persona when omitted.
7. **No proactive throughput caps**. Do not impose business caps up front; optimize and constrain only from empirical evidence.
8. **AIX import path is not a normal NexusEvent delivery path**. It uses import service writes; optional audit events are separate.
9. **Primary IPC transport is stdio JSONL v1** between NEX daemon and AIX worker; protocol remains transport-agnostic for future UDS support.

---

## Goals

1. NEX owns import behavior, idempotency, and persistence contracts.
2. AIX worker is supervised by NEX with adapter-like lifecycle controls.
3. Backfill and tail flows are first-class in NEX runtime.
4. Import semantics remain parity-safe with current `sessions.import` behavior.
5. Architecture supports complete Gateway removal.

---

## Non-Goals

1. Redesigning AIX source schemas.
2. Replacing SQLite-ledger storage.
3. Routing imported historical turns through identity/access/agent-response side effects.
4. Adding speculative throughput caps before observed need.

---

## Baseline Behavior to Preserve

### Import semantics

1. Request-level idempotency by `idempotencyKey`.
2. Request hash mismatch under same key is rejected.
3. Per-item savepoint isolation (single item failures do not abort batch).
4. Item dedupe by `(source, sourceProvider, sourceSessionId, fingerprint)`.
5. Fingerprint unchanged -> `skipped`; changed -> `upserted`.

### Chunk semantics

1. Chunk staging by `(source, upload_id, chunk_index)`.
2. Chunk metadata consistency checks.
3. Reassembly + validation before import.
4. TTL pruning for staged chunk rows.

### Persistence tables

1. `session_imports`
2. `session_import_requests`
3. `session_import_chunk_parts`
4. Existing sessions/turns/messages/tool_calls upsert path

---

## Target Architecture

```
NEX Daemon
  ├─ Import Adapter Orchestrator (aix)
  │    ├─ backfill job scheduler (async)
  │    └─ tail loop runner (sync)
  ├─ Local IPC Transport (NEX <-> aix worker)
  ├─ Session Import Service (domain logic + idempotency + chunking)
  └─ Agents Ledger writes

aix worker process (Go)
  ├─ parse source sessions
  └─ emit import payload batches/chunks over IPC
```

### Ownership model

1. NEX owns orchestration and write semantics.
2. AIX worker owns source parsing/extraction.
3. IPC carries import payloads only; it is not a Gateway RPC surface.

---

## Import Adapter Model (AIX Class)

`aix` is treated as a dedicated adapter class with adapter-like operations:

1. `backfill` operation: async job initiated by NEX.
2. `tail` operation: long-running sync ingestion loop initiated by NEX.
3. `health` operation: process/liveness and lag metrics.
4. `stop/restart` operation: supervised lifecycle.

Differences from normal channel adapters:

1. Output target is Session Import Service, not `processEvent(NexusEvent)`.
2. Side effects are session graph writes, not inbound message handling.
3. No delivery/send/stream behavior.

---

## IPC Contract

Primary IPC model: local process IPC between NEX and AIX worker.

Initial protocol constraints:

1. Structured JSON messages only.
2. Import payload includes existing fields (`source`, `mode`, `runId?`, `personaId?`, `idempotencyKey`, `items[]`).
3. Chunk payload includes existing chunk fields (`uploadId`, `chunkIndex`, `chunkTotal`, `encoding`, `data`, and source identity fields).

Transport profile:

1. Primary transport: `stdio` JSONL.
2. Future transport: UDS is allowed if protocol framing remains equivalent.
3. No Gateway RPC compatibility is required.

## IPC Protocol v1 (Normative)

Frame envelope:

```ts
{
  type: string,
  runId: string,
  seq?: number,
  payload?: Record<string, unknown>
}
```

NEX -> AIX control frames:

1. `run.start`
   - payload: `{ mode: "tail" | "backfill", source: "aix", personaId?: string }`
2. `run.stop`
   - payload: `{ reason?: string }`
3. `health.probe`

AIX -> NEX frames:

1. `import.batch`
   - payload: service-level import request body (minus envelope fields)
2. `import.chunk`
   - payload: service-level chunk request body (minus envelope fields)
3. `run.progress`
   - payload: `{ imported: number, upserted: number, skipped: number, failed: number }`
4. `run.complete`
   - payload: final aggregate result
5. `run.error`
   - payload: `{ code: string, message: string, retryable?: boolean }`
6. `health.status`
   - payload: `{ connected: boolean, lastEventAt?: number, details?: Record<string, unknown> }`

Delivery semantics:

1. IPC frames are at-least-once from AIX worker perspective.
2. NEX import idempotency guarantees dedupe safety for repeated frames.
3. NEX treats `run.complete` and `run.error` as terminal states.

---

## Component Design

### 1) NEX import domain module

Create a dedicated NEX module:

1. `src/nex/import/types.ts`
2. `src/nex/import/service.ts`
3. `src/nex/import/validation.ts`

Responsibilities:

1. Parse/normalize import inputs.
2. Enforce idempotency and hash consistency.
3. Perform chunk staging/reassembly.
4. Execute session graph upserts.
5. Return canonical import result payload.

### 2) NEX orchestration layer

Add import orchestration to NEX daemon/runtime:

1. `startAixTailImport()` for sync tail loop
2. `enqueueAixBackfill()` for async backfill jobs
3. `stopAixImport()` and restart control

Responsibilities:

1. Spawn/supervise AIX worker process.
2. Route IPC frames to Session Import Service methods.
3. Track run state and emit bus events.

### 3) Control surface (MVP)

1. No externally exposed import RPC surface is required for MVP.
2. Operator controls (start/stop/status) are provided through local NEX runtime/CLI integration.
3. Import data path remains NEX-initiated IPC only.

---

## API Contract (Service-Level)

### Request: import

```ts
{
  source: "aix",
  runId?: string,
  mode: "backfill" | "tail",
  personaId?: string,
  idempotencyKey: string,
  items: ImportSessionItem[]
}
```

### Request: chunk

```ts
{
  source: "aix",
  runId?: string,
  mode: "backfill" | "tail",
  personaId?: string,
  idempotencyKey: string,
  uploadId: string,
  chunkIndex: number,
  chunkTotal: number,
  encoding: "gzip+base64",
  data: string,
  sourceProvider: string,
  sourceSessionId: string,
  sourceSessionFingerprint: string
}
```

### Response shape

1. `ok`
2. `runId`
3. aggregate counters: `imported`, `upserted`, `skipped`, `failed`
4. per-item results (`status`, `reason?`)
5. chunk status: `staged` or `completed`

## Error Taxonomy (Service Contract)

Service errors should use stable machine-readable codes:

1. `idempotency_key_source_mismatch`
2. `idempotency_key_mode_mismatch`
3. `idempotency_key_payload_mismatch`
4. `chunk_upload_id_required`
5. `chunk_index_out_of_range`
6. `chunk_total_mismatch`
7. `chunk_mode_mismatch`
8. `chunk_idempotency_key_mismatch`
9. `chunk_encoding_mismatch`
10. `chunk_item_source_provider_mismatch`
11. `chunk_item_source_session_id_mismatch`
12. `chunk_item_source_session_fingerprint_mismatch`
13. `chunk_payload_decode_failed`
14. `chunk_payload_json_invalid`

Contract requirements:

1. Keep code values stable across minor releases.
2. Preserve per-item failure reason reporting in import results.
3. Emit error code in logs and bus events.

---

## Auth and Locality Model

This path is locality-trusted and NEX-initiated:

1. No token auth is required for NEX <-> AIX IPC.
2. Access is constrained by local process ownership and filesystem permissions.
3. No externally exposed import RPC endpoint is required for this architecture.

---

## Runtime and Reliability Model

### Execution and scheduling

1. Tail ingestion is synchronous and continuous.
2. Backfill ingestion runs as asynchronous jobs.
3. Backfill and tail state are tracked separately.
4. Tail and backfill may overlap; idempotency semantics must make overlap safe.

### Backfill Job Model (Normative)

Backfill jobs have explicit lifecycle states:

1. `queued`
2. `running`
3. `completed`
4. `failed`
5. `cancelled`

Job model rules:

1. At most one active backfill job per source scope at a time.
2. Tail ingestion does not require backfill completion to remain active.
3. Job status and summary counters are persisted for observability and replay analysis.
4. Job retries are safe because idempotency is request-based.

Backfill job persistence schema (required):

1. Persist jobs in `nexus.db` (runtime domain), not in import payload source stores.
2. Minimum fields:
   - `id` (primary key)
   - `source`
   - `mode` (`backfill`)
   - `status` (`queued|running|completed|failed|cancelled`)
   - `requested_at`
   - `started_at`
   - `completed_at`
   - `error_code`
   - `error_message`
   - `stats_json` (aggregate counts/progress metadata)

### Concurrency policy

1. No proactive business throughput caps are imposed initially.
2. Avoid speculative limits on batch size/item count.
3. Add constraints only from observed performance or stability failures.

### Safety floor (non-business limits)

1. Keep protocol validity checks.
2. Preserve transactional savepoint behavior.
3. Preserve chunk integrity checks.
4. Preserve crash-safe staging and retry semantics.

---

## Event Ledger Relationship

Default behavior:

1. AIX import writes to Agents Ledger through Session Import Service.
2. Imported turns are not fed through the normal inbound NexusEvent pipeline.

Optional future:

1. Emit audit/telemetry events about import runs to Events/Nexus ledgers.
2. Do not replay imported turns as live inbound events unless explicitly designed as a separate mode.

---

## Migration Plan (Gateway-Free)

### Phase 0: Extract and stabilize import service

1. Move session import/chunk logic into NEX import module.
2. Keep behavior parity with current semantics.
3. Remove gateway ownership assumptions from this path.

Exit criteria:

1. Existing import fixtures pass with identical status outcomes.
2. Idempotency and chunk semantics unchanged.

### Phase 1: Add AIX import adapter orchestration

1. Add NEX-managed AIX worker lifecycle.
2. Implement IPC frame handling to import service.
3. Add tail sync runner and backfill job queue.

Exit criteria:

1. NEX can launch/stop/restart AIX import worker.
2. Tail sync and backfill both execute through NEX orchestration.

### Phase 2: Burn-in and parity verification

1. Run real backfill then tail continuously.
2. Validate row-level parity and lineage integrity.
3. Fix observed mismatches only.

Exit criteria:

1. Stable tail behavior.
2. Parity checks meet acceptance thresholds.

---

## Test Strategy

### Unit tests

1. Idempotency mismatch/rehit behavior.
2. Chunk ordering, mismatch, and reassembly.
3. Fingerprint unchanged/changed status outcomes.
4. Parent-child and subagent lineage reconstruction.

### Integration tests

1. NEX-managed AIX worker IPC import into real agents ledger.
2. Backfill job execution and status tracking.
3. Tail sync loop with repeated incremental imports.

### Parity tests

1. Coverage by source/provider.
2. Message and tool-call count parity.
3. Parent session/turn/spawn lineage parity.

---

## Rollback Strategy

1. Disable AIX import adapter orchestration flag if regressions occur.
2. Keep import service module intact for deterministic replay in test environments.
3. Avoid schema rollback; use forward fixes and replay.

---

## Security Considerations

1. IPC payload is still untrusted input and must be validated.
2. Error responses/logs must avoid secret/config leakage.
3. Locality-only trust assumes same-user process boundary.
4. Audit trail of import runs should be retained.

---

## Acceptance Criteria

This spec is complete when:

1. NEX owns and runs session import/chunk logic (no gateway dependency).
2. AIX ingestion is managed as NEX import adapter lifecycle (tail sync + async backfill).
3. IPC path is stable under burn-in.
4. Data integrity/parity checks pass against existing baseline.
5. Persona remains optional with deterministic default resolution.

## Validation Checklist

Validation timestamp: 2026-02-12

1. Gateway-free ownership is explicit and normative. `PASS`
2. IPC requirement and primary transport are explicit (`stdio` JSONL v1). `PASS`
3. Tail sync + backfill async execution model is explicit. `PASS`
4. No-token locality auth model is explicit. `PASS`
5. Persona optional/default-resolution behavior is explicit. `PASS`
6. No proactive caps policy is explicit. `PASS`
7. Import adapter differs from normal NexusEvent adapter path. `PASS`
8. Error taxonomy and service contracts are defined. `PASS`
9. Acceptance criteria map to implementation phases. `PASS`
