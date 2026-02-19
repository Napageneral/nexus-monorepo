# Memory System V2 — Implementation Handoff

> **Database Layout:** See `specs/data/DATABASE_ARCHITECTURE.md` for the canonical 6-database layout. The memory system spans memory.db (facts, episodes), identity.db (entities), and embeddings.db (vectors).

> **Note:** This handoff was originally written for Go cortex implementation. The Go cortex (`nex/cortex/`) is now being eliminated and all logic ported to TypeScript. The Go code paths referenced below (internal/db/, internal/search/, internal/memory/, internal/identify/, internal/contacts/, internal/compute/) are being superseded by the TS implementation. These references remain for historical context.

You are implementing a major refactor of the memory system inside the Nexus project. This is a BIG BANG REFACTOR — no backwards compatibility concerns. Drop the old, build the new.

## Step 1: Read the Specs

Read ALL of these files before writing any code. They are the source of truth for every design decision.

**Start with the workplan — it tells you the exact order to build things:**

```
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/WORKPLAN.md
```

**Then read the architecture and data model:**

```
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_SYSTEM_V2.md
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/UNIFIED_ENTITY_STORE.md
```

**Then the writer (the most complex piece):**

```
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_WRITER_V2.md
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_WRITER_ROLE.md
```

**Then the read path:**

```
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_INJECTION.md
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_SEARCH_SKILL.md
/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_REFLECT_SKILL.md
```

## Step 2: Understand the Existing Codebase

The Go cortex code being superseded lives here:

```
/Users/tyler/nexus/home/projects/nexus/nex/cortex/
```

> **IMPORTANT:** The Go cortex is being eliminated. All logic is being ported to TypeScript. The following Go code paths are listed for reference only — they are being replaced by the TS implementation. See `specs/data/DATABASE_ARCHITECTURE.md` §4 for the full Go cortex elimination plan.

Key locations (Go, being eliminated):

| Path | What | Status |
|------|------|--------|
| `internal/db/schema.sql` | Legacy database schema | **ELIMINATED** — replaced by TS-owned schema files (memory.ts, identity.ts, embeddings.ts) |
| `internal/db/db.go` | Database init and migration | **ELIMINATED** — TS owns migrations |
| `internal/search/` | Legacy search implementation | **ELIMINATED** — replaced by TS recall implementation |
| `internal/memory/` | Legacy 7-stage memory pipeline (~25 files) | **ELIMINATED** — ported to TS |
| `internal/identify/` | Legacy identity resolution | **ELIMINATED** — ported to TS identity.db |
| `internal/contacts/` | Legacy contacts system | **ELIMINATED** — ported to TS identity.db |
| `internal/compute/engine.go` | Parallel worker system | **ELIMINATED** — ported to TS |
| `internal/compute/embeddings_batcher.go` | Embedding generation | **ELIMINATED** — ported to TS |
| `internal/bus/bus.go` | Event bus | **ELIMINATED** — replaced by Nex InMemoryEventBus |
| `internal/live/` | Live event processing | **ELIMINATED** — replaced by TS hooks/automations |

## Step 3: Read the Reference Implementation

The design draws heavily from Hindsight. When the specs say "port from Hindsight," look here:

```
/Users/tyler/nexus/home/projects/hindsight/hindsight-api/hindsight_api/engine/
```

Key reference files:

| Hindsight File | What to Port |
|---------------|-------------|
| `memory_engine.py` | recall() retrieval strategies, RRF fusion, MMR |
| `retain/fact_extraction.py` | Extraction prompts (adapted into MEMORY_WRITER_ROLE.md) |
| `consolidation/consolidator.py` | Per-fact consolidation loop |
| `consolidation/prompts.py` | Consolidation/observation prompt |
| `reflect/agent.py` | Evidence guardrails, hierarchical retrieval pattern |
| `retain/link_utils.py` | Entity co-occurrence updates |

Note: Hindsight is Python/Postgres. You're building in Go/SQLite. Translate patterns, don't copy code.

## Step 4: Build in Order

Follow the WORKPLAN.md phases exactly:

1. **Schema Migration** — Drop old memory tables, create new ones. All SQL is in the specs.
2. **recall() Implementation** — 4 retrieval strategies + RRF + MMR. New `internal/recall/` package.
3. **Embedding Pipeline** — Refactor for new schema. Local embedding model to start.
4. **Memory-Writer Meeseeks** — Workspace, tools, hooks. The agentic fact extractor.
5. **Consolidation Worker** — Background per-fact observation synthesis.
6. **Memory Injection Meeseeks** — Lightweight reader at worker:pre_execution.
7. **Skills** — Search + Reflect skill files, mental model tools.
8. **Cleanup + Backfill** — Delete old code, build backfill CLI.

Each phase has specific steps, files to touch, and test criteria in the workplan.

## Key Design Decisions (Don't Re-Litigate These)

These were debated extensively. Just build what the specs say:

- **Facts are natural language sentences**, not structured triples. No relationships table.
- **fact_entities junction IS the knowledge graph.** Facts link to entities. That's it.
- **Only causal links stored at write time.** Temporal, semantic, entity links computed at read time.
- **Single entities table with union-set (merged_into pointer).** No contacts, no aliases tables.
- **Entity type is free-form text.** Not an enum.
- **Observations are an analysis type** using existing analysis_runs/facets infrastructure.
- **parent_id on episodes, analysis_runs, mental_models** for immutable version history.
- **Embeddings in a separate table** with model column for swappability.
- **The writer agent IS the extractor.** No extract_facts() tool. Role prompt teaches extraction.
- **recall() is one API** with scope/entity/time/channel/budget params. Not 3 separate search tools.
- **Budget controls which strategies run** (low=semantic only, mid=3-way, high=all 4).
- **Backfill uses the same agentic writer flow**, just grouped into episodes first. Sequential per channel, parallel across channels.
- **Memory injection is a lightweight meeseeks** with a fast model that triages recall results. Not a raw function call.

## What Success Looks Like

When you're done:

1. Events flow in → Memory-Writer extracts facts + entities → stored in memory.db + identity.db + embeddings.db
2. recall() returns relevant facts/observations/mental_models with tunable parameters
3. Workers automatically get memory context injected before execution
4. Agents can search memory directly via the search skill
5. Consolidation runs in background, turning facts into observations
6. Old memory pipeline code is deleted
7. Backfill CLI can process historical events

## Notes

- The implementation is TypeScript in `/nex/src/`. The Go cortex code at `/nex/cortex/` is being eliminated. The `nex/cortex/` directory structure is being superseded by the TS implementation.
- SQLite, not Postgres. Use sqlite-vec for vectors, FTS5 for keyword search. Memory data is split across memory.db, identity.db (entities), and embeddings.db per DATABASE_ARCHITECTURE.md.
- The Go compute engine (`internal/compute/`) is being ported to TS.
- Test each phase before moving to the next. The workplan has test criteria for each phase.
- When in doubt, the spec docs are authoritative. When the specs don't cover something, use your judgment and match existing patterns in the codebase.
