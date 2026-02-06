# Memory Systems Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Executive Summary

OpenClaw and Nexus take fundamentally different approaches to memory:

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Philosophy** | Memory is active, in-flow | Memory is derived, separate |
| **Storage** | `MEMORY.md` + `memory/*.md` files | System of Record (Agents Ledger) |
| **Search** | Vector + BM25 via memory plugins | Cortex semantic layer |
| **When it runs** | During agent execution | Asynchronously (background) |
| **Data ownership** | Agent must write to remember | Infrastructure captures everything |

**The insight:** OpenClaw treats memory as something the agent manages. Nexus treats memory as something the infrastructure derives.

---

## OpenClaw's In-Flow Memory Model

### Architecture

```
Agent conversation
        ↓
Agent writes to MEMORY.md / memory/*.md  (active)
        ↓
Memory plugins index files (LanceDB, SQLite)
        ↓
memory_search tool queries index
        ↓
Results injected into agent context
```

### Key Characteristics

1. **Memory is active** — Agents must consciously write to `MEMORY.md` or `memory/*.md` to persist information
2. **Vector search via plugins** — Bundled plugins (LanceDB, sqlite-vec) handle embedding and search
3. **Hybrid search** — BM25 + vector with configurable weights (default 0.3/0.7)
4. **Memory flush on compaction** — Pre-compaction prompt asks agent to save important context
5. **In-flow execution** — Memory is queried and injected during agent turns
6. **Chunking strategy** — Split by markdown headers → paragraphs → sentences (512 tokens, 64 overlap)

### The Memory Flush Problem

Before auto-compaction, OpenClaw runs a "memory flush" turn:

```
"Pre-compaction memory flush. Store durable memories now."
```

The agent decides what's important and writes it to files. Then compaction summarizes old context.

**Problems with this approach:**
- Agent burden — must remember to remember
- Judgment calls — what's "important enough" to save?
- Lost context — anything not saved before compaction is gone
- No regeneration — faulty memories are stuck forever

### Source Files

Key implementation in OpenClaw:
- `src/memory/manager.ts` — Core orchestrator
- `src/memory/hybrid.ts` — BM25 + vector merging
- `src/memory/embeddings.ts` — Provider abstraction
- `src/agents/tools/memory-tool.ts` — `memory_search`, `memory_get`

---

## Nexus's Derived Layer Model (Cortex)

### Architecture

```
All turns → Agents Ledger (SQLite)     ← System of Record
                    ↓
            Cortex (background)         ← Derived Layer
                    ↓
    Episodes, Facets, Embeddings, Analyses
                    ↓
            cortex_search tool
```

### Key Characteristics

1. **Cortex is derived** — Runs asynchronously from agent execution
2. **Indexes from SoR** — Doesn't store raw data twice; indexes what's already in the Agents Ledger
3. **Background processing** — Doesn't slow down the pipeline
4. **Semantic search** — Across all history, not just memory files
5. **Can learn and enrich** — Cortex can propose enrichments to Identity Graph
6. **Regenerable** — If memory logic improves, regenerate entire Cortex from SoR

### The Four Cortex Components

| Component | Description | Purpose |
|-----------|-------------|---------|
| **Episodes** | Chunks of events grouped for analysis | Coherent conversation segments |
| **Facets** | Extracted metadata (entities, topics, sentiment) | Structured knowledge extraction |
| **Embeddings** | Vector representations for semantic search | Similarity-based retrieval |
| **Analyses** | Insights, patterns, learned relationships | Higher-order understanding |

### How Cortex Differs from Memory Files

| Aspect | OpenClaw Memory | Nexus Cortex |
|--------|-----------------|--------------|
| **Source** | Files agent wrote | All turns in Agents Ledger |
| **Mutability** | Files are the truth | Derived, can regenerate |
| **Completeness** | Only what agent saved | Everything ever said |
| **Temporal** | No temporal tracking | Bi-temporal bounds |
| **Relationships** | Text chunks only | Entities + relationships |
| **Cross-agent** | Per-agent isolation | Unified knowledge |

### Cortex Query Interface

```typescript
interface CortexQuery {
    query: string;                   // Natural language or semantic
    filters?: {
        sources?: string[];          // Limit to adapters
        time_range?: { start: number; end: number };
        entity_ids?: string[];       // Limit to participants
    };
    limit?: number;
    include_embeddings?: boolean;
}
```

Full specification: `specs/data/cortex/`

---

## Why Separation Matters

### 1. Separation of Concerns

**System of Record stores facts:** "Mom texted at 3pm asking about dinner"

**Cortex stores understanding:** "Mom usually asks about dinner plans on weekdays"

Facts don't change. Understanding can be refined.

### 2. Cortex Can Be Rebuilt

If you improve the memory algorithm:
- **OpenClaw:** New conversations benefit. Old memories stuck in old format.
- **Nexus:** Regenerate entire Cortex. All history benefits.

This is the key advantage of derived layers — they're not the source of truth.

### 3. No Memory Flush Needed

In OpenClaw:
```
Compaction happens → Old context lost → Hope you saved to files first!
```

In Nexus:
```
Compaction happens → Old context marked → Raw data still in Agents Ledger
Cortex runs → Builds memory from ALL raw data (including "compacted" turns)
```

The Agents Ledger IS the durable store. Compaction marks context boundaries; it doesn't delete.

### 4. Async Processing

OpenClaw's memory indexing happens during agent turns — sync operations that can slow response time.

Cortex runs in the background:
- Agent responds fast
- Cortex processes later
- Context enrichment available on next query

### 5. Richer Context Assembly

| Query Type | OpenClaw | Nexus |
|------------|----------|-------|
| "What did we discuss?" | Text chunk search | Episode retrieval + facets |
| "Who is this person?" | No relationship tracking | Identity Graph + Cortex |
| "What do they usually ask?" | Would need explicit notes | Pattern analysis from history |

---

## Tool Mapping

| OpenClaw Tool | Nexus Replacement | Notes |
|---------------|-------------------|-------|
| `memory_search` | `cortex_search` | Semantic search across all history |
| `memory_get` | Removed | Cortex returns full context; no line-range fetch needed |

### Stub Strategy

Until Cortex is fully implemented, `cortex_search` returns empty results. The system works — it just lacks the "understanding" layer. This is safe because:

- Agents don't depend on memory to function
- Context still flows from turns in the Agents Ledger
- The stub can be progressively enhanced

---

## What Happens to MEMORY.md?

### Short Answer

**Removed.** Nexus doesn't use file-based memory.

### Migration Path

| OpenClaw | Nexus |
|----------|-------|
| `MEMORY.md` | Broker writes directly to Agents Ledger |
| `memory/*.md` | No equivalent (everything in Agents Ledger) |
| Agent-curated notes | State files if needed (`state/agents/{agent}/notes.md`) |

### For Long-Form Curated Content

If agents need to maintain structured notes (e.g., project context, user preferences):

1. **Identity files** — `state/user/IDENTITY.md`, `state/agents/{agent}/MEMORY.md`
2. **State files** — `state/agents/{agent}/` for any persistent agent-specific data
3. **Home folder** — `home/` for user-facing documents agents might reference

These are **read-mostly** — the agent can update them, but they're not the primary memory system. Cortex is.

---

## Comparison Summary

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Raw data** | JSONL + memory files | Agents Ledger (SQLite) |
| **Memory layer** | File-based (`MEMORY.md`) | Cortex (derived) |
| **Live saving required** | Yes (pre-compaction flush) | No |
| **Agent complexity** | Must manage memory | Just does the task |
| **Cold start** | Problem (no history) | Non-issue (import + derive) |
| **Faulty memories** | Stuck forever | Regenerate from raw data |
| **Improvement path** | New conversations only | Regenerate all history |
| **Performance** | Sync during turns | Async background processing |
| **Cross-agent** | Isolated | Unified knowledge graph |

---

## Related Specs

- `../cortex/README.md` — Cortex architecture and components
- `../cortex/upstream/UPSTREAM_MEMORY.md` — Full OpenClaw memory system analysis
- `MEMORY_PHILOSOPHY.md` — Philosophical framing of the difference
- `../ledgers/` — System of Record (source data for Cortex)

---

*This is one of the most significant architectural differences between the systems — and why Nexus is fundamentally more robust for long-term AI memory.*
