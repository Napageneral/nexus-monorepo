# Meeseeks Pattern (Disposable Role Forks)

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-18
**Related:** AGENTS.md, DATA_MODEL.md, ../../data/cortex/roles/
**Database layout:** See `../../data/DATABASE_ARCHITECTURE.md` for canonical database inventory (6 databases)

---

## Overview

The Meeseeks Pattern defines how Nexus invokes disposable, role-specific agent forks to perform focused internal tasks. Named after the single-purpose beings from Rick and Morty — they pop into existence, accomplish one task, optionally improve their own capabilities, and disappear.

**Implementation:** A meeseeks is an **automation with a workspace and self-improvement** in the unified automations system. No separate abstraction — just a queryable subset of automations.

---

## Hooks and Automations: Unified Model

### Consolidation

Nexus currently has three overlapping systems: plugins (`NEXPlugin`), internal hooks (`registerInternalHook`), and durable hooks (`hooks` table). These collapse into one:

**Hooks** are points in code where automations can run. Every stage boundary, lifecycle event, and dispatch path is a hook.

**Automations** are the things that run at hooks. An automation is registered in the `automations` table with a `hook_point` that determines when it fires. One automation, one hook point. Simple.

What used to be separate concepts becomes one:

| Old concept | New concept |
|-------------|-------------|
| `NEXPlugin.afterRunAgent()` | Automation at hook `after:runAgent` |
| Internal hook `command:new` | Automation at hook `command:new` |
| Durable hook in `evaluateDurableAutomations()` | Automation at hook `runAutomations` |
| Directory-discovered `HOOK.md` + `handler.ts` | Automation loaded into table at startup |

### Hook Points

Every hook point supports both **blocking** and **async** automations. The hook point runner evaluates all registered automations: runs blocking ones first (awaiting results, merging enrichments), then fires async ones without waiting.

#### Pipeline hooks

| Hook point | When | Typical use |
|------------|------|-------------|
| `after:receiveEvent` | After event parsing | Event transformation |
| `after:resolveIdentity` | After identity resolution | Identity enrichment |
| `after:resolveAccess` | After IAM | Access policy augmentation |
| `runAutomations` | Stage 4 — first safe decision point | General-purpose automations, routing overrides |
| `after:assembleContext` | After context assembly | Context augmentation |
| `after:runAgent` | After agent turn completes | Post-turn processing (memory writes, analytics) |
| `after:deliverResponse` | After response delivered | Analytics, logging |
| `finalize` | Pipeline finalization | Cleanup, persistence |

#### Broker hooks

| Hook point | When | Typical use |
|------------|------|-------------|
| `worker:pre_execution` | After worker assembleContext, before worker startBrokerExecution | **Memory injection for workers** |

#### Lifecycle hooks

| Hook point | When | Typical use |
|------------|------|-------------|
| `command:new` | /new command issued | Session memory save |
| `agent:bootstrap` | Agent startup | Workspace setup |
| `gateway:startup` | Daemon starts | Service initialization |

---

## Schema: automations table

Rename the `hooks` table to `automations`. Add new columns:

```sql
-- Existing columns retained as-is:
--   id, name, description, mode, status, script_path, script_hash,
--   triggers_json, config_json, created_by_agent, created_by_session,
--   created_by_thread, version, previous_version_id, created_at,
--   updated_at, disabled_at, disabled_reason, last_triggered,
--   trigger_count, last_error, consecutive_errors, circuit_state,
--   circuit_opened_at

-- New columns:
ALTER TABLE hooks RENAME TO automations;
ALTER TABLE automations ADD COLUMN hook_point TEXT;
ALTER TABLE automations ADD COLUMN workspace_dir TEXT;
ALTER TABLE automations ADD COLUMN peer_workspaces TEXT;     -- JSON array of workspace dirs this automation can access
ALTER TABLE automations ADD COLUMN self_improvement INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automations ADD COLUMN timeout_ms INTEGER;
ALTER TABLE automations ADD COLUMN blocking INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_automations_hook_point ON automations(hook_point);
```

| New column | Type | Purpose |
|------------|------|---------|
| `hook_point` | TEXT | Which hook this automation runs at. NULL = `runAutomations` (backwards compat). |
| `workspace_dir` | TEXT | Absolute path to persistent home workspace. NULL = no workspace. |
| `peer_workspaces` | TEXT | JSON array of other workspace dirs this automation can read/write. NULL = no peers. |
| `self_improvement` | INTEGER | Chain a reflection turn after primary task. Requires workspace_dir. |
| `timeout_ms` | INTEGER | Per-automation timeout override. NULL = use global. |
| `blocking` | INTEGER | 1 = blocking (hook runner awaits result). 0 = async (fire-and-forget). |

### Queryable composition

```sql
-- All automations
SELECT * FROM automations WHERE status = 'active';

-- Automations at a specific hook
SELECT * FROM automations WHERE hook_point = 'worker:pre_execution' AND status = 'active';

-- Automations with workspaces
SELECT * FROM automations WHERE workspace_dir IS NOT NULL;

-- Meeseeks (workspace + self-improvement)
SELECT * FROM automations WHERE workspace_dir IS NOT NULL AND self_improvement = 1;

-- Automations with peer access
SELECT * FROM automations WHERE peer_workspaces IS NOT NULL;

-- Blocking automations at a hook
SELECT * FROM automations WHERE hook_point = 'after:runAgent' AND blocking = 1;
```

---

## Peer Workspaces

Automations can be granted read/write access to other automations' workspaces via the `peer_workspaces` column. This is the primary mechanism for cross-role coordination — each automation has its own workspace, its own lifecycle, its own context loading. Collaboration happens by reading and writing into each other's directories.

```sql
-- Memory reader can access the memory writer's workspace (and vice versa)
UPDATE automations
SET peer_workspaces = '["~/.nexus/state/meeseeks/memory-writer/"]'
WHERE name = 'memory-reader';

UPDATE automations
SET peer_workspaces = '["~/.nexus/state/meeseeks/memory-reader/"]'
WHERE name = 'memory-writer';
```

This is the canonical pattern: **two automations that collaborate, not one automation that does two things.** Each has its own hook point, its own blocking behavior, its own timeout, its own workspace, its own context loading script. They coordinate through peer workspace access — reading each other's SKILLS.md, leaving notes, providing feedback.

**Why two automations instead of one multi-hook?** The reader and writer have genuinely different execution profiles:

| | Memory Reader | Memory Writer |
|---|---|---|
| Hook point | `worker:pre_execution` | `after:runAgent` |
| Blocking | Yes (hot path, worker waits) | No (async, fire-and-forget) |
| Timeout | 10s (latency-sensitive) | 30s (background, has time) |
| Session | Fresh (no history needed) | Full history (needs context for extraction) |
| Skill | Search, traverse, synthesize | Extract, resolve, write |

Forcing these into one automation adds complexity (hook branching, config overrides, role-switching dispatch scripts) to solve a problem that peer_workspaces already solves cleanly. Two simple automations linked by peer access is the correct and cleaner approach.

At runtime, the workspace context includes both the home directory and any peer directories:

```typescript
interface AutomationWorkspaceContext {
  // Home workspace (this automation's own directory)
  home: string;                    // workspace_dir path

  // Convenience accessors for home workspace files
  role: string;                    // Contents of ROLE.md
  skills: string;                  // Contents of SKILLS.md
  patterns: string;                // Contents of PATTERNS.md
  errors: string;                  // Contents of ERRORS.md
  readFile: (filename: string) => string;  // Read any file from home

  // Peer workspaces (other automations this one can access)
  peers: {
    name: string;                  // Peer automation name (derived from dir)
    dir: string;                   // Peer workspace path
    readFile: (filename: string) => string;
    writeFile: (filename: string, content: string) => void;
  }[];
}
```

**Use cases for peer workspaces:**
- Memory reader reads the writer's SKILLS.md to understand what entity patterns it creates
- Memory writer reads the reader's ERRORS.md to learn what searches are failing
- Either can leave notes for the other (e.g., `NOTES_FOR_WRITER.md`, `NOTES_FOR_READER.md`)
- Link any two meeseeks together after the fact — add peer access to already-running automations without changing their code

---

## Tooling Model: Skills + Direct SQLite

Meeseeks agents operate in **code mode** — they have bash/filesystem access and can read, write, grep, and query anything in their workspace and the databases directly.

### Skills over structured tools

Instead of defining a thick layer of bespoke tool_use tools (memory_entity_search, memory_relationship_query, etc.), meeseeks agents get **skills** -- workspace files that contain schemas, query patterns, write helpers, and scripts. The agent uses these skills with its existing code mode capabilities.

**Why skills instead of tools?**

- **Skills evolve independently** — Update a skill file in the workspace, not a tool implementation in runtime code. The agent can even update its own skills via self-improvement.
- **Skills have no ceiling** — Structured tools are a ceiling — the agent can only do what the tool interface allows. Skills are a floor — the agent starts there and grows.
- **Skills can include scripts** — A skill folder can contain bash scripts that wrap `sqlite3` with the right pragmas (WAL mode, foreign keys), handle write-behind embedding triggers, or coordinate multi-step operations.
- **The agent learns** — The agent gets better at using skills over time via self-improvement. It discovers new query patterns, faster search strategies, edge cases — and writes them down.

### Database access via skills

Instead of HTTP-backed tools, meeseeks get **direct SQLite database paths** and **schemas** as part of their skill files. The agent uses `sqlite3` CLI or any other mechanism to compose queries directly.

```
~/.nexus/state/meeseeks/memory-reader/
  skills/
    memory/
      SCHEMA.md           # Full CREATE TABLE statements for memory.db + identity.db (entities)
      QUERIES.md          # Common query patterns with examples
      memory-search.sh    # Script that runs semantic + FTS search (embedding computation)
      memory-write.sh     # Script that handles writes with side-effect coordination
      DB_PATHS            # Paths: memory.db, identity.db, embeddings.db
```

The agent's ROLE.md references the skill folder. The agent reads the schema, writes SQL, runs scripts. Everything it needs is in the workspace.

### Semantic search: the one thing SQL can't do

`memory_search` (semantic + text search) requires computing query embeddings at runtime and doing vector similarity across heterogeneous tables. SQL alone can't express this. Two options:

1. **Skill script** -- `memory-search.sh` that calls an embedding service, computes similarity, ranks results, returns JSON. The agent calls it via bash.
2. **One structured tool** -- `memory_search` as a real tool_use tool backed by a TS endpoint.

Either works. The skill script approach is more consistent with the overall model. The structured tool approach is more ergonomic for the LLM. Both remain valid — the right choice depends on implementation experience.

### Why direct SQLite?

- **Maximum composability** — Agent writes any query it can imagine. CTEs, joins, aggregations, window functions.
- **Zero latency** — No HTTP round-trip. SQLite reads are microseconds.
- **Code mode natural** — The agent already has bash/filesystem access. SQLite is just another resource.
- **WAL mode** — Concurrent readers. Multiple meeseeks can read simultaneously.
- **Single-writer serialization** — SQLite's single-writer model naturally serializes writes. Write scripts coordinate this.

---

## How Automations Dispatch Subagents

**Key principle: never bypass the broker.** When an automation needs to dispatch a meeseeks subagent, it goes through `assembleContext` + `startBrokerExecution`.

**Key principle: one request, one lineage.** The meeseeks subagent does NOT create a new `NexusRequest`. It operates within the scope of the request that triggered the automation. The memory reader working on behalf of a worker dispatch is part of that worker's request — the reader's pipeline traces, usage, and results all accumulate on the same `NexusRequest`. This makes the entire chain traceable: `user message → MA pipeline → worker dispatch → memory reader → worker execution` is one request with multiple execution phases.

The meeseeks gets its own **session** (for broker session queue isolation and its own conversation context) but shares the parent's **request** (for traceability and lineage).

```typescript
export default async function memoryReaderAutomation(ctx: AutomationContext) {
  // ctx.request IS the workerRequest — not a copy, the same object.
  const taskContent = ctx.request.event.content;

  // 1. Derive a meeseeks session label from the parent request.
  //    Own session for broker queue isolation, but same request for lineage.
  const meeseeksSession = `meeseeks:memory-reader:${ctx.request.agent?.session_label || ctx.request.request_id}`;

  // 2. Assemble context — same request, meeseeks session label, focused task.
  const assembled = await ctx.assembleContext({
    sessionLabel: meeseeksSession,
    task: `Search memory for context relevant to: ${taskContent}`,
  });

  // 3. Inject role context from workspace
  assembled.systemPrompt += `\n\n${ctx.workspace.role}\n${ctx.workspace.skills}`;

  // 4. Execute through the broker
  const execution = ctx.startBrokerExecution(assembled, {
    sessionLabel: meeseeksSession,
  });
  const result = await execution.result;

  // 5. Return enrichment
  return {
    fire: true,
    blocking: true,
    enrich: { memories: result.response?.content || null },
  };
}
```

The automation gets these capabilities through its context:
- `ctx.request` — the NexusRequest that triggered this automation (NOT a copy — the actual request)
- `ctx.assembleContext({ sessionLabel, task })` — calls `assembleContextStage` for a meeseeks execution scoped to the parent request
- `ctx.startBrokerExecution(assembled, { sessionLabel })` — runs the meeseeks through the broker, all traces accumulate on `ctx.request`
- `ctx.workspace` — runtime-provided workspace context (home dir files, peer access)

**For blocking automations:** await `execution.result`, return enrichment.
**For async automations:** fire `ctx.startBrokerExecution()` without awaiting, return immediately.

### Why same request, different session?

The **request** is the unit of traceability. One user message that triggers a worker dispatch that triggers a memory reader — that's one request with multiple execution phases. Usage, pipeline traces, and timing all roll up to the same `request_id`. You can query "what did this request cost?" and get the full picture including meeseeks overhead.

The **session** is the unit of conversation context and concurrency. The meeseeks gets its own session so it has its own history (fresh for readers, or inherited for writers) and its own slot in the broker's `SessionQueue`. This prevents the meeseeks from blocking the parent's session queue.

### Cost model: Anthropic OAuth

All meeseeks run through the broker using the user's existing Anthropic OAuth subscription. No extra API keys, no Gemini setup, no additional payment. Meeseeks are basically free marginal cost on the existing subscription.

---

## Memory Reader and Writer: Two Collaborating Automations

The canonical meeseeks pair. Two separate automations, each at its own hook point, linked by peer workspaces.

### Memory Reader

Registered at `worker:pre_execution` (blocking). Fires in the worker dispatch path — searches memory and injects context into the worker's assembled context before the broker begins execution.

See `../../data/cortex/roles/MEMORY_READER.md` for full role spec.

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-reader',
  'worker:pre_execution',
  'persistent',
  'active',
  1,                                                    -- blocking: worker waits
  '~/.nexus/state/hooks/scripts/memory-reader.ts',
  '~/.nexus/state/meeseeks/memory-reader/',
  '["~/.nexus/state/meeseeks/memory-writer/"]',         -- peer: can read writer's workspace
  1,
  10000                                                  -- 10s timeout
);
```

### Memory Writer

Registered at `after:runAgent` (async). Fires after the agent turn completes -- extracts entities, relationships, and episodes from the completed turn and writes to memory.db + identity.db (entities) + embeddings.db.

See `../../data/cortex/roles/MEMORY_WRITER.md` for full role spec.

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-writer',
  'after:runAgent',
  'persistent',
  'active',
  0,                                                    -- async: fire-and-forget
  '~/.nexus/state/hooks/scripts/memory-writer.ts',
  '~/.nexus/state/meeseeks/memory-writer/',
  '["~/.nexus/state/meeseeks/memory-reader/"]',         -- peer: can read reader's workspace
  1,
  30000                                                  -- 30s timeout
);
```

### How They Collaborate

```
Reader workspace                         Writer workspace
~/.nexus/state/meeseeks/memory-reader/   ~/.nexus/state/meeseeks/memory-writer/
  ROLE.md                                  ROLE.md
  SKILLS.md  ←──── writer reads ────────── SKILLS.md
  PATTERNS.md                              PATTERNS.md
  ERRORS.md  ←──── writer reads ────────── ERRORS.md
  skills/                                  skills/
    memory/                                  memory/
      SCHEMA.md                                SCHEMA.md
      QUERIES.md                               QUERIES.md
      memory-search.sh                         memory-search.sh
      memory-write.sh                          memory-write.sh
  NOTES_FOR_WRITER.md ──── writer reads ──→
                     ←──── reader reads ─── NOTES_FOR_READER.md
```

Self-improvement on the reader updates `memory-reader/SKILLS.md`. The writer's next invocation can read it via peer access. And vice versa. They evolve independently but stay aware of each other.

---

## Workspace Lifecycle

### Automatic bootstrapping

When the runtime encounters an automation with `workspace_dir` set, it ensures the directory and seed files exist before invocation:

```
~/.nexus/state/meeseeks/{automation-name}/
  ROLE.md           # Role identity, instructions, constraints
  SKILLS.md         # Accumulated skills (updated by self-improvement)
  PATTERNS.md       # Common patterns (updated by self-improvement)
  ERRORS.md         # Known failure modes (updated by self-improvement)
  skills/           # Skill files: schemas, scripts, query patterns
```

Path convention: `~/.nexus/state/meeseeks/{name}/` derived from automation name. Stored as `workspace_dir` in automations table.

### Registration

```bash
nexus automations register memory-reader.ts \
  --name "memory-reader" \
  --hook-point "worker:pre_execution" \
  --blocking \
  --workspace \
  --peer "memory-writer" \
  --self-improvement \
  --timeout 10000
```

For the UI: user provides name, ROLE.md content, hook point, blocking/async, peers. Backend generates script from template, creates workspace, inserts automation record.

---

## Prompt Caching Strategy

Every meeseeks subagent fork maximizes cache hits with the primary session.

| Component | Same as primary? | Why |
|-----------|-----------------|-----|
| **System prompt** | YES | Built by same `buildSystemPrompt()`. First block in context. |
| **Tool definitions** | YES | Same tool list. Role prompt constrains usage. |
| **History** | YES (when applicable) | Full ledger clone for same-session forks. |
| **Role context** | APPENDED at end | ROLE.md + SKILLS.md from workspace. Only uncached portion. |

When the subagent uses `assembleContextStage`, it builds the system prompt using the same `buildSystemPrompt()` function → same output → prompt cache hit. Role context from the workspace is appended to `extraSystemPrompt` or injected at the turn level → only the new portion is uncached.

Cost: ~10-20% of a fresh session per invocation.

---

## Self-Improvement Phase

When `self_improvement = 1`, the runtime chains a reflection turn after the primary task. Uses the same `assembleContext` + `startBrokerExecution` pattern with a reflection-focused prompt, operating within the same parent request:

```typescript
// Runtime, after main handler completes
if (automation.self_improvement && automation.workspace_dir && taskResult) {
  const improveSessionLabel = `meeseeks:${automation.name}:improve:${request.request_id}`;

  const assembled = await assembleContextStage(request, runtime, {
    sessionLabel: improveSessionLabel,
    task: `Reflect on your task execution. Update workspace files with learnings:
      - ${automation.workspace_dir}/SKILLS.md
      - ${automation.workspace_dir}/PATTERNS.md
      - ${automation.workspace_dir}/ERRORS.md
    Keep updates brief and actionable.`,
  });
  assembled.systemPrompt += `\n\n${workspaceContext.role}`;

  const execution = startBrokerExecution(assembled, runtime, {
    sessionLabel: improveSessionLabel,
  });
  void execution.result; // Fire and forget — don't block
}
```

Runtime-managed, not script-managed. The script doesn't need to think about it. The improvement phase's usage rolls up to the same `request_id` — you can see the full cost of a meeseeks invocation (primary task + self-improvement) on one request.

---

## Concurrency

Handled by the broker's session queue. Each meeseeks subagent uses a deterministic session key:

```
meeseeks:{automation-name}:{parent-session-key}
```

The broker's `SessionQueue` enforces single-concurrency per session key. Different automations run in parallel — different session keys. If a second turn completes before the first writer finishes, the second writer invocation queues behind the first.

---

## Hook Point Runner

Generic mechanism for evaluating automations at any hook point:

```typescript
async function evaluateAutomationsAtHook(
  hookPoint: string,
  context: AutomationContext,
  runtime: NEXStageRuntime,
): Promise<AutomationEnrichment> {
  const db = runtime.dependencies.ledgers?.nexus;
  const automations = listAutomations(db, {
    hook_point: hookPoint,
    status: "active",
  });

  const enrichment: Record<string, unknown> = {};

  // 1. Run blocking automations first (sequentially)
  const blocking = automations.filter(a => a.blocking === 1);
  for (const automation of blocking) {
    ensureWorkspace(automation);
    const result = await executeAutomation(automation, context, runtime);
    Object.assign(enrichment, result.enrich || {});
  }

  // 2. Fire async automations (fire-and-forget)
  const async_ = automations.filter(a => a.blocking === 0);
  for (const automation of async_) {
    ensureWorkspace(automation);
    void executeAutomation(automation, context, runtime).catch(err => {
      console.error(`[automations] ${automation.name} error:`, err);
    });
  }

  // 3. Handle self-improvement for completed automations
  // (chained automatically by runtime)

  return enrichment;
}
```

This function is called at every hook point in the pipeline and broker dispatch paths.

---

## Required Changes

| Change | Size | Description |
|--------|------|-------------|
| Table rename + migration | Small | `hooks` → `automations`, add 6 new columns |
| Hook point runner | Medium | Generic `evaluateAutomationsAtHook()` function |
| `worker:pre_execution` hook | Medium | Insert hook in worker dispatch path (runAgent.ts lines 1501-1504 and 1718-1721) |
| `after:runAgent` hook | Medium | Insert hook in pipeline.ts after stage 6, async fire-and-forget |
| Automation context extension | Medium | Expose `request`, `assembleContext`, `startBrokerExecution`, `workspace` on AutomationContext |
| Peer workspace loading | Small | Read `peer_workspaces` JSON, provide `peers` array on workspace context |
| Per-automation timeout | Small | Check `automation.timeout_ms` in timeout resolver |
| Workspace bootstrap | Small | `ensureWorkspace()` before script execution, seed skill files |
| Self-improvement chaining | Medium | Runtime chains reflection turn when flag set |
| Plugin → automation migration | Medium | Convert `NEXPlugin` methods to automations at corresponding hooks |
| Internal hook → automation loading | Medium | Load directory-discovered hooks into automations table at startup |
| CLI alignment | Small | `nexus automations register/list/enable/disable/...` with `--peer` flag |

---

## Open Questions

1. **Blocking automation ordering:** At a hook point with multiple blocking automations, run them sequentially or in parallel? Sequential is simpler and avoids race conditions on shared enrichment. Parallel is faster.

2. **MA memory injection:** Do we eventually want a separate memory automation for the MA? Lighter-weight — just user preferences and communication patterns, not full entity/episode search. Could be a different automation at `runAutomations` hook.

3. **Plugin migration path:** Convert all existing `NEXPlugin` implementations to automations immediately, or keep plugins as a compatibility layer that delegates to the automation runner?

4. **Internal hook loading:** Load directory-discovered hooks into the automations table at startup (full convergence), or keep them as a separate loading path that feeds into the same runner?

5. **Event ledger unification:** Resolved -- see `../../data/cortex/EVENT_LEDGER_UNIFICATION.md`. One events ledger (`events.db`), legacy cortex events table removed. Pipeline already captures inbound + outbound. AIX adapters already built.

6. **Semantic search delivery:** Should `memory_search` (embedding + FTS hybrid search) be a structured tool_use tool, or a skill script (`memory-search.sh`) the agent calls via bash? Skill script is more consistent; structured tool is more ergonomic for the LLM.

---

## Related Documents

- `AGENTS.md` — Manager-Worker Pattern, worker dispatch
- `DATA_MODEL.md` — Core data model
- `../../data/cortex/roles/MEMORY_READER.md` — Memory reader meeseeks role spec
- `../../data/cortex/roles/MEMORY_WRITER.md` — Memory writer meeseeks role spec
- `../../data/cortex/MEMORY_SYSTEM.md` — Tripartite memory model
- `../../data/cortex/CORTEX_AGENT_INTERFACE.md` — Cortex tool/API surface
