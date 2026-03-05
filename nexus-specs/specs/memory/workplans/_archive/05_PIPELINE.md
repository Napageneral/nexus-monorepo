# Phase 5 — Pipeline, Dispatch & Meeseeks Automations

**Status:** ACTIVE
**Created:** 2026-03-01
**Phase:** 5 (depends on Phase 1 + Phase 3)
**Spec:** ../RETAIN_PIPELINE.md, ../MEMORY_STORAGE_MODEL.md, ../MEMORY_SYSTEM.md
**Primary Files:** `nex/src/memory/retain-dispatch.ts`, `nex/src/memory/retain-episodes.ts`, `nex/src/nex/automations/meeseeks/memory-retain-episode.ts`, `nex/src/nex/automations/meeseeks/memory-consolidate-episode.ts`, `nex/src/nex/automations/meeseeks/memory-reader.ts`

---

## Overview

This phase wires up the new Elements/Sets/Jobs schema into the retain pipeline and meeseeks dispatch layer. The key additions are:

1. **Sets + set_members** replace episodes + episode_events
2. **Jobs wrapping** — create a `jobs` row before each meeseeks, record `job_outputs` after
3. **processing_log** replaces `is_consolidated` boolean checks
4. **Memory injection rename** — `memory-reader.ts` → `memory-injection.ts`

---

## Current State

### `retain-dispatch.ts`

- `markEpisodeEventsRetained()` — writes to `memory_processing_log` (event_id, processed_at, writer_run_id) and `events.is_retained` (target: use `processing_log` anti-join, drop `is_retained`)
- Creates `episodes` + `episode_events` records via direct SQL
- `loadUnconsolidatedEpisodeFactIds()` — queries `facts WHERE is_consolidated = FALSE`
- `runHookAndRequireSuccess()` — orchestrates hook evaluation with retry (this pattern stays, wrapping changes)

### `retain-episodes.ts`

- `RetainEpisode` interface with episode_id, platform, thread_id, events, participants
- `EpisodeEvent` interface with sender_id, content, attachments
- Episode grouping logic (time gap + token budget)

### `memory-retain-episode.ts` (Writer Meeseeks)

- Parses episode payload from `request.event.metadata`
- Constructs task prompt with episode data
- Dispatches to broker — no job tracking

### `memory-consolidate-episode.ts` (Consolidator Meeseeks)

- Parses consolidation payload from metadata
- `loadEpisodeFacts()` queries `facts WHERE source_episode_id = ? AND is_consolidated = FALSE`
- Post-check: `countUnconsolidatedFactsByIds()` verifies all facts consolidated
- Dispatches to broker — no job tracking

### `memory-reader.ts` (Injection Meeseeks)

- 56 lines, simple: assemble → broker → extract `<memory_context>` block
- Named "memory-reader" but serves injection role

---

## Changes

### D1. Replace episode creation with set creation in `retain-dispatch.ts`

**Current:** `markEpisodeEventsRetained()` writes to `episodes`, `episode_events`, `episode_definitions`.

**New:** Write to `sets`, `set_members`, `set_definitions`.

```typescript
function createEpisodeSet(params: {
    memoryDb: DatabaseSync;
    episodeId: string;
    episode: RetainEpisode;
}): void {
    const now = Math.floor(Date.now() / 1000);

    // Ensure retain definition exists
    params.memoryDb.prepare(`
        INSERT OR IGNORE INTO set_definitions (id, name, version, strategy, config_json, description, created_at)
        VALUES ('retain', 'retain', '1.0.0', 'thread_time_gap',
                '{"silence_window_ms": 5400000, "token_budget": 10000}',
                'Retain episodes from adapter events', ?)
    `).run(now);

    // Create set
    const metadata = JSON.stringify({
        platform: params.episode.platform || null,
        thread_id: params.episode.thread?.thread_id || params.episode.thread_id || null,
        thread_name: params.episode.thread?.thread_name || null,
        start_time: params.episode.time_range?.start ? Math.floor(params.episode.time_range.start / 1000) : null,
        end_time: params.episode.time_range?.end ? Math.floor(params.episode.time_range.end / 1000) : null,
    });

    params.memoryDb.prepare(`
        INSERT INTO sets (id, definition_id, created_at, metadata)
        VALUES (?, 'retain', ?, ?)
        ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata
    `).run(params.episodeId, now, metadata);

    // Clear old members and re-insert
    params.memoryDb.prepare(`DELETE FROM set_members WHERE set_id = ?`).run(params.episodeId);

    const insertMember = params.memoryDb.prepare(`
        INSERT OR IGNORE INTO set_members (set_id, member_type, member_id, position, added_at)
        VALUES (?, 'event', ?, ?, ?)
    `);

    for (let i = 0; i < params.episode.events.length; i++) {
        const eventId = params.episode.events[i]?.event_id;
        if (eventId) {
            insertMember.run(params.episodeId, eventId, i + 1, now);
        }
    }
}
```

### D2. Replace `memory_processing_log` writes with `processing_log`

**Current:** `markEpisodeEventsRetained()` writes to `memory_processing_log` (event_id, processed_at, writer_run_id).

**New:** Write to `processing_log` with generalized schema:

```typescript
const insertProcessed = params.memoryDb.prepare(`
    INSERT OR IGNORE INTO processing_log (target_type, target_id, job_type_id, job_id, processed_at)
    VALUES ('event', ?, 'retain_v1', ?, ?)
`);

for (const eventId of eventIds) {
    insertProcessed.run(eventId, jobId, now);
}
```

### D3. Add job wrapping to writer meeseeks (`memory-retain-episode.ts`)

**The core addition.** Before the meeseeks runs, create a `jobs` row. After it completes, update the job status. Pass the `jobs.id` into the tool context.

```typescript
// Before meeseeks dispatch:
const jobId = generateULID();
const now = Math.floor(Date.now() / 1000);

// Ensure job type exists
memoryDb.prepare(`
    INSERT OR IGNORE INTO job_types (id, name, version, description, created_at)
    VALUES ('retain_v1', 'retain_v1', '1.0.0', 'Extract facts and entities from episode events', ?)
`).run(now);

// Create set for episode (D1 pattern)
createEpisodeSet({ memoryDb, episodeId: episode.episode_id, episode });

// Create job
memoryDb.prepare(`
    INSERT INTO jobs (id, type_id, input_set_id, status, created_at, started_at)
    VALUES (?, 'retain_v1', ?, 'running', ?, ?)
`).run(jobId, episode.episode_id, now, now);

// Pass jobId to meeseeks context → writer tools get it as currentJobId
// ... assemble, dispatch, await ...

// After meeseeks completes:
try {
    const result = await execution.result;
    memoryDb.prepare(`
        UPDATE jobs SET status = 'completed', completed_at = ?, model = ?
        WHERE id = ?
    `).run(Math.floor(Date.now() / 1000), model, jobId);
} catch (err) {
    memoryDb.prepare(`
        UPDATE jobs SET status = 'failed', error_message = ?, completed_at = ?
        WHERE id = ?
    `).run(String(err), Math.floor(Date.now() / 1000), jobId);
    throw err;
}
```

### D4. Add job wrapping to consolidator meeseeks (`memory-consolidate-episode.ts`)

Same pattern as D3, but for the consolidator:

```typescript
const jobId = generateULID();
const now = Math.floor(Date.now() / 1000);

// Create consolidation set for the facts being consolidated
memoryDb.prepare(`
    INSERT OR IGNORE INTO set_definitions (id, name, version, strategy, config_json, description, created_at)
    VALUES ('consolidation', 'consolidation', '1.0.0', 'knowledge_cluster', '{}', 'Knowledge-cluster sets for consolidation', ?)
`).run(now);

const consolidationSetId = `consolidation:${payload.episode_id}`;
memoryDb.prepare(`
    INSERT INTO sets (id, definition_id, created_at)
    VALUES (?, 'consolidation', ?)
    ON CONFLICT(id) DO NOTHING
`).run(consolidationSetId, now);

// Add facts as set members
const insertMember = memoryDb.prepare(`
    INSERT OR IGNORE INTO set_members (set_id, member_type, member_id, position, added_at)
    VALUES (?, 'element', ?, ?, ?)
`);
facts.forEach((fact, i) => insertMember.run(consolidationSetId, fact.id, i + 1, now));

// Create job
memoryDb.prepare(`
    INSERT INTO jobs (id, type_id, input_set_id, status, created_at, started_at)
    VALUES (?, 'consolidate_v1', ?, 'running', ?, ?)
`).run(jobId, consolidationSetId, now, now);

// Pass jobId to consolidator tools as currentJobId
```

### D5. Update `loadEpisodeFacts()` in consolidator

**Current:** Queries `facts WHERE source_episode_id = ? AND is_consolidated = FALSE`.

**New:** Query unconsolidated elements via `processing_log` anti-join:

```typescript
function loadEpisodeFacts(params: {
    memoryDb: DatabaseSync;  // now takes open db handle
    episodeId: string;
    hintedFactIds: string[];
}): ConsolidationFactRow[] {
    // Find facts created by the retain job for this episode's set
    const rows = params.memoryDb.prepare(`
        SELECT e.id, e.content AS text, e.as_of, e.source_event_id
        FROM elements e
        JOIN job_outputs jo ON jo.element_id = e.id
        JOIN jobs j ON j.id = jo.job_id
        WHERE j.input_set_id = ?
        AND e.type = 'fact'
        AND NOT EXISTS (
            SELECT 1 FROM processing_log pl
            WHERE pl.target_type = 'element'
            AND pl.target_id = e.id
            AND pl.job_type_id = 'consolidate_v1'
        )
        ORDER BY e.created_at ASC
    `).all(params.episodeId);

    // Fallback to hinted fact IDs if episode join finds nothing
    // ... same pattern as current code
}
```

### D6. Update post-completion check in consolidator

**Current:** `countUnconsolidatedFactsByIds()` checks `facts WHERE is_consolidated = FALSE`.

**New:** Check `processing_log` for unconsolidated elements:

```typescript
function countUnconsolidatedFactsByIds(memoryDb: DatabaseSync, factIds: string[]): number {
    const placeholders = factIds.map(() => '?').join(',');
    const row = memoryDb.prepare(`
        SELECT COUNT(*) AS count FROM elements e
        WHERE e.id IN (${placeholders})
        AND NOT EXISTS (
            SELECT 1 FROM processing_log pl
            WHERE pl.target_type = 'element'
            AND pl.target_id = e.id
            AND pl.job_type_id = 'consolidate_v1'
        )
    `).get(...factIds);
    return row?.count ?? 0;
}
```

### D7. Rename memory-reader → memory-injection

**Current file:** `nex/src/nex/automations/meeseeks/memory-reader.ts`
**New file:** `nex/src/nex/automations/meeseeks/memory-injection.ts`

The file rename plus:
- Update export name: `memoryReaderAutomation` → `memoryInjectionAutomation`
- Update session label: `meeseeks:memory-reader:` → `meeseeks:memory-injection:`
- Update automation name references wherever the automation is registered

The function itself (56 lines) stays the same — it's the meeseeks dispatch, not the tool implementation.

### D8. Update consolidator task prompt tool references

The consolidator's task prompt in `memory-consolidate-episode.ts` currently references:
- `create_observation` → should reference `consolidate_facts` (pattern 1)
- `update_observation` → should reference `consolidate_facts` (pattern 2)
- `mark_facts_consolidated` → should reference `consolidate_facts` (pattern 3)
- `resolve_observation_head` → should reference `resolve_element_head`
- `insert_causal_link` → should reference `insert_element_link`

Update the task text strings to use the new tool names and explain the three patterns.

### D9. Update writer task prompt tool references

The writer's task prompt in `memory-retain-episode.ts` currently references:
- `insert_fact` → stays (name unchanged)
- `link_fact_entity` → should reference `link_element_entity`
- `propose_merge` → stays (name unchanged)
- `recall` → stays

Update task text strings.

### D10. `loadUnconsolidatedEpisodeFactIds()` in retain-dispatch.ts

**Current:** Queries `facts WHERE source_episode_id = ? AND is_consolidated = FALSE`.

**New:** Same `processing_log` anti-join pattern as D5:

```typescript
function loadUnconsolidatedEpisodeFactIds(memoryDb: DatabaseSync, episodeId: string): string[] {
    const rows = memoryDb.prepare(`
        SELECT e.id FROM elements e
        JOIN job_outputs jo ON jo.element_id = e.id
        JOIN jobs j ON j.id = jo.job_id
        WHERE j.input_set_id = ?
        AND e.type = 'fact'
        AND NOT EXISTS (
            SELECT 1 FROM processing_log pl
            WHERE pl.target_type = 'element'
            AND pl.target_id = e.id
            AND pl.job_type_id = 'consolidate_v1'
        )
        ORDER BY e.created_at ASC
    `).all(episodeId);
    return rows.map(row => row.id).filter(Boolean);
}
```

### D11. Episode detection — ✅ Implemented in Phase 7

**Implemented in:** `07_EPISODE_DETECTION.md` (workplan) and `../EPISODE_DETECTION.md` (design spec).

**Summary:** Episode detection is now handled by per-episode CronService timers rather than the old `pending_retain_triggers` + polling model. The CronService was migrated from JSON file storage to a SQLite `cron_jobs` table in runtime.db. When a timer fires, it emits an `episode.timeout` internal event handled directly by the cron service layer. The `pending_retain_triggers` table has been eliminated. Key entry point: `slotEventIntoEpisode()` in `memory/retain-live.ts`.

### D12. Hook name updates

| Pipeline Stage | Old Hook / Reference | New Hook / Reference |
|---|---|---|
| Writer dispatch | *(implicit after episode grouping)* | `episode-created` hookpoint |
| Consolidator dispatch | *(implicit after writer completes)* | `episode-retained` hookpoint (after writer completes) |
| Memory injection | `worker:pre_execution` hookpoint | `worker:pre_execution` hookpoint (unchanged) |
| Injection automation | `memory-reader` | `memory-injection` (covered in D7) |

### D13. Events.db column awareness

The pipeline queries `events.db` for event data. These column names changed:

| Old Column | New Column | Notes |
|---|---|---|
| `from_identifier` | `sender_id` | |
| `source` + `source_id` | `event_id` | Adapter's original ID |
| `to_recipients` | `recipients` | |
| `reply_to` | `reply_to_id` | |
| `type` | *(dropped)* | |
| `direction` | *(dropped)* | |
| `is_retained` | *(dropped)* | Use `processing_log` anti-join |

**New columns:** `receiver_id`, `space_id`, `container_kind`, `container_id`, `request_id`.

Any pipeline code that reads event rows or constructs episode payloads from event data must use the new column names.

---

## Job ID Threading

The critical pattern: how does the `currentJobId` get from the meeseeks dispatch (this phase) into the writer tools (Phase 3)?

**Mechanism: Session-label encoding.**

The meeseeks dispatch encodes the jobId in the session label string:

```
meeseeks:memory-writer:{parentSession}:episode:{episodeId}:job:{jobId}
```

The tool factory extracts it via regex:

```typescript
const jobIdMatch = sessionKey.match(/:job:([^:]+)$/);
const currentJobId = options.currentJobId?.trim() || (jobIdMatch ? jobIdMatch[1] : "") || "";
```

The tool factory also accepts an explicit `currentJobId` option that takes priority over the session-label extraction. This provides an override path for testing and future broker enhancements.

**Why session-label encoding:** `startBrokerExecution` doesn't have a `toolContext` parameter for passing arbitrary data to tool factories. The session label is the existing communication channel from meeseeks dispatch to tool creation. The session label already flows end-to-end through `NexusRequest.agent.session_key`, so encoding the jobId there requires zero new infrastructure.

**Flow:**
```
meeseeks automation → create job row → encode jobId in sessionLabel
  → startBrokerExecution({ sessionLabel })
    → broker creates session → creates tools
      → tool factory extracts jobId from sessionLabel (or explicit option)
        → tools write source_job_id + job_outputs using currentJobId
```

---

## Retain Pipeline Changes

### `retain-episodes.ts` Updates

The `RetainEpisode` interface stays mostly the same — it's a TypeScript type used for grouping logic. The key change is downstream: when episodes are committed, they become `sets` + `set_members` instead of `episodes` + `episode_events`.

Update `EpisodeParticipant` interface per Phase 2 (identity rename):
```typescript
interface EpisodeParticipant {
    contact_id: string;       // was: participant_id (mapped from sender_id)
    contact_name: string;     // was: display_name
    entity_id: string | null;
    entity_name: string;
}
```

---

## Implementation Steps

1. Rewrite `markEpisodeEventsRetained()` → create sets/set_members, write to processing_log
2. Add `createEpisodeSet()` helper function
3. Add job wrapping to writer meeseeks (D3)
4. Add job wrapping to consolidator meeseeks (D4)
5. Update `loadEpisodeFacts()` to use processing_log anti-join (D5)
6. Update `countUnconsolidatedFactsByIds()` (D6)
7. Rename memory-reader → memory-injection (D7)
8. Update consolidator task prompt tool references (D8)
9. Update writer task prompt tool references (D9)
10. Update `loadUnconsolidatedEpisodeFactIds()` (D10)
11. ~~Episode detection~~ — **deferred to 07_EPISODE_DETECTION.md**
14. Wire up `episode-created` and `episode-retained` hookpoints (D12)
15. Update event column references to new names (D13)
16. Thread job ID from dispatch to tool context
17. Update `retain-episodes.ts` types (EpisodeParticipant)

---

## Validation

- Retain pipeline creates `sets` + `set_members` (not `episodes` + `episode_events`)
- Writer meeseeks creates a `jobs` row with status tracking
- Consolidator meeseeks creates a `jobs` row with status tracking
- After writer completes, job status is 'completed' with timestamp
- After writer fails, job status is 'failed' with error_message
- `processing_log` entries are created for retained events
- Unconsolidated facts query uses processing_log anti-join
- Memory injection meeseeks renamed from memory-reader
- Consolidator task prompt references new tool names
- Episode detection — **deferred to 07_EPISODE_DETECTION.md** (CronService-based timers, no pending_retain_triggers)
- `episode-created` and `episode-retained` hookpoints fire correctly
- No references to old events.db column names (`from_identifier`, `to_recipients`, `is_retained`, etc.)
- `npm run build` — zero compilation errors
- `npm test` — passes
