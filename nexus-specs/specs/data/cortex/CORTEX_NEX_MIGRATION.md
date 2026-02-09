# Cortex Integration Plan

**Status:** PLANNING  
**Last Updated:** 2026-02-09

---

## Overview

Cortex is a Go-based derived intelligence layer that reads from the System of Record (Events, Agents, Identity ledgers) and produces structured knowledge. This document describes how the existing Cortex (mnemonic) codebase integrates with the TypeScript NEX runtime.

**Key insight:** Cortex is a separate Go process. NEX is TypeScript. They share SQLite databases but run independently. The integration boundary is well-defined.

---

## Architecture Split

| Component | Language | Process | Purpose |
|-----------|----------|---------|---------|
| **NEX** (pipeline, broker, adapters, IAM, bus) | TypeScript | Main daemon | Event processing, agent execution |
| **Cortex** (memory, analysis, embeddings, search) | Go | Separate process | Derived knowledge, semantic search |

### Why Two Languages

- **TypeScript for NEX**: Fast iteration, shared types with pi-coding-agent, ecosystem alignment
- **Go for Cortex**: Performance-critical parallel jobs (embedding batching, entity resolution), existing Go codebase (mnemonic)

See `../../project-structure/LANGUAGE_DECISION.md` for the full rationale.

---

## What Cortex Owns

### Existing Go Packages (from mnemonic)

| Package | NEX Role | Notes |
|---------|----------|-------|
| `internal/bus/` | Async job queue | Powers background analysis pipeline |
| `internal/db/` | Cortex DB access | Per-agent `cortex/{agentId}.db` |
| `internal/compute/` | Job execution engine | Parallel analysis, rate control, embeddings batching |
| `internal/memory/` | Analysis pipeline | Entity extraction, relationship resolution, dedup |
| `internal/search/` | Semantic search | Embeddings, similarity queries |
| `internal/identify/` | Identity resolution helpers | Entity resolution, fact extraction, suggestions |
| `internal/contacts/` | Contact sync | Background import from adapters |

### Cortex Storage

```
~/nexus/state/cortex/
├── atlas.db          # Per-agent derived knowledge
├── ...               # One DB per agent
```

Each `cortex/{agentId}.db` contains: episodes, facets, embeddings, analyses.

Cortex also writes enrichments to `identity.db` (the Identity Ledger) when it discovers new relationships or identities with high confidence.

---

## Integration Boundary

### NEX → Cortex

| Trigger | Mechanism | Purpose |
|---------|-----------|---------|
| New event written to Events Ledger | Cortex bus detects new rows | Episode creation, analysis |
| New turn written to Agents Ledger | Cortex bus detects new rows | Conversation analysis |
| Context assembly (stage 5) | CortexClient query | RAG: inject relevant context |
| Agent tool call `cortex_search` | CortexClient query | Agent-initiated memory lookup |

### Cortex → NEX

| Action | Mechanism | Purpose |
|--------|-----------|---------|
| Identity enrichment | Direct write to identity.db | New relationships, merged identities |
| Search results | CortexClient response | Context for stage 5 and agent tools |

### Transport (TBD)

The exact IPC between the TypeScript NEX process and Go Cortex process is to be determined during implementation:

| Option | Pros | Cons |
|--------|------|------|
| **HTTP API** (localhost) | Simple, debuggable, standard | Latency, connection overhead |
| **Unix socket** | Fast, no TCP overhead | Platform-specific |
| **Direct SQLite** | Zero IPC for reads | Write contention, no RPC for analysis jobs |

Likely approach: **HTTP API** for queries (CortexClient), **direct SQLite reads** for Cortex background jobs reading from ledgers.

---

## CortexClient Interface

The TypeScript-side client for querying Cortex:

```typescript
interface CortexClient {
  // Semantic search across knowledge
  search(query: CortexQuery): Promise<CortexResult>;
  
  // Health check
  health(): Promise<{ status: 'ok' | 'unavailable'; version?: string }>;
}
```

When Cortex is unavailable (not running, not yet implemented), `search()` returns empty results. The system works without it — it just lacks the "understanding" layer.

---

## Migration Path

### Phase 1: Stub (V1 Implementation)
- `CortexClient.search()` returns empty results
- NEX and Broker work without Cortex
- All data written to ledgers (Cortex can analyze retroactively)

### Phase 2: Integration
- Start Cortex Go process alongside NEX daemon
- Wire CortexClient to Cortex HTTP API
- Cortex bus reads from ledger DBs for background analysis
- `cortex_search` agent tool returns real results

### Phase 3: Advanced
- Proactive context injection (Cortex suggests relevant context)
- Identity enrichment pipeline (auto-discover relationships)
- Cortex-informed routing (smart session forking)

---

## Package Mapping from Mnemonic

| Mnemonic Package | Cortex Role | Changes Needed |
|------------------|-------------|----------------|
| `internal/bus/` | Job queue | Keep as-is, add NexusEvent-aware job types |
| `internal/db/` | DB layer | Point at `~/nexus/state/` instead of mnemonic paths |
| `internal/compute/engine.go` | Job executor | Keep as-is |
| `internal/compute/embeddings_batcher.go` | Batch embeddings | Keep as-is |
| `internal/memory/pipeline.go` | Analysis pipeline | Adapt to read from Nexus ledgers |
| `internal/memory/entity_extractor.go` | Entity extraction | Keep as-is |
| `internal/memory/relationship_extractor.go` | Relationship extraction | Keep as-is |
| `internal/memory/query_engine.go` | Memory query | Expose via HTTP API |
| `internal/search/search.go` | Semantic search | Expose via HTTP API |
| `internal/search/gemini_embedder.go` | Embedding provider | Keep as-is |
| `internal/identify/` | Identity helpers | Keep, ensure writes go to `identity.db` |
| `internal/contacts/` | Contact sync | Keep, adapt for Nexus paths |

---

## Related Specs

- `README.md` — Cortex overview and query interface
- `../../runtime/nex/NEX.md` — NEX pipeline (TypeScript side)
- `../../runtime/broker/CONTEXT_ASSEMBLY.md` — How Cortex feeds into agent context (Layer 3)
- `../../project-structure/LANGUAGE_DECISION.md` — TS/Go split rationale
- `../ledgers/` — System of Record that Cortex reads from
