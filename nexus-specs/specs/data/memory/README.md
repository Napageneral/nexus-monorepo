# Memory System (Derived Layer)

**Status:** DESIGN COMPLETE
**Last Updated:** 2026-02-18

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout, table inventories, and migration plan.

---

## Overview

The **Memory System** is the derived layer that makes raw data useful. It reads from the System of Record (Events, Agents, Identity ledgers) and produces structured knowledge: episodes, facets, embeddings, and analyses.

**Key Insight:** The System of Record stores *facts*. The Memory System stores *understanding*.

The memory system handles higher-order processing -- integrating raw events into durable knowledge through facts, episodes, observations, and mental models.

---

## What the Memory System Provides

| Component | Description |
|-----------|-------------|
| **Episodes** | Chunks of events grouped for analysis |
| **Facets** | Extracted metadata (entities, topics, sentiment) |
| **Embeddings** | Vector representations for semantic search |
| **Analyses** | Insights, patterns, learned relationships |

---

## Memory System vs System of Record

| Aspect | System of Record | Memory System |
|--------|-----------------|--------|
| **Purpose** | Store facts | Derive understanding |
| **Mutability** | Append-only (Events, Agents) | Mutable (can recompute) |
| **Source** | Raw events and turns | Processed from SoR |
| **Query type** | Exact lookup | Semantic search |
| **Examples** | "What did Mom text at 3pm?" | "What does Mom usually ask about?" |

---

## What Replaces Upstream Memory

Upstream openclaw used a file-based memory system (`MEMORY.md`, `memory/*.md`) that agents must actively write to. We removed this entirely:

| Upstream | Nexus |
|----------|-------|
| `memory_search` tool | `recall()` tool |
| MEMORY.md file-based | Broker writes directly to Agents Ledger |
| Per-agent isolation | Unified knowledge (Memory System) |
| Text chunks only | Entities + relationships |
| No temporal tracking | Bi-temporal bounds |

**Why the Memory System is better:**
- Agents don't need to "remember" to write memories
- Broker captures all turns automatically to Agents Ledger
- Memory system derives knowledge from this automatically

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM OF RECORD                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Events     │  │   Agents     │  │     Identity     │  │
│  │   Ledger     │  │   Ledger     │  │      Ledger      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          └─────────────────┼───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   MEMORY SYSTEM (TS)                         │
│                    (Derived Layer)                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Episodes   │  │    Facets    │  │    Embeddings    │  │
│  │  (chunks)    │  │  (metadata)  │  │   (vectors)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     Analyses                          │  │
│  │  (patterns, relationships, temporal facts)            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Storage: memory.db (facts, episodes, analysis)              │
│           identity.db (entities, entity_tags, merges)        │
│           embeddings.db (vector index)                       │
└─────────────────────────────────────────────────────────────┘
```

> **Note:** The Go cortex process has been eliminated. All memory system logic is ported to TypeScript. Entities now live in `identity.db` (not `memory.db`), enabling JOINs with contacts for identity resolution. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for full details.

---

## Query Interface

The memory system is queried by multiple components for semantic search and memory retrieval:

| Consumer | Use Case |
|----------|----------|
| **Broker** | Context enrichment (auto-inject relevant memories into Layer 3) |
| **Broker** | Smart routing (find best thread for a message) |
| **Automations** | Semantic matching for event evaluation |
| **Agents** | `recall()` tool (agent-initiated memory lookup) |
| **CLI** | `nexus search` (user semantic search) |

```typescript
interface MemoryQuery {
  query: string;                   // Natural language or semantic
  filters?: {
    sources?: string[];            // Limit to adapters ('imessage', 'gmail', etc.)
    time_range?: { start: number; end: number };
    entity_ids?: string[];         // Limit to participants
  };
  limit?: number;
  include_embeddings?: boolean;
}

interface MemoryResult {
  hits: {
    episode_id: string;
    score: number;
    content_preview: string;
    source_event_ids: string[];
    facets: Facet[];
  }[];
  total_hits: number;
}
```

> **Note:** The Go cortex process has been eliminated. Memory queries are served directly by the Nex TS process via `recall()`. See `MEMORY_SEARCH_SKILL.md` for the recall API. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for storage layout.

---

## Memory System Writes

The memory system primarily reads from ledgers, but can write enrichments to the Identity Ledger (identity.db):

```typescript
interface IdentityEnrichment {
  entity_id: string;
  relationship?: string;           // Learned from patterns
  tags_add?: string[];
  tags_remove?: string[];
  new_identities?: {
    platform: string;
    sender_id: string;
  }[];
  confidence: number;              // 0-1
  source: 'memory_analysis';
}
```

**Confidence thresholds:**
- High confidence (>0.9): Auto-apply to Identity Graph
- Medium confidence (0.7-0.9): Queue for human review
- Low confidence (<0.7): Log but don't apply

---

## Implementation Status

| Component | Status |
|-----------|--------|
| Episodes | Planned |
| Facets | Planned |
| Embeddings | Planned |
| Analyses | Planned |
| `recall()` tool | Stub (returns empty) |

**Stub strategy:** Until the memory system is fully implemented, `recall()` returns empty results. The system works without it; it just lacks the "understanding" layer. All data is written to ledgers regardless, so the memory system can analyze retroactively once implemented.

---

## Related

- [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) — Canonical database layout (memory.db, identity.db, embeddings.db)
- `MEMORY_SYSTEM_V2.md` — Full 4-layer memory architecture
- `MEMORY_WRITER_V2.md` — Agentic retain flow
- `MEMORY_SEARCH_SKILL.md` — Agent search skill (recall API)
- `UNIFIED_ENTITY_STORE.md` — Entity store (lives in identity.db)
- `MEMORY_SYSTEM.md` — Tripartite memory model (declarative, episodic, procedural)
- `roles/MEMORY_READER.md` — Memory reader meeseeks role spec
- `roles/MEMORY_WRITER.md` — Memory writer meeseeks role spec (superseded by MEMORY_WRITER_V2.md)
- `../../runtime/broker/MEESEEKS_PATTERN.md` — Disposable role fork pattern
- `../ledgers/` — System of Record (source data)
- `../../runtime/nex/NEXUS_REQUEST.md` — Pipeline lifecycle
- `../../runtime/broker/CONTEXT_ASSEMBLY.md` — Memory injection into agent context (Layer 3)
- `../../runtime/broker/` — Broker queries memory for context
