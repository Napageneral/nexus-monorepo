# Memory System Specs

**Status:** DECISION MADE  
**Conflict Risk:** Medium (removal)

---

## Executive Summary

Upstream clawdbot uses a file-based memory system (`MEMORY.md`, `memory/*.md`) that agents must actively write to. We're **removing this entirely** and replacing with **Cortex** — an automatic knowledge capture system.

**Key Insight:** Agents shouldn't have to "remember" to write memories. Cortex captures everything automatically from conversation history.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `UPSTREAM_MEMORY.md` | ✅ COMPLETE | Detailed upstream memory architecture |
| `CORTEX_INTEGRATION.md` | TODO | How cortex_query replaces memory_search |
| `MIGRATION.md` | TODO | Conversion from upstream memory to Cortex |

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
| Session JSONL | ⚠️ Optional | If configured |
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

## Decision: Remove Upstream Memory, Replace with Cortex

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

| Upstream | Cortex |
|----------|--------|
| `memory_search` tool | `cortex_query` tool |
| MEMORY.md file-based | Automatic turn ingestion |
| Per-agent isolation | Unified knowledge graph |
| Text chunks only | Entities + relationships |
| No temporal tracking | Bi-temporal bounds |

### Architecture Comparison

```
UPSTREAM MEMORY                    CORTEX
═══════════════                    ══════

Agent writes to                    Agent just talks
MEMORY.md                          │
    │                              ▼
    ▼                          Automatic
Manual file                    Turn Ingestion
indexing                           │
    │                              ▼
    ▼                          Entity Extraction
BM25 + Vector                  + Relationship Graph
Search                             │
    │                              ▼
    ▼                          Knowledge Graph
Text chunks                    + Bi-temporal Facts
returned                           │
                                   ▼
                               Graph + Vector
                               + Temporal Query
```

### Why Cortex is Better

| Aspect | Upstream | Cortex |
|--------|----------|--------|
| Agent burden | Must write to MEMORY.md | Zero — auto-captured |
| Cross-agent | Per-agent isolation | Unified knowledge |
| Relationships | None | Full knowledge graph |
| Temporal | None | Bi-temporal bounds |
| Contradiction | None | Auto-invalidates stale facts |
| What's searchable | Explicit memories | All conversations |
| Entity tracking | None | Automatic extraction |

---

## Implementation

### Stub Strategy

Until Cortex is ready:
1. Implement `cortex_query` as no-op or basic search
2. Remove memory system from codebase
3. Update workspace bootstrap (no MEMORY.md)

### Integration Point

```typescript
// Tool: cortex_query
{
  name: "cortex_query",
  description: "Search knowledge graph for information",
  parameters: {
    query: { type: "string", description: "Natural language query" },
    filters: { type: "object", description: "Optional filters (entity, time range)" }
  }
}
```

---

## Dependencies

- Cortex must be ready before full integration
- aix adapters already support clawdbot/nexus session ingestion

---

## Cortex Capabilities (for reference)

When complete, Cortex provides:

| Capability | Description |
|------------|-------------|
| **Auto-capture** | All agent turns ingested automatically |
| **Entity extraction** | People, places, projects extracted as entities |
| **Knowledge graph** | Relationships between entities |
| **Bi-temporal tracking** | When facts were true + when we learned them |
| **Contradiction handling** | Auto-invalidates stale facts |
| **Cross-session search** | Search ALL session history |

**Cortex Query Types:**

```typescript
// Text search (replaces memory_search)
cortex_query({ query: "what did Tyler say about auth?" })

// Entity queries
cortex_query({ entity: "Tyler", type: "person" })

// Relationship traversal
cortex_query({ subject: "Tyler", predicate: "works_at" })

// Temporal queries
cortex_query({ query: "Tyler's job", asOf: "2024-06-01" })
```

**Separate Cortex Spec:** See `~/nexus/home/projects/cortex/docs/MEMORY_SYSTEM_SPEC.md` for full Cortex design.

---

*See CORTEX_INTEGRATION.md for Nexus-specific integration details (to be written).*
