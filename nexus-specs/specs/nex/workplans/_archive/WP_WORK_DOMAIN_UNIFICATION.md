# Workplan: Work Domain Unification

**Status:** COMPLETED — commit 9b612d2f0
**Created:** 2026-03-04
**Spec References:**
- [WORK_DOMAIN_UNIFICATION.md](../WORK_DOMAIN_UNIFICATION.md) (623 lines — full schemas, reasoning, old→new mapping)
- [API_DESIGN_BATCH_6.md](../API_DESIGN_BATCH_6.md) (operations for jobs, cron, DAGs, agent configs)

**Dependencies:**
- WP5 (workspaces) — `workspace_id` FK on job_definitions
- WP6 (hooks) — `hook_points` field for pipeline attachment

---

## Goal

Collapse 5 overlapping "do stuff" subsystems (~15 tables across 4 databases) into 7 unified primitives with a coherent data model. Everything is a job. Time-based scheduling uses cron expressions only. Workflows are DAGs with dependencies. Agent configurations move to database. Hard cutover — no backwards compatibility, no migration logic.

---

## Current State

### Tables Across 4 Databases

**events.db:**
- `automations` (42 fields) — event-reactive scripts with versioning, circuit breakers, workspace bindings
- `hook_invocations` — execution audit trail with timing, tokens, broker stats, errors

**work.db:**
- `tasks` — work item templates (name, type, default assignee, priority, agent_prompt)
- `work_items` — task instances (title, status, entity_id, assignee, scheduled_at, due_at)
- `work_item_events` — audit trail (action, old_value, new_value, actor)
- `workflows` — multi-step workflow templates
- `workflow_steps` — workflow positions (task_id, dependencies, delays, conditions, overrides)
- `sequences` — workflow execution instances (workflow_id, entity_id, status, context)

**memory.db:**
- `job_types` — processing job templates (retain_v1, consolidate_v1, reflect_v1, inject_v1)
- `jobs` — processing instances (type_id, input_set_id, status, model, raw_output)
- `job_outputs` — junction table (job_id, element_id)
- `processing_log` — "has X been processed by job type Y?" audit

**nexus.db:**
- `cron_jobs` — time-based scheduling (schedule_json with at/every/cron kinds, agent_id, payload)
- `import_jobs` — AIX import executions (source, mode, status, stats)

### Services

**Cron service** (`src/cron/service.ts`, `store.ts`, `types.ts`) — evaluates cron expressions, fires at scheduled times, updates `next_run_at`

**Work scheduler** (`src/nex/control-plane/server-methods/work.ts`) — 30s polling loop checking `work_items.scheduled_at`, dispatches events

**Clock tick** — 30s `setInterval` in runtime, fires `nexus:clock-tick` internal events

**Hook runtime** (`src/nex/automations/hooks-runtime.ts`) — evaluates automations at 19 pipeline hook points

### Hardcoded Config

**role-caps.ts** (`src/iam/role-caps.ts`) — `MANAGER_MWP_TOOL_ALLOWLIST` (12 tools), `WORKER_ROLE_TOOL_DENYLIST` (5 tools)

---

## Target State

### 7 New Tables (unified work.db)

#### 1. job_definitions

Base: `automations` table from events.db

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
    workspace_id          TEXT REFERENCES workspaces(id),  -- FK to unified workspace system (WP5)
    hook_points           TEXT,                             -- JSON array: ["post-ingest", "pre-delivery"]
    created_by            TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);

CREATE INDEX idx_job_definitions_status ON job_definitions(status);
CREATE INDEX idx_job_definitions_workspace ON job_definitions(workspace_id);
CREATE INDEX idx_job_definitions_name ON job_definitions(name);
CREATE INDEX idx_job_definitions_hook_points ON job_definitions(hook_points) WHERE hook_points IS NOT NULL;
```

**Replaces:** `automations`, `tasks`, `job_types`

**Key changes from automations:**
- `workspace_dir` → `workspace_id` (FK to workspaces table)
- `hook_point` (singular) → `hook_points` (JSON array) for multi-attachment
- `mode`, `triggers_json`, `blocking`, `session_target`, `wake_mode`, `peer_workspaces`, `self_improvement` → removed (logic moves to script or config_json)
- `created_by_agent`, `created_by_session`, `created_by_thread` → `created_by` (entity ID)
- `disabled_at`, `disabled_reason`, `last_triggered`, `trigger_count`, `last_error`, `consecutive_errors`, `circuit_state`, `circuit_opened_at` → removed (computed from job runs)

#### 2. cron_schedules

```sql
CREATE TABLE IF NOT EXISTS cron_schedules (
    id                    TEXT PRIMARY KEY,
    name                  TEXT,
    job_definition_id     TEXT NOT NULL REFERENCES job_definitions(id) ON DELETE CASCADE,
    expression            TEXT NOT NULL,           -- 6-field cron with seconds: "*/30 * * * * *"
    timezone              TEXT DEFAULT 'UTC',
    active_from           TEXT,                    -- ISO 8601
    active_until          TEXT,                    -- ISO 8601
    enabled               INTEGER DEFAULT 1,
    next_run_at           TEXT,                    -- ISO 8601
    last_run_at           TEXT,                    -- ISO 8601
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);

CREATE INDEX idx_cron_schedules_job ON cron_schedules(job_definition_id);
CREATE INDEX idx_cron_schedules_next_run ON cron_schedules(next_run_at) WHERE enabled = 1;
CREATE INDEX idx_cron_schedules_enabled ON cron_schedules(enabled);
```

**Replaces:** `cron_jobs` table

**Key decisions:**
- Everything is a cron expression — no `kind` field (at/every/cron collapsed)
- Clock tick = `*/30 * * * * *` with `name = 'clock_tick'`
- One-shots use `active_until` to bound the date range
- No error tracking on schedules — errors live on job runs
- No `agent_id`, `payload_json`, `delivery_json`, `session_target`, `wake_mode` — job script handles invocation

#### 3. job_runs

```sql
CREATE TABLE IF NOT EXISTS job_runs (
    id                    TEXT PRIMARY KEY,
    job_definition_id     TEXT NOT NULL REFERENCES job_definitions(id),
    cron_schedule_id      TEXT REFERENCES cron_schedules(id),     -- NULL for hooks/manual
    dag_run_id            TEXT REFERENCES dag_runs(id),           -- NULL for standalone
    dag_node_id           TEXT REFERENCES dag_nodes(id),          -- NULL for standalone
    status                TEXT NOT NULL DEFAULT 'pending',        -- pending/running/completed/failed/cancelled
    trigger_source        TEXT,                                   -- 'cron', 'hook', 'dag', 'manual'
    input_json            TEXT,                                   -- set_id, event data, entity context, params
    output_json           TEXT,                                   -- element IDs, script results, side effects
    error                 TEXT,
    turn_ids              TEXT,                                   -- JSON array for agent inspection
    started_at            TEXT,
    completed_at          TEXT,
    duration_ms           INTEGER,
    metrics_json          TEXT,                                   -- tokens, LLM calls, broker stats
    created_at            TEXT NOT NULL
);

CREATE INDEX idx_job_runs_job_def ON job_runs(job_definition_id, created_at DESC);
CREATE INDEX idx_job_runs_status ON job_runs(status);
CREATE INDEX idx_job_runs_cron ON job_runs(cron_schedule_id) WHERE cron_schedule_id IS NOT NULL;
CREATE INDEX idx_job_runs_dag ON job_runs(dag_run_id) WHERE dag_run_id IS NOT NULL;
CREATE INDEX idx_job_runs_created ON job_runs(created_at DESC);
```

**Replaces:** `hook_invocations`, `work_items`, memory `jobs`, `processing_log`, `work_item_events`

**The audit trail IS job runs** — no separate audit table needed

#### 4. dag_definitions

```sql
CREATE TABLE IF NOT EXISTS dag_definitions (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL UNIQUE,
    description           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);

CREATE INDEX idx_dag_definitions_name ON dag_definitions(name);
```

**Replaces:** `workflows`

#### 5. dag_nodes

```sql
CREATE TABLE IF NOT EXISTS dag_nodes (
    id                    TEXT PRIMARY KEY,
    dag_definition_id     TEXT NOT NULL REFERENCES dag_definitions(id) ON DELETE CASCADE,
    job_definition_id     TEXT NOT NULL REFERENCES job_definitions(id),
    depends_on            TEXT,                    -- JSON array of node IDs
    condition_json        TEXT,                    -- evaluated after dependencies complete
    delay_after_ms        INTEGER,                 -- wait after dependencies complete
    overrides_json        TEXT,                    -- override job config for this position
    position              INTEGER,                 -- for UI ordering
    created_at            TEXT NOT NULL
);

CREATE INDEX idx_dag_nodes_dag ON dag_nodes(dag_definition_id, position);
CREATE INDEX idx_dag_nodes_job ON dag_nodes(job_definition_id);
```

**Replaces:** `workflow_steps`

#### 6. dag_runs

```sql
CREATE TABLE IF NOT EXISTS dag_runs (
    id                    TEXT PRIMARY KEY,
    dag_definition_id     TEXT NOT NULL REFERENCES dag_definitions(id),
    status                TEXT NOT NULL DEFAULT 'pending',        -- pending/running/paused/completed/failed/cancelled
    parameters_json       TEXT,                                   -- batch/campaign params
    context_json          TEXT,                                   -- accumulated node outputs
    started_at            TEXT,
    completed_at          TEXT,
    paused_at             TEXT,
    error                 TEXT,
    created_by            TEXT,
    created_at            TEXT NOT NULL
);

CREATE INDEX idx_dag_runs_dag_def ON dag_runs(dag_definition_id, created_at DESC);
CREATE INDEX idx_dag_runs_status ON dag_runs(status);
CREATE INDEX idx_dag_runs_created ON dag_runs(created_at DESC);
```

**Replaces:** `sequences`

#### 7. agent_configs

```sql
CREATE TABLE IF NOT EXISTS agent_configs (
    id                    TEXT PRIMARY KEY,
    name                  TEXT UNIQUE,                            -- NULL for auto-generated snapshots
    description           TEXT,
    model                 TEXT,
    provider              TEXT,
    thinking              TEXT,                                   -- off/minimal/low/medium/high
    system_prompt         TEXT,                                   -- role-level behavioral directives
    tool_allow            TEXT,                                   -- JSON array
    tool_deny             TEXT,                                   -- JSON array
    prompt_mode           TEXT,                                   -- full/minimal
    can_dispatch          INTEGER DEFAULT 0,                      -- agent_send capability
    config_json           TEXT,                                   -- isolation, subagent config, tokens, compaction
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);

CREATE INDEX idx_agent_configs_name ON agent_configs(name) WHERE name IS NOT NULL;
```

**New table** — no direct replacement, absorbs logic from role-caps.ts

**Seed data:**

```sql
INSERT INTO agent_configs (id, name, description, tool_allow, tool_deny, can_dispatch, created_at, updated_at)
VALUES
    ('config_manager', 'manager', 'Manager agent preset',
     '["agent_send","get_agent_status","get_agent_logs","wait","send_message","read","write","edit"]',
     NULL, 1, datetime('now'), datetime('now')),
    ('config_worker', 'worker', 'Worker agent preset',
     NULL,
     '["reply_to_caller","message","send_message","get_agent_logs","wait"]',
     0, datetime('now'), datetime('now'));
```

### New Database: work.db

All 7 tables live in a unified `work.db`:
- job_definitions
- cron_schedules
- job_runs
- dag_definitions
- dag_nodes
- dag_runs
- agent_configs

**Eliminates:** events.db (automations + hook_invocations), work.db (8 tables), memory.db (jobs tables), nexus.db (cron_jobs)

---

## Changes Required

### Database Schema

**New database: work.db**

Location: `${NEXUS_DB_DIR}/work.db` (sibling to agents.db, events.db, etc.)

Schema initialization:
```typescript
// src/db/work.ts (complete rewrite)
export function ensureWorkSchema(db: DatabaseSync): void {
  db.exec(WORK_SCHEMA_SQL);
}

const WORK_SCHEMA_SQL = `
  -- all 7 CREATE TABLE statements from Target State
  -- all indexes
  -- seed data for agent_configs
`;
```

**Schema additions to agents.db:**

```sql
-- Add agent_config_id to turns table
ALTER TABLE turns ADD COLUMN agent_config_id TEXT REFERENCES agent_configs(id);
CREATE INDEX idx_turns_agent_config ON turns(agent_config_id);

-- Rename workspace_path to working_dir on turns
-- (manual migration: copy workspace_path → working_dir, then drop workspace_path)

-- Add workspace_id to sessions table
ALTER TABLE sessions ADD COLUMN workspace_id TEXT;
CREATE INDEX idx_sessions_workspace ON sessions(workspace_id);

-- Add type, forked_from_session_id, forked_at_turn_id to sessions
ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT 'main';
ALTER TABLE sessions ADD COLUMN forked_from_session_id TEXT;
ALTER TABLE sessions ADD COLUMN forked_at_turn_id TEXT;
```

### New Code

**1. Work DB operations** — `src/db/work.ts` (complete rewrite)

Exports:
```typescript
// Job Definitions
export function insertJobDefinition(db: DatabaseSync, input: InsertJobDefinitionInput): string;
export function updateJobDefinition(db: DatabaseSync, id: string, updates: UpdateJobDefinitionInput): void;
export function getJobDefinition(db: DatabaseSync, idOrName: string): JobDefinitionRow | null;
export function listJobDefinitions(db: DatabaseSync, opts?: ListJobDefinitionsOptions): JobDefinitionRow[];

// Cron Schedules
export function insertCronSchedule(db: DatabaseSync, input: InsertCronScheduleInput): string;
export function updateCronSchedule(db: DatabaseSync, id: string, updates: UpdateCronScheduleInput): void;
export function getCronSchedule(db: DatabaseSync, id: string): CronScheduleRow | null;
export function listCronSchedules(db: DatabaseSync, opts?: ListCronSchedulesOptions): CronScheduleRow[];

// Job Runs
export function insertJobRun(db: DatabaseSync, input: InsertJobRunInput): string;
export function updateJobRun(db: DatabaseSync, id: string, updates: UpdateJobRunInput): void;
export function getJobRun(db: DatabaseSync, id: string): JobRunRow | null;
export function listJobRuns(db: DatabaseSync, opts?: ListJobRunsOptions): JobRunRow[];

// DAG Definitions
export function insertDagDefinition(db: DatabaseSync, input: InsertDagDefinitionInput): string;
export function getDagDefinition(db: DatabaseSync, idOrName: string): DagDefinitionRow | null;
export function listDagDefinitions(db: DatabaseSync, opts?: ListDagDefinitionsOptions): DagDefinitionRow[];

// DAG Nodes
export function insertDagNode(db: DatabaseSync, input: InsertDagNodeInput): string;
export function listDagNodes(db: DatabaseSync, dagId: string): DagNodeRow[];

// DAG Runs
export function insertDagRun(db: DatabaseSync, input: InsertDagRunInput): string;
export function updateDagRun(db: DatabaseSync, id: string, updates: UpdateDagRunInput): void;
export function getDagRun(db: DatabaseSync, id: string): DagRunRow | null;
export function listDagRuns(db: DatabaseSync, opts?: ListDagRunsOptions): DagRunRow[];

// Agent Configs
export function insertAgentConfig(db: DatabaseSync, input: InsertAgentConfigInput): string;
export function updateAgentConfig(db: DatabaseSync, id: string, updates: UpdateAgentConfigInput): void;
export function getAgentConfig(db: DatabaseSync, idOrName: string): AgentConfigRow | null;
export function listAgentConfigs(db: DatabaseSync): AgentConfigRow[];
```

**2. Cron service refactor** — `src/cron/service.ts`, `src/cron/store.ts`

Changes:
- Read from `work.db::cron_schedules` instead of nexus.db::cron_jobs
- On fire: create a job run in `job_runs` table with `trigger_source='cron'`
- Invoke job script, capture turn_ids, update job run with status/output/error
- Update `cron_schedules.next_run_at` and `last_run_at`

**3. Hook runtime refactor** — `src/nex/automations/hooks-runtime.ts`

Changes:
- Read from `work.db::job_definitions WHERE hook_points LIKE ?` instead of events.db::automations
- On hook fire: create a job run in `job_runs` table with `trigger_source='hook'`
- Invoke job script, capture turn_ids, update job run with status/output/error
- No separate hook_invocations table

**4. DAG runtime** — `src/work/dag-runtime.ts` (new file)

Logic:
```typescript
export async function advanceDagRun(db: DatabaseSync, dagRunId: string): Promise<void> {
  const dagRun = getDagRun(db, dagRunId);
  if (!dagRun || dagRun.status !== 'running') return;

  const nodes = listDagNodes(db, dagRun.dag_definition_id);
  const completedRuns = listJobRuns(db, { dag_run_id: dagRunId, status: 'completed' });
  const completedNodeIds = new Set(completedRuns.map(r => r.dag_node_id).filter(Boolean));

  for (const node of nodes) {
    const deps = JSON.parse(node.depends_on || '[]') as string[];
    if (!deps.every(depId => completedNodeIds.has(depId))) continue;

    // All deps complete — check condition
    if (node.condition_json) {
      const condition = JSON.parse(node.condition_json);
      const context = JSON.parse(dagRun.context_json || '{}');
      if (!evaluateCondition(condition, context)) continue;
    }

    // Check if already running/completed
    const existing = listJobRuns(db, { dag_run_id: dagRunId, dag_node_id: node.id });
    if (existing.length > 0) continue;

    // Create job run for this node
    const jobDef = getJobDefinition(db, node.job_definition_id);
    const runId = insertJobRun(db, {
      job_definition_id: node.job_definition_id,
      dag_run_id: dagRunId,
      dag_node_id: node.id,
      status: 'pending',
      trigger_source: 'dag',
      input_json: JSON.stringify({
        dagContext: JSON.parse(dagRun.context_json || '{}'),
        overrides: JSON.parse(node.overrides_json || '{}')
      }),
      created_at: new Date().toISOString()
    });

    // Invoke job (delay if node.delay_after_ms)
    if (node.delay_after_ms) {
      scheduleDeferredJobRun(runId, node.delay_after_ms);
    } else {
      await invokeJobRun(db, runId);
    }
  }

  // Check if all nodes complete
  if (nodes.every(node => {
    const runs = listJobRuns(db, { dag_run_id: dagRunId, dag_node_id: node.id, status: 'completed' });
    return runs.length > 0;
  })) {
    updateDagRun(db, dagRunId, { status: 'completed', completed_at: new Date().toISOString() });
  }
}

async function invokeJobRun(db: DatabaseSync, runId: string): Promise<void> {
  const run = getJobRun(db, runId);
  if (!run) return;

  updateJobRun(db, runId, { status: 'running', started_at: new Date().toISOString() });

  try {
    const result = await executeJobScript(run.job_definition_id, JSON.parse(run.input_json || '{}'));
    updateJobRun(db, runId, {
      status: 'completed',
      output_json: JSON.stringify(result.output),
      turn_ids: JSON.stringify(result.turnIds || []),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(run.started_at!).getTime()
    });

    // Merge output into DAG context
    if (run.dag_run_id) {
      const dagRun = getDagRun(db, run.dag_run_id);
      if (dagRun) {
        const context = JSON.parse(dagRun.context_json || '{}');
        Object.assign(context, result.output);
        updateDagRun(db, run.dag_run_id, { context_json: JSON.stringify(context) });
      }
    }
  } catch (error) {
    updateJobRun(db, runId, {
      status: 'failed',
      error: String(error),
      completed_at: new Date().toISOString()
    });
  }
}
```

**5. Agent config resolution** — `src/agents/config-resolver.ts` (new file)

```typescript
export function resolveAgentConfig(
  db: DatabaseSync,
  nameOrId: string,
  overrides?: Partial<AgentConfigRow>
): AgentConfigRow {
  let base = getAgentConfig(db, nameOrId);
  if (!base) throw new Error(`Agent config not found: ${nameOrId}`);

  if (!overrides || Object.keys(overrides).length === 0) {
    return base;
  }

  // Create snapshot for this invocation
  const snapshotId = insertAgentConfig(db, {
    name: null,  // auto-generated snapshots have no name
    description: `Snapshot of ${base.name || base.id}`,
    ...base,
    ...overrides,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  return getAgentConfig(db, snapshotId)!;
}
```

**6. Control plane operations** — `src/nex/control-plane/server-methods/jobs.ts` (new file)

Handlers for 8 operations:
- jobs.list
- jobs.get
- jobs.create
- jobs.update
- jobs.delete
- jobs.invoke
- jobs.runs.list
- jobs.runs.get

Similar for cron.ts, dags.ts, agent-configs.ts

### Modified Files

**src/db/hooks.ts** — DELETE (entire file replaced by work.ts)

**src/db/memory.ts** — Remove job-related tables:
```typescript
// Remove from MEMORY_SCHEMA_SQL:
// - jobs table
// - job_types table
// - job_outputs table
// - processing_log table

// Keep:
// - elements, elements_fts, element_entities, element_links
// - sets, set_members, set_definitions
// - resolution_log, access_log
```

**src/db/nexus.ts** — Remove cron_jobs table from schema

**src/nex/automations/hooks-runtime.ts** — Refactor to use job_definitions and job_runs

**src/cron/service.ts** — Refactor to use cron_schedules and job_runs

**src/agents/broker.ts** — Pass `agent_config_id` when creating turns:
```typescript
const configRow = resolveAgentConfig(workDb, configNameOrId, runtimeOverrides);
insertTurn(agentsDb, {
  ...turnData,
  agent_config_id: configRow.id
});
```

**src/iam/role-caps.ts** — DELETE or stub:
```typescript
// Redirect to database lookups
export function applyRoleToolAllowlist(role: string, tools: string[]): string[] {
  const workDb = openLedger('work');
  const config = getAgentConfig(workDb, role);
  if (!config?.tool_allow) return tools;
  const allowlist = JSON.parse(config.tool_allow) as string[];
  return tools.filter(t => allowlist.includes(t));
}
```

**src/nex/control-plane/server-methods/work.ts** — DELETE (all work.* operations removed)

**src/nex/control-plane/server-methods/clock-schedule.ts** — Rename to cron.ts, refactor for new schema

**src/nex/control-plane/server-methods/memory-review.ts** — Remove memory.jobs.* operations

### Deleted Files/Code

**Delete entirely:**
- `src/db/work.ts` (old file — rewritten from scratch)
- `src/nex/control-plane/server-methods/work.ts` (all work.* operations)
- Most of `src/iam/role-caps.ts` (hardcoded arrays → DB lookups)

**Remove from memory.db schema:**
- jobs table
- job_types table
- job_outputs table
- processing_log table

**Remove from nexus.db schema:**
- cron_jobs table

**Remove from events.db:**
- automations table → moved to work.db as job_definitions
- hook_invocations table → replaced by job_runs

### Operations to Register

**Control plane:** `src/nex/control-plane/server.ts`

Register 34 operations:

```typescript
// jobs.* (8)
registerHandler('jobs.list', handlers.jobs.list);
registerHandler('jobs.get', handlers.jobs.get);
registerHandler('jobs.create', handlers.jobs.create);
registerHandler('jobs.update', handlers.jobs.update);
registerHandler('jobs.delete', handlers.jobs.delete);
registerHandler('jobs.invoke', handlers.jobs.invoke);
registerHandler('jobs.runs.list', handlers.jobs.runsList);
registerHandler('jobs.runs.get', handlers.jobs.runsGet);

// cron.* (6)
registerHandler('cron.list', handlers.cron.list);
registerHandler('cron.get', handlers.cron.get);
registerHandler('cron.create', handlers.cron.create);
registerHandler('cron.update', handlers.cron.update);
registerHandler('cron.delete', handlers.cron.delete);
registerHandler('cron.trigger', handlers.cron.trigger);

// dags.* (10)
registerHandler('dags.list', handlers.dags.list);
registerHandler('dags.get', handlers.dags.get);
registerHandler('dags.create', handlers.dags.create);
registerHandler('dags.update', handlers.dags.update);
registerHandler('dags.delete', handlers.dags.delete);
registerHandler('dags.runs.list', handlers.dags.runsList);
registerHandler('dags.runs.get', handlers.dags.runsGet);
registerHandler('dags.runs.start', handlers.dags.runsStart);
registerHandler('dags.runs.pause', handlers.dags.runsPause);
registerHandler('dags.runs.resume', handlers.dags.runsResume);
registerHandler('dags.runs.cancel', handlers.dags.runsCancel);

// agents.configs.* (5)
registerHandler('agents.configs.list', handlers.agentConfigs.list);
registerHandler('agents.configs.get', handlers.agentConfigs.get);
registerHandler('agents.configs.create', handlers.agentConfigs.create);
registerHandler('agents.configs.update', handlers.agentConfigs.update);
registerHandler('agents.configs.delete', handlers.agentConfigs.delete);
```

**Unregister old operations:**

```typescript
// Remove these handlers
unregister('automations.*');
unregister('work.tasks.*');
unregister('work.items.*');
unregister('work.workflows.*');
unregister('work.sequences.*');
unregister('work.campaigns.*');
unregister('clock.schedule.*');
unregister('memory.jobs.*');
```

---

## Execution Order

### Phase 1: Schema & DB Primitives (No Dependencies)

1. **Create work.db schema** (`src/db/work.ts`)
   - Write new file with 7 table schemas
   - Add indexes
   - Seed agent_configs with manager/worker presets
   - Export all CRUD functions (42 functions total)

2. **Modify agents.db schema**
   - Add `agent_config_id` to turns table
   - Add `workspace_id` to sessions table
   - Add `type`, `forked_from_session_id`, `forked_at_turn_id` to sessions
   - Rename `workspace_path` → `working_dir` on turns (manual migration)

### Phase 2: Core Runtime Logic (Depends on Phase 1)

3. **Write agent config resolver** (`src/agents/config-resolver.ts`)
   - `resolveAgentConfig()` with snapshot creation for overrides
   - Used by broker when creating turns

4. **Write DAG runtime** (`src/work/dag-runtime.ts`)
   - `advanceDagRun()` — node dependency resolution
   - `invokeJobRun()` — job execution wrapper
   - `evaluateCondition()` — condition evaluation
   - Integration with job_runs table

5. **Refactor cron service** (`src/cron/service.ts`, `src/cron/store.ts`)
   - Read from work.db::cron_schedules
   - Create job_runs with trigger_source='cron'
   - Update next_run_at / last_run_at

6. **Refactor hook runtime** (`src/nex/automations/hooks-runtime.ts`)
   - Read from work.db::job_definitions with hook_points
   - Create job_runs with trigger_source='hook'
   - Remove hook_invocations writes

### Phase 3: Control Plane Operations (Depends on Phase 2)

7. **Write control plane handlers**
   - `src/nex/control-plane/server-methods/jobs.ts` (8 operations)
   - `src/nex/control-plane/server-methods/cron.ts` (6 operations)
   - `src/nex/control-plane/server-methods/dags.ts` (10 operations)
   - `src/nex/control-plane/server-methods/agent-configs.ts` (5 operations)

8. **Register new operations in control plane server**
   - Add 34 new handlers
   - Unregister old operations (automations.*, work.*, clock.schedule.*, memory.jobs.*)

### Phase 4: Integration & Cleanup (Depends on Phase 3)

9. **Update broker to use agent_config_id**
   - Call `resolveAgentConfig()` before creating turn
   - Pass config ID to turn record

10. **Remove old DB schemas**
    - Delete automations/hook_invocations from events.db
    - Delete all work.* tables from work.db (old file)
    - Delete cron_jobs from nexus.db
    - Delete job tables from memory.db

11. **Delete deprecated code**
    - `src/db/hooks.ts`
    - `src/nex/control-plane/server-methods/work.ts`
    - Most of `src/iam/role-caps.ts` (replace with DB lookups)

### Phase 5: Testing & Validation (Depends on Phase 4)

12. **Smoke tests**
    - Create job definition → verify in work.db
    - Create cron schedule → verify next_run_at computed
    - Trigger cron → verify job run created
    - Create DAG with 2 nodes → verify advancement
    - Hook fires → verify job run with turn_ids
    - Agent uses named config → verify agent_config_id on turn

---

## Critical Path

**Blocking dependencies:**
- Phase 1 (schema) must complete before any runtime work
- Phase 2 (runtime) must complete before control plane operations
- WP5 (workspaces) must be complete before job_definitions.workspace_id works
- WP6 (hooks) must be complete before job_definitions.hook_points works

**Parallelizable:**
- Within Phase 2: cron service and hook runtime can be refactored in parallel
- Within Phase 3: all 4 handler files can be written in parallel
- Phase 4 cleanup can happen incrementally once Phase 3 is working

**Estimated complexity:** HIGH — this is the most complex workplan, touching 15+ files across 4 databases and 3 runtime subsystems.
