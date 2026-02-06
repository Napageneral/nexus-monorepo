# Cortex (Derived Layer)

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02

---

## Overview

**Cortex** is the derived layer that makes raw data useful. It reads from the System of Record (Events, Agents, Identity ledgers) and produces structured knowledge: episodes, facets, embeddings, and analyses.

**Key Insight:** The System of Record stores *facts*. Cortex stores *understanding*.

The name "Cortex" reflects its role as the outer layer that handles higher-order processing — much like the cerebral cortex integrates sensory information and enables complex cognition.

---

## What Cortex Provides

| Component | Description |
|-----------|-------------|
| **Episodes** | Chunks of events grouped for analysis |
| **Facets** | Extracted metadata (entities, topics, sentiment) |
| **Embeddings** | Vector representations for semantic search |
| **Analyses** | Insights, patterns, learned relationships |

---

## Cortex vs System of Record

| Aspect | System of Record | Cortex |
|--------|-----------------|--------|
| **Purpose** | Store facts | Derive understanding |
| **Mutability** | Append-only (Events, Agents) | Mutable (can recompute) |
| **Source** | Raw events and turns | Processed from SoR |
| **Query type** | Exact lookup | Semantic search |
| **Examples** | "What did Mom text at 3pm?" | "What does Mom usually ask about?" |

---

## What Replaces Upstream Memory

Upstream clawdbot used a file-based memory system (`MEMORY.md`, `memory/*.md`) that agents must actively write to. We removed this entirely:

| Upstream | Nexus |
|----------|-------|
| `memory_search` tool | `cortex_search` tool |
| MEMORY.md file-based | Broker writes directly to Agents Ledger |
| Per-agent isolation | Unified knowledge (Cortex) |
| Text chunks only | Entities + relationships |
| No temporal tracking | Bi-temporal bounds |

**Why Cortex is better:**
- Agents don't need to "remember" to write memories
- Broker captures all turns automatically to Agents Ledger
- Cortex derives knowledge from this automatically

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM OF RECORD                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Events     │  │   Agents     │  │     Identity     │  │
│  │   Ledger     │  │   Ledger     │  │      Graph       │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          └─────────────────┼───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        CORTEX                                │
│                   (Derived Layer)                            │
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
└─────────────────────────────────────────────────────────────┘
```

---

## Cortex Query Interface

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

interface CortexResult {
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

---

## Who Queries Cortex

| Component | Query Type | Purpose |
|-----------|------------|---------|
| **Hooks** | Semantic search | Context for hook evaluation |
| **Broker** | Smart forking | Find best fork point in turn tree |
| **Broker** | Context enrichment | RAG for agent context |
| **Agents** | Tool calls | `cortex_search` tool |
| **CLI** | `nexus search` | User semantic search |

---

## Cortex Writes

Cortex primarily reads, but can propose enrichments to Identity Graph:

```typescript
interface IdentityEnrichment {
    entity_id: string;
    relationship?: string;           // Learned from patterns
    tags_add?: string[];
    new_identities?: {
        channel: string;
        identifier: string;
    }[];
    confidence: number;              // 0-1
    source: 'cortex_analysis';
}
```

**Rules:**
- High confidence (>0.9): Auto-apply
- Medium confidence (0.7-0.9): Queue for human review
- Low confidence (<0.7): Log but don't add

---

## Implementation Status

| Component | Status |
|-----------|--------|
| Episodes | 📋 Planned |
| Facets | 📋 Planned |
| Embeddings | 📋 Planned |
| Analyses | 📋 Planned |
| `cortex_search` tool | 📋 Stub (returns empty) |

**Stub strategy:** Until Cortex is fully implemented, `cortex_search` returns empty results. The system works without it; it just lacks the "understanding" layer.

---

## Query Interface

Cortex is queried by multiple components for semantic search and memory retrieval:

| Consumer | Use Case |
|----------|----------|
| **Broker** | Context enrichment (future: auto-inject relevant memories into Layer 3) |
| **Broker** | Smart routing (find best thread for a message) |
| **Automations** | Semantic matching for event evaluation |
| **Agents** | `cortex_search` tool (agent-initiated memory lookup) |
| **CLI** | `nexus search` (user semantic search) |

```typescript
interface CortexQuery {
  query: string;                   // Natural language or semantic
  filters?: {
    sources?: string[];            // Limit to adapters ('imessage', 'gmail', etc.)
    time_range?: { start: number; end: number };
    entity_ids?: string[];         // Limit to participants
  };
  limit?: number;
  include_embeddings?: boolean;
}

interface CortexResult {
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

**Note:** The exact transport (HTTP API, Unix socket, direct SQLite) between the TypeScript NEX process and the Go Cortex process is TBD. See `../../project-structure/LANGUAGE_DECISION.md` for the process boundary.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `upstream/UPSTREAM_MEMORY.md` | ✅ Complete | Upstream memory architecture (removed) |

---

## Related

- `../ledgers/` — System of Record (source data)
- `../../runtime/nex/NEXUS_REQUEST.md` — Pipeline lifecycle (Cortex feeds into stage 5)
- `../../runtime/broker/CONTEXT_ASSEMBLY.md` — Cortex injection into agent context (Layer 3)
- `../../runtime/broker/` — Broker queries Cortex for context
