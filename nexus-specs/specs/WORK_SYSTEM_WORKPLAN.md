# Work System Implementation Workplan

## Context

The CRM analysis (see `CRM_ANALYSIS_AND_WORK_SYSTEM.md`) identified that the existing Nexus entity/contact/memory system already provides most CRM functionality. The **missing primitive** is a work management system for tracking future work: follow-ups, task sequences, workflows, and campaigns.

This workplan breaks the work.db implementation into iterative phases, each independently testable. It also adds the `entity_tag_events` audit table and `deleted_at` soft-delete to `entity_tags`.

**Spec references:**
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` — Full schema, four-model pattern, execution model
- `DATABASE_ARCHITECTURE.md` §3.7 — work.db table inventory
- `ENTITY_ACTIVITY_DASHBOARD.md` — Query patterns that consume work data

### Architecture: How Events Flow Through NEX Pipeline

The cron service **already uses the full NEX pipeline** for isolated agent jobs. The production wiring in `server-cron.ts`:
1. `runIsolatedAgentJob` callback → calls `dispatchNexusEvent()` (`nexus-event-dispatch.ts`)
2. `dispatchNexusEvent()` builds a proper `NexusEvent` with `platform: "cron"`, `operation: "event.ingest"`
3. Calls `runtime.nex.processEvent(event)` → **full pipeline**: receiveEvent → resolvePrincipals → resolveAccess → runAutomations → assembleContext → runAgent → deliverResponse → finalize

The clock adapter uses the identical pattern (`platform: "clock"`, `dispatchNexusEvent()`).

Both `"cron"` and `"clock"` are recognized system platforms in IAM (`iam/identity.ts` line 79).

**Note:** The legacy `cron/isolated-agent/run.ts` (which runs agents directly, bypassing the pipeline) is dead code — only imported in test files, never in production.

**Note:** The in-process cron scheduler is currently **disabled** (`cronEnabled = false` in `server-cron.ts` line 29: "Bundle B: cron is an adapter concern"). Work items therefore need their own scheduler.

### Work Item Execution Model

Work items follow the same pattern as clock and cron — a dedicated control-plane service:
1. **Work scheduler** polls `work.db` for due items (`scheduled_at <= now && status == 'scheduled'`)
2. For each due item, calls `dispatchNexusEvent()` with `platform: "work"`
3. Full pipeline processes: access control → automations → context assembly → agent execution → delivery → finalize
4. Work scheduler receives `NEXPipelineResult`, updates work item status, advances sequences

### Key Files (existing infrastructure)

| File | Role |
|------|------|
| `nex/src/nex/control-plane/nexus-event-dispatch.ts` | `dispatchNexusEvent()` — shared helper for clock, cron, and work |
| `nex/src/nex/control-plane/server-cron.ts` | Reference pattern: how cron constructs events for `dispatchNexusEvent()` |
| `nex/src/nex/control-plane/server-clock.ts` | Reference pattern: timer + `dispatchNexusEvent()` polling loop |
| `nex/src/iam/identity.ts` line 79 | `SYSTEM_PLATFORMS` set — add `"work"` here |
| `nex/src/nex/request.ts` | `NexusEvent` / `NexusEventSchema` type definition |

---

## Phase 0: Entity Tag Extensions (identity.db)

**Goal:** Add `deleted_at` soft-delete to `entity_tags` and create `entity_tag_events` audit table.

**Spec ref:** CRM_ANALYSIS_AND_WORK_SYSTEM.md §3

### Files to modify

| File | Change |
|------|--------|
| `nex/src/db/identity.ts` | Add `deleted_at` column migration + `entity_tag_events` table + CRUD helpers |

### Implementation

1. **Schema migration in `ensureIdentitySchema()`:**
   - Check `hasColumn(db, "entity_tags", "deleted_at")` — if missing, `ALTER TABLE entity_tags ADD COLUMN deleted_at INTEGER`
   - Check `hasTable(db, "entity_tag_events")` — if missing, `CREATE TABLE entity_tag_events (...)` with both indexes
   - Follow existing migration pattern (see `needsEntityMigration()` / `runEntityMigration()` around lines 750-1020)

2. **New helper functions:**
   - `addEntityTag(db, entityId, tag, actor?, reason?)` — upserts entity_tags (sets deleted_at=NULL on re-add) + inserts entity_tag_events with action='added'
   - `removeEntityTag(db, entityId, tag, actor?, reason?)` — sets deleted_at on entity_tags + inserts entity_tag_events with action='removed'
   - `listEntityTagEvents(db, entityId?, tag?)` — query entity_tag_events with optional filters
   - `listActiveEntityTags(db, entityId)` — query entity_tags WHERE deleted_at IS NULL

3. **Existing callers:** Search for any direct INSERT/DELETE on entity_tags and route through the new helpers. Key locations:
   - `tagEntity()` function if it exists
   - Memory writer entity extraction
   - Any admin/CLI tag commands

### Validation 0

```
Test: entity-tag-events.test.ts
├── addEntityTag creates tag + event row
├── addEntityTag re-adding soft-deleted tag sets deleted_at=NULL + new event
├── removeEntityTag sets deleted_at + event row with action='removed'
├── listEntityTagEvents returns chronological history
├── listActiveEntityTags excludes soft-deleted
└── migration: existing tags survive ALTER TABLE ADD COLUMN
```

**Checkpoint:** Run test, verify entity_tags has deleted_at column, entity_tag_events table exists, CRUD works atomically.

---

## Phase 1: work.db Schema + Ledger Integration

**Goal:** Create work.db as the 7th database with all 6 tables. Wire it into the ledger manager.

**Spec ref:** CRM_ANALYSIS_AND_WORK_SYSTEM.md §4, DATABASE_ARCHITECTURE.md §3.7

### Files to create

| File | Purpose |
|------|---------|
| `nex/src/db/work.ts` | Schema SQL + `ensureWorkSchema()` + row types + CRUD functions |

### Files to modify

| File | Change |
|------|--------|
| `nex/src/db/ledgers.ts` | Add `"work"` to `LedgerName`, `LEDGER_FILENAMES`, `LedgerConnections`, `openAllLedgers()` |
| `nex/src/db/index.ts` | Re-export work.ts functions |

### Implementation

1. **`ledgers.ts` changes:**
   ```typescript
   export type LedgerName = "events" | "agents" | "identity" | "memory" | "embeddings" | "nexus" | "work";

   // Add to LEDGER_FILENAMES:
   work: "work.db",

   // Add to LedgerConnections interface:
   work: DatabaseSync;

   // Add to openAllLedgers():
   const work = openLedger("work", env);
   // Include in return object and close()
   ```

2. **`work.ts` — follow patterns from `nexus.ts`:**
   - `WORK_SCHEMA_SQL` constant with all 6 CREATE TABLE statements from spec §4
   - `ensureWorkSchema(db)` function — idempotent, runs CREATE TABLE IF NOT EXISTS
   - Row types: `TaskRow`, `WorkflowRow`, `WorkflowStepRow`, `WorkItemRow`, `WorkItemEventRow`, `SequenceRow`
   - Input types: `TaskInput`, `WorkItemInput`, etc. (Omit<Row, 'created_at' | 'updated_at'>)
   - CRUD functions (Phase 2 implements these, Phase 1 just gets schema + types)

### Validation 1

```
Test: work-schema.test.ts
├── ensureWorkSchema creates all 6 tables
├── ensureWorkSchema is idempotent (run twice = no error)
├── openAllLedgers includes work database
├── work.db file appears in state/data/
├── PRAGMA foreign_keys = ON (verify FK enforcement)
└── all indexes exist (spot-check 3-4 key indexes)
```

**Checkpoint:** `openAllLedgers()` returns 7 databases, work.db exists on disk, all tables verified via `PRAGMA table_info(...)`.

---

## Phase 2: Work Item CRUD

**Goal:** Implement core CRUD operations for tasks, work items, work item events, workflows, workflow steps, and sequences.

**Spec ref:** CRM_ANALYSIS_AND_WORK_SYSTEM.md §4.1-4.5

### Files to modify

| File | Change |
|------|---------|
| `nex/src/db/work.ts` | Add all CRUD functions |

### Implementation — ordered by dependency

**2a. Tasks (atom definitions)**
- `createTask(db, input: TaskInput): TaskRow`
- `getTask(db, id): TaskRow | null`
- `listTasks(db, opts?: { type?: string }): TaskRow[]`
- `updateTask(db, id, patch): TaskRow`

**2b. Workflows + Steps (collection definitions)**
- `createWorkflow(db, input: WorkflowInput): WorkflowRow`
- `getWorkflow(db, id): WorkflowRow | null`
- `listWorkflows(db, opts?: { type?: string }): WorkflowRow[]`
- `addWorkflowStep(db, input: WorkflowStepInput): WorkflowStepRow`
- `listWorkflowSteps(db, workflowId): WorkflowStepRow[]`
- `getWorkflowWithSteps(db, id): { workflow: WorkflowRow, steps: WorkflowStepRow[] } | null`

**2c. Work Items (atom instances) — most complex**
- `createWorkItem(db, input: WorkItemInput): WorkItemRow` — also writes 'created' event
- `getWorkItem(db, id): WorkItemRow | null`
- `listWorkItems(db, opts?: { status?, entityId?, sequenceId?, taskId?, assignee? }): WorkItemRow[]`
- `updateWorkItemStatus(db, id, newStatus, actor, reason?)` — updates cache + appends event
- `assignWorkItem(db, id, assigneeType, assigneeId, actor)` — updates cache + appends event
- `snoozeWorkItem(db, id, snoozedUntil, actor, reason?)` — updates status + snoozed_until + event
- `completeWorkItem(db, id, actor, reason?)` — sets status=completed, completed_at + event
- `cancelWorkItem(db, id, actor, reason?)` — sets status=cancelled + event
- `listDueWorkItems(db, now: number): WorkItemRow[]` — WHERE status='scheduled' AND scheduled_at <= now
- `listWorkItemEvents(db, workItemId): WorkItemEventRow[]`

**2d. Sequences (collection instances)**
- `createSequence(db, input: SequenceInput): SequenceRow`
- `getSequence(db, id): SequenceRow | null`
- `listSequences(db, opts?: { workflowId?, entityId?, parentId?, status? }): SequenceRow[]`
- `updateSequenceStatus(db, id, newStatus)`
- `getSequenceWithItems(db, id): { sequence: SequenceRow, items: WorkItemRow[] } | null`

**Key pattern:** Every status change on a work item goes through a helper that atomically:
1. Updates the mutable cache fields on work_items
2. Appends an immutable row to work_item_events

### Validation 2

```
Test: work-crud.test.ts
├── Tasks
│   ├── createTask + getTask round-trip
│   ├── listTasks filters by type
│   └── updateTask preserves immutable fields
├── Work Items
│   ├── createWorkItem generates 'created' event
│   ├── updateWorkItemStatus appends event + updates cache
│   ├── completeWorkItem sets completed_at + status
│   ├── snoozeWorkItem sets snoozed_until
│   ├── listDueWorkItems returns only scheduled items past due
│   ├── listWorkItems filters by entity/status/sequence
│   └── listWorkItemEvents returns chronological history
├── Workflows
│   ├── createWorkflow + addWorkflowStep
│   ├── getWorkflowWithSteps returns ordered steps
│   └── workflow_steps respects UNIQUE(workflow_id, step_order)
├── Sequences
│   ├── createSequence with parent_sequence_id (nesting)
│   ├── getSequenceWithItems includes child work items
│   └── listSequences filters by parent (campaign children)
└── Immutability
    ├── work_item core fields unchanged after status update
    ├── work_item_events are append-only (no UPDATE/DELETE)
    └── event log is source of truth (matches cache state)
```

**Checkpoint:** Full CRUD coverage. Every work item state change has a corresponding event. Queries return correct filtered results.

---

## Phase 3: Work Scheduler Service (NEX Pipeline Integration)

**Goal:** Create a work scheduler control-plane service that polls work.db and dispatches due items as NexusEvents through the full pipeline.

**Spec ref:** CRM_ANALYSIS_AND_WORK_SYSTEM.md §5

### Architecture

Follows the **exact pattern** of the existing clock service (`server-clock.ts`):
- Dedicated `setInterval` timer polls work.db
- Each due item dispatched via `dispatchNexusEvent()` → `runtime.nex.processEvent()`
- Full pipeline: receiveEvent → resolvePrincipals → resolveAccess → runAutomations → assembleContext → runAgent → deliverResponse → finalize
- Work scheduler receives `NEXPipelineResult` back, updates work item status

We do NOT extend the cron timer (it's disabled) or the clock tick (different concern).

### Files to create

| File | Purpose |
|------|---------|
| `nex/src/nex/control-plane/server-work.ts` | Work scheduler service: timer + poll + dispatch |

### Files to modify

| File | Change |
|------|--------|
| `nex/src/iam/identity.ts` | Add `"work"` to `SYSTEM_PLATFORMS` set |
| `nex/src/nex/control-plane/server-startup.ts` | Wire `buildRuntimeWorkScheduler()` alongside clock/cron |

### Implementation

1. **`server-work.ts`** — follows `server-clock.ts` pattern:
   ```typescript
   import { dispatchNexusEvent, summarizeNexResult } from "./nexus-event-dispatch.js";
   import { listDueWorkItems, updateWorkItemStatus, completeWorkItem, getTask }
     from "../../db/work.js";
   import { advanceSequence } from "../../db/work.js";  // Phase 4

   const DEFAULT_WORK_POLL_INTERVAL_MS = 30_000;

   export function buildRuntimeWorkScheduler(params: {
     getNexRuntime: () => NEXAdapterRuntimeHandle | null | undefined;
     getLedgers: () => LedgerConnections | null;
     log: WorkLogger;
   }): RuntimeWorkState {
     let timer: ReturnType<typeof setInterval> | null = null;
     let inFlight = false;

     const tick = async () => {
       if (inFlight) return;
       const ledgers = params.getLedgers();
       if (!ledgers || !params.getNexRuntime()) return;
       inFlight = true;

       try {
         ensureWorkSchema(ledgers.work);
         const now = Date.now();
         const dueItems = listDueWorkItems(ledgers.work, now);

         for (const item of dueItems) {
           updateWorkItemStatus(ledgers.work, item.id, 'active', 'work-scheduler',
             'scheduled_at reached');

           const task = item.task_id ? getTask(ledgers.work, item.task_id) : null;
           const prompt = item.description
             ?? task?.agent_prompt
             ?? `Work item due: ${item.title}`;

           const runId = `work:${item.id}:${Date.now().toString(36)}`;
           try {
             const result = await dispatchNexusEvent({
               getNexRuntime: () => params.getNexRuntime() ?? null,
               source: "work",
               content: prompt,
               event_id: runId,
               request_id: runId,
               queue_mode: "followup",
               skip_delivery: true,  // default; delivery config from task/item
               routing_override: {
                 session_label: `system:work:item:${item.id}`,
                 persona_ref: item.assignee_id ?? task?.default_agent_id ?? undefined,
               },
               delivery: {
                 platform: "work",
                 account_id: "default",
                 sender_id: `work:${item.id}`,
                 sender_name: item.title,
                 container_id: `work:item:${item.id}`,
                 container_kind: "direct",
                 capabilities: { supports_streaming: false },
               },
               metadata: {
                 type: "work.item.due",
                 work_item_id: item.id,
                 task_id: item.task_id,
                 entity_id: item.entity_id,
                 sequence_id: item.sequence_id,
               },
             });

             const summary = summarizeNexResult(result);
             if (result.request.status === "failed" || result.request.status === "denied") {
               updateWorkItemStatus(ledgers.work, item.id, 'pending', 'work-scheduler',
                 `pipeline error: ${summary.error ?? result.request.status}`);
             } else {
               completeWorkItem(ledgers.work, item.id, 'work-scheduler',
                 summary.text || 'executed successfully');
               // Phase 4: advanceSequence(ledgers.work, item.id);
             }
           } catch (err) {
             updateWorkItemStatus(ledgers.work, item.id, 'pending', 'work-scheduler',
               `dispatch error: ${String(err)}`);
             params.log.error(`work: item ${item.id} dispatch failed: ${String(err)}`);
           }
         }
       } catch (err) {
         params.log.warn(`work: tick failed: ${String(err)}`);
       } finally {
         inFlight = false;
       }
     };

     return {
       start: () => { timer = setInterval(() => void tick(), DEFAULT_WORK_POLL_INTERVAL_MS); timer.unref?.(); },
       stop: () => { if (timer) clearInterval(timer); timer = null; },
     };
   }
   ```

2. **Wire into startup** — in `server-startup.ts`, alongside `buildRuntimeClockService()`:
   ```typescript
   const workScheduler = buildRuntimeWorkScheduler({
     getNexRuntime: () => nexRuntime,
     getLedgers: () => nexRuntime?.ledgers ?? null,
     log,
   });
   workScheduler.start();
   ```

3. **IAM** — add `"work"` to `SYSTEM_PLATFORMS` in `iam/identity.ts`.

### Validation 3

```
Test: server-work.test.ts
├── tick dispatches due items via dispatchNexusEvent
├── tick skips items not yet due
├── tick skips non-scheduled status items
├── tick transitions: scheduled → active → completed on success
├── tick transitions: scheduled → active → pending on failure
├── tick resolves prompt from task.agent_prompt when item.description missing
├── tick handles empty result set gracefully
├── tick handles missing ledgers/runtime gracefully (no-op)
├── tick serializes (inFlight guard prevents concurrent ticks)
├── tick includes work_item_id in event metadata
└── start/stop controls timer lifecycle

Integration test: work-pipeline-flow.integration.test.ts
├── Create task + work item with scheduled_at = now - 1s
├── Mock dispatchNexusEvent to return success
├── Call tick → item dispatched with platform: "work"
├── Verify: work item status → 'completed'
├── Verify: work_item_events has created → active → completed
├── Verify: dispatchNexusEvent called with correct routing_override + metadata
└── Existing clock/cron tests still pass (no regression)
```

**Checkpoint:** A work item with `scheduled_at` in the past gets picked up by the work scheduler, dispatched through the full NEX pipeline, and transitions through the complete lifecycle.

---

## Phase 4: Sequence Advancement + Workflow Instantiation

**Goal:** When a work item completes, advance its sequence. Provide workflow instantiation to create sequences from templates.

**Spec ref:** CRM_ANALYSIS_AND_WORK_SYSTEM.md §5 (Reactive Work Item Updates, Campaign Instantiation)

### Architecture

Since work items go through the full NEX pipeline via `dispatchNexusEvent()`, which returns a `NEXPipelineResult`, the work scheduler in `server-work.ts` gets the result synchronously. Sequence advancement happens in the work scheduler's tick loop after a successful completion — keeping all work logic self-contained.

### Files to modify

| File | Change |
|------|--------|
| `nex/src/db/work.ts` | Add `advanceSequence(db, completedWorkItemId)` function |
| `nex/src/db/work.ts` | Add `instantiateWorkflow(db, workflowId, opts)` function |
| `nex/src/nex/control-plane/server-work.ts` | Call `advanceSequence()` after successful completion |

### Implementation

1. **`advanceSequence(db, completedWorkItemId)`:**
   - Get the completed work item
   - If no `sequence_id`, return (standalone item)
   - List all work items in the same sequence
   - Find items whose `depends_on_items` (JSON array) includes only completed items
   - For each newly unblocked item: set status='scheduled', compute `scheduled_at` from workflow step `delay_after_ms`
   - Check if ALL items in sequence are completed → update sequence status to 'completed'

2. **`instantiateWorkflow(db, workflowId, opts: { entityId?, parentSequenceId?, name? })`:**
   - Create sequence row
   - For each workflow_step (ordered by step_order):
     - Create work item from task definition + step overrides
     - Set depends_on_items from step.depends_on_steps (mapped to work item IDs)
   - Schedule first items (those with no dependencies)
   - Return `{ sequence, workItems }`

3. **`server-work.ts` integration** — in tick loop, after `completeWorkItem()`:
   ```typescript
   completeWorkItem(ledgers.work, item.id, 'work-scheduler', summary.text || 'executed');
   advanceSequence(ledgers.work, item.id);  // unblock next items in sequence
   ```

### Validation 4

```
Test: sequence-advancement.test.ts
├── advanceSequence unblocks next item when dependency completes
├── advanceSequence handles multi-dependency (A+B → C)
├── advanceSequence marks sequence 'completed' when all items done
├── advanceSequence handles standalone items (no sequence) gracefully
├── advanceSequence computes scheduled_at from delay_after_ms
└── advanceSequence does nothing for already-completed sequences

Test: workflow-instantiation.test.ts
├── instantiateWorkflow creates sequence + all work items
├── instantiateWorkflow applies task defaults + step overrides
├── instantiateWorkflow maps step dependencies to work item IDs
├── instantiateWorkflow schedules first items (no deps)
├── instantiateWorkflow with entityId binds all items to entity
└── instantiateWorkflow with parentSequenceId creates nested campaign child

Integration test: full-sequence-flow.integration.test.ts
├── Create workflow with 3 steps: A → B → C
├── Instantiate workflow → sequence with 3 work items
├── Verify: item A is 'scheduled', B and C are 'pending'
├── Call work scheduler tick (mock dispatchNexusEvent returns success)
├── Verify: item A completed → advanceSequence → item B now 'scheduled'
├── Call tick again → item B completed → item C scheduled
├── Call tick again → item C completed → sequence 'completed'
└── Verify: work_item_events log shows full lifecycle for all 3 items
```

**Checkpoint:** A 3-step workflow can be instantiated, and work items fire in sequence with proper dependency tracking, all the way through to sequence completion.

---

## Phase 5: Campaign Instantiation

**Goal:** Enable creating campaigns (parent sequences with per-entity child sequences).

**Spec ref:** CRM_ANALYSIS_AND_WORK_SYSTEM.md §5 (Campaign Instantiation)

### Files to modify

| File | Change |
|------|--------|
| `nex/src/db/work.ts` | Add `instantiateCampaign(db, identityDb, workflowId, opts)` function |

### Implementation

1. **`instantiateCampaign(db, identityDb, workflowId, opts: { name, entityFilter })`:**
   - Query identity.db for target entities (e.g., `SELECT entity_id FROM entity_tags WHERE tag = ? AND deleted_at IS NULL`)
   - Create parent sequence (workflow_id=W, entity_id=NULL, name=campaign name)
   - For each target entity: call `instantiateWorkflow(db, workflowId, { entityId, parentSequenceId })`
   - Return { campaign: parentSequence, childSequences }

### Validation 5

```
Test: campaign-instantiation.test.ts
├── instantiateCampaign creates parent + N child sequences
├── Each child sequence has correct entity_id binding
├── Child sequences reference parent_sequence_id
├── First items in each child are 'scheduled'
├── listSequences({ parentId }) returns all children
└── Campaign parent shows status 'active'
```

**Checkpoint:** A campaign targeting entities tagged `pipeline:lead` creates individual sequences per entity, all linked to a parent campaign sequence.

---

## Phase 6: Recurrence Support

**Goal:** Support recurring work items that respawn when completed.

**Spec ref:** CRM_ANALYSIS_AND_WORK_SYSTEM.md §4.3 (recurrence field)

### Files to modify

| File | Change |
|------|--------|
| `nex/src/db/work.ts` | Extend `completeWorkItem` to check recurrence + spawn next instance |

### Implementation

When a work item with a `recurrence` cron expression is completed:
1. Parse the cron expression to compute next occurrence
2. Create a new work item cloned from the original (same task_id, entity_id, title, etc.)
3. Set `scheduled_at` to the next cron time, `recurrence_source_id` to original item
4. Set status='scheduled'

### Validation 6

```
Test: recurrence.test.ts
├── Completing a recurring item creates new item with next scheduled_at
├── New item has recurrence_source_id pointing to original
├── New item inherits task_id, entity_id, title
├── Non-recurring items don't spawn on completion
└── Cron expression parsing works for common patterns (daily, weekly, monthly)
```

---

## Integration Validation Ladder

Each level builds on all previous levels passing. Run from bottom to top.

```
Level 6: Full CRM Flow
├── Create follow-up for entity → fires on schedule → agent executes → completes
├── Create campaign for tagged entities → per-entity sequences advance independently
├── Recurring weekly check-in spawns new items each week
└── Work item + entity activity dashboard queries return correct aggregates

Level 5: Campaign E2E
├── Tag 3 entities with pipeline:lead (with entity_tag_events)
├── Create workflow + instantiate campaign
├── All 3 child sequences created with correct entity bindings
└── Timer processes first items for all 3 sequences

Level 4: Sequence E2E
├── Create 3-step workflow → instantiate → items fire in order
├── Sequence completes when all items complete
└── Full work_item_events audit trail

Level 3: Work Scheduler Integration
├── Due work items picked up by work scheduler tick
├── NexusEvent dispatched with platform: "work" through full pipeline
└── Work item status transitions correctly (scheduled → active → completed)

Level 2: CRUD Correctness
├── All CRUD operations round-trip correctly
├── Status changes are atomic (cache + event log)
├── Query filters return correct results
└── FK constraints enforced

Level 1: Schema Foundation
├── work.db created with all 6 tables
├── identity.db has entity_tag_events + deleted_at
├── openAllLedgers returns 7 databases
└── Indexes exist and pragmas applied

Level 0: Existing Tests Pass
├── All existing cron tests pass (no regression)
├── All existing identity tests pass
└── All existing pipeline tests pass
```

### Running the ladder

```bash
# Level 0: Regression check
pnpm vitest run src/cron/service.jobs.test.ts src/db/identity-schema-migration.test.ts src/nex/pipeline.event-ingested.test.ts

# Level 1: Schema
pnpm vitest run src/db/work-schema.test.ts src/db/entity-tag-events.test.ts

# Level 2: CRUD
pnpm vitest run src/db/work-crud.test.ts

# Level 3: Work Scheduler
pnpm vitest run src/nex/control-plane/server-work.test.ts

# Level 4: Sequence
pnpm vitest run src/db/work-sequence.test.ts

# Level 5: Campaign
pnpm vitest run src/db/work-campaign.test.ts

# Level 6: Full integration
pnpm vitest run --config vitest.e2e.config.ts src/nex/control-plane/server.work-crm-flow.e2e.test.ts

# All at once:
pnpm vitest run src/db/work-schema.test.ts src/db/entity-tag-events.test.ts src/db/work-crud.test.ts src/db/work-sequence.test.ts src/db/work-campaign.test.ts src/db/recurrence.test.ts src/nex/control-plane/server-work.test.ts src/nex/control-plane/server-methods/work.test.ts src/nex/control-plane/runtime-operations.conformance.test.ts src/extensions-api/work.test.ts src/nex/control-plane/server-methods.scope-authz.test.ts src/extensions-api/index.test.ts
pnpm --dir ui test
pnpm vitest run --config vitest.e2e.config.ts src/nex/control-plane/server.work-crm-flow.e2e.test.ts
```

---

## File Summary

### New files
| File | Phase | Purpose |
|------|-------|---------|
| `nex/src/db/work.ts` | 1-6 | work.db schema, types, all CRUD |
| `nex/src/nex/control-plane/server-work.ts` | 3 | Work scheduler: poll work.db → dispatchNexusEvent |
| `nex/src/db/work-schema.test.ts` | 1 | Schema validation tests |
| `nex/src/db/work-crud.test.ts` | 2 | CRUD operation tests |
| `nex/src/db/entity-tag-events.test.ts` | 0 | Entity tag extension tests |
| `nex/src/nex/control-plane/server-work.test.ts` | 3 | Work scheduler tests |
| `nex/src/db/work-sequence.test.ts` | 4 | Sequence advancement + workflow instantiation tests |
| `nex/src/db/work-campaign.test.ts` | 5 | Campaign tests |

### Modified files
| File | Phase | Change |
|------|-------|--------|
| `nex/src/db/identity.ts` | 0 | deleted_at migration + entity_tag_events table + helpers |
| `nex/src/db/ledgers.ts` | 1 | Add "work" to LedgerName, connections, open/close |
| `nex/src/db/index.ts` | 1 | Re-export work.ts |
| `nex/src/iam/identity.ts` | 3 | Add "work" to SYSTEM_PLATFORMS |
| `nex/src/nex/control-plane/server-startup.ts` | 3 | Wire buildRuntimeWorkScheduler alongside clock/cron |

---

## Execution Order

Implement phases sequentially. Each phase has its own test file. Don't proceed to the next phase until the current phase's tests pass AND no regressions in Level 0.

```
Phase 0 (entity tags)     → run Level 0 + Level 1 partial
Phase 1 (schema + ledger) → run Level 0 + Level 1
Phase 2 (CRUD)            → run Level 0 + Level 1 + Level 2
Phase 3 (work scheduler)  → run Level 0 through Level 3
Phase 4 (sequences)       → run Level 0 through Level 4
Phase 5 (campaigns)       → run Level 0 through Level 5
Phase 6 (recurrence)      → run Level 0 through Level 6
```

---

## See Also

- [CRM Analysis and Work System](CRM_ANALYSIS_AND_WORK_SYSTEM.md) — Full schema and design spec
- [Database Architecture](DATABASE_ARCHITECTURE.md) — 7-database layout including work.db
- [Entity Activity Dashboard](ENTITY_ACTIVITY_DASHBOARD.md) — Query patterns consuming work data
- [Unified Entity Store](memory/UNIFIED_ENTITY_STORE.md) — Entity tags with soft-delete
