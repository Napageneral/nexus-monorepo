# Phase 7 — Episode Detection & CronService Migration

**Status:** ACTIVE
**Created:** 2026-03-03
**Phase:** 7 (depends on Phase 5 for set creation helpers)
**Spec:** ../EPISODE_DETECTION.md, ../RETAIN_PIPELINE.md
**Primary Files:** `nex/src/cron/service.ts`, `nex/src/cron/store.ts`, `nex/src/cron/types.ts`, `nex/src/cron/service/*`, `nex/src/memory/retain-live.ts`, `nex/src/db/nexus.ts`

---

## Overview

This phase has two parts:

1. **CronService migration:** JSON file storage → SQLite `cron_jobs` table in runtime.db
2. **Episode detection:** Replace the `pending_retain_triggers` + polling model with per-episode cron timers that emit internal events

The CronService migration is a prerequisite for episode detection (episode timers create/update/delete cron jobs on every event — too much I/O for a JSON file).

---

## Current State

### CronService (`src/cron/`)

- **Storage:** JSON file at `~/.nexus/cron/jobs.json` via `loadCronStore()` / `saveCronStore()` in `cron/store.ts`
- **State:** `CronServiceState` holds an in-memory `CronStoreFile` (full job list cached in RAM)
- **Persistence:** `persist()` in `cron/service/store.ts` writes the entire store to JSON on every mutation
- **Timer loop:** `armTimer()` → `setTimeout` → `onTimer()` → `findDueJobs()` → `executeJobCore()`. `MAX_TIMER_DELAY_MS = 60_000`.
- **Execution:** Two payload kinds: `systemEvent` → `enqueueSystemEvent(text)`, `agentTurn` → `runIsolatedAgentJob()`
- **Crash recovery:** `runMissedJobs()` on startup finds jobs where `nextRunAtMs < now`, executes them
- **One-shot jobs:** `{ kind: "at", at: "ISO" }` with `deleteAfterRun: true` — auto-deleted on success
- **Disabled:** `cronEnabled = false` currently. Will need to be enabled.
- **CronService class** (`service.ts`): Thin wrapper exposing `start`, `stop`, `status`, `list`, `add`, `update`, `remove`, `run`, `wake`
- **No `get` method:** Only `findJobOrThrow` internally; no public "get job by ID" API

### Episode Detection (`src/memory/retain-live.ts`)

- **`queueRetainEvent()`:** Upserts a `pending_retain_triggers` row in nexus.db. Checks token budget — if exceeded, force-schedules by resetting `last_event_at`. Does NOT create sets or set_members. Does NOT interact with CronService.
- **`listDueRetainTriggers()`:** Queries `pending_retain_triggers WHERE last_event_at <= ?` — polling model.
- **`refreshRetainTriggerWindow()`:** Recalculates accumulation state by re-querying events. Used after a dispatch to reset the window.
- **`clearRetainTrigger()`:** Deletes a `pending_retain_triggers` row.
- **`loadEpisodesForTrigger()`:** Queries events for a trigger, groups into episodes. This is the batch grouping path.

### `pending_retain_triggers` Table (`src/db/nexus.ts`)

```sql
CREATE TABLE IF NOT EXISTS pending_retain_triggers (
    platform        TEXT NOT NULL,
    container_id    TEXT NOT NULL,
    thread_id       TEXT NOT NULL DEFAULT '',
    set_id          TEXT NOT NULL,
    first_event_at  INTEGER NOT NULL,
    last_event_at   INTEGER NOT NULL,
    token_estimate  INTEGER NOT NULL DEFAULT 0,
    event_count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(platform, container_id, thread_id)
);
```

CRUD functions: `upsertPendingRetainTrigger`, `setPendingRetainTrigger`, `getPendingRetainTrigger`, `listPendingRetainTriggers`, `deletePendingRetainTrigger`.

### Consumers of `pending_retain_triggers`

| File | Function | Usage |
|---|---|---|
| `memory/retain-live.ts` | `queueRetainEvent()` | Upserts trigger row |
| `memory/retain-live.ts` | `listDueRetainTriggers()` | Lists due triggers (polling) |
| `memory/retain-live.ts` | `clearRetainTrigger()` | Deletes trigger row |
| `memory/retain-live.ts` | `refreshRetainTriggerWindow()` | Recalculates trigger state |
| `cli/memory-retain-cli.ts` | CLI commands | Calls `listDueRetainTriggers`, `clearRetainTrigger`, `loadEpisodesForTrigger` |
| `nex/stages/acceptRequest.ts` | Comment only | References `queueRetainEvent` in a comment |
| `memory/retain-live.test.ts` | Tests | Tests `queueRetainEvent`, `listDueRetainTriggers`, `refreshRetainTriggerWindow` |

### CronServiceDeps (`src/cron/service/state.ts`)

```typescript
export type CronServiceDeps = {
  nowMs?: () => number;
  log: Logger;
  storePath: string;        // Path to JSON file — will be removed
  cronEnabled: boolean;
  enqueueSystemEvent: (text: string, opts?: { agentId?: string }) => void;
  runIsolatedAgentJob: (...) => Promise<{...}>;
  onEvent?: (evt: CronEvent) => void;
};
```

---

## Changes

### C1. Add `cron_jobs` table to runtime.db schema

**File:** `src/db/runtime.ts` (or wherever the runtime.db schema lives)

```sql
CREATE TABLE IF NOT EXISTS cron_jobs (
    id                  TEXT PRIMARY KEY,
    agent_id            TEXT,
    name                TEXT NOT NULL,
    description         TEXT,
    enabled             INTEGER NOT NULL DEFAULT 1,
    delete_after_run    INTEGER NOT NULL DEFAULT 0,
    created_at_ms       INTEGER NOT NULL,
    updated_at_ms       INTEGER NOT NULL,
    schedule_json       TEXT NOT NULL,
    session_target      TEXT NOT NULL DEFAULT 'main',
    wake_mode           TEXT NOT NULL DEFAULT 'queued',
    payload_json        TEXT NOT NULL,
    delivery_json       TEXT,
    next_run_at_ms      INTEGER,
    running_at_ms       INTEGER,
    last_run_at_ms      INTEGER,
    last_status         TEXT,
    last_error          TEXT,
    last_duration_ms    INTEGER,
    consecutive_errors  INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run
    ON cron_jobs(next_run_at_ms) WHERE enabled = 1 AND running_at_ms IS NULL;

CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent
    ON cron_jobs(agent_id) WHERE agent_id IS NOT NULL;
```

### C2. Rewrite `cron/store.ts` — SQLite backend

**Current:** `loadCronStore()` reads JSON file, `saveCronStore()` writes JSON file atomically.

**New:** Replace with SQLite CRUD functions:

- `loadAllJobs(db): CronJob[]` — `SELECT * FROM cron_jobs`, deserialize JSON columns
- `loadJob(db, id): CronJob | null` — single row lookup
- `insertJob(db, job: CronJob): void` — INSERT
- `updateJob(db, job: CronJob): void` — UPDATE by id
- `deleteJob(db, id): void` — DELETE by id
- `upsertJob(db, job: CronJob): void` — INSERT OR REPLACE (needed for episode timer upserts)

Serialization: `schedule_json = JSON.stringify(job.schedule)`, `payload_json = JSON.stringify(job.payload)`, `delivery_json = job.delivery ? JSON.stringify(job.delivery) : null`. State fields map 1:1 to columns.

**Migration helper:** On first startup, if `~/.nexus/cron/jobs.json` exists, read it, insert all jobs into the SQLite table, rename the JSON file to `jobs.json.migrated`.

### C3. Update `CronServiceState` and `CronServiceDeps`

**`CronServiceDeps` changes:**

```typescript
// Remove:
storePath: string;

// Add:
db: DatabaseSync;             // runtime.db handle
emitInternalEvent: (operation: string, data: Record<string, unknown>) => void;
```

**`CronServiceState` changes:**

```typescript
// Remove:
storeLoadedAtMs: number | null;
storeFileMtimeMs: number | null;

// The `store: CronStoreFile | null` field:
// Option A: Keep as in-memory cache, load from SQLite on start, sync on mutations.
// Option B: Remove entirely, query SQLite directly for each operation.
// Recommendation: Keep as cache for now — the timer loop reads the full job list
// frequently (findDueJobs, recomputeNextRuns). Cache is invalidated/refreshed
// on every mutation. This matches current behavior with minimal refactoring.
```

### C4. Update `cron/service/store.ts` — replace file I/O

**Current:** `ensureLoaded()` reads JSON file (with mtime check), `persist()` writes JSON file.

**New:**
- `ensureLoaded()` → loads all jobs from SQLite into `state.store` (only on first call or `forceReload`)
- `persist()` → no-op for bulk writes (individual mutations use the CRUD functions from C2)
- Individual operations (`add`, `update`, `remove`) call `insertJob`/`updateJob`/`deleteJob` directly

The large normalization logic in `ensureLoaded()` that handles legacy JSON formats can be significantly simplified — SQLite rows won't have legacy formatting issues (the migration in C2 normalizes on import).

### C5. Add `internalEvent` payload kind to `cron/types.ts`

**Current:** `CronPayload = systemEvent | agentTurn`

**New:**

```typescript
export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | { kind: "agentTurn"; message: string; model?: string; /* ... existing fields */ }
  | { kind: "internalEvent"; operation: string; data: Record<string, unknown> };
```

Also update `CronPayloadPatch`:

```typescript
export type CronPayloadPatch =
  | { kind: "systemEvent"; text?: string }
  | { kind: "agentTurn"; /* ... existing fields */ }
  | { kind: "internalEvent"; operation?: string; data?: Record<string, unknown> };
```

Remove `CronStoreFile` type (no longer needed — was the JSON file wrapper).

### C6. Add `internalEvent` execution path in `cron/service/timer.ts`

In `executeJobCore()`, add a third branch:

```typescript
if (job.payload.kind === "internalEvent") {
  const { operation, data } = job.payload;
  state.deps.emitInternalEvent(operation, data);
  return { status: "ok", summary: `emitted ${operation}` };
}
```

Also update `resolveJobPayloadTextForMain()` in `jobs.ts` to handle the new kind (return undefined — internal events don't produce text for the main session).

Update `assertSupportedJobSpec()` to accept `internalEvent` payloads for `main` session target.

### C7. Add `get` method to `CronService`

The episode detection inline path needs to look up a cron job by ID (to check if there's an active episode timer). The CronService currently has no public `get` method.

Add to `CronService`:

```typescript
async get(id: string): Promise<CronJob | null> {
  return await ops.get(this.state, id);
}
```

Add to `ops.ts`:

```typescript
export async function get(state: CronServiceState, id: string): Promise<CronJob | null> {
  return await locked(state, async () => {
    await ensureLoaded(state, { skipRecompute: true });
    return state.store?.jobs.find((j) => j.id === id) ?? null;
  });
}
```

### C8. Rewrite episode detection in `retain-live.ts`

This is the core change. Replace `queueRetainEvent` and the polling model with CronService-based episode management.

**New function: `slotEventIntoEpisode()`**

```typescript
export async function slotEventIntoEpisode(params: {
  memoryDb: DatabaseSync;
  cronService: CronService;
  event: QueueRetainEventInput;
  cfg?: RetainSchedulingConfig;
}): Promise<{ set_id: string; action: "created" | "appended" | "clipped_and_created" }> {
  const { memoryDb, cronService, event, cfg } = params;
  const { gapMs, episodeTokenBudget } = resolveRetainSchedulingConfig(cfg ?? {});
  const platform = event.platform || "unknown";
  const containerId = event.container_id;
  const threadId = event.thread_id || "";
  const cronJobId = `episode-timeout:${platform}:${containerId}:${threadId}`;
  const tokenEstimate = estimateTokenCountFromText(event.content || "");
  const now = Date.now();

  const existingJob = await cronService.get(cronJobId);

  if (!existingJob) {
    // No active episode — start one
    const setId = generateSetId();
    createOpenEpisodeSet(memoryDb, setId, { platform, containerId, threadId, tokenEstimate, eventCount: 1 });
    addSetMember(memoryDb, setId, "event", event.event_id, 1);
    await cronService.add({
      id: cronJobId, // deterministic ID for upsert
      name: "Episode timeout",
      enabled: true,
      deleteAfterRun: true,
      schedule: { kind: "at", at: new Date(now + gapMs).toISOString() },
      sessionTarget: "main",
      wakeMode: "now",
      payload: {
        kind: "internalEvent",
        operation: "episode.timeout",
        data: { set_id: setId, platform, container_id: containerId, thread_id: threadId },
      },
    });
    return { set_id: setId, action: "created" };
  }

  // Active episode exists
  const data = existingJob.payload.kind === "internalEvent" ? existingJob.payload.data : {};
  const setId = String(data.set_id || "");

  // Safety net: if timer is past due, clip the old episode first
  const scheduledAt = existingJob.schedule.kind === "at" ? new Date(existingJob.schedule.at).getTime() : Infinity;
  if (scheduledAt < now) {
    // Timer should have fired — clip old episode, start fresh
    await clipEpisode(memoryDb, setId);
    await cronService.remove(cronJobId);
    // Recurse to create new episode
    return slotEventIntoEpisode(params);
  }

  // Append to existing episode
  const setMeta = readSetMetadata(memoryDb, setId);
  const newTokenEstimate = (setMeta.token_estimate || 0) + tokenEstimate;
  const newEventCount = (setMeta.event_count || 0) + 1;
  addSetMember(memoryDb, setId, "event", event.event_id, newEventCount);
  updateSetMetadata(memoryDb, setId, { token_estimate: newTokenEstimate, event_count: newEventCount });

  if (newTokenEstimate >= episodeTokenBudget) {
    // Token budget exceeded — clip immediately
    await clipEpisode(memoryDb, setId);
    await cronService.remove(cronJobId);
    // Start fresh episode with this event as first member
    // (the event is already in the clipped set — new episode starts empty, next event fills it)
    return { set_id: setId, action: "clipped_and_created" };
  }

  // Under budget — reset silence timer
  await cronService.update(cronJobId, {
    schedule: { kind: "at", at: new Date(now + gapMs).toISOString() },
  });
  return { set_id: setId, action: "appended" };
}
```

**New helper functions needed:**

- `createOpenEpisodeSet(memoryDb, setId, meta)` — creates set with `definition_id = 'retain'` and metadata JSON containing `{ platform, thread_id, container_id, token_estimate, event_count }`
- `addSetMember(memoryDb, setId, memberType, memberId, position)` — inserts set_member row
- `readSetMetadata(memoryDb, setId)` — reads the set's metadata JSON
- `updateSetMetadata(memoryDb, setId, patch)` — updates the set's metadata JSON
- `clipEpisode(memoryDb, setId)` — creates a `jobs` row with `type_id = 'retain_v1'` and `input_set_id = setId`, fires the `episode-created` hookpoint
- `generateSetId()` — ULID generator

Note: `createEpisodeSet()` already exists in `retain-dispatch.ts` (added in Phase 5). The new `createOpenEpisodeSet()` is simpler — it creates the set shell when the episode opens, before events are fully assembled. The existing function can likely be refactored to share code.

### C9. Delete `pending_retain_triggers` infrastructure

**Remove from `db/nexus.ts`:**
- `pending_retain_triggers` CREATE TABLE from schema string
- `idx_pending_retain_last_event_at` index
- `PendingRetainTriggerRow` type (if defined there)
- `UpsertPendingRetainTriggerInput` type
- `SetPendingRetainTriggerInput` type
- `upsertPendingRetainTrigger()` function
- `setPendingRetainTrigger()` function
- `getPendingRetainTrigger()` function
- `listPendingRetainTriggers()` function
- `deletePendingRetainTrigger()` function

**Remove from `memory/retain-live.ts`:**
- `queueRetainEvent()` — replaced by `slotEventIntoEpisode()`
- `listDueRetainTriggers()` — no longer needed (cron handles timing)
- `clearRetainTrigger()` — replaced by `cronService.remove()`
- `refreshRetainTriggerWindow()` — no longer needed
- All imports from `db/nexus.js` related to pending_retain_triggers
- `QueueRetainEventInput` type — replace or rename for new function signature
- `QueueRetainEventResult` type — replace with new return type

**Keep in `memory/retain-live.ts`:**
- `loadEpisodesForTrigger()` — still used by backfill path (takes events, groups into episodes). May need renaming/signature change since it won't take a trigger row anymore.
- `buildEpisodeRetainNexusEvent()` — unchanged
- `buildEpisodeConsolidationNexusEvent()` — unchanged
- `deriveRetainThreadKey()` — may still be useful for set_id derivation

### C10. Update `cli/memory-retain-cli.ts`

The CLI currently calls `listDueRetainTriggers`, `loadEpisodesForTrigger`, and `clearRetainTrigger`. Update to:

- List active episode timers via `cronService.list()` filtered by ID prefix `episode-timeout:`
- Show episode state from set metadata in memory.db
- Clip/clear via `cronService.remove()` + episode clip logic
- May need CronService injected as a dependency

### C11. Update `nex/stages/acceptRequest.ts` comment

Line 38 has a comment referencing `queueRetainEvent`. Update to reference the new function name.

### C12. Rewrite `memory/retain-live.test.ts`

The test file tests `queueRetainEvent`, `listDueRetainTriggers`, `refreshRetainTriggerWindow` against `pending_retain_triggers`. Rewrite tests for:

- `slotEventIntoEpisode()` — episode creation, appending, token budget clipping
- Cron job creation/update/deletion as side effects
- Set creation and set_member management in memory.db
- Safety net for stale timers

### C13. Wire `emitInternalEvent` into CronService initialization

Where the CronService is initialized (likely in daemon startup), provide the `emitInternalEvent` dep. This function needs to route the internal event into the nex event system such that hookpoints/automations can catch `episode.timeout` events.

Implementation options (to be determined during implementation):
- Create a NexusRequest with `operation: "episode.timeout"` and route through the pipeline
- Emit directly to the hookpoint system (lighter weight, but less standard)
- Publish to the internal event bus (if one exists)

### C14. Register `episode.timeout` automation/hookpoint

Wire up the `episode.timeout` event to the retain pipeline. When this event fires:

1. Read set_id from event data
2. Read set metadata (token_estimate, event_count, time range) from memory.db
3. Create job row in memory.db (`type_id = 'retain_v1'`, `input_set_id = set_id`)
4. Fire `episode-created` hookpoint → dispatches writer meeseeks

This is the glue between the cron system (which just emits events) and the retain pipeline (which processes episodes). The existing `episode-created` hookpoint mechanism from D12 in 05_PIPELINE.md handles the writer dispatch.

### C15. Enable CronService

The CronService is currently disabled (`cronEnabled = false`). This needs to be flipped to `true` and any guards around it removed or updated. This may involve:

- Updating the daemon config to enable cron by default
- Ensuring the runtime.db is available when the CronService starts
- Testing that the timer loop works end-to-end

### C16. Update RETAIN_PIPELINE.md

Replace the "Episode Detection Mechanism" subsection in §1:

- Remove `pending_retain_triggers` table schema
- Remove the manual crash recovery scan description
- Reference EPISODE_DETECTION.md for the full mechanism
- Keep the high-level description of the two clipping rules (silence window + token budget)

### C17. Update 05_PIPELINE.md D11

Rewrite D11 to reference EPISODE_DETECTION.md and this workplan. Remove the `pending_retain_triggers` schema from D11. Update implementation steps 11-13 to reference the cron-based approach.

---

## Implementation Order

```
C1. cron_jobs table schema in runtime.db
  ↓
C2. SQLite store functions (loadAllJobs, insertJob, updateJob, deleteJob, upsertJob)
  ↓
C3. Update CronServiceDeps + CronServiceState (db handle, emitInternalEvent, remove storePath)
  ↓
C4. Rewrite cron/service/store.ts (ensureLoaded → SQLite, persist → per-mutation)
  ↓
C5. Add internalEvent payload kind to types.ts
  ↓
C6. Add internalEvent execution path in timer.ts
  ↓
C7. Add get() method to CronService
  ↓
C8. Rewrite episode detection in retain-live.ts (slotEventIntoEpisode)
  ↓
C9. Delete pending_retain_triggers infrastructure (db/nexus.ts, retain-live.ts)
  ↓
C10. Update CLI (memory-retain-cli.ts)
  ↓
C11. Update acceptRequest.ts comment
  ↓
C12. Rewrite retain-live.test.ts
  ↓
C13. Wire emitInternalEvent into CronService initialization
  ↓
C14. Register episode.timeout automation/hookpoint
  ↓
C15. Enable CronService (cronEnabled = true)
  ↓
C16. Update RETAIN_PIPELINE.md
  ↓
C17. Update 05_PIPELINE.md D11
```

**Parallelizable:** C1-C7 (CronService migration) can be done as a batch before C8-C15 (episode detection). C16-C17 (spec updates) can happen alongside either batch.

---

## Validation

### CronService Migration (C1-C7)
- Existing cron jobs (user-created) still load and execute after migration
- JSON file is migrated to SQLite on first startup
- `add`, `update`, `remove`, `list`, `get` all work with SQLite backend
- `internalEvent` payload kind fires `emitInternalEvent` dep
- `runMissedJobs()` still catches past-due jobs on startup
- Timer loop arms correctly with SQLite-backed job list
- `deleteAfterRun` still cleans up one-shot jobs

### Episode Detection (C8-C15)
- First event in a thread creates a set + set_member + cron job
- Subsequent events append set_members and reset the cron timer
- Token budget exceeded → episode clips immediately, cron job deleted, new episode starts
- Silence timer fires → `episode.timeout` event emitted → retain job created → writer dispatches
- Stale timer safety net: if timer is past due on event arrival, old episode clips
- Crash recovery: process restart → `runMissedJobs()` → past-due timers fire → episodes clip
- `pending_retain_triggers` table is gone — no references anywhere in codebase
- CLI can list active episodes and manually trigger clips
- `npm run build` — zero compilation errors
- `npm test` — passes

### Spec Alignment (C16-C17)
- RETAIN_PIPELINE.md §1 references EPISODE_DETECTION.md
- No remaining mentions of `pending_retain_triggers` in active spec documents
- 05_PIPELINE.md D11 updated with cron-based approach
