# Memory System Specs

**Status:** DECISION MADE  
**Conflict Risk:** Medium (removal)

---

## Executive Summary

Upstream clawdbot uses a file-based memory system (`MEMORY.md`, `memory/*.md`) that agents must actively write to. We're **removing this entirely** and replacing with **Ledger + Index** — an automatic knowledge capture system where the Broker writes to the Ledger (primary data) and the Index derives knowledge from it.

**Key Insight:** Agents shouldn't have to "remember" to write memories. The Nexus Broker writes agent turns directly to the Agent Ledger (in `nexus.db`), and the Index layer derives knowledge from this primary data automatically.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `UPSTREAM_MEMORY.md` | ✅ COMPLETE | Detailed upstream memory architecture |
| `MNEMONIC_INTEGRATION.md` | TODO | How mnemonic_query replaces memory_search |
| `MIGRATION.md` | TODO | Conversion from upstream memory to Mnemonic |

---

## Upstream Memory Architecture

### Overview

Upstream clawdbot uses a **hybrid BM25 + vector search** system backed by SQLite with automatic indexing of workspace files.

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Memory Manager | `src/memory/manager.ts` | Core orchestration |
| Schema | `src/memory/memory-schema.ts` | SQLite tables + FTS5 |
| Tools | `src/agents/tools/memory-tool.ts` | `memory_search` tool |
| CLI | `src/cli/memory-cli.ts` | Manual indexing commands |
| Config | `src/config/types.tools.ts` | memorySearch options |
| Extensions | `extensions/memory-core/`, `memory-lancedb/` | Pluggable storage |

### SQLite Schema (Upstream)

```sql
-- Chunk storage with embeddings
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,           -- file path
  content TEXT NOT NULL,
  embedding BLOB,                 -- float32 vector
  metadata_json TEXT,
  created_at INTEGER
);

-- FTS5 for BM25 text search
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content='chunks',
  content_rowid='rowid'
);

-- sqlite-vec for vector similarity
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  embedding float[1536]
);
```

### Search Flow (Upstream)

```
memory_search("how does auth work?")
         │
         ▼
┌─────────────────────────────────────────────────┐
│              HYBRID SEARCH                       │
│                                                  │
│  ┌─────────────┐     ┌─────────────────────┐   │
│  │   BM25      │     │   Vector Similarity │   │
│  │  (FTS5)     │     │   (sqlite-vec)      │   │
│  └──────┬──────┘     └──────────┬──────────┘   │
│         │                       │              │
│         └───────────┬───────────┘              │
│                     ▼                          │
│            ┌───────────────┐                   │
│            │  RRF Fusion   │                   │
│            │ (rank merge)  │                   │
│            └───────────────┘                   │
│                     │                          │
│                     ▼                          │
│            Ranked Results                      │
└─────────────────────────────────────────────────┘
```

### What Gets Indexed (Upstream)

| Source | Auto-Indexed | Notes |
|--------|--------------|-------|
| `MEMORY.md` | ✅ Yes | Primary memory file |
| `memory/*.md` | ✅ Yes | Memory log files |
| Session transcripts | ⚠️ Optional | JSONL only for external harnesses |
| Project files | ❌ No | Not indexed |

### Memory Tool (Upstream)

```typescript
{
  name: "memory_search",
  description: "Search memory for relevant information",
  parameters: {
    query: { type: "string", description: "Search query" },
    limit: { type: "number", default: 10 },
    threshold: { type: "number", default: 0.5 }
  }
}
```

---

## Decision: Remove Upstream Memory, Replace with Ledger + Index

### What We Remove

| Component | Location |
|-----------|----------|
| Memory manager | `src/memory/` |
| Memory plugins | `extensions/memory-core/`, `extensions/memory-lancedb/` |
| Memory tools | `src/agents/tools/memory-tool.ts` |
| Memory CLI | `src/cli/memory-cli.ts` |
| Memory config | `src/config/types.tools.ts` (memorySearch section) |
| MEMORY.md | workspace bootstrap |
| memory/ logs | workspace bootstrap |

### What Replaces It

| Upstream | Nexus (Ledger + Index) |
|----------|------------------------|
| `memory_search` tool | `index_query` tool |
| MEMORY.md file-based | Broker writes directly to Agent Ledger |
| Per-agent isolation | Unified knowledge graph (Index) |
| Text chunks only | Entities + relationships (derived in Index) |
| No temporal tracking | Bi-temporal bounds |

### Architecture Comparison

```
UPSTREAM MEMORY                    NEXUS (LEDGER + INDEX)
═══════════════                    ══════════════════════

Agent writes to                    Agent just talks
MEMORY.md                          │
    │                              ▼
    ▼                          Broker writes to
Manual file                    Agent Ledger (nexus.db)
indexing                           │
    │                              ▼
    ▼                          Index derives:
BM25 + Vector                  Entity Extraction
Search                         + Relationship Graph
    │                              │
    ▼                              ▼
Text chunks                    Knowledge Graph (Index)
returned                       + Bi-temporal Facts
                                   │
                                   ▼
                               Graph + Vector
                               + Temporal Query
```

**Note:** Session JSONL files (`~/nexus/state/sessions/`) are no longer used for Nexus-native sessions. The Broker writes directly to `nexus.db`. JSONL is only used for ingesting external harness transcripts via AIX adapters.

### Why Ledger + Index is Better

| Aspect | Upstream | Ledger + Index |
|--------|----------|----------------|
| Agent burden | Must write to MEMORY.md | Zero — Broker captures turns |
| Cross-agent | Per-agent isolation | Unified knowledge (Index) |
| Relationships | None | Full knowledge graph (Index) |
| Temporal | None | Bi-temporal bounds |
| Contradiction | None | Auto-invalidates stale facts |
| What's searchable | Explicit memories | All conversations (Ledger) |
| Entity tracking | None | Automatic extraction (Index) |

---

## Implementation

### Stub Strategy

Until the Index layer is ready:
1. Implement `index_query` as no-op or basic search
2. Remove memory system from codebase
3. Update workspace bootstrap (no MEMORY.md)

### Integration Point

```typescript
// Tool: index_query
{
  name: "index_query",
  description: "Search knowledge graph for information (derived from Ledger)",
  parameters: {
    query: { type: "string", description: "Natural language query" },
    filters: { type: "object", description: "Optional filters (entity, time range)" }
  }
}
```

---

## Dependencies

- Index layer must be ready before full integration
- Broker writes to Agent Ledger (primary data layer)
- AIX adapters support ingesting external harness transcripts (JSONL) into Ledger

---

## Index Capabilities (for reference)

When complete, the Index layer provides (derived from Ledger data):

| Capability | Description |
|------------|-------------|
| **Auto-capture** | Broker writes all agent turns to Ledger automatically |
| **Entity extraction** | People, places, projects extracted as entities (Index) |
| **Knowledge graph** | Relationships between entities (Index) |
| **Bi-temporal tracking** | When facts were true + when we learned them |
| **Contradiction handling** | Auto-invalidates stale facts |
| **Cross-session search** | Search ALL session history (Ledger) |

**Index Query Types:**

```typescript
// Text search (replaces memory_search)
index_query({ query: "what did Tyler say about auth?" })

// Entity queries
index_query({ entity: "Tyler", type: "person" })

// Relationship traversal
index_query({ subject: "Tyler", predicate: "works_at" })

// Temporal queries
index_query({ query: "Tyler's job", asOf: "2024-06-01" })
```

**Architecture Note:** The Ledger stores primary event data (agent turns, messages). The Index is a derived layer that extracts entities, relationships, and facts from Ledger data. This separation ensures the source of truth (Ledger) remains clean while enabling rich queries via Index.

---

*See INDEX_INTEGRATION.md for Nexus-specific integration details (to be written).*
