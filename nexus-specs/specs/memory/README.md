# Memory System (Derived Layer)

**Status:** IMPLEMENTED
**Last Updated:** 2026-02-23

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout, table inventories, and migration plan.

---

## Overview

The **Memory System** is the derived layer that makes raw data useful. It reads from the System of Record (Events, Agents, Identity ledgers) and produces structured knowledge: episodes, facets, embeddings, and analyses.

**Key Insight:** The System of Record stores *facts*. The Memory System stores *understanding*.

The memory system handles higher-order processing -- integrating raw events into durable knowledge through facts, episodes, observations, and mental models.

---

## What the Memory System Provides

| Layer | Component | Description |
|-------|-----------|-------------|
| **L1 — Events** | Short-term memory | Raw events indexed for immediate searchability via recall() |
| **L2 — Facts/Episodes** | Facts & Episodes | Atomic durable knowledge extracted from conversation episodes |
| **L3 — Observations** | Observations | Synthesized patterns from clusters of related facts |
| **L4 — Mental Models** | Mental Models | Comprehensive reports created by the reflect skill |
| *Support* | **Embeddings** | Vector representations for semantic search (embeddings.db) |
| *Support* | **Entities** | Unified entity store for identity resolution (identity.db) |

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

> **Note:** The memory system runs in-process as TypeScript. There is no separate subprocess. Entities live in `identity.db` (not `memory.db`), enabling JOINs with contacts for identity resolution. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for full details.

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

```
recall(query, params)

Key parameters:
  query        string      Natural language search query
  scope        string[]    What to search: facts, observations, mental_models, entities
  entity       string      Filter by entity name or ID
  time_after   integer     Only results after this timestamp (unix ms)
  time_before  integer     Only results before this timestamp (unix ms)
  budget       string      Search depth: 'low' | 'mid' | 'high'

Returns:
  results[]    facts + observations + mental_models ranked by RRF+MMR
               Each result includes: id, text, type, as_of, relevance score,
               is_stale flag, linked entity_ids, source metadata
```

> See `skills/MEMORY_SEARCH_SKILL.md` for the full recall() API, hierarchical retrieval strategy, and budget management. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for storage layout.

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
| Schema (memory.db, identity.db, embeddings.db) | Complete |
| `recall()` | Complete |
| Embedding pipeline | Complete |
| Memory-Writer meeseeks | Complete |
| Consolidation worker | Complete |
| Memory Injection meeseeks | Complete |
| Skills (search, reflect) | Complete |
| Backfill CLI | Complete |

---

## Related

- [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) — Canonical database layout (memory.db, identity.db, embeddings.db)
- `MEMORY_SYSTEM.md` — Full 4-layer memory architecture
- `MEMORY_WRITER.md` — Agentic retain flow
- `workplans/MEMORY_WRITER_ROLE.md` — Memory-Writer meeseeks role spec
- `skills/MEMORY_SEARCH_SKILL.md` — Agent search skill (recall API)
- `skills/MEMORY_REFLECT_SKILL.md` — Deep research and mental model persistence
- `skills/MEMORY_INJECTION.md` — Memory injection into agent context
- `RETAIN_PIPELINE.md` — Retain pipeline (events to facts)
- `UNIFIED_ENTITY_STORE.md` — Entity store (lives in identity.db)
- `workplans/MEMORY_V2_REVIEW_UI_DASHBOARD_SPEC.md` — Operator memory review UI spec (runs, episodes, outputs, provenance)
- `../../runtime/broker/MEESEEKS_PATTERN.md` — Disposable role fork pattern
- `../ledgers/` — System of Record (source data)
- `../../runtime/nex/NEXUS_REQUEST.md` — Pipeline lifecycle
- `../../runtime/broker/CONTEXT_ASSEMBLY.md` — Memory injection into agent context (Layer 3)
- `../../runtime/broker/` — Broker queries memory for context
