# Work Domain Unification

**Status:** COMPLETE — all decisions locked
**Last Updated:** 2026-03-04

---

## Overview

The Nexus codebase evolved five separate "do stuff" subsystems across four databases. This spec unifies them into a coherent set of primitives that eliminates duplication while preserving the genuine value of each subsystem.

**Cross-references:**
- Cron/Clock: [API_DESIGN_BATCH_4.md](./API_DESIGN_BATCH_4.md) (Batch 4, `clock.schedule.*` → superseded by `cron.*`)
- Agents & Workspaces: [API_DESIGN_BATCH_4.md](./API_DESIGN_BATCH_4.md) (Batch 4)
- Memory System: [API_DESIGN_BATCH_3.md](./API_DESIGN_BATCH_3.md) (Batch 3, sets/elements/jobs)
- Agent Config: extends agents domain from Batch 4
- Batch 6 Operations: [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md)

---

## The Problem: Five Overlapping Systems

| System | Database | Core Concept | Scheduling | Trigger |
|--------|----------|-------------|------------|---------|
| **Cron** | nexus.db | `cron_jobs` — scheduled agent turns/events | Dynamic timer | Time (at/every/cron) |
| **Clock Tick** | *(none)* | Heartbeat signal | Fixed 30s interval | Time |
| **Automations** | events.db | `automations` — event-reactive scripts | — | Event matching |
| **Memory Jobs** | memory.db | `jobs` + `job_types` — processing pipeline | Pipeline/manual | Pipeline stage |
| **Work CRM** | work.db | `work_items` + `tasks` — agent task management | Fixed 30s polling | Time (scheduled_at) |

### Duplication Identified

**1. Template → Instance Pattern (3x)**
- Memory: `job_types` → `jobs`
- Work CRM: `tasks` → `work_items`
- Automations: `automations` → `hook_invocations`

**2. Collections / Orchestration (2x)**
- Memory: `set_definitions` → `sets` (flat/polymorphic)
- Work CRM: `workflows` → `sequences` (linear, with dependencies)

**3. Scheduling and Dispatch (3x)**
- Cron service: cron expression → `dispatchNexusEvent`
- Work scheduler: `scheduled_at` → `dispatchNexusEvent`
- Clock tick: 30s `setInterval` → `dispatchNexusEvent`
- All three run independent polling loops. Both Cron and Work use cron expressions.

**4. Audit Trails (3x)**
- Work CRM: `work_item_events` (action, old_value, new_value, actor)
- Automations: `hook_invocations` (timing, metrics, errors, broker stats)
- Memory: `processing_log` (target_type, target_id, job_type_id)

### What is NOT Duplicated

- **Events** (events.db): Axiomatic raw inputs. Unique.
- **Elements** (memory.db): Derived knowledge. Unique.
- **Sets** (memory.db): Polymorphic data collections. Unique (but see DAG below).
- **Entities** (identity.db): Canonical identity. Unique.

---

## The Unified Primitives

### The Key Insight: Everything is a Job

A retain operation is a job. A consolidate is a job. "Follow up with Sarah" is a job. "When a DM arrives, auto-categorize" is a job. A cron-scheduled health check is a job.

The primitive is the **Job**. An automation is a job that reacts to an event. A work item is a job that runs on a schedule. A memory processing task is a job that processes a set of inputs.

The job's script can do anything: dispatch an agent, run batch LLM processing, send an email, invoke a tool. The job primitive doesn't care about the HOW — it captures the WHAT and tracks the execution.

### The Missing Primitive: DAG

Sets are flat/polymorphic collections — great for grouping data inputs. But workflows require something sets cannot express:
- **Dependencies** (A must complete before B)
- **Conditions** (only run B if A produced result X)
- **Delays** (wait 24 hours after A before starting B)
- **Branching** (if X then run B, else run C)
- **Parallel execution** (A and B can run concurrently)

The **DAG** (Directed Acyclic Graph) is the workflow primitive. Nodes are job definitions. Edges are dependencies with conditions and timing.

### Two Collection Types

**Sets** = data collections. Polymorphic members (events, elements, sets). Used as inputs to jobs. Strategy-based grouping.

**DAGs** = workflow collections. Nodes are job definitions with edges (dependencies, conditions, delays). Used for multi-step orchestration.

Both are valuable. Both remain.

### Triggers Collapse to Cron

Event-reactive behavior (conditions, hook points, pubsub subscriptions) lives in the **job script itself** — code is always more expressive than configuration JSON. The job definition declares WHERE it attaches (hook_points field) but the script decides IF and HOW to respond.

Time-based scheduling (cron expressions, intervals, one-shots) requires persistent runtime state (next_run_at, last_run_at). This is the **Cron Schedule** — a binding between a job definition and a time-based pattern.

Clock tick is just a cron schedule with `*/30 * * * * *`. The separate work scheduler and clock tick service are eliminated.

### Audit Trail IS Job Runs

There is no separate audit trail table. The collection of job run records IS the audit trail. A job run is created, it executes, it completes or fails. The record is immutable. If you want to know what happened, you query job runs.

Job runs link to agent turns via `turn_ids`. From a turn, you can reconstruct the full session — every tool call, every decision, the complete agent behavior.

---

## Unified Schema

### Job Definitions (14 fields)

The **template**. "Here is a thing that CAN be done."

Starting point: the existing `automations` table, which is the closest to the right shape.

```sql
CREATE TABLE IF NOT EXISTS job_definitions (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL UNIQUE,
    description           TEXT,
    script_path           TEXT NOT NULL,
    script_hash           TEXT,
    config_json           TEXT,
    status                TEXT NOT NULL DEFAULT 'active',
    version               INTEGER NOT NULL DEFAULT 1,
    previous_version_id   TEXT REFERENCES job_definitions(id),
    timeout_ms            INTEGER,
    workspace_dir         TEXT,
    hook_points           TEXT,
    created_by            TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
```

**Field justifications:**

| Field | Why |
|-------|-----|
| `id` | Primary key |
| `name` | Human-readable unique identifier. Agents and humans reference jobs by name. |
| `description` | What this job does. Shown in listings, used by agents to understand purpose. |
| `script_path` | Path to the executable script (JS/TS). The script IS the job logic. |
| `script_hash` | SHA-256 of the script file. Enables immutable versioning — when hash changes, a new version is created automatically. |
| `config_json` | Job-specific configuration. Anything the script needs that isn't in the script itself. |
| `status` | `active` / `paused` / `disabled`. Controls whether the job can be invoked. |
| `version` | Monotonically increasing version number. |
| `previous_version_id` | Links to the previous version of this job definition. Creates an immutable lineage chain. |
| `timeout_ms` | Maximum execution time before the runtime kills the job. |
| `workspace_dir` | The job's own knowledge base. Different agents performing the same job share this workspace. The workspace can have a manifest so agents accumulate learnings about performing the job. Loaded at message level (persona workspace loads at system level). |
| `hook_points` | JSON array of pipeline attachment points (e.g., `["post-ingest", "pre-delivery"]`). If populated, the runtime invokes this job at those pipeline stages. The script handles all condition evaluation. If null/empty, the job is only triggered by cron or manually. Pipeline hooks are blocking by definition. |
| `created_by` | Entity ID of the creator (human, agent, or system). Connects to the identity system. |
| `created_at`, `updated_at` | ISO 8601 timestamps. |

**What was removed from the automations schema and why:**

| Removed Field | Reason |
|---------------|--------|
| `mode` (persistent/one-shot) | Moved to cron schedule behavior. A one-shot is a schedule with a bounded date range. |
| `triggers_json` | Event matching conditions live in the job script, not in configuration JSON. Code is always more expressive than config. |
| `blocking` | Implicit from hook_points — pipeline hooks are blocking by definition. Pubsub subscriptions are non-blocking and handled in script code. |
| `hook_point` (singular) | Replaced by `hook_points` (plural, JSON array) to support attaching to multiple pipeline stages. |
| `self_improvement` | This is a DAG-level concept. A self-improvement workflow is a DAG that chains: do work → reflect → improve the script. |
| `session_target` | Removed. Session context is determined at invocation time by whatever triggers the job (cron creates isolated sessions, DAGs inherit context, hooks run inline, manual callers specify). |
| `wake_mode` | Implementation detail, can live in config_json if needed. |
| `peer_workspaces` | Lives in config_json. |
| `created_by_session`, `created_by_thread` | Overly granular provenance. Entity ID is sufficient. |
| `disabled_at`, `disabled_reason` | Status + updated_at is sufficient. Reason can be in config_json or metadata. |
| `last_triggered`, `trigger_count` | Computed from job runs. Don't denormalize what you can query. |
| `last_error`, `consecutive_errors` | Computed from job runs. |
| `circuit_state`, `circuit_opened_at` | Computed from recent job run failures. If N consecutive failures, runtime auto-disables. |

### Immutable Version Lineage (script_hash)

When the runtime detects that `script_hash` differs from the file at `script_path`:
1. Create a NEW job_definitions record (new id, incremented version)
2. Set `previous_version_id` to the old record's id
3. Old record remains as immutable history

All job runs reference the specific job_definition_id they executed against. You get a complete lineage:

```
retain_v1 (script_hash: abc123)
  └→ retain_v2 (script_hash: def456, previous_version_id: v1)
      └→ retain_v3 (script_hash: 789ghi, previous_version_id: v2)
```

Query: "Show me all runs of retain, grouped by version" instantly reveals when the script changed and how behavior shifted. Especially powerful with self-improvement DAGs that modify their own scripts.

---

### Cron Schedules (11 fields)

A **binding** between a job definition and a time-based firing pattern.

```sql
CREATE TABLE IF NOT EXISTS cron_schedules (
    id                    TEXT PRIMARY KEY,
    name                  TEXT,
    job_definition_id     TEXT NOT NULL REFERENCES job_definitions(id),
    expression            TEXT NOT NULL,
    timezone              TEXT DEFAULT 'UTC',
    active_from           TEXT,
    active_until          TEXT,
    enabled               INTEGER DEFAULT 1,
    next_run_at           TEXT,
    last_run_at           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
```

**Field justifications:**

| Field | Why |
|-------|-----|
| `id` | Primary key |
| `name` | Optional human-readable label. "morning_health_check", "clock_tick", etc. |
| `job_definition_id` | Which job to fire. FK to job_definitions. |
| `expression` | Cron expression. Supports 6-field format (with seconds) for sub-minute intervals. This is the ONLY scheduling format — no separate "interval" or "at" kinds. |
| `timezone` | IANA timezone for expression evaluation. Defaults to UTC. |
| `active_from` | ISO 8601 datetime. When this schedule becomes active. Null = immediately. |
| `active_until` | ISO 8601 datetime. When this schedule stops firing. Null = forever. |
| `enabled` | Boolean. Can be toggled without deleting the schedule. |
| `next_run_at` | ISO 8601 datetime. Computed by the cron service. When the next fire will occur. |
| `last_run_at` | ISO 8601 datetime. When the schedule last fired. |
| `created_at`, `updated_at` | ISO 8601 timestamps. |

**No error tracking on schedules.** The cron schedule doesn't error — the JOB errors. Error tracking lives on job runs. Circuit-breaker behavior (stop scheduling after N failures) is computed by querying recent job runs for the job_definition_id.

**No `kind` field.** Everything is a cron expression. The `active_from`/`active_until` date range handles windowing and one-shots. See usage examples below.

#### Cron Expression Format

Uses 6-field cron (with seconds) for sub-minute support:

```
┌──────────── second (0-59)
│ ┌────────── minute (0-59)
│ │ ┌──────── hour (0-23)
│ │ │ ┌────── day of month (1-31)
│ │ │ │ ┌──── month (1-12)
│ │ │ │ │ ┌── day of week (0-6, Sunday=0)
│ │ │ │ │ │
* * * * * *
```

#### Usage Examples

**Clock tick — every 30 seconds, forever:**
```
name:        "clock_tick"
expression:  "*/30 * * * * *"
timezone:    "UTC"
active_from: null          -- start immediately
active_until: null         -- run forever
```

**Weekday morning standup — 9am ET, Monday through Friday:**
```
name:        "morning_standup"
expression:  "0 0 9 * * 1-5"
timezone:    "America/New_York"
active_from: null
active_until: null
```

**One-shot — fire once at a specific time:**
```
name:        "quarterly_review_reminder"
expression:  "0 0 10 15 3 *"       -- 10:00 AM on March 15
timezone:    "America/Los_Angeles"
active_from: null
active_until: "2026-03-16T00:00:00Z"  -- window closes after the target day
```
The cron expression matches March 15 at 10am. The `active_until` ensures it never fires again after that date. No special one-shot logic needed.

**Temporary schedule — every hour during a 2-week campaign:**
```
name:        "campaign_monitor"
expression:  "0 0 * * * *"          -- top of every hour
timezone:    "UTC"
active_from: "2026-04-01T00:00:00Z"
active_until: "2026-04-15T00:00:00Z"
```
Fires hourly, but only during the two-week campaign window.

**Every 5 minutes during business hours:**
```
name:        "inbox_check"
expression:  "0 */5 9-17 * * 1-5"   -- every 5 min, 9am-5pm, weekdays
timezone:    "America/New_York"
active_from: null
active_until: null
```

**End of day wrap-up — 6pm every day:**
```
name:        "daily_wrapup"
expression:  "0 0 18 * * *"
timezone:    "America/New_York"
active_from: "2026-03-01T00:00:00Z"  -- started March 1st
active_until: null                    -- runs indefinitely
```

---

### Job Runs (13 fields) — The Audit Trail

The **instance**. "Here is a specific time that thing WAS done."

```sql
CREATE TABLE IF NOT EXISTS job_runs (
    id                    TEXT PRIMARY KEY,
    job_definition_id     TEXT NOT NULL REFERENCES job_definitions(id),
    cron_schedule_id      TEXT REFERENCES cron_schedules(id),
    dag_run_id            TEXT REFERENCES dag_runs(id),
    dag_node_id           TEXT REFERENCES dag_nodes(id),
    status                TEXT NOT NULL DEFAULT 'pending',
    input_json            TEXT,
    output_json           TEXT,
    error                 TEXT,
    turn_ids              TEXT,
    started_at            TEXT,
    completed_at          TEXT,
    duration_ms           INTEGER,
    metrics_json          TEXT,
    created_at            TEXT NOT NULL
);
```

**Field justifications:**

| Field | Why |
|-------|-----|
| `id` | Primary key |
| `job_definition_id` | Which job was executed. FK to job_definitions. |
| `cron_schedule_id` | Which cron schedule fired this run. Null for hook-triggered, DAG-triggered, or manual runs. |
| `dag_run_id` | Which DAG run this is part of. Null for standalone runs. |
| `dag_node_id` | Which DAG node this run executes. Null for standalone runs. |
| `status` | `pending` → `running` → `completed` / `failed` / `cancelled`. Immutable lifecycle. |
| `input_json` | What was passed in. Could contain: set reference (for memory jobs), event data (for hook jobs), entity context, parameters. Flexible by design. |
| `output_json` | What came out. Could contain: produced element IDs, script results, side effect records. |
| `error` | Error message if the run failed. |
| `turn_ids` | JSON array of agent turn IDs created during this job execution. For jobs that dispatch agents, this links to the full agent behavior — tool calls, decisions, conversation history. For pure script jobs that don't dispatch agents, this is null. |
| `started_at`, `completed_at` | ISO 8601 timestamps. |
| `duration_ms` | How long the execution took. |
| `metrics_json` | Performance data: token counts, LLM calls, broker stats, cost. |
| `created_at` | ISO 8601 timestamp. When the run record was created (may differ from started_at for queued runs). |

**No `fired` boolean.** If the job ran, it acted. The `turn_ids` field provides links to the agent sessions for deep inspection of what happened and why. If `turn_ids` is null and `output_json` is null, the job's script handled everything internally.

**No entity_id.** If the job was run for a specific entity (e.g., "follow up with Sarah"), the entity context is in `input_json`. The job run doesn't own entity relationships — the job script receives entity context as input.

**No assignee.** Which agent performed the work is captured in the agent turns referenced by `turn_ids`. The turn records which agent config was used.

**No snoozed.** Snoozing is a scheduling concern. If work needs to be deferred, create a new cron schedule for the job. The job run is immutable — it ran or it didn't.

**No priority.** Priority is a scheduling/queue concept, not an execution record. If needed, it's part of the cron schedule or DAG node configuration.

### The Job Run IS the Audit Trail

This table replaces three former audit mechanisms:

| Former System | What It Tracked | Now Captured By |
|---------------|----------------|-----------------|
| `hook_invocations` | Automation executions with timing, metrics, errors | `job_runs` — status, duration_ms, metrics_json, error |
| `work_item_events` | Work item status changes (created, assigned, completed) | `job_runs` — each status transition is a new run, turn_ids link to agent behavior |
| `processing_log` | What was processed by which job type | `job_runs` — input_json (what was processed), job_definition_id (which job type) |

To review what a job has been doing: query `job_runs WHERE job_definition_id = ?`, follow `turn_ids` into the agent turns table for full behavioral inspection.

---

### DAG Definitions (5 fields)

The **workflow template**. "Here is a multi-step process."

```sql
CREATE TABLE IF NOT EXISTS dag_definitions (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    description           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
```

A DAG is a named container for nodes. The complexity lives in the nodes and their edges.

### DAG Nodes (7 fields)

A **position in a workflow** that references a job definition.

```sql
CREATE TABLE IF NOT EXISTS dag_nodes (
    id                    TEXT PRIMARY KEY,
    dag_id                TEXT NOT NULL REFERENCES dag_definitions(id),
    job_definition_id     TEXT NOT NULL REFERENCES job_definitions(id),
    depends_on            TEXT,
    delay_after_ms        INTEGER,
    condition_json        TEXT,
    overrides_json        TEXT
);
```

**Field justifications:**

| Field | Why |
|-------|-----|
| `id` | Primary key |
| `dag_id` | Which DAG this node belongs to. FK to dag_definitions. |
| `job_definition_id` | Which job to run at this position. FK to job_definitions. The same job definition can appear in multiple DAGs at multiple positions. |
| `depends_on` | JSON array of node IDs that must complete before this node can run. This IS the DAG structure — the edges. Empty/null = no dependencies (can run immediately). |
| `delay_after_ms` | Wait this long after dependencies complete before starting. Enables "wait 3 days then follow up" patterns. |
| `condition_json` | Conditional execution. Evaluated after dependencies complete. If conditions not met, this node is skipped. Enables branching: "only run B if A produced result X." |
| `overrides_json` | Override the job's default config for this position. Can override config_profile, job config, input parameters. Enables the same job to behave differently at different positions in different DAGs. |

**DAG Node vs Job Definition:**

A **Job Definition** is "here's a thing that can be done." It's reusable and standalone.

A **DAG Node** is "here's a POSITION in a workflow." It points to a job definition and adds WHERE (dependencies), WHEN (delays, conditions), and HOW (overrides).

Example — episode finalization DAG:
```
DAG: "episode_finalization"
  node_1 → job: "retain"             (depends_on: [])
  node_2 → job: "retain_self"        (depends_on: [])     -- parallel with node_1
  node_3 → job: "consolidate"        (depends_on: [node_1])
  node_4 → job: "consolidate_self"   (depends_on: [node_2])
```

Four nodes, four jobs. Nodes 1 and 2 run in parallel (no deps between them). Node 3 waits for node 1. Node 4 waits for node 2. The DAG handles all the chaining automatically.

### DAG Runs (10 fields)

An **instance** of a DAG execution.

```sql
CREATE TABLE IF NOT EXISTS dag_runs (
    id                    TEXT PRIMARY KEY,
    dag_definition_id     TEXT NOT NULL REFERENCES dag_definitions(id),
    status                TEXT NOT NULL DEFAULT 'active',
    context_json          TEXT,
    source                TEXT,
    source_ref            TEXT,
    started_at            TEXT,
    completed_at          TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
```

**Field justifications:**

| Field | Why |
|-------|-----|
| `id` | Primary key |
| `dag_definition_id` | Which DAG is being executed. FK to dag_definitions. |
| `status` | `active` / `paused` / `completed` / `cancelled`. |
| `context_json` | Accumulated context flowing between nodes. When a node's job run completes, its `output_json` gets merged into the DAG run's context. The next node receives this context as part of its `input_json`. This is how data passes between steps. |
| `source` | What initiated this run. E.g., "campaign", "episode_finalized", "manual". |
| `source_ref` | Reference to the source (campaign ID, event ID, etc.). |
| `started_at`, `completed_at` | ISO 8601 timestamps. |
| `created_at`, `updated_at` | ISO 8601 timestamps. |

**DAG Advancement Logic:**

When a job run completes (status → `completed`):
1. Check if the job run has a `dag_run_id` and `dag_node_id`
2. Merge the job run's `output_json` into the DAG run's `context_json`
3. Find all downstream nodes (nodes whose `depends_on` includes this node)
4. For each downstream node, check if ALL its dependencies have completed
5. If yes, evaluate `condition_json`. If conditions met, create a new job run for that node
6. If `delay_after_ms` is set, schedule the new job run via cron instead of immediate execution
7. When all nodes have completed, set DAG run status to `completed`

**DAG Behaviors:**
- **Retries**: If a node's job run fails, the DAG can retry (configurable in overrides_json)
- **Gating**: Nodes only run when ALL dependencies complete successfully
- **Branching**: `condition_json` enables "if X then run B, else run C" patterns
- **Parallel execution**: Nodes with no dependency edges between them run concurrently
- **Context accumulation**: Each node's output enriches the DAG's shared context

---

### Agent Configs (12 fields)

Named, versioned agent configuration presets. Separate from persona (workspace/identity files).

```sql
CREATE TABLE IF NOT EXISTS agent_configs (
    id                    TEXT PRIMARY KEY,
    name                  TEXT,
    description           TEXT,
    model                 TEXT,
    thinking              TEXT,
    system_prompt         TEXT,
    tool_allow            TEXT,
    tool_deny             TEXT,
    prompt_mode           TEXT,
    can_dispatch          INTEGER DEFAULT 0,
    config_json           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
```

**Field justifications:**

| Field | Why |
|-------|-----|
| `id` | Primary key |
| `name` | Named presets: "deep_researcher", "fast_worker", "manager_v2". Null for auto-generated configs created by runtime overrides. |
| `description` | What this config is optimized for. |
| `model` | Model identifier. E.g., "anthropic/claude-opus-4", "anthropic/claude-sonnet-4". |
| `thinking` | Thinking level. "off", "minimal", "low", "medium", "high". |
| `system_prompt` | Role-level directives injected into the agent's system prompt. This is the "role" — the behavioral instructions separate from persona identity. |
| `tool_allow` | JSON array of allowed tools. Null = all tools available. |
| `tool_deny` | JSON array of denied tools. Null = no restrictions. |
| `prompt_mode` | "full" or "minimal". Controls which system prompt sections are included. |
| `can_dispatch` | Whether this agent can spawn sub-agents via agent_send. Manager = true, Worker = false. |
| `config_json` | Everything else: isolation settings, subagent config, context tokens, compaction settings, etc. |
| `created_at`, `updated_at` | ISO 8601 timestamps. |

**The Persona / Role / Job Trinity:**

An agent execution combines three independent dimensions:

| Dimension | What it captures | Where it lives | Prompt level |
|-----------|-----------------|---------------|--------------|
| **Persona** | WHO — identity, personality, memory | Workspace files (SOUL.md, IDENTITY.md) | System prompt |
| **Role** (Agent Config) | HOW — capabilities, model, toolset, behavioral directives | `agent_configs` table | System prompt (additive) |
| **Job** | WHAT — task, instructions, accumulated learnings | Job definition workspace_dir | Message level |

These compose independently:
```
agent_send({
    config: "deep_researcher",     -- Role: which agent config to use
    persona: "echo",               -- Persona: which identity workspace
    job: "market_analysis"         -- Job: which job definition (loads job workspace)
})
```

**Immutable Config Snapshots:**

Agent turns reference `agent_config_id`. When the runtime needs to override a config value (e.g., different model for a specific invocation), it automatically creates a NEW agent_config record with the overridden values. The turn points to that specific config. Old turns always reference exactly the config they ran with.

This enables:
- **A/B testing**: Create two named configs, assign them to different runs, compare results
- **Attribution**: Every turn is linked to exactly one config — you can measure which configs produce better outcomes
- **History**: The config a turn used 6 months ago is still queryable, even if the named preset has been updated since

**Replaces hardcoded role-caps.ts:**

The current `MANAGER_MWP_TOOL_ALLOWLIST` and `WORKER_ROLE_TOOL_DENYLIST` in `role-caps.ts` become named agent_config records. The runtime looks up the config instead of referencing hardcoded arrays.

---

## Old → New Mapping

### Tables Consolidated

| Former Table | Former DB | Becomes | Notes |
|-------------|-----------|---------|-------|
| `automations` | events.db | `job_definitions` | Script path, config, status, versioning preserved. Triggers/conditions moved to script code. Hook points elevated to dedicated field. |
| `hook_invocations` | events.db | `job_runs` | Timing, metrics, errors, results all captured. `fired` boolean replaced by turn_ids for deep inspection. |
| `tasks` (work CRM) | work.db | `job_definitions` | Task templates become job definitions. Default assignee/priority move to job config or DAG node overrides. |
| `work_items` | work.db | `job_runs` | Status lifecycle preserved. Entity context moves to input_json. Assignee captured via agent turn reference. |
| `work_item_events` | work.db | `job_runs` (the table IS the audit trail) | Each run is an immutable record. No separate event tracking needed. |
| `workflows` | work.db | `dag_definitions` | Named workflow templates. |
| `workflow_steps` | work.db | `dag_nodes` | Dependencies, conditions, delays, overrides all preserved. |
| `sequences` | work.db | `dag_runs` | Workflow execution instances. Context accumulation replaces step-by-step status tracking. |
| `job_types` (memory) | memory.db | `job_definitions` | Processing templates become job definitions. |
| `jobs` (memory) | memory.db | `job_runs` | Processing instances become job runs. Input set referenced via input_json. |
| `job_outputs` (memory) | memory.db | `job_runs.output_json` | Produced element IDs stored in output_json. |
| `processing_log` (memory) | memory.db | `job_runs` (the table IS the audit trail) | What was processed (input_json) by which job (job_definition_id). |
| `cron_jobs` | nexus.db | `job_definitions` + `cron_schedules` | Definition part → job_definitions. Schedule part → cron_schedules. |
| `import_jobs` | nexus.db | `job_runs` | Import executions become job runs of an "import" job definition. |

### Services Eliminated

| Former Service | Replaced By |
|---------------|-------------|
| Work scheduler (30s polling in server-work.ts) | Cron service handles all time-based scheduling |
| Clock tick service (30s setInterval) | A cron schedule: `*/30 * * * * *` |
| Hook evaluation runtime | Job definitions with hook_points, invoked by pipeline |

### From ~15 tables across 4 databases → 7 tables in one unified system

Plus `agent_configs` for the configuration preset system.

---

## Cross-Batch Impacts

### Batch 3 (Memory)
- `memory.jobs.*` operations → absorbed into `jobs.*`
- Memory pipeline uses unified job definitions internally
- Sets remain unchanged (polymorphic data collections)
- Elements remain unchanged (knowledge outputs)

### Batch 4 (Agents, Clock)
- `clock.schedule.*` operations → superseded by `cron.*`
- `agents.*` domain extended with `agents.configs.*` operations
- Agent turns gain `agent_config_id` FK, lose inline config fields

### Batch 5 (Automations referenced in hook system)
- Automations table → replaced by job_definitions with hook_points
- Hook invocations → replaced by job_runs

### Batch 6 (Work CRM, Browser, TTS, Wizard)
- Work CRM → fully absorbed into unified primitives
- See [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md) for operations

---

## What Stays Separate

- **Sets** (memory.db) — Polymorphic data collections. Jobs reference sets as inputs via `input_json`. Sets are NOT workflows.
- **Elements** (memory.db) — Knowledge outputs. Job runs produce elements (referenced in `output_json`).
- **Events** (events.db) — Raw immutable inputs. Jobs with `hook_points` react to events in the pipeline.
- **Entities** (identity.db) — Canonical identity. Job runs receive entity context via `input_json`. `created_by` on job definitions references entity IDs.
