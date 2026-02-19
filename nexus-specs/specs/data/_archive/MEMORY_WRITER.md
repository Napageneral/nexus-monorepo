# Memory Writer Role (Meeseeks)

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-13
**Pattern:** Meeseeks (see `../../../runtime/broker/MEESEEKS_PATTERN.md`)
**Peer:** MEMORY_READER.md (linked via `peer_workspaces`)
**Related:** ../MEMORY_SYSTEM.md, ../CORTEX_AGENT_INTERFACE.md

---

## Overview

The Memory Writer is an automation registered at the **`after:runAgent`** hook point (async, fire-and-forget). It fires after the agent turn completes, extracting knowledge from the completed turn and writing it to Cortex. The writer is responsible for **entities, relationships, and episodes** — the full extraction pipeline in a single agent pass.

**The agent IS the pipeline.** The writer replaces the 7-stage Go memory pipeline with intelligent, single-pass extraction. What was rigid pipeline stages becomes agent judgment — reading deeply, making resolution calls, accumulating skill over time.

**Key design: full context for long-term inference.** The writer subagent gets context assembled through the standard `assembleContext` path with full conversation history. Its ROLE.md instructions focus it on extracting from the **latest turn** while leveraging full history for context and disambiguation.

---

## Automation Registration

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, peer_workspaces, self_improvement, timeout_ms
) VALUES (
  'memory-writer',
  'after:runAgent',
  'persistent',
  'active',
  0,                                                     -- async: pipeline does not wait
  '~/.nexus/state/hooks/scripts/memory-writer.ts',
  '~/.nexus/state/meeseeks/memory-writer/',
  '["~/.nexus/state/meeseeks/memory-reader/"]',          -- can read reader's workspace
  1,                                                     -- self-improvement enabled
  30000                                                  -- 30s timeout
);
```

---

## Invocation Flow

```
Stage 6: runAgent completes (pipeline.ts)
    │
    ▼
Hook: after:runAgent
    │
    ├── evaluateAutomationsAtHook("after:runAgent", ...)
    │
    ├── Blocking automations run first (if any registered here)
    │
    └── Async automations fire-and-forget:
          │
          └── memory-writer automation:
                1. Dispatches subagent via assembleContext + startBrokerExecution
                2. Writer meeseeks runs:
                   ┌───────────────────────────────────────────┐
                   │ WRITER MEESEEKS                           │
                   │ (own session, parent's request)           │
                   │                                           │
                   │ Prompt: ROLE.md + SKILLS.md               │
                   │ Skills: cortex/ (schema, queries, scripts)│
                   │                                           │
                   │ The agent IS the pipeline:                │
                   │                                           │
                   │ 1. EXTRACT entities from latest turn      │
                   │    - People, companies, projects, etc.    │
                   │    - Use full history for disambiguation  │
                   │                                           │
                   │ 2. RESOLVE against existing graph         │
                   │    - cortex-search + SQL to check         │
                   │      existing entities, aliases           │
                   │    - Agent reads deeply, makes judgment   │
                   │    - Writes aliases directly (no separate │
                   │      identity promotion stage)            │
                   │                                           │
                   │ 3. WRITE observations                     │
                   │    - New entities with aliases            │
                   │    - Every relationship observation       │
                   │      (append-only, no dedup)              │
                   │    - Episodes with linked events          │
                   │    - Embeddings triggered in background   │
                   │                                           │
                   └───────────────────────────────────────────┘
                3. Self-improvement chained by runtime (background)

    (Pipeline continues immediately — stage 7 deliverResponse runs without waiting)
```

---

## Dispatch Script

```typescript
export default async function memoryWriterAutomation(ctx: AutomationContext) {
  // Frequency check (configurable)
  const config = ctx.automation.config_json || {};
  const frequency = config.frequency || 'every_turn';
  if (frequency === 'every_n_turns') {
    const count = parseInt(ctx.workspace.readFile('turn_count.txt') || '0') + 1;
    // ... write updated count, skip if not at interval
  }

  // ctx.request IS the pipeline request — same NexusRequest, not a copy.
  const meeseeksSession = `meeseeks:memory-writer:${ctx.request.agent?.session_label || ctx.request.request_id}`;

  // 1. Assemble context — same request, own session label, focused task.
  //    Writer gets FULL conversation history via assembleContext.
  const assembled = await ctx.assembleContext({
    sessionLabel: meeseeksSession,
    task: `Extract entities, relationships, and episodes from the latest turn.
           Focus on NEW information. Use full history only for context/disambiguation.`,
  });

  // 2. Inject role context from workspace
  assembled.systemPrompt += `\n\n${ctx.workspace.role}\n${ctx.workspace.skills}`;

  // 3. Execute through the broker — same request, meeseeks session.
  const execution = ctx.startBrokerExecution(assembled, {
    sessionLabel: meeseeksSession,
  });
  await execution.result;

  return {
    fire: true,
    blocking: false,
    // No enrichment — writers don't enrich the pipeline, they persist to Cortex
  };
}
```

---

## The Agent IS the Pipeline

The writer replaces the 7-stage Go memory pipeline with intelligent, single-pass extraction:

| Old Pipeline Stage | New Agent Behavior |
|--------------------|-------------------|
| 1. EntityExtractor (Gemini LLM) | Agent extracts entities from latest turn using full conversation context |
| 2. EntityResolver (alias + embedding) | Agent does deep reading through cortex-search + SQL to find existing matches. Makes judgment calls. |
| 3. RelationshipExtractor (Gemini LLM) | Agent extracts relationships in the same pass. 1:1 relationships as primitive. |
| 4. IdentityPromoter | **Collapsed** — Agent writes aliases directly when it finds identity info (emails, phones, handles). No separate stage. |
| 5. EdgeResolver (dedup) | **Removed** — Observation log model. Every observation is appended, no dedup. |
| 6. ContradictionDetector | **Removed** — Happens at read time. Reader interprets relationship history. |
| 7. EntityEmbedder | **Background** — Triggered automatically when embeddable objects are written. Not an agent concern. |

The old pipeline was 7 rigid stages with two Gemini LLM calls. The new model is one intelligent agent pass that reads deeply, makes judgment calls, and accumulates skill over time.

---

## Observation-Log Model

**Every relationship observation is stored. No deduplication. No contradiction detection at write time.**

```sql
-- Each observation is a separate row with its own timestamp and context
INSERT INTO relationships (id, source_entity_id, target_entity_id, relation_type, fact, confidence, created_at)
VALUES
  ('r1', 'tyler', 'anthropic', 'WORKS_AT', 'Tyler works at Anthropic', 1.0, '2026-01-15'),
  ('r2', 'tyler', 'anthropic', 'WORKS_AT', 'Tyler is building Nexus at Anthropic', 1.0, '2026-02-01'),
  ('r3', 'tyler', 'google',    'WORKS_AT', 'Tyler used to work at Google', 0.8, '2026-02-10');
-- All three rows exist. The reader synthesizes the current picture.
```

**Why append-only?**
- Shows how relationships grow, expand, and change over time
- Bi-temporal tracking is too restrictive — real relationships are nuanced
- The reader's intelligence is better at interpreting relationship history than rigid invalidation rules
- Every observation carries its own `fact`, `confidence`, `created_at` — rich provenance
- This entirely removes contradiction detection at write time, which is clean

---

## Relationship Extraction Rules

- **1:1 relationships are the primitive.** Every relationship connects two entities.
- **Group naming:** If 3+ individuals recur together and the grouping is meaningful, create a named group entity — but only if the grouping recurs. One-off groupings of 3+ just become individual 1:1 relationships.
- **6+ always gets a name.** Groups of 6 or more entities that appear together always get a named group entity regardless of recurrence.
- **Identity relationships** (HAS_EMAIL, HAS_PHONE, HAS_HANDLE, etc.) are written directly to `entity_aliases` table. The agent determines this in one pass — no separate IdentityPromoter stage.

---

## Extraction Philosophy

Be **aggressively extractive**. The observation log handles volume gracefully. Extract:

- Every entity mentioned (people, companies, projects, locations, events, documents, pets)
- Every relationship observation (professional, social, preference, temporal, identity, behavioral)
- Every literal fact (emails, phones, dates, compensation figures)
- Source attribution (self_disclosed, mentioned, inferred)
- Confidence levels for inferred knowledge
- Episodes with linked events and entity/relationship mentions

### Latest Turn Focus with Full Context

```markdown
## Focus (from ROLE.md)
Your PRIMARY focus is the LATEST turn — the most recent user message and agent
response. Extract all entities, relationships, and facts from this turn.

You have the FULL conversation history. Use this context to:
- Resolve ambiguous entity references ("she" → who was being discussed?)
- Detect evolving relationships (mentioned job change 3 turns ago, confirmed now)
- Spot patterns across turns (user keeps asking about the same project)

Do NOT re-extract everything from the full history. Focus on NEW information
from the latest turn, using history only for context and disambiguation.
```

---

## Tooling: Skills + Direct SQLite

The writer operates in **code mode** with direct SQLite access via skill files. Reads via raw SQL, writes via skill scripts that handle side-effect coordination.

### Skill folder

```
~/.nexus/state/meeseeks/memory-writer/
  ROLE.md
  SKILLS.md
  PATTERNS.md
  ERRORS.md
  skills/
    cortex/
      SCHEMA.md           # Full Cortex DB schema (all three ledgers)
      QUERIES.md          # Common read query patterns (for resolution)
      cortex-search.sh    # Semantic + FTS hybrid search (for entity resolution)
      cortex-write.sh     # Write helper: handles INSERT + background embedding trigger
      DB_PATH             # ~/.nexus/data/cortex.db
```

### How the agent uses skills

1. **Reads `skills/cortex/SCHEMA.md`** to understand table structure
2. **Runs `cortex-search.sh`** to check if entities already exist before creating (resolution)
3. **Writes raw SQL** via `sqlite3` CLI for reads: checking existing entities, aliases, relationships
4. **Runs `cortex-write.sh`** for writes: entity creation, relationship appends, episode creation — the script handles:
   - Alias normalization (lowercase, cleaned)
   - Background embedding trigger
   - Merge candidate detection for new entities
   - `episode_entity_mentions` / `episode_relationship_mentions` junction table rows
5. **Reads `skills/cortex/QUERIES.md`** for pre-built patterns

### Why skill scripts for writes?

Raw SQL INSERTs work, but writes have side effects:
- New entities need embeddings generated in the background
- New aliases need normalization
- New entities might be merge candidates against existing ones
- Episodes need junction table rows for mentions

The `cortex-write.sh` script wraps these operations. The agent calls it with structured arguments, and the script handles the coordination. This keeps the agent focused on extraction intelligence while the script handles DB plumbing.

---

## Frequency Tuning

The writer can be configured with frequency logic in the dispatch script:

| Mode | Logic | Use When |
|------|-------|----------|
| `every_turn` | Always dispatch (default) | Maximum memory coverage. Recommended. |
| `every_n_turns` | Track turn count in workspace, skip if not at interval | Reduce cost for chatty sessions |
| `pre_compaction` | Check if compaction is imminent, only dispatch then | Most conservative |

The frequency mode is stored in `config_json`:

```json
{ "frequency": "every_turn" }
```

---

## Workspace

```
~/.nexus/state/meeseeks/memory-writer/
  ROLE.md               # Role instructions and constraints
  SKILLS.md             # Accumulated extraction strategies
  PATTERNS.md           # Common extraction patterns
  ERRORS.md             # Known failure modes
  skills/
    cortex/
      SCHEMA.md         # Full Cortex DB schema
      QUERIES.md        # Read query patterns (for resolution)
      cortex-search.sh  # Semantic + FTS hybrid search
      cortex-write.sh   # Write helper with side-effect coordination
      DB_PATH           # Database path
```

### Peer access

The writer has peer access to the reader's workspace (`~/.nexus/state/meeseeks/memory-reader/`). It can:
- Read the reader's SKILLS.md to understand what search strategies are being used
- Read the reader's ERRORS.md to learn what searches are failing (and improve extraction to help)
- Read NOTES_FOR_WRITER.md if the reader leaves feedback
- Write NOTES_FOR_READER.md with information the reader should know

### Example SKILLS.md (after accumulation)

```markdown
## Entity Patterns
- Tyler often mentions people by first name only. Always resolve against entity_aliases before creating.
- "The project" = Nexus (entity id: def-456) unless specified otherwise.
- Group chats with Tyler + Sarah + Mike = "Core Team" (entity id: ghi-789). Created after 6+ co-occurrences.

## Extraction Rules
- Identity relationships (emails, phones) → write directly to entity_aliases, not relationships table.
- When confidence < 0.7, mark source_type as "inferred" not "mentioned".
- Always check person_facts before creating new person entities — might already exist from contact import.

## Known Issues
- Entity "Anthropic" has two versions from early import. Merge candidate pending — don't create a third.
- Episodes from iMessage import sometimes have wrong timezone. Use events.timestamp for created_at.
```

---

## Prompt Caching Strategy

| Component | Same as parent? | Why |
|-----------|----------------|-----|
| **System prompt** | YES | Built by same `buildSystemPrompt()`. First cached block. |
| **Tool definitions** | YES | Same tool list. ROLE.md constrains usage. |
| **History** | YES (via assembleContext) | Full ledger history — enables context-aware extraction. |
| **Role context** | APPENDED | ROLE.md + SKILLS.md. Only uncached portion. |

Having the full history is critical — the writer needs to resolve entity references, detect patterns across turns, and avoid re-extracting old information.

Cost per invocation: ~10-20% of a fresh session.

---

## Self-Improvement

Managed by the runtime. When `self_improvement = 1`, the runtime chains a reflection turn after the primary writer task completes. The reflection meeseeks updates SKILLS.md, PATTERNS.md, ERRORS.md.

Since the writer is already async, the self-improvement phase just extends the background work slightly. All usage rolls up to the same `request_id`.

---

## Concurrency

Session key: `meeseeks:memory-writer:{parent-session-label}`

The broker's `SessionQueue` enforces single-concurrency per key. If a second turn completes before the first writer finishes, the second writer invocation queues behind the first.

---

## Access Permissions

All tools are available (same as parent session). ROLE.md constrains behavior:

| Resource | Access |
|----------|--------|
| Cortex database (read, via SQL + skills) | Yes — all tables, all three ledgers |
| Cortex database (write, via skill scripts) | Yes — entities, relationships, episodes, aliases, mentions |
| Skill scripts (cortex-search.sh, cortex-write.sh) | Yes |
| Home workspace (read/write) | Yes |
| Peer workspace: memory-reader (read/write) | Yes |
| User workspace | No (by ROLE.md instruction) |
| Parent request context | Read (via `ctx.request`) |

---

## Event Ledger Integration

### Writer's data source is `assembleContext`

The writer gets full conversation history (both sides — user messages and assistant responses) via `assembleContext`. It does **not** need to read from the events ledger for per-turn extraction. The events ledger is for episodic memory construction (chunking timeline events into episodes) and cross-channel awareness — a different concern.

The writer's flow:
1. `after:runAgent` fires → `assembleContext` gives full session history
2. Writer extracts entities/relationships/episodes from that context
3. Writes to Cortex declarative tables (entities, relationships, entity_aliases)
4. Writes episodes linking to events in the events ledger (for provenance)

### Event ledger unification

The events ledger is being unified — there is ONE events ledger (`events.db`), not two. See `../EVENT_LEDGER_UNIFICATION.md` for the full spec. The pipeline already captures both inbound (Stage 1) and outbound (Stage 8) events. Agent-initiated sends need additional capture.

### AIX session import

AIX adapters (already built) handle import:
- **`AixAdapter`** — Full fidelity (every message) → agents ledger + events ledger
- **`AixEventsAdapter`** — Trimmed turns (consolidated user + stripped assistant) → events ledger (memory-focused)

Both write to the unified events ledger. The writer can process imported sessions the same way it processes live sessions.
