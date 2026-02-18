# Implementation Handoff: Meeseeks + Memory System

## What You're Building

The Nexus memory system: two meeseeks agents (Memory Reader, Memory Writer) that give Nexus automatic memory — the reader injects relevant context before workers execute, the writer extracts knowledge after agent turns complete. Both operate as "automations" in a unified hook/automation system that replaces the current plugin/hook fragmentation.

This is a multi-layered implementation. Read the specs in order. Start with the automation infrastructure, then build the memory agents on top.

---

## Spec Documents (read in this order)

### 1. MEESEEKS_PATTERN.md — The automation infrastructure
**Path:** `specs/runtime/broker/MEESEEKS_PATTERN.md`

This is the foundation. It defines:
- **Hooks and Automations unified model** — Collapsing plugins (`NEXPlugin`), internal hooks (`registerInternalHook`), and durable hooks (`hooks` table) into one system. `hooks` table → `automations` table with new columns.
- **Schema changes** — 6 new columns on `automations`: `hook_point`, `workspace_dir`, `peer_workspaces`, `self_improvement`, `timeout_ms`, `blocking`
- **Hook point runner** — Generic `evaluateAutomationsAtHook()` that runs at every hook point
- **Two critical hook insertion points:**
  - `worker:pre_execution` — in `nex/src/nex/stages/runAgent.ts` after the worker's `assembleContextStage` completes and immediately before `startBrokerExecution` begins (i.e., for `request.agent.role === "worker"`). This covers workers dispatched via `agent_send` (durable enqueue path bypasses pipeline stages 1-4).
  - `after:runAgent` — in pipeline.ts after stage 6
- **Peer workspaces** — How automations get read/write access to each other's workspaces
- **Subagent dispatch pattern** — `ctx.request` (same request, not new) + `ctx.assembleContext` + `ctx.startBrokerExecution`. One request, one lineage, different sessions.
- **Tooling model** — Skills + direct SQLite instead of structured tools. Skill folders with schemas, query patterns, and helper scripts.
- **Self-improvement** — Runtime-managed reflection turn after primary task
- **Cost model** — All meeseeks run through broker using existing Anthropic OAuth. Free marginal cost.

### 2. MEMORY_READER.md — The reader meeseeks
**Path:** `specs/data/cortex/roles/MEMORY_READER.md`

Automation at `worker:pre_execution` (blocking, 10s timeout). Searches memory, returns enrichment that gets prepended to worker's `currentMessage`. Key details:
- Dispatch script pattern
- Skill-based tooling: `cortex-search.sh` for semantic search, raw SQL for everything else
- Agentic search strategy (entity detection → search → relationship traversal → read-time interpretation → iterate)
- Read-time relationship interpretation from observation log
- Output format (`<memory_context>` block)
- Hot path constraints (target <5s, max 3 turns)
- Peer access to writer's workspace

### 3. MEMORY_WRITER.md — The writer meeseeks
**Path:** `specs/data/cortex/roles/MEMORY_WRITER.md`

Automation at `after:runAgent` (async, 30s timeout). Extracts entities, relationships, episodes from completed turns. Key details:
- **Agent IS the pipeline** — Replaces 7-stage Go pipeline with single intelligent pass
- **Observation-log model** — Append-only relationships, no dedup, no contradiction detection at write
- Relationship extraction rules (1:1 primitive, group naming at 3+ recurring / 6+ always)
- Skill-based tooling: `cortex-write.sh` for writes with side-effect coordination
- Identity relationships written directly to `entity_aliases` (no separate IdentityPromoter stage)
- Full conversation history via `assembleContext` for context-aware extraction
- Frequency tuning (`every_turn`, `every_n_turns`, `pre_compaction`)
- Peer access to reader's workspace

### 4. CORTEX_AGENT_INTERFACE.md — The tooling surface
**Path:** `specs/data/cortex/CORTEX_AGENT_INTERFACE.md`

Defines how agents interact with the Cortex DB. The key shift: **skills + direct SQLite, not structured tools.**
- Full schema reference for all three ledgers (Events, Core, Agents) in `cortex.db`
- Skill folder structure: `SCHEMA.md`, `QUERIES.md`, `cortex-search.sh`, `cortex-write.sh`, `DB_PATH`
- Example SQL queries for common patterns
- `cortex-search.sh` — semantic + FTS5 hybrid search (the one operation needing more than SQL)
- `cortex-write.sh` — write helper handling side effects (embedding triggers, alias normalization, mention junction tables)
- Background embedding system
- Migration table mapping every old tool to its skill-based replacement

### 5. Supporting context
- **Database schema:** `nex/cortex/internal/db/schema.sql` — The actual CREATE TABLE statements. One `cortex.db` file, WAL mode, three logical ledgers.
- **Current pipeline code:** `nex/cortex/internal/memory/pipeline.go` and siblings — The Go memory pipeline being replaced. Good reference for understanding what the writer agent conceptually does.
- **Worker dispatch:** `nex/src/nex/stages/runAgent.ts` — Lines 1439-1510 for worker dispatch, line 1501 for `assembleContextStage`, line 1504 for `startBrokerExecution`. This is where `worker:pre_execution` gets inserted.
- **Request types:** `nex/src/nex/request.ts` — `NexusRequest`, `createNexusRequest()`, `EventContext`, `TriggerContext`, `AgentContext` type definitions.

---

## Implementation Order

### Phase 1: Automation Infrastructure
1. **Table migration** — `hooks` → `automations`, add 6 new columns (`hook_point`, `workspace_dir`, `peer_workspaces`, `self_improvement`, `timeout_ms`, `blocking`). Index on `hook_point`.
2. **Hook point runner** — `evaluateAutomationsAtHook(hookPoint, context, runtime)`. Queries automations by hook_point, runs blocking ones sequentially, fires async ones. Returns merged enrichment.
3. **AutomationContext** — Expose `ctx.request`, `ctx.assembleContext`, `ctx.startBrokerExecution`, `ctx.workspace` (with home + peers), `ctx.automation` (the automation record).
4. **Insert `worker:pre_execution` hook** — In `nex/src/nex/stages/runAgent.ts` between `assembleContextStage` and `startBrokerExecution` for worker runs (`request.agent.role === "worker"`). Call `evaluateAutomationsAtHook`, merge enrichment into assembled context.
5. **Insert `after:runAgent` hook** — In pipeline.ts after stage 6. Fire async automations. Don't await.
6. **Workspace bootstrapping** — `ensureWorkspace(automation)` creates workspace dir + seed files before invocation.
7. **Peer workspace loading** — Parse `peer_workspaces` JSON, provide `peers[]` array on workspace context.
8. **Self-improvement chaining** — After main handler, if `self_improvement = 1`, dispatch reflection turn via same `assembleContext` + `startBrokerExecution` pattern, fire-and-forget.

### Phase 2: Skill Infrastructure
1. **Skill folder seeding** — When bootstrapping workspace, create `skills/cortex/` with:
   - `DB_PATH` — path to cortex.db
   - `SCHEMA.md` — auto-generated from current schema
   - `QUERIES.md` — pre-built query patterns from CORTEX_AGENT_INTERFACE.md
2. **`cortex-search.sh`** — Script that computes query embeddings, runs vector similarity against embeddings table, cross-references with FTS5, ranks results. Returns JSON.
3. **`cortex-write.sh`** — Script that handles INSERT + side effects: alias normalization, background embedding trigger, merge candidate detection, mention junction table rows.

### Phase 3: Memory Reader
1. **Register automation** — `memory-reader` at `worker:pre_execution`, blocking, 10s timeout, workspace at `~/.nexus/state/meeseeks/memory-reader/`, peer to writer workspace.
2. **Dispatch script** — `memory-reader.ts` that assembles context, injects ROLE.md + SKILLS.md, dispatches meeseeks via broker.
3. **ROLE.md** — Reader instructions: search strategy, tool constraints, output format.
4. **Enrichment injection** — Hook runner prepends `<memory_context>` to worker's `currentMessage`.

### Phase 4: Memory Writer
1. **Register automation** — `memory-writer` at `after:runAgent`, async (blocking=0), 30s timeout, workspace at `~/.nexus/state/meeseeks/memory-writer/`, peer to reader workspace.
2. **Dispatch script** — `memory-writer.ts` that assembles context with full history, injects ROLE.md + SKILLS.md, dispatches meeseeks via broker.
3. **ROLE.md** — Writer instructions: extraction philosophy, observation-log model, relationship rules, latest-turn focus.
4. **Observation-log schema compatibility** — The existing `relationships` table has unique indexes that enforce dedup. These need to be relaxed for the append-only model. The unique indexes `idx_relationships_unique_entity` and `idx_relationships_unique_literal` include `valid_at` — for append-only, either drop these or ensure each observation has a unique `valid_at` (the `created_at` timestamp effectively serves this purpose if `valid_at` is set to `created_at`).

### Phase 5: Plugin Migration
1. Convert existing `NEXPlugin` methods to automations at corresponding hooks.
2. Load directory-discovered hooks into automations table at startup.
3. CLI: `nexus automations register/list/enable/disable/...`

---

## Key Design Decisions (for context)

These were deliberately decided during design. Don't second-guess them:

1. **Same request, different session** — Meeseeks share the parent's NexusRequest (for traceability) but get their own session (for queue isolation). `ctx.request` is the actual parent object, not a copy.
2. **Never bypass the broker** — All meeseeks dispatch goes through `assembleContext` + `startBrokerExecution`. This is a key principle of Nexus.
3. **Two automations, not one** — Reader and writer are separate automations with separate workspaces, linked by peer_workspaces. NOT a single multi-hook automation. They have genuinely different execution profiles.
4. **Skills + direct SQLite, not structured tools** — No bespoke tool_use tools for DB access. Agents get skill files (schema, queries, scripts) and use sqlite3 directly. Only semantic search needs a special script/tool because it requires embedding computation.
5. **Observation-log model** — Every relationship observation is appended. No dedup, no contradiction detection at write time. The reader interprets relationship history at read time. This removes pipeline stages 5 (EdgeResolver) and 6 (ContradictionDetector).
6. **Agent IS the pipeline** — The writer agent replaces the 7-stage Go memory pipeline with intelligent single-pass extraction. Not a wrapper around the Go pipeline.
7. **Identity promotion collapsed** — No separate IdentityPromoter stage. The writer agent writes aliases directly to `entity_aliases` when it encounters identity relationships.
8. **Background embeddings** — Write scripts trigger embedding generation asynchronously. The agent doesn't think about embeddings.
9. **Anthropic OAuth** — Meeseeks run through the user's existing Anthropic subscription via the broker. No Gemini, no extra API keys.
10. **Enrichment via currentMessage** — Memory context is prepended to `currentMessage`, not appended to `systemPrompt`. Task-scoped, not session-scoped.

---

## Known Gaps / Open Questions

- **Event Ledger Unification** — There are currently two event systems (Nex `events.db` and Cortex `events` table in `cortex.db`). The Cortex one is a bad port and needs to be removed. All adapters need to write to the Nex events ledger. **See `specs/data/cortex/EVENT_LEDGER_UNIFICATION.md` for the full spec.** This is a prerequisite for the memory system — the writer and episodic memory need a single coherent events ledger.
- **MEMORY_SYSTEM.md** — Updated to reflect observation-log model, read-time interpretation, agent-as-pipeline, and skills + direct SQLite tooling.
- **Semantic search delivery** — Should be `cortex-search.sh` (skill script) or `cortex_search` (structured tool)? Decide during implementation.
- **Write script complexity** — Start `cortex-write.sh` minimal (INSERT + embedding trigger), expand as needed.
- **Relationship unique index** — Existing unique indexes on `relationships` table enforce dedup. Need to relax for append-only model.
