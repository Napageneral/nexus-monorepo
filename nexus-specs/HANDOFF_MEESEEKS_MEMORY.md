# Handoff: Meeseeks Automation Infrastructure + Memory System

## TL;DR

Build a unified automation system that replaces the current plugin/hook fragmentation, then use it to implement two memory agents — a reader that injects context before workers execute, and a writer that extracts knowledge after agent turns complete. Skills + direct SQLite, not structured tools. Two separate automations linked by peer workspaces.

## Dependency

**This workstream depends on the Event Ledger Unification** (see `HANDOFF_EVENT_LEDGER_UNIFICATION.md`). Specifically:
- The writer links episodes to events — needs a single coherent events ledger
- The reader's FTS5 search over events — needs FTS5 on events.db

Steps 1-2 of the event ledger work (FTS5 + outbound capture) should be done first. The adapter migration (Steps 3-5) can happen in parallel with this work.

## Specs to Read (in this order)

| Order | Spec | Path | What it covers |
|---|---|---|---|
| 1 | **MEESEEKS_PATTERN.md** | `specs/runtime/broker/MEESEEKS_PATTERN.md` | Automation infrastructure: schema, hook runner, dispatch pattern, workspaces, peer access, self-improvement, cost model |
| 2 | **MEMORY_READER.md** | `specs/data/cortex/roles/MEMORY_READER.md` | Reader automation: registration, dispatch script, search strategy, output format, hot path constraints |
| 3 | **MEMORY_WRITER.md** | `specs/data/cortex/roles/MEMORY_WRITER.md` | Writer automation: registration, agent-as-pipeline, observation-log model, extraction philosophy, skill tooling |
| 4 | **CORTEX_AGENT_INTERFACE.md** | `specs/data/cortex/CORTEX_AGENT_INTERFACE.md` | Tooling surface: skill folders, cortex-search.sh, cortex-write.sh, schema reference, migration from old tools |
| 5 | **MEMORY_SYSTEM.md** | `specs/data/cortex/MEMORY_SYSTEM.md` | High-level memory model: declarative/episodic/procedural, observation-log, read-time interpretation |

## Key Code Files

| File | What it is |
|---|---|
| `nex/src/nex/stages/runAgent.ts` | Worker execution. Insert `worker:pre_execution` between the worker's `assembleContextStage` and `startBrokerExecution` (i.e., `request.agent.role === "worker"`). |
| `nex/src/nex/stages/pipeline.ts` | Pipeline stages. `after:runAgent` hook gets inserted after stage 6. |
| `nex/src/db/hooks.ts` | Current hooks table schema + CRUD. Gets renamed to automations. |
| `nex/src/nex/automations/hooks-runtime.ts` | Current hook evaluation runtime. Gets extended to support the new automation model. |
| `nex/src/nex/request.ts` | `NexusRequest`, `createNexusRequest()`, `EventContext`, `TriggerContext`, `AgentContext` types. |
| `nex/cortex/internal/db/schema.sql` | Cortex DB schema — entities, relationships, entity_aliases, episodes, etc. The knowledge graph tables the writer writes to. |

## What You're Building (5 phases)

### Phase 1: Automation Infrastructure

This is the foundation everything else builds on. Unify plugins, internal hooks, and durable hooks into one system.

#### 1a. Table migration

Rename `hooks` → `automations`. Add 6 new columns.

**File:** `nex/src/db/hooks.ts`

```sql
ALTER TABLE hooks RENAME TO automations;
ALTER TABLE automations ADD COLUMN hook_point TEXT;
ALTER TABLE automations ADD COLUMN workspace_dir TEXT;
ALTER TABLE automations ADD COLUMN peer_workspaces TEXT;     -- JSON array
ALTER TABLE automations ADD COLUMN self_improvement INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automations ADD COLUMN timeout_ms INTEGER;
ALTER TABLE automations ADD COLUMN blocking INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_automations_hook_point ON automations(hook_point);
```

Existing columns stay as-is. `hook_point = NULL` means `runAutomations` (backwards compat for existing hooks).

#### 1b. Hook point runner

Create `evaluateAutomationsAtHook(hookPoint, context, runtime)`:
1. Query `automations` by `hook_point` + `status = 'active'`
2. Run blocking automations sequentially, collect enrichment
3. Fire async automations without awaiting
4. Return merged enrichment

See MEESEEKS_PATTERN.md § "Hook Point Runner" for the full TypeScript signature.

#### 1c. AutomationContext

The context object passed to automation handlers:

```typescript
interface AutomationContext {
  request: NexusRequest;  // THE parent request, not a copy
  assembleContext: (opts: { sessionLabel: string; task: string }) => Promise<AssembledContext>;
  startBrokerExecution: (assembled: AssembledContext, opts: { sessionLabel: string }) => BrokerExecution;
  workspace: AutomationWorkspaceContext;  // home + peers
  automation: AutomationRecord;           // the automation DB record
}
```

`ctx.request` is the actual `NexusRequest` object — same reference. Meeseeks traces, usage, and timing all roll up to the same `request_id`.

#### 1d. Insert hook points

**`worker:pre_execution`** — In `runAgent.ts`:
- Between `assembleContextStage` and `startBrokerExecution` for worker runs (`request.agent.role === "worker"`).
- Call `evaluateAutomationsAtHook("worker:pre_execution", ctx, runtime)`
- Merge returned enrichment (e.g., `memories`) into the assembled context's `currentMessage`

**`after:runAgent`** — In `pipeline.ts`:
- After stage 6 (runAgent completes)
- Call `evaluateAutomationsAtHook("after:runAgent", ctx, runtime)` — fire-and-forget for async automations
- Don't await async results, don't block the pipeline

#### 1e. Workspace bootstrapping

When the runtime encounters an automation with `workspace_dir` set, call `ensureWorkspace(automation)` before script execution:

```
~/.nexus/state/meeseeks/{automation-name}/
  ROLE.md           # Seeded from registration, updatable by self-improvement
  SKILLS.md         # Empty initially, grows via self-improvement
  PATTERNS.md       # Empty initially
  ERRORS.md         # Empty initially
  skills/           # Seeded per automation type
```

#### 1f. Peer workspace loading

Parse `peer_workspaces` JSON array, provide `peers[]` on workspace context:

```typescript
interface AutomationWorkspaceContext {
  home: string;
  role: string;       // Contents of ROLE.md
  skills: string;     // Contents of SKILLS.md
  patterns: string;   // Contents of PATTERNS.md
  errors: string;     // Contents of ERRORS.md
  readFile: (filename: string) => string;
  peers: {
    name: string;
    dir: string;
    readFile: (filename: string) => string;
    writeFile: (filename: string, content: string) => void;
  }[];
}
```

#### 1g. Self-improvement chaining

After main handler completes, if `self_improvement = 1`:
1. Dispatch a reflection turn via `assembleContext` + `startBrokerExecution`
2. The reflection prompt instructs the agent to update SKILLS.md, PATTERNS.md, ERRORS.md
3. Fire-and-forget — don't block anything
4. Usage rolls up to the same `request_id`

### Phase 2: Skill Infrastructure

Build the skill folder system that gives meeseeks agents direct SQLite access to Cortex.

#### 2a. Skill folder seeding

When bootstrapping a memory meeseeks workspace, create `skills/cortex/`:

```
skills/cortex/
  DB_PATH             # Just the path: ~/.nexus/data/cortex.db
  SCHEMA.md           # Auto-generated from current schema.sql
  QUERIES.md          # Pre-built query patterns (from CORTEX_AGENT_INTERFACE.md)
  cortex-search.sh    # Semantic + FTS5 hybrid search script
  cortex-write.sh     # Write helper with side-effect coordination
```

`SCHEMA.md` should be auto-generated from the actual schema.sql so it stays current.

#### 2b. cortex-search.sh

Script the agent calls via bash for semantic search (the one operation raw SQL can't do):
1. Takes a query string as input
2. Computes query embedding via the embedding service
3. Runs vector similarity against the `embeddings` table
4. Cross-references with FTS5 results from `events_fts` (in events.db)
5. Ranks and returns JSON results

Start simple — even just FTS5 search is useful. Add embedding-based search as a second pass.

#### 2c. cortex-write.sh

Script the agent calls for writes that need side-effect coordination:
1. `entity` subcommand — INSERT into entities + entity_aliases, trigger background embedding
2. `relationship` subcommand — INSERT into relationships (append-only), create episode_relationship_mentions
3. `episode` subcommand — INSERT into episodes + episode_events + episode_entity_mentions

Start minimal. The agent can always fall back to raw SQL via `sqlite3` for anything the script doesn't cover.

### Phase 3: Memory Reader

Register and implement the reader meeseeks.

#### 3a. Register automation

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-reader', 'worker:pre_execution', 'persistent', 'active',
  1, '~/.nexus/state/hooks/scripts/memory-reader.ts',
  '~/.nexus/state/meeseeks/memory-reader/',
  '["~/.nexus/state/meeseeks/memory-writer/"]',
  1, 10000
);
```

#### 3b. Dispatch script

See MEMORY_READER.md for the full dispatch script pattern. Key points:
- `ctx.request` IS the worker request
- Derive meeseeks session: `meeseeks:memory-reader:{parent-session-label}`
- `assembleContext` with focused task: search memory for relevant context
- Inject ROLE.md + SKILLS.md into system prompt
- Execute through broker, await result
- Return enrichment: `{ memories: result.response.content }`

#### 3c. ROLE.md

Write reader instructions per MEMORY_READER.md spec:
- Search strategy: entity detection → cortex-search → relationship traversal → read-time interpretation → iterate
- Output: `<memory_context>` block with relevant facts, relationships, recent episodes
- Constraints: target <5s, max 3 agentic turns, focus on relevance not completeness

#### 3d. Enrichment injection

In the hook runner, when blocking automations return enrichment with `memories`:
- Prepend the memory context to the worker's `currentMessage` (not system prompt)
- This makes it task-scoped, not session-scoped

### Phase 4: Memory Writer

Register and implement the writer meeseeks.

#### 4a. Register automation

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-writer', 'after:runAgent', 'persistent', 'active',
  0, '~/.nexus/state/hooks/scripts/memory-writer.ts',
  '~/.nexus/state/meeseeks/memory-writer/',
  '["~/.nexus/state/meeseeks/memory-reader/"]',
  1, 30000
);
```

#### 4b. Dispatch script

See MEMORY_WRITER.md for the full pattern. Key differences from reader:
- Gets FULL conversation history via `assembleContext`
- Async — fire and don't await
- No enrichment returned (writes directly to Cortex)

#### 4c. ROLE.md

Write writer instructions per MEMORY_WRITER.md spec:
- Extraction philosophy: aggressively extractive, latest turn focus, full history for disambiguation
- Observation-log model: every relationship observation appended, no dedup
- Identity relationships → entity_aliases directly
- Group naming rules: 1:1 primitive, 3+ recurring = named, 6+ always named

#### 4d. Schema compatibility

The existing `relationships` table has unique indexes that enforce dedup:
```sql
CREATE UNIQUE INDEX idx_relationships_unique_entity
ON relationships(source_entity_id, target_entity_id, relation_type, valid_at)
WHERE target_entity_id IS NOT NULL;
```

For append-only, either:
- **Drop these indexes** (simplest)
- **Set `valid_at` to `created_at`** for each observation (each timestamp is unique, so the index doesn't conflict)

Recommended: set `valid_at = created_at` for each observation. This preserves the index for queries while allowing appends.

### Phase 5: Plugin Migration (can defer)

Convert existing `NEXPlugin` methods to automations. This is cleanup, not blocking.

## Key Design Decisions (don't second-guess these)

1. **Same request, different session** — Meeseeks share parent's NexusRequest (traceability) but get own session (queue isolation). `ctx.request` is the actual parent object.
2. **Never bypass the broker** — All dispatch goes through `assembleContext` + `startBrokerExecution`.
3. **Two automations, not one** — Reader and writer are separate. Different hook points, different blocking behavior, different timeouts, different context loading.
4. **Skills + direct SQLite, not structured tools** — Agents get skill files and use sqlite3 directly. Only semantic search needs a special script.
5. **Observation-log model** — Append-only relationships. No dedup at write time. Reader interprets at read time.
6. **Agent IS the pipeline** — Writer replaces the 7-stage Go memory pipeline. Not a wrapper.
7. **Identity promotion collapsed** — Writer writes aliases directly to entity_aliases. No separate stage.
8. **Background embeddings** — Write scripts trigger embedding generation async. Agent doesn't think about it.
9. **Anthropic OAuth** — Meeseeks run through existing subscription via broker. Free marginal cost.
10. **Enrichment via currentMessage** — Memory context prepended to currentMessage, not systemPrompt.

## What NOT to Touch

- The Go memory pipeline (`nex/cortex/internal/memory/pipeline.go`) — it's being replaced, not wrapped. Leave it running until the writer meeseeks is proven.
- The events ledger — that's the other workstream (see HANDOFF_EVENT_LEDGER_UNIFICATION.md)
- Existing hook/plugin functionality — Phase 1 extends the system, doesn't break existing hooks. They become automations with `hook_point = NULL` (backwards compat to `runAutomations`).

## Testing

1. **Automation infrastructure:** Register a test automation at `after:runAgent` that logs "hello". Verify it fires after agent turns.
2. **Blocking automation:** Register at `worker:pre_execution` that returns enrichment. Verify enrichment appears in worker's context.
3. **Workspace:** Verify workspace directory is created with seed files. Verify automation can read ROLE.md.
4. **Peer access:** Verify reader can read writer's SKILLS.md and vice versa.
5. **Memory reader E2E:** Ask the worker about a known entity. Verify the reader searches Cortex and injects relevant context.
6. **Memory writer E2E:** Have a conversation mentioning a new person. Verify the writer creates an entity + relationships in Cortex.
7. **Self-improvement:** Verify SKILLS.md gets updated after the reflection turn.
8. **Concurrency:** Fire two rapid turns. Verify the second writer queues behind the first (SessionQueue enforcement).
