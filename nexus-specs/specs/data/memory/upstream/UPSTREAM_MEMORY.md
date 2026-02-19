# Upstream Clawdbot Memory System Analysis

**Status:** Reference Documentation  
**Upstream Source:** `src/memory/`, `src/agents/memory-search.ts`, `src/agents/tools/memory-tool.ts`

---

## Overview

Upstream clawdbot has a sophisticated **hybrid BM25 + vector search** memory system backed by SQLite. It indexes `MEMORY.md`, `memory/*.md` files, and optionally session transcripts, allowing agents to semantically search past conversations and notes.

**Key Characteristic:** Agents must **actively write** to `MEMORY.md` and `memory/` files to persist information — nothing is captured automatically.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          MEMORY SEARCH PIPELINE                            │
│                                                                            │
│  ┌─────────────────┐         ┌─────────────────┐        ┌──────────────┐ │
│  │   memory_search │  ───►   │  MemoryIndex    │  ───►  │   SQLite DB  │ │
│  │   (tool)        │         │  Manager        │        │   + FTS5     │ │
│  └─────────────────┘         └─────────────────┘        │   + vec0     │ │
│                                      │                   └──────────────┘ │
│                                      ▼                                    │
│                             ┌─────────────────┐                          │
│                             │   Embedding     │                          │
│                             │   Provider      │                          │
│                             │ (openai/gemini/ │                          │
│                             │  local)         │                          │
│                             └─────────────────┘                          │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Source Files Reference

| File | Purpose |
|------|---------|
| `src/memory/manager.ts` | Core `MemoryIndexManager` class — main orchestrator |
| `src/memory/memory-schema.ts` | SQLite table definitions |
| `src/memory/hybrid.ts` | BM25 + vector score merging (RRF-style) |
| `src/memory/embeddings.ts` | Embedding provider abstraction |
| `src/memory/embeddings-openai.ts` | OpenAI embedding client |
| `src/memory/embeddings-gemini.ts` | Gemini embedding client |
| `src/memory/node-llama.ts` | Local GGUF model via node-llama-cpp |
| `src/memory/sqlite-vec.ts` | sqlite-vec extension loader |
| `src/memory/internal.ts` | Chunking, hashing, file utilities |
| `src/memory/sync-memory-files.ts` | Sync memory/*.md to index |
| `src/memory/sync-session-files.ts` | Sync session transcripts to index |
| `src/memory/session-files.ts` | Session JSONL parsing for indexing |
| `src/memory/batch-openai.ts` | OpenAI batch API for embeddings |
| `src/memory/batch-gemini.ts` | Gemini batch API for embeddings |
| `src/memory/manager-search.ts` | Vector and keyword search implementations |
| `src/agents/memory-search.ts` | Config resolution and merging |
| `src/agents/tools/memory-tool.ts` | Agent tools: `memory_search`, `memory_get` |
| `src/cli/memory-cli.ts` | CLI commands for memory management |

---

## 2. SQLite Schema

### Tables

```sql
-- Metadata storage
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexed files tracking
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'memory',  -- 'memory' or 'sessions'
  hash TEXT NOT NULL,                      -- Content hash
  mtime INTEGER NOT NULL,                  -- Modification time (ms)
  size INTEGER NOT NULL                    -- File size (bytes)
);

-- Chunk storage with embeddings
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,                     -- Hash of path:lines:content:model:source
  path TEXT NOT NULL,                      -- Relative file path
  source TEXT NOT NULL DEFAULT 'memory',   -- 'memory' or 'sessions'
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  hash TEXT NOT NULL,                      -- Content hash
  model TEXT NOT NULL,                     -- Embedding model used
  text TEXT NOT NULL,                      -- Chunk text
  embedding TEXT NOT NULL,                 -- JSON-encoded float array
  updated_at INTEGER NOT NULL              -- Last update timestamp
);

-- Embedding cache (optional)
CREATE TABLE embedding_cache (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  embedding TEXT NOT NULL,
  dims INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, model, provider_key, hash)
);

-- FTS5 for BM25 keyword search (when enabled)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  id UNINDEXED,
  path UNINDEXED,
  source UNINDEXED,
  model UNINDEXED,
  start_line UNINDEXED,
  end_line UNINDEXED
);

-- Vector search via sqlite-vec extension (when enabled)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[{dimensions}]
);
```

### Indexes

```sql
CREATE INDEX idx_chunks_path ON chunks(path);
CREATE INDEX idx_chunks_source ON chunks(source);
CREATE INDEX idx_embedding_cache_updated_at ON embedding_cache(updated_at);
```

---

## 3. What Gets Indexed

| Source | Location | Auto-Indexed | Notes |
|--------|----------|--------------|-------|
| `MEMORY.md` | Workspace root | ✅ Yes | Primary memory file |
| `memory/*.md` | `memory/` directory | ✅ Yes | Memory log files |
| Session transcripts | Agent sessions dir | ⚠️ Optional | Requires `sources: ["sessions"]` |

### Memory File Detection

From `src/memory/internal.ts`:

```typescript
export function isMemoryPath(relPath: string): boolean {
  if (relPath === "MEMORY.md") return true;
  if (relPath.startsWith("memory/") && relPath.endsWith(".md")) return true;
  return false;
}

export async function listMemoryFiles(workspaceDir: string): Promise<string[]> {
  const results: string[] = [];
  const rootMemory = path.join(workspaceDir, "MEMORY.md");
  if (await fileExists(rootMemory)) {
    results.push("MEMORY.md");
  }
  const memoryDir = path.join(workspaceDir, "memory");
  if (await fileExists(memoryDir)) {
    const entries = await fs.readdir(memoryDir);
    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        results.push(`memory/${entry}`);
      }
    }
  }
  return results;
}
```

---

## 4. Chunking Strategy

From `src/memory/internal.ts`:

```typescript
export type ChunkingConfig = {
  tokens: number;    // Target chunk size in tokens
  overlap: number;   // Overlap tokens between chunks
};

export const DEFAULT_CHUNKING: ChunkingConfig = {
  tokens: 512,
  overlap: 64,
};
```

### Algorithm

1. Split content by markdown headers (`# `, `## `, etc.)
2. If section exceeds `tokens`, split by paragraphs
3. If paragraph exceeds `tokens`, split by sentences
4. Maintain `overlap` tokens between consecutive chunks
5. Track `startLine` and `endLine` for each chunk

---

## 5. Embedding Providers

### Provider Selection

```typescript
export type EmbeddingProvider = "openai" | "gemini" | "local" | "auto";

// Auto resolution:
// 1. If OPENAI_API_KEY set → openai
// 2. If GEMINI_API_KEY set → gemini
// 3. If local model configured → local
// 4. Fallback to configured fallback
```

### Models

| Provider | Default Model | Dimensions |
|----------|---------------|------------|
| OpenAI | `text-embedding-3-small` | 1536 |
| Gemini | `text-embedding-004` | 768 |
| Local | User-provided GGUF | Varies |

### Fallback Chain

```typescript
// Example: openai fails → fallback to gemini
fallback: "gemini"  // in config

// Or fallback to local:
fallback: "local"
local: { modelPath: "hf:BAAI/bge-small-en-v1.5-gguf" }
```

---

## 6. Hybrid Search

### Algorithm

From `src/memory/hybrid.ts`:

```typescript
// 1. Run vector search (cosine similarity via sqlite-vec)
const vectorResults = await searchVector(queryVec, candidates);

// 2. Run keyword search (BM25 via FTS5)
const keywordResults = await searchKeyword(queryText, candidates);

// 3. Merge with RRF-style scoring
const merged = mergeHybridResults({
  vector: vectorResults,
  keyword: keywordResults,
  vectorWeight: 0.7,  // configurable
  textWeight: 0.3,    // configurable
});

// BM25 rank to score conversion
export function bm25RankToScore(rank: number): number {
  const normalized = Math.max(0, rank);
  return 1 / (1 + normalized);  // Transform rank to 0-1 score
}
```

### Config Options

```typescript
query: {
  maxResults: 10,           // Top N results
  minScore: 0.3,            // Filter threshold
  hybrid: {
    enabled: true,
    vectorWeight: 0.7,      // Weight for vector similarity
    textWeight: 0.3,        // Weight for BM25 text match
    candidateMultiplier: 4  // Fetch 4x candidates before reranking
  }
}
```

---

## 7. Sync Triggers

### When Indexing Happens

| Trigger | Config Key | Description |
|---------|------------|-------------|
| Session start | `sync.onSessionStart` | Index on new session |
| On search | `sync.onSearch` | Lazy sync before search |
| File watch | `sync.watch` | chokidar watches memory files |
| Interval | `sync.intervalMinutes` | Periodic background sync |
| Session update | Event-based | Subscribe to transcript updates |

### File Watching

```typescript
private ensureWatcher() {
  const watchPaths = [
    path.join(this.workspaceDir, "MEMORY.md"),
    path.join(this.workspaceDir, "memory"),
  ];
  this.watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: this.settings.sync.watchDebounceMs,
      pollInterval: 100,
    },
  });
  // mark dirty on add/change/unlink
}
```

### Debouncing

- File changes: Configurable via `watchDebounceMs` (default 500ms)
- Session updates: 5000ms debounce (`SESSION_DIRTY_DEBOUNCE_MS`)

---

## 8. Batch Embedding

For large indexing jobs, supports batch API:

### OpenAI Batch

```typescript
const requests = texts.map((text) => ({
  custom_id: randomUUID(),
  method: "POST",
  url: "/v1/embeddings",
  body: { model: "text-embedding-3-small", input: text },
}));

await runOpenAiEmbeddingBatches({
  openAi: client,
  requests,
  wait: true,           // Wait for completion
  pollIntervalMs: 5000,
  timeoutMs: 600000,    // 10 min default
});
```

### Gemini Batch

Similar pattern using Gemini's batch embedding API.

### Failure Handling

```typescript
const BATCH_FAILURE_LIMIT = 2;

// After 2 batch failures, fall back to sequential embedding
if (this.batchFailureCount >= BATCH_FAILURE_LIMIT) {
  this.batch.enabled = false;
}
```

---

## 9. Agent Tools

### `memory_search`

```typescript
{
  name: "memory_search",
  description: "Mandatory recall step: semantically search MEMORY.md + memory/*.md...",
  parameters: {
    query: Type.String(),
    maxResults: Type.Optional(Type.Number()),
    minScore: Type.Optional(Type.Number()),
  }
}
```

**Returns:**
```typescript
{
  results: [
    {
      path: "memory/project-notes.md",
      startLine: 42,
      endLine: 58,
      score: 0.87,
      snippet: "The auth system uses JWT tokens...",
      source: "memory"
    }
  ],
  provider: "openai",
  model: "text-embedding-3-small",
  fallback: null
}
```

### `memory_get`

```typescript
{
  name: "memory_get",
  description: "Safe snippet read from MEMORY.md or memory/*.md...",
  parameters: {
    path: Type.String(),
    from: Type.Optional(Type.Number()),  // Start line
    lines: Type.Optional(Type.Number()), // Number of lines
  }
}
```

**Returns:**
```typescript
{ text: "...", path: "memory/project-notes.md" }
```

---

## 10. Configuration Reference

Full `memorySearch` config:

```typescript
memorySearch: {
  enabled: true,
  sources: ["memory", "sessions"],  // What to index
  
  // Embedding provider
  provider: "openai" | "gemini" | "local" | "auto",
  model: "text-embedding-3-small",
  fallback: "local",
  
  // Remote API settings
  remote: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-...",  // Override from env
    headers: {},
    batch: {
      enabled: true,
      wait: true,
      concurrency: 2,
      pollIntervalMs: 5000,
      timeoutMinutes: 10,
    }
  },
  
  // Local model settings
  local: {
    modelPath: "hf:BAAI/bge-small-en-v1.5-gguf"
  },
  
  // SQLite storage
  store: {
    path: "~/nexus/state/memory/{agentId}.sqlite",
    vector: {
      enabled: true,
      extensionPath: null  // Auto-detect sqlite-vec
    }
  },
  
  // Chunking
  chunking: {
    tokens: 512,
    overlap: 64
  },
  
  // Sync behavior
  sync: {
    onSessionStart: true,
    onSearch: true,        // Lazy sync
    watch: true,
    watchDebounceMs: 500,
    intervalMinutes: 0,    // 0 = disabled
  },
  
  // Query settings
  query: {
    maxResults: 10,
    minScore: 0.3,
    hybrid: {
      enabled: true,
      vectorWeight: 0.7,
      textWeight: 0.3,
      candidateMultiplier: 4
    }
  },
  
  // Embedding cache
  cache: {
    enabled: true,
    maxEntries: 10000
  },
  
  // Experimental
  experimental: {
    sessionMemory: false  // Index session transcripts
  }
}
```

---

## 11. Index Invalidation

The index automatically rebuilds when:

```typescript
const needsFullReindex =
  params?.force ||
  !meta ||
  meta.model !== this.provider.model ||
  meta.provider !== this.provider.id ||
  meta.providerKey !== this.providerKey ||
  meta.chunkTokens !== this.settings.chunking.tokens ||
  meta.chunkOverlap !== this.settings.chunking.overlap;

if (needsFullReindex) {
  this.resetIndex();  // DELETE FROM files, chunks, cache, vec, fts
}
```

---

## 11.5 Memory Manager Internals

### Sync Coordination

The `MemoryIndexManager` uses dirty tracking to coordinate syncs:

```typescript
// From src/memory/manager.ts
private dirty = false;                           // Memory files changed
private sessionsDirty = false;                   // Sessions changed
private sessionsDirtyFiles = new Set<string>();  // Which session files
private sessionPendingFiles = new Set<string>(); // Pending processing
private sessionDeltas = new Map<string, {        // Delta tracking
  lastSize: number;
  pendingBytes: number;
  pendingMessages: number;
}>();
private syncing: Promise<void> | null = null;   // Sync lock
```

**Sync orchestration:**
```typescript
async sync(params?: { reason?: string; force?: boolean }): Promise<void> {
  if (this.syncing) {
    return this.syncing;  // Already syncing, return existing promise
  }
  this.syncing = this.runSync(params).finally(() => {
    this.syncing = null;
  });
  return this.syncing;
}
```

### Chunk Lifecycle

1. **Indexing:** `indexFile()` reads content → chunks → embeds → stores in DB
2. **Storage:** Chunks in `chunks` table, FTS in `chunks_fts`, vectors in `chunks_vec`
3. **Cleanup:** Stale chunks removed when files change or are deleted

### Dirty Tracking

**Memory files:** File watcher marks `dirty = true` on add/change/unlink

**Session files:** Delta-based tracking with debouncing:
- Tracks file size and newline counts
- Debounced processing (5s) via `SESSION_DIRTY_DEBOUNCE_MS`
- Thresholds: `deltaBytes` and `deltaMessages` from config

---

## 11.6 Session Transcript Indexing Details

### What Gets Indexed from Sessions

Only `user` and `assistant` messages — tool calls are excluded:

```typescript
// From src/memory/session-files.ts
if ((record as { type?: unknown }).type !== "message") continue;
const message = (record as { message?: unknown }).message;
if (message.role !== "user" && message.role !== "assistant") continue;
```

### Content Extraction

```typescript
function extractSessionText(content: unknown): string {
  // Handle string content directly
  if (typeof content === "string") return content;
  
  // For arrays, extract type: "text" blocks only
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n");
  }
  return "";
}
```

### Formatting for Index

Messages are formatted as labeled turns:

```typescript
// From buildSessionEntry()
const formattedText = messages
  .map(m => {
    const label = m.role === "user" ? "User" : "Assistant";
    return `${label}: ${redactSensitiveText(m.text)}`;
  })
  .join("\n\n");
```

### Chunking Differences

- **Memory files:** Uses `chunkMarkdown()` — respects headers, paragraphs
- **Session files:** Same chunking, but content is pre-formatted as "User: ...\nAssistant: ..."

---

## 11.7 Embedding Cache Details

### Cache Key Format

The cache uses a composite key:
- `provider` — Embedding provider (openai, gemini, local)
- `model` — Embedding model
- `provider_key` — Includes baseUrl + headers (excluding auth)
- `hash` — Content hash

```typescript
// From src/memory/manager.ts
const cacheKey = {
  provider: this.provider.id,
  model: this.provider.model,
  provider_key: computeProviderKey(this.provider),
  hash: hashContent(text)
};
```

### Eviction Strategy

- **No TTL** — Entries persist until evicted
- **LRU eviction** — When `maxEntries` exceeded, oldest by `updated_at` deleted

```typescript
async pruneEmbeddingCacheIfNeeded(): Promise<void> {
  const count = db.prepare("SELECT COUNT(*) FROM embedding_cache").get();
  if (count <= maxEntries) return;
  
  const toDelete = count - maxEntries;
  db.prepare(`
    DELETE FROM embedding_cache 
    WHERE rowid IN (
      SELECT rowid FROM embedding_cache 
      ORDER BY updated_at ASC LIMIT ?
    )
  `).run(toDelete);
}
```

---

## 11.8 Pre-Compaction Memory Flush (CRITICAL)

### Purpose

Before auto-compaction, OpenClaw runs a **silent agentic turn** to let the model save durable memories. This preserves important context that would otherwise be lost in summarization.

### Trigger Logic

```typescript
// From src/auto-reply/reply/memory-flush.ts
function shouldRunMemoryFlush(params: {
  entry?: Pick<SessionEntry, "totalTokens" | "compactionCount" | "memoryFlushCompactionCount">;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
}): boolean {
  // Calculate threshold
  const threshold = contextWindowTokens - reserveTokensFloor - softThresholdTokens;
  if (totalTokens < threshold) return false;
  
  // Don't run twice for same compaction count
  const compactionCount = params.entry?.compactionCount ?? 0;
  const lastFlushAt = params.entry?.memoryFlushCompactionCount;
  if (typeof lastFlushAt === "number" && lastFlushAt === compactionCount) {
    return false;
  }
  
  return true;
}
```

### Default Prompts

**User prompt:**
```typescript
const DEFAULT_MEMORY_FLUSH_PROMPT = [
  "Pre-compaction memory flush.",
  "Store durable memories now (use memory/YYYY-MM-DD.md; create memory/ if needed).",
  "If nothing to store, reply with NO_REPLY.",
].join(" ");
```

**System prompt:**
```typescript
const DEFAULT_MEMORY_FLUSH_SYSTEM_PROMPT = [
  "Pre-compaction memory flush turn.",
  "The session is near auto-compaction; capture durable memories to disk.",
  "You may reply, but usually NO_REPLY is correct.",
].join(" ");
```

### Compaction Integration

The memory flush listens for compaction events:

```typescript
// From src/auto-reply/reply/agent-runner-memory.ts
onAgentEvent: (evt) => {
  if (evt.stream === "compaction") {
    const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
    const willRetry = Boolean(evt.data.willRetry);
    if (phase === "end" && !willRetry) {
      memoryCompactionCompleted = true;
    }
  }
}
```

After flush completes, `memoryFlushCompactionCount` is updated to prevent duplicate flushes.

### Skipped When

- Workspace is read-only (`workspaceAccess: "ro"` or `"none"`)
- CLI provider (non-messaging)
- Heartbeat messages
- Already flushed in current compaction cycle

---

## 11.9 QMD (Quantum Memory Database)

OpenClaw supports an alternative memory backend called QMD:

### Implementation

`src/memory/qmd-manager.ts` — `QmdMemoryManager` implements `MemorySearchManager`

### Features

- **Collection-based:** Maps collections to memory sources
- **Session export:** Exports session transcripts to markdown for indexing
- **CLI integration:** Spawns `qmd` CLI for operations
- **Scope filtering:** Filters results by session key/channel/chat type

### No Reranking

QMD uses its native scoring — no additional reranking layer:
```typescript
// Results use entry.score directly from QMD query
```

### Update Strategy

- **Debounced:** Skips if within `debounceMs` of last update
- **Embedding interval:** Separate `embedIntervalMs` controls embedding frequency
- **Boot/interval:** Runs on boot and at configured intervals

---

## 12. Per-Agent Configuration

Memory search supports per-agent overrides:

```typescript
// config.json
{
  "agents": {
    "defaults": {
      "memorySearch": { /* base config */ }
    },
    "entries": {
      "atlas": {
        "memorySearch": {
          "enabled": true,
          "sources": ["memory", "sessions"]  // Override
        }
      }
    }
  }
}
```

Resolution:
```typescript
const defaults = cfg.agents?.defaults?.memorySearch;
const overrides = resolveAgentConfig(cfg, agentId)?.memorySearch;
const resolved = mergeConfig(defaults, overrides, agentId);
```

---

## 13. CLI Commands

From `src/cli/memory-cli.ts`:

| Command | Description |
|---------|-------------|
| `clawdbot memory status` | Show index status (files, chunks, provider) |
| `clawdbot memory reindex [--force]` | Trigger reindex |
| `clawdbot memory search <query>` | Run search from CLI |
| `clawdbot memory probe` | Test embedding availability |

---

## 14. Extensions

### LanceDB Alternative

`extensions/memory-lancedb/` — Alternative vector store using LanceDB instead of sqlite-vec.

### Memory Core Plugin

`extensions/memory-core/` — Shared types and utilities.

---

## Decision: Nexus Replaces This System with Cortex

### Why Replace

1. **Agent burden** — Agents must actively write to `MEMORY.md`. They "forget" to remember.
2. **Manual indexing** — Nothing is captured automatically from conversations.
3. **Per-agent isolation** — No cross-agent knowledge sharing.
4. **No relationships** — Text chunks only, no entity/relationship extraction.
5. **No temporal tracking** — Can't query "what did we know at time X?".
6. **Pre-compaction flush is a patch** — The memory flush mechanism exists because OpenClaw's memory is fragile. It's a workaround for a fundamental design issue.

### What Replaces It

**Cortex** — An automatic derived layer:

| Upstream Memory | Cortex |
|-----------------|--------|
| Agent writes to `MEMORY.md` | Agent just talks |
| Manual file indexing | Automatic turn ingestion |
| BM25 + vector search | Graph + vector + temporal query |
| Text chunks | Episodes + facets + entities |
| No temporal bounds | Bi-temporal tracking |
| Per-agent isolation | Unified knowledge graph |
| Pre-compaction flush | Not needed (all turns persist) |

### Why Pre-Compaction Flush is NOT Ported

OpenClaw needs the memory flush because:
- Compaction discards old message content
- File-based `MEMORY.md` is the only durable memory
- Without flush, context is permanently lost

Nexus doesn't need it because:
- **All turns persist** in Agents Ledger forever
- **Cortex derives** from the complete System of Record
- **No live saving** required — nothing is ever lost
- **Regenerable** — can rebuild Cortex when improved
- **No cold start** — full history always available

The pre-compaction flush is a patch for a fragile foundation. Nexus has a solid foundation.

### Stub Strategy

Until Cortex is fully implemented:

1. **Remove** memory system code from Nexus fork
2. **Stub** `cortex_query` tool that returns empty results or basic search
3. **Remove** `MEMORY.md` from workspace bootstrap
4. **Update** docs to explain Cortex replacement

### Tool Mapping

| Upstream Tool | Nexus Replacement |
|---------------|-------------------|
| `memory_search` | `cortex_query` (stub → full Cortex) |
| `memory_get` | Removed (cortex returns full context) |

---

## See Also

- **[README.md](./README.md)** — Memory lane overview and decision summary
- **[MNEMONIC_INTEGRATION.md](./MNEMONIC_INTEGRATION.md)** — Nexus-specific integration details (TODO)
- **[MIGRATION.md](./MIGRATION.md)** — Conversion from upstream memory to Mnemonic (TODO)
