# Episode Detection — CronService-Based Timer Architecture

**Status:** CANONICAL
**Last Updated:** 2026-03-03
**Related:** RETAIN_PIPELINE.md, MEMORY_STORAGE_MODEL.md, ../nex/DAEMON.md

---

## Overview

Episode detection determines when a group of events in a thread constitutes a complete "episode" — a coherent conversation chunk ready for fact extraction. This spec defines the detection mechanism: how episodes open, how events accumulate, and how episodes close (clip).

The system uses **two independent clipping rules** (see RETAIN_PIPELINE.md §1 for the rationale):

| Trigger | Condition | Default Config |
|---|---|---|
| Silence window | No new events for 90 minutes | `gap_minutes: 90` |
| Token budget | Accumulated tokens exceed threshold | `max_tokens: 10000` |

This spec focuses on the **mechanism** — how these rules are implemented at a systems level.

---

## Design Decisions

### Decision 1: Per-Episode Cron Timers (Not Polling)

**Chosen:** Each active episode gets a one-shot timer via the CronService. The timer fires after the silence window expires. New events reset the timer.

**Rejected alternative — polling loop:**

A polling approach would scan a `pending_retain_triggers` table periodically (e.g., every 60 seconds) looking for rows where `last_event_at + gap_ms < now`. This was rejected because:

1. **Wasted work.** Most poll cycles find nothing due. The system burns CPU scanning a table that rarely changes, at a frequency that has no relationship to when episodes actually need to clip.
2. **Latency.** Episodes don't clip until the next poll cycle after the silence window expires. With a 60-second poll interval, that's up to 60 seconds of unnecessary delay on top of the 90-minute window.
3. **Poor precedent.** Nexus already has a general-purpose timer system (CronService). Building a parallel polling loop for episode timeouts creates two scheduling systems with different failure modes, monitoring surfaces, and configuration knobs. Every future "do X after Y time" use case would face the same build-vs-reuse question.
4. **Crash recovery duplication.** A polling model needs its own startup scan logic. The CronService already has `runMissedJobs()` for exactly this purpose.

**Why CronService timers are better:**

- **Event-driven.** No wasted poll cycles. The timer fires exactly when needed.
- **Crash recovery for free.** `runMissedJobs()` on startup catches any timers that should have fired during downtime.
- **Single scheduling system.** User-created cron jobs (daily summaries, periodic tasks) and system-internal timers (episode timeouts) share one table, one timer loop, one monitoring surface.
- **Sets the pattern.** Future time-based behaviors (e.g., "remind me in 2 hours," "check back on this thread tomorrow") follow the same path. One infrastructure investment, many consumers.

### Decision 2: CronService Emits Internal Events (Not Direct Handler Calls)

**Chosen:** When a cron timer fires, it emits a typed internal event into the nex system. Hookpoints/automations decide what to do with it. The cron system has no knowledge of retain, writers, or memory.

**Rejected alternative — registered handler functions:**

The cron service could maintain a `handlers: Record<string, Function>` map and call handler functions directly when timers fire. This was rejected because:

1. **Tight coupling.** The cron system would import or reference memory subsystem code. Adding a new consumer requires modifying cron service initialization.
2. **Single handler per event.** Direct function calls are point-to-point. If we later want a second system to react to episode timeouts (e.g., analytics, notifications), we need to modify the handler to dispatch to multiple places.
3. **Breaks the nex pattern.** Everything in nex is event-driven. Adapters emit events, the pipeline processes them, hookpoints trigger automations. Episode timeouts should follow the same pattern rather than introducing a side channel.

**Why internal events are better:**

- **Decoupled.** The cron system emits; the automation layer listens. Neither knows about the other's internals.
- **Fan-out.** Multiple handlers can listen for the same event type. Today it's the retain pipeline. Tomorrow it could also trigger analytics or notifications — no changes to the cron system needed.
- **Composable.** The event carries identity data (which episode, which thread). Any handler can decide what to do with it based on that data, using whatever logic makes sense for its domain.
- **Swappable.** You can change, add, or remove handlers for `episode.timeout` events without touching the cron infrastructure or the episode management code.

### Decision 3: Accumulation State Lives on the Set (Not in the Cron Job)

**Chosen:** Token estimates and event counts are tracked on the set's metadata in `memory.db`. The cron job carries only a set_id and thread identity — just enough to emit the right event.

**Rejected alternative — accumulation state in cron job payload:**

The cron job's payload JSON could carry `token_estimate`, `event_count`, `first_event_at`, etc. This was rejected because:

1. **Duplication.** The actual events are already in `set_members`. The token estimate can be derived from the events. Storing it separately creates a consistency risk.
2. **Payload bloat.** The cron job's payload should describe *what event to emit*, not *what the memory subsystem needs to know about the episode*. Those are different concerns.
3. **Wrong owner.** The memory subsystem owns episode state. The cron system owns timers. Putting episode state in the cron job conflates the two.

**Why set metadata is better:**

- **Single source of truth.** The set in `memory.db` owns all episode state. Events are in `set_members`, metadata (token estimate, event count, time range) is on the set row.
- **Queryable.** Other systems (recall, CLI, control plane) can inspect active episodes by querying sets directly, without knowing anything about the cron system.
- **Minimal cron payload.** The cron job carries `{ set_id, platform, container_id, thread_id }` — just thread identity and the set reference. Clean separation.

### Decision 4: No Separate `pending_retain_triggers` Table

**Chosen:** Eliminate the `pending_retain_triggers` table entirely. The cron_jobs table in runtime.db handles the timer scheduling. The sets table in memory.db handles episode state.

**Why not keep both?**

The `pending_retain_triggers` table was designed for the polling model — a place to scan for due triggers. With per-episode cron timers, the cron_jobs table absorbs the "when does this episode need attention?" question. The sets table already answers "what's in this episode?" There's nothing left for `pending_retain_triggers` to do.

One flexible table (cron_jobs) replaces one niche table (pending_retain_triggers). The cron table serves many use cases; the triggers table served one.

---

## CronService: JSON to SQLite Migration

The CronService currently stores jobs in a JSON file at `~/.nexus/cron/jobs.json`. This works for user-created cron jobs (low cardinality, infrequent writes) but doesn't scale for system-internal timers that are created, updated, and deleted on every event.

### New Storage: `cron_jobs` Table in runtime.db

```sql
CREATE TABLE cron_jobs (
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

CREATE INDEX idx_cron_jobs_next_run
    ON cron_jobs(next_run_at_ms) WHERE enabled = 1 AND running_at_ms IS NULL;

CREATE INDEX idx_cron_jobs_agent
    ON cron_jobs(agent_id) WHERE agent_id IS NOT NULL;
```

### Column Design

State fields (`next_run_at_ms`, `running_at_ms`, `last_run_at_ms`, etc.) are **denormalized columns** rather than a nested JSON blob. This enables efficient queries:

```sql
-- Find due jobs (the core timer loop query)
SELECT * FROM cron_jobs
WHERE enabled = 1 AND running_at_ms IS NULL AND next_run_at_ms <= ?
ORDER BY next_run_at_ms ASC;
```

Structured fields (`schedule_json`, `payload_json`, `delivery_json`) stay as **JSON columns** because they're always read and written as whole objects, never queried by subfield.

### Migration Path

The CronService already has a `loadCronStore` / `saveCronStore` abstraction. The migration replaces the JSON file I/O with SQLite CRUD behind the same interface. The `CronJob` TypeScript type does not change — only the persistence layer.

On first startup after the migration, the service reads the existing JSON file (if any), inserts all jobs into the SQLite table, and deletes the JSON file. Subsequent startups use SQLite only.

### What Changes in the CronService

| Component | Before | After |
|---|---|---|
| Storage | JSON file (`jobs.json`) | `cron_jobs` table in runtime.db |
| Load | `loadCronStore()` reads file | `SELECT * FROM cron_jobs` |
| Save | `saveCronStore()` writes file atomically | Individual `INSERT/UPDATE/DELETE` statements |
| `CronServiceState.store` | In-memory cache of full file | May keep a thin cache or query on demand |
| `CronServiceDeps.storePath` | Path to JSON file | Removed; replaced by db handle |

### What Does NOT Change

- `CronJob` type definition (except adding the new `internalEvent` payload kind)
- `CronSchedule` types (`at`, `every`, `cron`)
- Timer loop (`armTimer`, `onTimer`, `findDueJobs`)
- Crash recovery flow (`runMissedJobs` on startup)
- Error backoff logic
- `deleteAfterRun` behavior for one-shot jobs

---

## New Payload Kind: `internalEvent`

```typescript
export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | { kind: "agentTurn"; message: string; model?: string; /* ... */ }
  | { kind: "internalEvent"; operation: string; data: Record<string, unknown> };
```

When `executeJobCore` encounters an `internalEvent` payload, it calls a new dep:

```typescript
// Added to CronServiceDeps
emitInternalEvent: (operation: string, data: Record<string, unknown>) => void;
```

The execution path:

```typescript
// In executeJobCore
if (job.payload.kind === "internalEvent") {
  const { operation, data } = job.payload;
  state.deps.emitInternalEvent(operation, data);
  return { status: "ok", summary: `emitted ${operation}` };
}
```

The cron service knows nothing about what `operation` means or who handles it. It just emits. The nex event routing layer connects events to handlers.

---

## Episode Detection Flow

### Thread Identity

Each thread is uniquely identified by `(platform, container_id, thread_id)`. This triple is the key for episode lookup.

The cron job ID is deterministic from the thread identity:

```
episode-timeout:{platform}:{container_id}:{thread_id}
```

This enables O(1) lookup: "is there an active episode timer for this thread?" = "does cron job with this ID exist?"

### Event Arrival (Inline Path)

When a new event arrives during `event.ingest`:

#### 1. Look Up Active Episode

Check if a cron job exists with ID `episode-timeout:{platform}:{container_id}:{thread_id}`.

- **If no cron job exists** → no active episode. Go to step 2a.
- **If cron job exists** → active episode. Read the `set_id` from the cron job's `payload.data`. Go to step 2b.

#### 2a. Start New Episode

```
1. Generate a new set_id (ULID)
2. Create set in memory.db:
   - INSERT INTO sets (id, definition_id, created_at, metadata)
   - definition_id = 'retain'
   - metadata = { platform, thread_id, container_id, token_estimate: T, event_count: 1 }
3. Add event as first set_member:
   - INSERT INTO set_members (set_id, member_type, member_id, position, added_at)
4. Create one-shot cron job:
   - id: episode-timeout:{platform}:{container_id}:{thread_id}
   - schedule: { kind: "at", at: now + 90min }
   - deleteAfterRun: true
   - payload: { kind: "internalEvent", operation: "episode.timeout",
                data: { set_id, platform, container_id, thread_id } }
```

#### 2b. Append to Active Episode

```
1. Add event as set_member in memory.db (position = next ordinal)
2. Update set metadata: increment token_estimate and event_count
3. Read updated token_estimate from set metadata
4. Check token budget:
```

**Under budget:**

```
5a. Upsert cron job: reset schedule to { kind: "at", at: now + 90min }
    (This reschedules the silence timer — the conversation is still active)
```

**Over budget — clip immediately:**

```
5b. Clip the episode:
    - Create job row in memory.db (type_id = 'retain_v1', input_set_id = set_id)
    - Fire episode-created hookpoint
    - Delete the cron job for this thread
6b. Start a fresh episode with this event (recurse to step 2a)
```

#### Safety Net: Stale Timer

If the cron job's scheduled `at` time is in the past (the timer should have fired but hasn't yet — race condition, slow cron loop), treat it as a silence gap exceeded: clip the old episode, start fresh. This prevents accumulating events into an episode that should have already closed.

### Timer Fires (Cron Path)

```
CronService timer loop → finds due episode-timeout job
  → executeJobCore sees kind: "internalEvent"
  → calls emitInternalEvent("episode.timeout", { set_id, platform, container_id, thread_id })
  → nex event routing delivers the event
  → automation/hookpoint for episode.timeout:
    1. Create job row in memory.db (type_id = 'retain_v1', input_set_id = set_id)
    2. Fire episode-created hookpoint (dispatches writer meeseeks)
  → cron job auto-deleted (deleteAfterRun: true)
```

The `episode.timeout` event is a statement of fact: "90 minutes of silence have passed on this thread." The handler that listens for it decides to create a retain job and dispatch a writer. But the cron system doesn't know or care about that. Another handler could listen for the same event and do something entirely different (log analytics, send a notification, update a dashboard).

---

## Crash Recovery

### On Startup

The CronService's existing `start()` function:

1. Clears stale `runningAtMs` markers (jobs that were mid-execution when the process died)
2. Calls `runMissedJobs()` — finds all enabled jobs where `next_run_at_ms < now` and executes them
3. Recomputes `nextRunAtMs` for recurring jobs
4. Arms the timer

For episode timeout jobs, `runMissedJobs()` finds any past-due timers and fires them. The `episode.timeout` events are emitted, the automation layer clips the episodes, writers are dispatched. **Zero additional crash recovery code.**

### Example Timeline

```
14:00  Event arrives in thread A. Episode opens, cron timer set for 15:30.
14:15  Process crashes.
       (Timer was supposed to fire at 15:30 but the process is down.)
16:00  Process restarts.
       → CronService.start()
       → runMissedJobs() finds episode-timeout:...:threadA with next_run_at_ms = 15:30
       → 15:30 < 16:00 → execute immediately
       → emitInternalEvent("episode.timeout", { set_id: "...", ... })
       → Episode clips, writer dispatches.
```

### What About Events That Arrived During Downtime?

If the process is down and events arrive (queued by the adapter, stored in events.db by another process, etc.), those events are NOT slotted into episodes because the inline event path wasn't running. They are picked up by the **backfill** path, which constructs episodes from historical events after the fact. The live episode detection and backfill are complementary paths that together ensure no events are missed.

---

## Cron Job Shape for Episode Timeouts

Minimal. The cron job is just a timer with an event to emit:

```json
{
  "id": "episode-timeout:imessage:+16319056994:",
  "name": "Episode timeout",
  "enabled": true,
  "deleteAfterRun": true,
  "schedule": { "kind": "at", "at": "2026-03-03T16:30:00.000Z" },
  "sessionTarget": "main",
  "wakeMode": "now",
  "payload": {
    "kind": "internalEvent",
    "operation": "episode.timeout",
    "data": {
      "set_id": "01JNQR4X...",
      "platform": "imessage",
      "container_id": "+16319056994",
      "thread_id": ""
    }
  }
}
```

No token estimates. No event counts. No accumulation state. Just: which episode, when to fire, what event to emit.

---

## Integration Points

### With RETAIN_PIPELINE.md

This spec replaces the "Episode Detection Mechanism" subsection in §1 of RETAIN_PIPELINE.md. The `pending_retain_triggers` table and its associated crash recovery section are removed. The RETAIN_PIPELINE spec should reference this document for the detection mechanism.

### With CronService

The CronService gains:
- SQLite storage backend (replacing JSON file)
- `internalEvent` payload kind
- `emitInternalEvent` dep

The CronService does NOT gain any knowledge of episodes, retain, or memory. It remains a general-purpose timer system.

### With memory.db Sets

Active episodes are sets with `definition_id = 'retain'`. The set's `metadata` JSON tracks accumulation state (`token_estimate`, `event_count`, time range). Events are added as `set_members` in real-time as they arrive. When the episode clips, the set is already fully populated — the pipeline just creates the job and fires the hook.

### With the Nex Event System

The `episode.timeout` event flows through the nex internal event routing. The hookpoint/automation system connects it to the retain pipeline. This follows the standard nex pattern: events in, automations react.
