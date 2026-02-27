# CRM Analysis and Work System

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-26
**Related:** DATABASE_ARCHITECTURE.md, memory/UNIFIED_ENTITY_STORE.md, memory/MEMORY_SYSTEM.md, memory/FACT_GRAPH_TRAVERSAL.md, ENTITY_ACTIVITY_DASHBOARD.md

---

## 1. Overview

This spec captures the analysis of how Nexus's existing contact/entity/identity system can function as a CRM, what behavioral gaps exist, and the design for a work management system that fills those gaps.

**Key finding:** The existing system is already a CRM data layer. Entities, contacts, facts, mental models, events, tags, and groups provide rich relationship data fed by real conversations. What's missing is the **proactive behavior layer** — tracking future work, follow-ups, sequences, and campaigns.

### What Already Works as CRM

| CRM Capability | Existing Primitive | Location |
|---|---|---|
| Contact records | `entities` + `contacts` | identity.db |
| Cross-platform identity | Two-row universal identifier pattern | identity.db |
| Contact deduplication | Union-find merge chain + `merge_candidates` | identity.db |
| Interaction history | Event ledger with FTS | events.db |
| Relationship notes | Facts linked to entities via `fact_entities` | memory.db |
| Relationship summaries | Mental models per entity | memory.db |
| Segmentation | `entity_tags` + `groups` with roles/nesting | identity.db |
| Company-person associations | Entity types + facts linking them | identity.db + memory.db |
| Relationship graph | Fact graph traversal (see FACT_GRAPH_TRAVERSAL.md) | memory.db + identity.db |
| Access control | Tag-based ACL, grants | identity.db |

### What's Needed

| CRM Capability | Solution | New/Existing |
|---|---|---|
| Manual fact creation | Expose existing `create_fact` tool through UI | Existing (UI only) |
| Lifecycle tracking | Entity tags with namespaced conventions (`lifecycle:active`) | Existing + tag event audit |
| Entity activity dashboard | Deterministic aggregates over events + contacts | Existing (queries only, see ENTITY_ACTIVITY_DASHBOARD.md) |
| Relationship health | Mental models with auto-refresh on new facts | Existing |
| Relationship graph queries | Fact graph traversal patterns | Existing (see FACT_GRAPH_TRAVERSAL.md) |
| Follow-ups & reminders | **Work items** (new primitive) | **New: work.db** |
| Task sequences & workflows | **Sequences + workflows** (new primitives) | **New: work.db** |
| Campaigns & batch outreach | Nested sequences (parent_sequence_id) | **New: work.db** |
| External system sync (Jira/Linear) | Work items with source_ref | **New: work.db** |
| Tag transition history | **Entity tag events** (new audit table) | **New: identity.db** |

---

## 2. The Four-Model Pattern

A recurring structural pattern appears across the Nexus data architecture. Three distinct domains (past, knowledge, future) each instantiate the same four abstract models.

### The Models

| Model | Role | Description |
|---|---|---|
| **Atom** | Individual record | An atomic unit of information with timestamp, entity binding, and metadata |
| **Atom Definition** | Template for atoms | Defines a category/type of atom with defaults and configuration |
| **Collection** | Grouping of atoms | A set of atoms organized by criteria (temporal, logical, sequential) |
| **Collection Definition** | Template for collections | Defines how to construct and process a kind of collection |

### Domain Instantiation

| | Atom | Atom Definition | Collection | Collection Definition |
|---|---|---|---|---|
| **Past** (events.db) | Event | *(implicit in adapters)* | Episode | Episode Definition |
| **Knowledge** (memory.db) | Fact | *(implicit in writer)* | Observation (analysis_run) | Analysis Type |
| **Future** (work.db) | Work Item | Task | Sequence | Workflow |

**Why Past and Knowledge lack explicit Atom Definitions:** Events arrive from external platforms — the adapter defines their shape implicitly. Facts are extracted by the memory writer agent using judgment — the writer's prompt is the implicit definition. Work items are different: the system itself creates them, so explicit definitions (Tasks) are needed to standardize categories of work.

**The empty slots are extensible.** Event Definitions could be added later for custom event types or categorization schemas. Fact Definitions could enable typed fact queries ("show me all preference facts about Sarah"). The architecture accommodates these without restructuring.

### Time Orientation

The three domains form a temporal spectrum:

```
Past (events.db)          Knowledge (memory.db)         Future (work.db)
────────────────          ─────────────────────         ────────────────
Records what happened     Derives understanding          Plans what should happen
Immutable, append-only    Mostly immutable               Immutable core + mutable state
Feeds into knowledge      Synthesizes past               Consumes knowledge for context
                          Informs future                 Produces events when executed
```

When a work item comes due, the clock/cron adapter converts it to a NexusEvent and pushes it through the NEX pipeline. **Work items become events when they mature.** This is the bridge between future and past — the forward-looking system feeds into the backward-looking system naturally.

### Schema Conventions

Each domain implements its models with domain-specific fields, but shares common field naming conventions:

| Convention | Meaning | Used In |
|---|---|---|
| `id` | Primary key (TEXT, ULID/UUID) | All tables |
| `entity_id` | Optional binding to an entity in identity.db | All atom and collection tables |
| `source` | Provenance: who/what created this record | All atom tables |
| `source_ref` | External system ID (JIRA-123, LIN-456) | Atoms with external origin |
| `metadata_json` | Flexible JSON extension point | All tables |
| `created_at` | When the row was physically inserted (unix ms) | All tables |
| `updated_at` | When the row was last modified (unix ms) | Mutable tables |
| `status` | Lifecycle state | Collections and future atoms |

**This is a design principle, not a code abstraction.** Each domain implements concrete types with domain-specific fields. The shared conventions ensure consistency and make cross-domain queries predictable. No shared base types or generic interfaces are needed.

### Immutability Pattern

All domains follow the same approach to state tracking:

```
Immutable core record (the atom/collection itself — never changes)
  + Mutable state cache (status fields — updated for fast queries)
  + Immutable event log (every state change appended, never modified)
```

| Domain | Core Record | State Cache | Event Log |
|---|---|---|---|
| **Past** | `events` (immutable) | `event_state` (viewed, archived, pinned) | `event_state_log` |
| **Future** | `work_items` (immutable core) | status/assignee fields on work_items | `work_item_events` |
| **Identity** | `entity_tags` (current state) | deleted_at field | `entity_tag_events` |

The event log is always the source of truth. The mutable state fields are a materialized cache for query performance. If they disagree, the event log wins.

---

## 3. Entity Tag Events

New audit table in identity.db for tracking tag lifecycle with full fidelity.

### Schema

```sql
-- Existing table (minor addition: deleted_at for soft-delete)
CREATE TABLE entity_tags (
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER,           -- NULL = active, set = soft-deleted
  PRIMARY KEY (entity_id, tag)
);

-- New table: full transition history
CREATE TABLE entity_tag_events (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL,
  tag         TEXT NOT NULL,
  action      TEXT NOT NULL,      -- 'added' | 'removed'
  actor       TEXT,               -- 'user', 'memory-writer', 'agent', 'system'
  reason      TEXT,               -- human-readable: '45 days no contact', 'manual reclassification'
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_entity_tag_events_entity ON entity_tag_events(entity_id, created_at DESC);
CREATE INDEX idx_entity_tag_events_tag ON entity_tag_events(tag, created_at DESC);
```

### Behavior

When a tag is added or removed, both tables are updated atomically:

**Adding a tag:**
1. INSERT/UPDATE `entity_tags` (set `deleted_at = NULL` if re-adding)
2. INSERT into `entity_tag_events` with `action = 'added'`

**Removing a tag:**
1. UPDATE `entity_tags` SET `deleted_at = now`
2. INSERT into `entity_tag_events` with `action = 'removed'`

### Tag Naming Conventions for CRM

```
lifecycle:new           -- recently discovered contact
lifecycle:active        -- actively communicating
lifecycle:dormant       -- no recent contact (threshold configurable)
lifecycle:archived      -- intentionally archived

pipeline:lead           -- potential business relationship
pipeline:qualified      -- qualified lead
pipeline:in-conversation -- active discussions
pipeline:active-client  -- current client
pipeline:past-client    -- former client

relationship:family
relationship:close-friend
relationship:colleague
relationship:acquaintance
```

These are conventions, not schema constraints. Any tag string is valid.

---

## 4. Work System — work.db

The 7th database in the Nexus architecture. Tracks future work to be done.

**Purpose (one sentence):** What should happen — task definitions, work items, workflow definitions, and sequences for tracking planned and scheduled work.

### Design Principles

1. **Immutable core + mutable state cache + immutable event log.** Work item creation records don't change. Status is a cached field. All changes logged to `work_item_events`.
2. **Definition/instance pattern.** Tasks define kinds of work. Work items are specific instances. Workflows define kinds of sequences. Sequences are specific instances.
3. **Entity binding is optional.** Work items and sequences MAY relate to an entity but don't have to.
4. **Sequences nest.** A campaign is a parent sequence whose children are entity-level sequences. Self-referential `parent_sequence_id`.
5. **Work items become events.** When a work item comes due, the clock/cron adapter converts it to a NexusEvent and pushes it through the NEX pipeline. The pipeline routes to the appropriate agent/meeseeks for execution.

### 4.1 tasks — Atom Definitions

Templates for kinds of work. Analogous to Episode Definitions.

```sql
CREATE TABLE tasks (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,       -- 'follow_up', 'initial_outreach', 'quarterly_review'
  description             TEXT,
  type                    TEXT,                -- category: 'follow_up', 'outreach', 'review', 'check_in'

  -- Defaults (applied when instantiating work items)
  default_assignee_type   TEXT,                -- 'user', 'agent', 'meeseeks'
  default_assignee_id     TEXT,
  default_priority        TEXT,                -- 'low', 'normal', 'high', 'urgent'
  default_due_offset_ms   INTEGER,             -- ms from creation. 3 days = 259200000

  -- Execution
  automation_ref          TEXT,                -- automation ID that handles execution
  agent_prompt            TEXT,                -- prompt template for agent/meeseeks execution

  metadata_json           TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_name ON tasks(name);
```

### 4.2 workflows — Collection Definitions

Templates for kinds of sequences. Defines ordered steps with dependencies.

```sql
CREATE TABLE workflows (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,        -- 'new_client_onboarding', 'lead_nurture_3step'
  description       TEXT,
  type              TEXT,                 -- category: 'onboarding', 'outreach', 'review', 'engineering'

  metadata_json     TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_workflows_type ON workflows(type);

CREATE TABLE workflow_steps (
  id                      TEXT PRIMARY KEY,
  workflow_id             TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id                 TEXT NOT NULL REFERENCES tasks(id),
  step_order              INTEGER NOT NULL,

  -- Sequencing
  depends_on_steps        TEXT,            -- JSON array of step IDs that must complete first
  delay_after_ms          INTEGER,         -- wait N ms after dependencies complete before activating
  condition_json          TEXT,            -- optional: JSON condition for whether to execute this step

  -- Overrides (override task defaults for this specific step)
  override_due_offset_ms  INTEGER,
  override_priority       TEXT,
  override_assignee_type  TEXT,
  override_assignee_id    TEXT,
  override_prompt         TEXT,

  metadata_json           TEXT,
  created_at              INTEGER NOT NULL,
  UNIQUE(workflow_id, step_order)
);

CREATE INDEX idx_workflow_steps_workflow ON workflow_steps(workflow_id, step_order);
CREATE INDEX idx_workflow_steps_task ON workflow_steps(task_id);
```

### 4.3 work_items — Atom Instances

Specific work to be done. Immutable core + mutable state cache.

```sql
CREATE TABLE work_items (
  id                TEXT PRIMARY KEY,

  -- Definition binding (nullable for ad-hoc items)
  task_id           TEXT REFERENCES tasks(id),

  -- Immutable core
  title             TEXT NOT NULL,
  description       TEXT,
  entity_id         TEXT,                 -- optional: who/what this is about (references identity.db)
  priority          TEXT,                 -- 'low', 'normal', 'high', 'urgent'
  due_at            INTEGER,              -- when this should be done/happen
  scheduled_at      INTEGER,              -- when to push into NEX pipeline (may differ from due_at)

  -- Sequence binding
  sequence_id       TEXT REFERENCES sequences(id),
  workflow_step_id  TEXT REFERENCES workflow_steps(id),
  sequence_order    INTEGER,
  depends_on_items  TEXT,                 -- JSON array of work_item IDs that must complete first

  -- Provenance
  source            TEXT,                 -- 'manual', 'automation', 'workflow', 'import:jira', 'import:linear'
  source_ref        TEXT,                 -- external ID (JIRA-123, LIN-456)
  source_url        TEXT,                 -- link back to external system

  -- Recurrence
  recurrence        TEXT,                 -- cron expression for recurring items
  recurrence_source_id TEXT,              -- original work_item this was spawned from

  -- Mutable state cache (source of truth is work_item_events)
  status            TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'scheduled', 'active', 'blocked',
                                                       -- 'completed', 'cancelled', 'snoozed'
  assignee_type     TEXT,                 -- 'user', 'agent', 'meeseeks'
  assignee_id       TEXT,
  started_at        INTEGER,
  completed_at      INTEGER,
  snoozed_until     INTEGER,

  metadata_json     TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_work_items_status ON work_items(status);
CREATE INDEX idx_work_items_due ON work_items(due_at) WHERE status IN ('pending', 'scheduled');
CREATE INDEX idx_work_items_entity ON work_items(entity_id);
CREATE INDEX idx_work_items_sequence ON work_items(sequence_id, sequence_order);
CREATE INDEX idx_work_items_task ON work_items(task_id);
CREATE INDEX idx_work_items_source ON work_items(source, source_ref);
CREATE INDEX idx_work_items_assignee ON work_items(assignee_type, assignee_id) WHERE status = 'active';
CREATE INDEX idx_work_items_snoozed ON work_items(snoozed_until) WHERE status = 'snoozed';
CREATE INDEX idx_work_items_scheduled ON work_items(scheduled_at) WHERE status = 'scheduled';
```

### 4.4 work_item_events — Immutable State Change Log

Every status/assignment change is appended here. This is the source of truth for work item lifecycle history.

```sql
CREATE TABLE work_item_events (
  id              TEXT PRIMARY KEY,
  work_item_id    TEXT NOT NULL REFERENCES work_items(id),
  action          TEXT NOT NULL,       -- 'created', 'status_changed', 'assigned', 'snoozed',
                                        -- 'completed', 'cancelled', 'priority_changed', 'rescheduled'
  old_value       TEXT,                -- previous state (JSON or simple value)
  new_value       TEXT,                -- new state
  actor           TEXT,                -- 'user', 'agent', 'clock', 'system'
  reason          TEXT,                -- human-readable explanation
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_work_item_events_item ON work_item_events(work_item_id, created_at DESC);
CREATE INDEX idx_work_item_events_action ON work_item_events(action, created_at DESC);
CREATE INDEX idx_work_item_events_actor ON work_item_events(actor);
```

### 4.5 sequences — Collection Instances

Specific sequence of work items, optionally following a workflow definition.

```sql
CREATE TABLE sequences (
  id                    TEXT PRIMARY KEY,

  -- Definition binding (nullable for ad-hoc sequences)
  workflow_id           TEXT REFERENCES workflows(id),

  -- Nesting (campaigns = parent sequences with child sequences)
  parent_sequence_id    TEXT REFERENCES sequences(id),

  -- Core
  name                  TEXT NOT NULL,
  description           TEXT,
  entity_id             TEXT,            -- optional: who/what this sequence is about
  status                TEXT NOT NULL,   -- 'pending', 'active', 'paused', 'completed', 'cancelled'

  -- Provenance
  source                TEXT,            -- 'manual', 'automation', 'campaign', 'import:linear'
  source_ref            TEXT,
  source_url            TEXT,

  -- Lifecycle
  started_at            INTEGER,
  completed_at          INTEGER,

  metadata_json         TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX idx_sequences_workflow ON sequences(workflow_id);
CREATE INDEX idx_sequences_entity ON sequences(entity_id);
CREATE INDEX idx_sequences_status ON sequences(status);
CREATE INDEX idx_sequences_parent ON sequences(parent_sequence_id);
```

---

## 5. Execution Model

### How Work Items Enter the NEX Pipeline

The **clock/cron adapter** is the scheduler. When a work item gets a `scheduled_at` timestamp, it registers with the clock adapter's schedule. The clock adapter reads work.db directly as its schedule source and fires work items as NexusEvents when they come due — the same way it fires any other cron/timer event.

```
work.db                              NEX Pipeline
───────                              ────────────

Clock/Cron Adapter
  Reads work.db as schedule source:
    work_items
      WHERE status = 'scheduled'
      AND scheduled_at <= :now
           │
           ▼
  Fires NexusEvent:
    {                                receiveEvent
      type: 'work_item.due',            │
      source: 'clock',              resolvePrincipals
      work_item_id: '...',              │
      entity_id: '...',             resolveAccess
      task_id: '...',                   │
      metadata: { ... }             runAutomations ←── matches work_item.due events
    }                                    │
                                    assembleContext ←── recall injects entity context
                                         │
                                    runAgent ←── meeseeks executes the work
                                         │
                                    deliverResponse ←── sends message if outbound
                                         │
                                    finalize
                                         │
                                         ▼
                                    Update work_item status in work.db
                                    Check sequence: next step unblocked?
                                      If yes → schedule next work_item
```

No separate "work scheduler" automation or service is needed. The clock adapter already handles timed event delivery — work items are just another source of scheduled events for it to manage.

### Reactive Work Item Updates

When an inbound event arrives that relates to an active work item:

```
Inbound event (e.g., Sarah replies to outreach)
  → NEX pipeline runs normally
  → Automation checks: active work_items for sender entity?
  → If match found:
      → Update work_item status (e.g., 'completed' if response received)
      → Write to work_item_events
      → Check sequence dependencies
      → Activate next step if unblocked
```

### Campaign Instantiation

An automation or manual action creates a campaign:

```
1. Resolve target filter: SELECT entity_id FROM entity_tags WHERE tag = 'pipeline:lead'
2. Create parent sequence: (workflow_id=W, entity_id=NULL, name="Q1 Lead Nurture")
3. For each target entity:
   a. Create child sequence: (workflow_id=W, entity_id=E, parent_sequence_id=campaign)
   b. For each workflow_step in W:
      c. Create work_item from step's task definition
         - Apply task defaults + step overrides
         - Compute due_at from delay_after_ms
         - Set depends_on_items from step dependencies
         - Set sequence_id, workflow_step_id, sequence_order
4. Schedule first work items (those with no dependencies)
```

### Follow-Up Creation

A follow-up is simply a work item:

```
Manual: "Remind me to follow up with Sarah about the proposal on Tuesday"
  → Create work_item:
      task_id: (follow_up task definition)
      title: "Follow up with Sarah about the proposal"
      entity_id: sarah
      due_at: next Tuesday 9am
      source: 'manual'
      status: 'scheduled'
      scheduled_at: next Tuesday 9am

Agent-initiated: Agent detects dormancy during conversation context
  → Create work_item:
      task_id: (check_in task definition)
      title: "Check in with Sarah - 30 days no contact"
      entity_id: sarah
      due_at: tomorrow
      source: 'agent'
      status: 'scheduled'
      scheduled_at: tomorrow 9am
```

**Note on relationship health:** Mental models already auto-refresh via the existing memory consolidation pipeline when underlying observations change. Dormancy detection and relationship health monitoring do not require a separate automation — the memory system handles this naturally. An agent reviewing entity context during normal operation can create follow-up work items when it notices dormancy.

### External System Sync

```
Jira/Linear adapter imports:
  Epic/Project  →  Sequence (source='import:jira', source_ref='PROJ-100')
  Issue         →  Work Item (source='import:jira', source_ref='PROJ-101')
  Issue Type    →  Task (if new type discovered)
  Status change →  work_item_events + status cache update

GitHub adapter imports:
  Milestone     →  Sequence
  Issue         →  Work Item (source='import:github', source_ref='#123')

Bidirectional sync: status changes in work.db propagate back to external
systems via adapter-specific outbound events.
```

---

## 6. Database Layout (Post Work System)

```
{workspace}/state/data/
├── events.db          # Event ledger (past: what happened)
├── agents.db          # Agent sessions (present: execution state)
├── identity.db        # Identity, directory, entities, auth, ACL (timeless: who)
├── memory.db          # Facts, episodes, analysis (derived: knowledge)
├── embeddings.db      # Vector index (derived: semantic search)
├── runtime.db         # Pipeline operations, adapters, automations, bus (present: operations)
└── work.db            # Tasks, work items, workflows, sequences (future: what should happen)
```

### Table Inventory: work.db

| Table | Purpose |
|---|---|
| `tasks` | Atom definitions: templates for kinds of work |
| `workflows` | Collection definitions: templates for sequences |
| `workflow_steps` | Ordered task references within a workflow, with dependencies and overrides |
| `work_items` | Atom instances: specific work to be done, with immutable core + mutable state |
| `work_item_events` | Immutable audit log of all work item state changes |
| `sequences` | Collection instances: specific sequences of work items, self-referential for nesting |

### New Table in identity.db

| Table | Purpose |
|---|---|
| `entity_tag_events` | Immutable audit log of tag additions and removals |

---

## 7. Proactive Behavior — No Separate Automation Needed

**Key insight:** The CRM proactive behaviors that would traditionally require a "relationship monitor" automation are already handled by existing Nexus primitives:

1. **Relationship health monitoring** — Mental models already auto-refresh via the memory consolidation pipeline when underlying observations are modified. No separate automation needed.

2. **Due work item firing** — The clock/cron adapter reads work.db directly as a schedule source. When `scheduled_at <= now`, the adapter fires the work item as a NexusEvent. This is built into the adapter, not a separate automation row.

3. **Sequence advancement** — When a work item completes during NEX pipeline finalization, the pipeline checks sequence dependencies and schedules the next unblocked work item. This is part of the pipeline's finalize stage, not a polling automation.

4. **Dormancy detection** — Can be expressed as a recurring work item (using the `recurrence` field) that creates a check-in task when fired. Or, agents can notice dormancy during normal entity context review and create follow-up work items.

**Design principle:** Rather than adding automation rows that poll on timer ticks, each concern is handled by the system component best positioned to act on it — the clock adapter for scheduling, the pipeline for sequencing, and the memory system for relationship health.

---

## 8. Related Specs

| Spec | Purpose |
|---|---|
| `memory/FACT_GRAPH_TRAVERSAL.md` | Relationship query patterns using fact graph (replaces typed relationship table) |
| `ENTITY_ACTIVITY_DASHBOARD.md` | Per-entity and aggregate CRM metrics, queries, and visualization spec |
| `DATABASE_ARCHITECTURE.md` | Canonical database layout (update to include work.db as 7th database) |
| `memory/UNIFIED_ENTITY_STORE.md` | Entity schema, contacts, groups, merge mechanics |
| `memory/MEMORY_SYSTEM.md` | Facts, episodes, observations, mental models |
| `nex/UNIFIED_RUNTIME_OPERATION_MODEL.md` | NEX pipeline that work items flow through |

---

## 9. Summary: New Primitives

After full analysis, the CRM capability requires exactly:

| New Primitive | Type | Location | Purpose |
|---|---|---|---|
| `tasks` | Table | work.db | Define kinds of work (atom definitions) |
| `workflows` | Table | work.db | Define kinds of sequences (collection definitions) |
| `workflow_steps` | Table | work.db | Ordered steps within workflows |
| `work_items` | Table | work.db | Track specific work to be done (atom instances) |
| `work_item_events` | Table | work.db | Immutable audit log of work item changes |
| `sequences` | Table | work.db | Track specific sequences of work (collection instances) |
| `entity_tag_events` | Table | identity.db | Immutable audit log of tag changes |

**No new automations or services required.** The clock/cron adapter integrates with work.db directly as a schedule source. Relationship health monitoring is handled by the existing memory consolidation pipeline. Sequence advancement is handled by the NEX pipeline finalize stage.

Everything else — relationship health, activity dashboards, lifecycle tracking, relationship graphs, entity profiles — composes from existing primitives (facts, mental models, entity tags, events, contacts, recall API).
