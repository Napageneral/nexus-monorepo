# Meeseeks Pattern (Disposable Role Forks)

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-18
**Related:** AGENTS.md, DATA_MODEL.md, ../../data/memory/roles/
**Database layout:** See `../../data/DATABASE_ARCHITECTURE.md` for canonical database inventory (7 databases)

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
| `after:ingest` | After event parsing | Event transformation |
| `after:resolveIdentity` | After identity resolution | Identity enrichment |
| `after:resolveReceiver` | After receiver resolution | Receiver enrichment |
| `after:resolveAccess` | After IAM | Access policy augmentation |
| `runAutomations` | Stage 5 — first safe decision point | General-purpose automations, routing overrides |
| `after:assembleContext` | After session routing | Context augmentation |
| `episode-created` | When an episode clips (token budget or silence timer) | Memory writer dispatch |
| `episode-retained` | After memory writer completes successfully | Memory consolidator dispatch |
| `after:deliverResponse` | After response processed | Analytics, logging |
| `deliverResponse` | Pipeline delivery/finalization | Cleanup, persistence |

#### Broker hooks

| Hook point | When | Typical use |
|------------|------|-------------|
| `worker:pre_execution` | After worker assembleContext, before worker startBrokerExecution | **Memory injection for workers** |

#### Lifecycle hooks

| Hook point | When | Typical use |
|------------|------|-------------|
| `command:new` | /new command issued | Session memory save |
| `agent:bootstrap` | Agent startup | Workspace setup |
| `nex:startup` | Daemon starts | Service initialization |

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
SELECT * FROM automations WHERE hook_point = 'worker:pre_execution' AND blocking = 1;
```

---

## Peer Workspaces

Automations can be granted read/write access to other automations' workspaces via the `peer_workspaces` column. This is the primary mechanism for cross-role coordination — each automation has its own workspace, its own lifecycle, its own context loading. Collaboration happens by reading and writing into each other's directories.

```sql
-- Memory consolidator can access the writer's workspace
UPDATE automations
SET peer_workspaces = '["~/.nexus/state/meeseeks/memory-writer/"]'
WHERE name = 'memory-consolidator';

-- Memory injection can access the writer's workspace
UPDATE automations
SET peer_workspaces = '["~/.nexus/state/meeseeks/memory-writer/"]'
WHERE name = 'memory-injection';

-- Memory writer can access consolidator and injection workspaces
UPDATE automations
SET peer_workspaces = '["~/.nexus/state/meeseeks/memory-consolidator/", "~/.nexus/state/meeseeks/memory-injection/"]'
WHERE name = 'memory-writer';
```

This is the canonical pattern: **separate automations that collaborate, not one automation that does many things.** Each has its own hook point, its own blocking behavior, its own timeout, its own workspace, its own context loading script. They coordinate through peer workspace access — reading each other's SKILLS.md, leaving notes, providing feedback.

Forcing the writer, consolidator, and injection meeseeks into one automation adds complexity (hook branching, config overrides, role-switching dispatch scripts) to solve a problem that peer_workspaces already solves cleanly. Three simple automations linked by peer access is the correct and cleaner approach.

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
- Memory consolidator reads the writer's SKILLS.md to understand entity patterns it creates
- Memory injection reads the writer's PATTERNS.md to learn what entity patterns exist for better search
- Memory writer reads the injection meeseeks' ERRORS.md to learn what searches are failing and what users ask about
- Any meeseeks can leave notes for others (e.g., `NOTES_FOR_WRITER.md`, `NOTES_FOR_CONSOLIDATOR.md`)
- Link any two meeseeks together after the fact — add peer access to already-running automations without changing their code

---

## Tooling Model: CLI Commands + Skills

Meeseeks agents operate in **code mode** — they have bash/filesystem access and can read, write, grep, and query anything in their workspace.

### CLI commands over structured tools

Instead of defining a thick layer of bespoke `tool_use` tools (memory_entity_search, memory_relationship_query, etc.), meeseeks agents use **CLI commands** (`nexus memory <subcommand>`) that are always available in bash. The CLI sends IPC requests to the NEX daemon, which executes the core function, coordinates database writes, and returns JSON to stdout.

**Why CLI over `tool_use`?**

- **Prompt cache stability** — CLI commands don't change the tool inventory. Every agent session has the same tool surface. Adding a new memory operation means adding a new CLI subcommand, not changing what tools are injected into agents.
- **Code mode natural** — Agents already have bash access. `nexus memory recall --query "..."` composes with pipes, scripts, and other CLI tools.
- **Uniform interface** — One `nexus memory` namespace for all memory operations. Agents learn the command tree, not a fragmented set of structured tools.
- **Daemon-coordinated** — All operations go through the daemon via IPC, ensuring writes are serialized, events are emitted, and downstream automations can trigger.

### Skills as knowledge, not execution

Meeseeks agents get **skills** — workspace files that contain schemas, query patterns, usage guidance, and scripts. Skills teach the agent *how* to use the CLI commands effectively, not replace them.

```
~/.nexus/state/meeseeks/memory-injection/
  skills/
    memory/
      SCHEMA.md           # Database schemas — teaches agent what data structures exist
      QUERIES.md          # Common query patterns and CLI command recipes
      PATTERNS.md         # Learned search strategies, entity disambiguation patterns
```

**Why skills alongside CLI?**

- **Skills evolve independently** — Update a skill file in the workspace, not a tool implementation in runtime code. The agent can even update its own skills via self-improvement.
- **Skills have no ceiling** — Structured tools constrain what the agent can do. Skills teach the agent to compose CLI commands in novel ways — piping recall results into further queries, batching writes, combining memory operations with filesystem analysis.
- **The agent learns** — The agent gets better at using CLI commands over time via self-improvement. It discovers effective query patterns, search strategies, edge cases — and writes them down in skill files.

### Read-only direct SQLite access

For **read-only** queries that don't require embedding computation or daemon coordination, meeseeks agents can also query SQLite directly using `sqlite3` CLI in WAL mode. This provides maximum composability for ad-hoc analytical queries — CTEs, joins, aggregations, window functions — without IPC overhead.

**All writes go through the daemon** via `nexus memory` CLI commands. Direct SQLite is read-only. This preserves the daemon's ability to coordinate writes, emit events, and maintain consistency across databases.

---

## How Automations Dispatch Subagents

**Key principle: never bypass the broker.** When an automation needs to dispatch a meeseeks subagent, it goes through `assembleContext` + `startBrokerExecution`.

**Key principle: one request, one lineage.** The meeseeks subagent does NOT create a new `NexusRequest`. It operates within the scope of the request that triggered the automation. The memory reader working on behalf of a worker dispatch is part of that worker's request — the reader's pipeline traces, usage, and results all accumulate on the same `NexusRequest`. This makes the entire chain traceable: `user message → MA pipeline → worker dispatch → memory reader → worker execution` is one request with multiple execution phases.

The meeseeks gets its own **session** (for broker session queue isolation and its own conversation context) but shares the parent's **request** (for traceability and lineage).

```typescript
export default async function memoryReaderAutomation(ctx: AutomationContext) {
  // ctx.request IS the workerRequest — not a copy, the same object.
  const taskContent = ctx.request.event.content;

  // 1. Derive a meeseeks session key from the parent request.
  //    Own session for broker queue isolation, but same request for lineage.
  const meeseeksSession = `meeseeks:memory-injection:${ctx.request.agent?.session_key || ctx.request.request_id}`;

  // 2. Assemble context — same request, meeseeks session key, focused task.
  const assembled = await ctx.assembleContext({
    sessionKey: meeseeksSession,
    task: `Search memory for context relevant to: ${taskContent}`,
  });

  // 3. Inject role context from workspace
  assembled.systemPrompt += `\n\n${ctx.workspace.role}\n${ctx.workspace.skills}`;

  // 4. Execute through the broker
  const execution = ctx.startBrokerExecution(assembled, {
    sessionKey: meeseeksSession,
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
- `ctx.assembleContext({ sessionKey, task })` — calls `assembleContextStage` for a meeseeks execution scoped to the parent request
- `ctx.startBrokerExecution(assembled, { sessionKey })` — runs the meeseeks through the broker, all traces accumulate on `ctx.request`
- `ctx.workspace` — runtime-provided workspace context (home dir files, peer access)

**For blocking automations:** await `execution.result`, return enrichment.
**For async automations:** fire `ctx.startBrokerExecution()` without awaiting, return immediately.

### Why same request, different session?

The **request** is the unit of traceability. One user message that triggers a worker dispatch that triggers a memory reader — that's one request with multiple execution phases. Usage, pipeline traces, and timing all roll up to the same `request_id`. You can query "what did this request cost?" and get the full picture including meeseeks overhead.

The **session** is the unit of conversation context and concurrency. The meeseeks gets its own session so it has its own history (fresh for readers, or inherited for writers) and its own slot in the broker's `SessionQueue`. This prevents the meeseeks from blocking the parent's session queue.

### Cost model: Anthropic OAuth

All meeseeks run through the broker using the user's existing Anthropic OAuth subscription. No extra API keys, no Gemini setup, no additional payment. Meeseeks are basically free marginal cost on the existing subscription.

---

## Memory Meeseeks: Three Collaborating Automations

The canonical memory meeseeks trio. Three separate automations, each at its own hook point, linked by peer workspaces.

See `../../memory/MEMORY_SYSTEM.md` for the full memory architecture.
See `../../memory/MEMORY_STORAGE_MODEL.md` for the unified elements/sets/jobs storage model.

### Memory Writer

Registered at `episode-created` (async). Dispatched when an episode clips (silence window or token budget) — extracts facts and entities from the episode's events. Writes elements (`type='fact'`), creates/resolves entities, and links elements to entities.

See `../../memory/MEMORY_WRITER.md` for full role spec.

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-writer',
  'episode-created',
  'persistent',
  'active',
  0,                                                    -- async: fire-and-forget
  '~/.nexus/state/hooks/scripts/memory-writer.ts',
  '~/.nexus/state/meeseeks/memory-writer/',
  '["~/.nexus/state/meeseeks/memory-consolidator/", "~/.nexus/state/meeseeks/memory-injection/"]',
  1,
  30000                                                  -- 30s timeout
);
```

### Memory Consolidator

Registered at `episode-retained` (async). Dispatched after the writer completes successfully for the same episode. Receives the episode's facts and connects them into the broader memory graph — creating or updating observations (elements with `type='observation'`), detecting causal relationships (element links), and proposing entity merges.

See `../../memory/MEMORY_CONSOLIDATION.md` for full role spec.

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-consolidator',
  'episode-retained',
  'persistent',
  'active',
  0,                                                    -- async: fire-and-forget
  '~/.nexus/state/hooks/scripts/memory-consolidator.ts',
  '~/.nexus/state/meeseeks/memory-consolidator/',
  '["~/.nexus/state/meeseeks/memory-writer/"]',         -- peer: can read writer's workspace
  1,
  60000                                                  -- 60s timeout (consolidation is heavier)
);
```

### Memory Injection

Registered at `worker:pre_execution` (blocking). Fires on every worker dispatch — forked from the primary session, uses memory search to find relevant context the main session doesn't have, and either interrupts with discovered information or stays silent.

See `../../memory/skills/MEMORY_INJECTION.md` for full role spec.

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-injection',
  'worker:pre_execution',
  'persistent',
  'active',
  1,                                                    -- blocking: worker waits
  '~/.nexus/state/hooks/scripts/memory-injection.ts',
  '~/.nexus/state/meeseeks/memory-injection/',
  '["~/.nexus/state/meeseeks/memory-writer/"]',         -- peer: can read writer's workspace
  1,
  10000                                                  -- 10s timeout (latency-sensitive)
);
```

### How They Collaborate

```
Writer workspace                            Consolidator workspace                     Injection workspace
~/.nexus/state/meeseeks/memory-writer/      ~/.nexus/state/meeseeks/memory-consolidator/   ~/.nexus/state/meeseeks/memory-injection/
  ROLE.md                                     ROLE.md                                        ROLE.md
  SKILLS.md                                   SKILLS.md                                      SKILLS.md
  PATTERNS.md                                 PATTERNS.md                                    PATTERNS.md
  ERRORS.md                                   ERRORS.md                                      ERRORS.md
  skills/memory/                              skills/memory/                                 skills/memory/
```

**Why three automations instead of one or two?** Each has genuinely different execution profiles:

| | Memory Writer | Memory Consolidator | Memory Injection |
|---|---|---|---|
| Hook point | `episode-created` | `episode-retained` (after writer) | `worker:pre_execution` |
| Blocking | No (async) | No (async) | Yes (hot path, worker waits) |
| Timeout | 30s | 60s | 10s (latency-sensitive) |
| Session | Full history (needs context) | Fresh (just the facts) | Forked from session |
| Skill | Extract, resolve, write | Synthesize, link, merge | Search, retrieve, inject |
| Input | Episode events (set) | Episode facts (set) | Query-driven (no input set) |
| Output | Facts (elements) | Observations + links (elements) | Context injection (no persistent output) |

Self-improvement on each meeseeks updates its own workspace. Peer access allows cross-pollination — the consolidator can read the writer's SKILLS.md to understand entity patterns, the injection meeseeks can read the writer's patterns to improve search strategies. They evolve independently but stay aware of each other.

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
nexus automations register memory-injection.ts \
  --name "memory-injection" \
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
  const improveSessionKey = `meeseeks:${automation.name}:improve:${request.request_id}`;

  const assembled = await assembleContextStage(request, runtime, {
    sessionKey: improveSessionKey,
    task: `Reflect on your task execution. Update workspace files with learnings:
      - ${automation.workspace_dir}/SKILLS.md
      - ${automation.workspace_dir}/PATTERNS.md
      - ${automation.workspace_dir}/ERRORS.md
    Keep updates brief and actionable.`,
  });
  assembled.systemPrompt += `\n\n${workspaceContext.role}`;

  const execution = startBrokerExecution(assembled, runtime, {
    sessionKey: improveSessionKey,
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
| `episode-created` / `episode-retained` hooks | Medium | Wire up hookpoints for memory writer and consolidator dispatch |
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

5. **Event ledger unification:** Resolved -- see `../../data/_archive/EVENT_LEDGER_UNIFICATION.md` (archived). One events ledger (`events.db`), legacy events table removed. Pipeline already captures inbound + outbound. AIX adapters already built.

6. **Semantic search delivery:** ~~Should `memory_search` be a structured tool_use tool, or a skill script?~~ **Resolved: CLI command.** All memory operations (including semantic search via `nexus memory recall`) are CLI commands that send IPC requests to the NEX daemon. The daemon executes the core function (including embedding computation and vector search) and returns JSON. This keeps all database access coordinated through the daemon while giving agents a uniform `nexus memory <subcommand>` interface. See `../../memory/MEMORY_SYSTEM.md` § Tool Architecture for the full execution model.

---

## Related Documents

- `AGENTS.md` — Manager-Worker Pattern, worker dispatch
- `DATA_MODEL.md` — Core data model
- `../../memory/MEMORY_SYSTEM.md` — Memory system architecture (4-layer model)
- `../../memory/MEMORY_STORAGE_MODEL.md` — Unified elements/sets/jobs storage model
- `../../memory/MEMORY_WRITER.md` — Memory writer meeseeks role spec
- `../../memory/MEMORY_CONSOLIDATION.md` — Memory consolidator meeseeks role spec
- `../../memory/skills/MEMORY_INJECTION.md` — Memory injection meeseeks role spec
