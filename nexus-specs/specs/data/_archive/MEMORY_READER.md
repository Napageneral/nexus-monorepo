# Memory Reader Role (Meeseeks)

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-13
**Pattern:** Meeseeks (see `../../../runtime/broker/MEESEEKS_PATTERN.md`)
**Peer:** MEMORY_WRITER.md (linked via `peer_workspaces`)
**Related:** ../MEMORY_SYSTEM.md, ../CORTEX_AGENT_INTERFACE.md

---

## Overview

The Memory Reader is an automation registered at the **`worker:pre_execution`** hook point (blocking). It fires in the worker dispatch path — after a worker's context is assembled but before the broker begins execution. It searches memory and injects relevant context into the worker's assembled context so the worker has the memories it needs to complete its task.

**Why at worker dispatch, not the pipeline?** The MA (Manager Agent) orchestrates and delegates — it doesn't need full memory context. Workers actually perform tasks ("Write email to Sarah about the project timeline") and need relevant memories to do so. Workers dispatched via `agent_send` (`op="dispatch"`) bypass the pipeline's `runAutomations` stage entirely, so a pipeline-level memory reader wouldn't reach them. The `worker:pre_execution` hook catches every worker execution path.

**Why it exists:** Previously, agents had to remember to call `memory_search`. They often forgot. The Memory Reader removes this failure mode by making memory retrieval automatic and invisible.

---

## Automation Registration

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-reader',
  'worker:pre_execution',
  'persistent',
  'active',
  1,                                                     -- blocking: worker waits
  '~/.nexus/state/hooks/scripts/memory-reader.ts',
  '~/.nexus/state/meeseeks/memory-reader/',
  '["~/.nexus/state/meeseeks/memory-writer/"]',          -- can read writer's workspace
  1,                                                     -- self-improvement enabled
  10000                                                  -- 10s timeout
);
```

---

## Invocation Flow

```
MA calls agent_send({ op: "dispatch", text: "Write email to Sarah about project timeline", ... })
    │
    ├── createNexusRequest() for worker                (runAgent.ts:1439)
    │     event.content = task description
    │     IAM (principal, access) inherited from parent
    │
    ├── assembleContextStage(workerRequest)             (runAgent.ts:1501)
    │     Builds system prompt, history, tools, currentMessage
    │     Worker gets its own session context
    │
    │   ══════════════════════════════════════════════
    │   HOOK: worker:pre_execution
    │   evaluateAutomationsAtHook("worker:pre_execution", ...)
    │
    │   Memory Reader automation fires (blocking):
    │
    │   1. Receives workerRequest (the SAME NexusRequest —
    │      not a copy, the actual object) + assembled context
    │
    │   2. Dispatches reader meeseeks within scope of
    │      this workerRequest:
    │        ctx.assembleContext({ sessionLabel, task })
    │        → ctx.startBrokerExecution(assembled, { sessionLabel })
    │      Same request, different session. Never bypasses broker.
    │
    │   3. Reader meeseeks runs:
    │      ┌───────────────────────────────────────────┐
    │      │ READER MEESEEKS                           │
    │      │ (own session, parent's request)           │
    │      │                                           │
    │      │ Prompt: ROLE.md + SKILLS.md               │
    │      │ Skills: cortex/ (schema, queries, scripts)│
    │      │ Task: "Find memories relevant to:         │
    │      │   Write email to Sarah about project      │
    │      │   timeline"                               │
    │      │                                           │
    │      │ a. Parse task → identify entities, topics  │
    │      │ b. cortex-search for entities + episodes  │
    │      │ c. SQL queries for relationships,         │
    │      │    observation history, person_facts       │
    │      │ d. Follow relationship chains, iterate    │
    │      │ e. Query events/agents ledger for recent  │
    │      │    relevant sessions                      │
    │      │ f. Synthesize relationship histories      │
    │      │    (read-time interpretation)             │
    │      │ g. Return structured memory context       │
    │      └───────────────────────────────────────────┘
    │
    │   4. Reader returns enrichment:
    │        { fire: true, blocking: true,
    │          enrich: { memories: "<memory_context>..." } }
    │      Usage/traces roll up to the workerRequest.
    │
    │   5. Enrichment injected into worker's assembled context
    │      (prepended to currentMessage — task-scoped, not session-scoped)
    │   ══════════════════════════════════════════════
    │
    ├── startBrokerExecution(workerRequest, enrichedContext)  (runAgent.ts:1504)
    │     Worker agent runs with memory context available
    │
    └── Result flows back to MA
```

---

## Dispatch Script

```typescript
export default async function memoryReaderAutomation(ctx: AutomationContext) {
  // ctx.request IS the workerRequest — the same NexusRequest object.
  const taskContent = ctx.request.event.content;

  // 1. Derive a meeseeks session label from the parent request.
  //    Own session for broker queue isolation, but same request for lineage.
  const meeseeksSession = `meeseeks:memory-reader:${ctx.request.agent?.session_label || ctx.request.request_id}`;

  // 2. Assemble context for the meeseeks execution.
  //    Same request, meeseeks session label, focused task.
  const assembled = await ctx.assembleContext({
    sessionLabel: meeseeksSession,
    task: `Search memory for context relevant to: ${taskContent}`,
  });

  // 3. Inject role context from workspace
  assembled.systemPrompt += `\n\n${ctx.workspace.role}\n${ctx.workspace.skills}`;

  // 4. Execute through the broker — same request, meeseeks session
  const execution = ctx.startBrokerExecution(assembled, {
    sessionLabel: meeseeksSession,
  });
  const result = await execution.result;

  // 5. Return enrichment to inject into the worker's context
  return {
    fire: true,
    blocking: true,
    enrich: { memories: result.response?.content || null },
  };
}
```

### Enrichment injection

```typescript
if (enrichment.memories) {
  assembledContext.currentMessage.content =
    `<memory_context>\n${enrichment.memories}\n</memory_context>\n\n` +
    assembledContext.currentMessage.content;
}
```

Prepended to `currentMessage` (not `systemPrompt`) — keeps memory scoped to this specific task.

---

## Tooling: Skills + Direct SQLite

The reader operates in **code mode** with direct SQLite access via skill files. No bespoke tool_use tools for reads — the agent writes SQL directly, runs skill scripts, and composes arbitrarily complex queries.

### Skill folder

```
~/.nexus/state/meeseeks/memory-reader/
  ROLE.md
  SKILLS.md
  PATTERNS.md
  ERRORS.md
  skills/
    cortex/
      SCHEMA.md           # Full Cortex DB schema (all three ledgers)
      QUERIES.md          # Common read query patterns with examples
      cortex-search.sh    # Semantic + FTS hybrid search script
      DB_PATH             # ~/.nexus/data/cortex.db
```

### How the agent uses skills

1. **Reads `skills/cortex/SCHEMA.md`** to understand table structure
2. **Runs `cortex-search.sh`** for semantic search (embedding + FTS5 hybrid — the one operation that needs more than raw SQL)
3. **Writes raw SQL** via `sqlite3` CLI for everything else: relationship traversal, person_facts lookup, episode queries, ledger searches, co-occurrence detection, temporal filtering
4. **Reads `skills/cortex/QUERIES.md`** for pre-built query patterns it can adapt

The agent has access to all tables across all three ledgers (Events, Core, Agents) in the same `cortex.db`.

---

## Search Strategy

The reader performs an **agentic search** — it decides what to search for based on the worker's task description. Not a fixed query pipeline; the reader LLM determines the strategy.

### Typical flow

1. **Entity detection** — Identify people, projects, companies, etc. mentioned in the task.
2. **Semantic search** — `cortex-search.sh` for entities, episodes, events matching the query.
3. **SQL relationship traversal** — For matched entities, query the observation log. Full history, not just current state.
4. **Read-time interpretation** — Synthesize the observation log into current truth. This is where "contradiction detection" happens — by the reader's intelligence, not rigid rules.
5. **Person facts** — Query `person_facts` for hard identity data (emails, phones, etc.).
6. **Episode context** — Recent episodes mentioning those entities or topics.
7. **Ledger search** — Query events ledger and agents ledger for recent relevant sessions, communications.
8. **Iterate** — If initial results are insufficient, refine and search again (up to `max_turns: 3`).

### Read-time relationship interpretation

The reader doesn't return raw relationship rows. It interprets the observation log:

```sql
SELECT fact, confidence, created_at FROM relationships
WHERE source_entity_id = 'tyler' AND relation_type = 'WORKS_AT'
ORDER BY created_at ASC;
```

Returns:
```
"Tyler works at Google" (0.8, 2024-03-15)
"Tyler left Google" (0.9, 2025-01-10)
"Tyler works at Anthropic" (1.0, 2025-02-01)
"Tyler is building Nexus at Anthropic" (1.0, 2026-02-10)
```

The reader synthesizes: "Tyler currently works at Anthropic (building Nexus). Previously at Google." This is richer than a binary valid/invalid state.

### Example: "Write email to Sarah about project timeline"

1. `cortex-search.sh "Sarah project timeline"` → finds Sarah Chen entity + Project X episodes
2. SQL: `SELECT * FROM relationships WHERE source_entity_id = ? ORDER BY created_at DESC` → observation log
3. SQL: `SELECT * FROM person_facts WHERE person_id = ? AND fact_type = 'email_work'` → sarah.chen@company.com
4. SQL: episodes joined with `episode_entity_mentions` → recent discussions
5. Synthesize: Sarah is Engineering Lead on Project X, deadline moved to March 15, she flagged scope creep
6. Return structured `<memory_context>` block

---

## Output Format

```
<memory_context>
## Entities
- Sarah Chen (Person)
  - EMAIL: sarah.chen@company.com
  - ROLE: Engineering Lead on Project X (observed 2026-02-10, self_disclosed)

## Relationship History (Sarah ↔ Project X)
- 2026-01-15: WORKS_ON Project X (mentioned, confidence 0.9)
- 2026-02-01: LEADS Project X (self_disclosed, confidence 1.0)
- 2026-02-10: Flagged scope creep in backend module (observed)

## Recent Episodes
- 2026-02-11 14:30: Slack thread about Project X timeline
  - Team agreed to cut feature Y to meet deadline
  - Action item: Tyler to send updated timeline email

## Facts
- Project X deadline: March 15 (decided, 2026-02-10)
</memory_context>
```

The format is flexible — the reader determines what to include based on relevance.

---

## Hot Path Considerations

The reader is **blocking** — the worker waits. Latency matters.

- **Timeout:** 10 seconds. If exceeded, reader is terminated, worker proceeds without memory.
- **Target latency:** < 5 seconds.
- **Bounded iteration:** `max_turns: 3` limits agentic rounds.
- **SQLite reads are microseconds** — most time is LLM inference.
- **Self-improvement learns** from timeouts (what searches to front-load).

---

## Workspace

```
~/.nexus/state/meeseeks/memory-reader/
  ROLE.md               # Role instructions and constraints
  SKILLS.md             # Accumulated search strategies
  PATTERNS.md           # Common query patterns
  ERRORS.md             # Known failure modes (timeouts, empty results)
  skills/
    cortex/
      SCHEMA.md         # Full Cortex DB schema
      QUERIES.md        # Read query patterns
      cortex-search.sh  # Semantic + FTS hybrid search
      DB_PATH           # Database path
```

### Peer access

The reader has peer access to the writer's workspace (`~/.nexus/state/meeseeks/memory-writer/`). It can:
- Read the writer's SKILLS.md to understand what entity patterns are being created
- Read NOTES_FOR_READER.md if the writer leaves feedback
- Understand the writer's extraction patterns to improve search alignment

---

## Prompt Caching Strategy

| Component | Same as parent? | Why |
|-----------|----------------|-----|
| **System prompt** | YES | Built by same `buildSystemPrompt()`. First cached block. |
| **Tool definitions** | YES | Same tool list. ROLE.md constrains usage. |
| **History** | Fresh session | Reader gets its own short-lived session (no history). |
| **Role context** | APPENDED | ROLE.md + SKILLS.md from workspace. Only uncached portion. |

Cost per invocation: ~10-20% of a fresh session.

---

## Self-Improvement

Managed by the runtime. When `self_improvement = 1`, the runtime chains a reflection turn after the primary reader task completes. The reflection meeseeks updates SKILLS.md, PATTERNS.md, ERRORS.md.

Fired as background (fire-and-forget) — doesn't add to blocking latency. All usage rolls up to the same `request_id`.

---

## Concurrency

Session key: `meeseeks:memory-reader:{parent-worker-session-label}`

Different workers dispatched in parallel get different session keys → their memory readers run in parallel. The broker's `SessionQueue` enforces single-concurrency per key.

---

## Access Permissions

All tools are available (same as parent session). ROLE.md constrains behavior:

| Resource | Access |
|----------|--------|
| Cortex database (read, via SQL + skills) | Yes — all tables, all three ledgers |
| Cortex database (write) | No (by ROLE.md instruction) |
| Skill scripts (cortex-search.sh, etc.) | Yes |
| Home workspace (read/write) | Yes |
| Peer workspace: memory-writer (read) | Yes |
| User workspace | No (by ROLE.md instruction) |
| Parent request context | Read (via `ctx.request`) |
