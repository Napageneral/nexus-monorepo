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

### D11. Episode detection — hybrid inline + cron timer

**Previous:** Episode grouping logic in `retain-episodes.ts` used time gap + token budget as a batch calculation.

**New (hybrid approach):**

1. During `event.ingest`, events are slotted into active episodes (sets) in real-time
2. `pending_retain_triggers` table tracks open episodes with a `set_id` reference
3. Token-budget clips happen inline during `event.ingest` — when an episode exceeds the token budget, it is clipped immediately
4. Silence-window detection uses per-episode cron adapter timers — each active episode has a timer that resets on new events
5. Timer fires → invokes the episode timeout handler directly as an internal runtime event (does NOT go through the full pipeline — no principals to resolve, no access to check)
6. Episode clip = create job row, fire `episode-created` hookpoint

**Crash recovery:** On startup, scan `pending_retain_triggers`, clip expired episodes (those past the silence window), and reschedule active timers for remaining ones.

**`pending_retain_triggers` schema:**

```sql
CREATE TABLE pending_retain_triggers (
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

The critical new pattern: how does the `currentJobId` get from the meeseeks dispatch (this phase) into the writer tools (Phase 3)?

**Current flow:**
```
meeseeks automation → assembleContext → startBrokerExecution → broker runs tools
```

**Target flow:**
```
meeseeks automation → create job row → fork meeseeks session (with jobId in context) → agent runs tools (tools read jobId from session context)
```

The `jobId` needs to be threaded through the session context so memory CLI tools can read it. The meeseeks is forked from the parent session (typically a manager agent turn), inheriting full context. The `currentJobId` is passed as part of the fork context — tools read it from the session to associate their writes with the correct job.

The exact mechanism: pass `currentJobId` when creating the tool instances for the session. The tool factory already receives the session label for writer/consolidator detection; add `currentJobId` to the same context.

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
    is_owner: boolean;
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
11. Implement hybrid episode detection — inline token-budget + cron timer (D11)
12. Add `pending_retain_triggers` table with `set_id` column (D11)
13. Implement crash recovery: scan triggers, clip expired, reschedule active (D11)
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
- Episode detection uses hybrid approach: inline token-budget clip + cron timer silence-window
- `pending_retain_triggers` table includes `set_id` column
- Crash recovery reschedules active timers and clips expired episodes on startup
- `episode-created` and `episode-retained` hookpoints fire correctly
- No references to old events.db column names (`from_identifier`, `to_recipients`, `is_retained`, etc.)
- `npm run build` — zero compilation errors
- `npm test` — passes
