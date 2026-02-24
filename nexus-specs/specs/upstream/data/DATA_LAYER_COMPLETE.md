# OpenClaw Complete Data Layer Reference

**Status:** COMPLETE  
**Last Updated:** 2026-02-04  
**Upstream Version:** v2026.2.3

---

## Overview

This document captures EVERYTHING OpenClaw persists to disk — the complete data layer. For Nexus, this informs what we replace with SQLite ledgers vs what we port directly.

---

## Storage Summary

| Storage Type | Format | Location | Nexus Replacement |
|--------------|--------|----------|-------------------|
| **Config** | JSON5 | `~/.openclaw/openclaw.json` | Split YAML configs in `state/` |
| **Auth Profiles** | JSON | `agents/{id}/agent/auth-profiles.json` | Credential vault in `state/credentials/` |
| **Provider Creds** | JSON | `credentials/{provider}/{account}/creds.json` | Credential vault |
| **Device Pairing** | JSON | `devices/{pending,paired}.json` | Identity Graph + session tokens |
| **Sessions** | JSONL + JSON | `agents/{id}/sessions/` | Agents Ledger (SQLite) |
| **Memory Index** | SQLite | `memory/{id}.sqlite` | Cortex (derived layer) |
| **Embedding Cache** | SQLite (table) | Inside memory index | Cortex embeddings table |
| **Media Cache** | Binary | `media/` | Keep as-is (ephemeral) |
| **Skills** | Markdown | `skills/` | Skills in `~/nexus/skills/` |
| **Extensions** | Various | `extensions/` | NEX plugins |
| **Logs** | Text | `logs/` | Keep as-is |
| **Exec Approvals** | JSON | `exec-approvals.json` | IAM audit trail |

---

## 1. Configuration Storage

### Location & Format

**Primary:** `~/.openclaw/openclaw.json` (JSON5 format)

**Environment Overrides:**
- `OPENCLAW_STATE_DIR` — Override state directory (default: `~/.openclaw`)
- `OPENCLAW_CONFIG_PATH` — Explicit config file path

**Legacy Support:**
- Checks legacy directories: `.clawdbot`, `.moltbot`, `.moldbot`
- Migrates automatically on first load

### Config Schema Sections

```typescript
{
  // Version tracking
  meta: {
    lastTouchedVersion: string,
    lastTouchedAt: number
  },
  
  // Provider auth (deprecated - use auth-profiles)
  auth: {
    anthropic: { apiKey?: string },
    openai: { apiKey?: string },
    google: { apiKey?: string }
  },
  
  // Gateway settings
  gateway: {
    port: number,         // Default: 3000
    bind: string,         // Default: "127.0.0.1"
    authMode: "none" | "device-token" | "api-key"
  },
  
  // Agent configuration
  agents: {
    defaults: {
      workspace: string,
      model: string,
      identity: { name: string, emoji: string },
      memorySearch: { ... },
      compaction: { ... }
    },
    list: [{ name: string, ... }]
  },
  
  // Channel configurations
  channels: {
    whatsapp: { enabled: boolean, accounts: [...] },
    telegram: { enabled: boolean, token: string },
    discord: { enabled: boolean, token: string },
    // ... other channels
  },
  
  // Skills configuration
  skills: {
    enabled: boolean,
    allowBundled: string[],
    entries: { [name]: { enabled: boolean } }
  },
  
  // Plugin configuration
  plugins: {
    enabled: boolean,
    entries: { [id]: { enabled: boolean, config: {...} } }
  },
  
  // Model aliases and provider configs
  models: {
    aliases: { [alias]: { provider, model } },
    providers: { [provider]: { baseUrl, apiKey } }
  },
  
  // Session behavior
  session: {
    defaultScope: "main" | "per-peer" | "per-channel-peer",
    compaction: { mode: "default" | "safeguard", ... }
  },
  
  // Memory backend
  memory: {
    backend: "builtin" | "qmd",
    qmd: { path: string, ... }
  },
  
  // Hook configuration
  hooks: {
    enabled: boolean,
    entries: [{ event: string, handler: string }]
  },
  
  // Tool configuration  
  tools: {
    shell: { enabled: boolean, allowlist: string[] },
    memory: { indexPath: string }
  },
  
  // Logging
  logging: {
    level: "debug" | "info" | "warn" | "error",
    file: string
  }
}
```

### Code References

- `src/config/paths.ts` — Path resolution logic
- `src/config/io.ts` — Config file I/O
- `src/config/zod-schema.ts` — Schema validation
- `src/config/types.openclaw.ts` — TypeScript types

### Nexus Difference

**OpenClaw:** Single monolithic `config.json` (JSON5)

**Nexus:** Split configs by domain:
```
~/nexus/state/
├── config/
│   ├── adapters.yaml      # Adapter settings
│   ├── capabilities.yaml  # Skill/tool settings
│   └── iam.yaml          # IAM policies
├── agents/{id}/
│   └── config.yaml       # Per-agent config
└── credentials/
    └── {service}.yaml    # Per-service credentials
```

---

## 2. Credential/Auth Storage

### 2.1 Auth Profiles (Main Credential Store)

**Location:** `~/.openclaw/agents/{agentId}/agent/auth-profiles.json`

**Format:** JSON

**Structure:**
```typescript
{
  version: number,
  profiles: {
    [profileId: string]: {
      type: "api_key" | "oauth" | "token",
      provider: string,
      
      // For api_key:
      key?: string,
      email?: string,
      
      // For oauth:
      access?: string,
      refresh?: string,
      expires?: number,
      accountId?: string,
      enterpriseUrl?: string,
      
      // For token:
      token?: string,
      expires?: number
    }
  },
  order?: Record<string, string[]>,     // Provider → profile order for failover
  lastGood?: Record<string, string>,    // Provider → last working profile
  usageStats?: Record<string, {
    lastUsed: number,
    errorCount: number,
    cooldownUntil?: number,
    disabledUntil?: number,
    disabledReason?: string,
    lastFailureAt?: number,
    failureCounts?: Record<string, number>
  }>
}
```

**Per-Agent Isolation:** Each agent has its own `auth-profiles.json`

**Code References:**
- `src/agents/auth-profiles/store.ts` — Store management
- `src/agents/auth-profiles/paths.ts` — Path resolution
- `src/agents/auth-profiles/usage.ts` — Usage tracking and cooldowns

### 2.2 Provider-Specific Credentials

**Location:** `~/.openclaw/credentials/{provider}/{accountId}/creds.json`

**Examples:**
- `credentials/whatsapp/{accountId}/creds.json` — WhatsApp session
- `credentials/telegram/{accountId}/creds.json` — Telegram session
- `credentials/github-copilot.token.json` — Copilot proxy token

**Backup Files:** `creds.json.bak` created before each write

### 2.3 Device Pairing State

**Location:** `~/.openclaw/devices/`

**Files:**
```
devices/
├── pending.json    # Pending pairing requests (5-min TTL)
└── paired.json     # Paired devices with tokens
```

**Pending Schema:**
```typescript
{
  [requestId: string]: {
    requestId: string,
    deviceId: string,
    publicKey: string,
    displayName?: string,
    platform?: string,
    role?: string,
    scopes?: string[],
    ts: number
  }
}
```

**Paired Schema:**
```typescript
{
  [deviceId: string]: {
    deviceId: string,
    publicKey: string,
    tokens?: Record<string, {
      token: string,
      role: string,
      scopes: string[],
      createdAtMs: number,
      rotatedAtMs?: number,
      revokedAtMs?: number,
      lastUsedAtMs?: number
    }>,
    createdAtMs: number,
    approvedAtMs: number
  }
}
```

### Nexus Credential System

**Replaces with:** Unified credential vault with pointers

```yaml
# ~/nexus/state/credentials/google-oauth.yaml
service: google
account: tyler@gmail.com
source: keychain              # or: env, 1password, file
keychain_item: "Nexus Google OAuth"
capabilities:
  - email-read
  - calendar-read
status: verified
verified_at: 2026-02-04T10:00:00Z
```

**Benefits:**
- Single view via `nexus credential list`
- Health checks via `nexus credential verify`
- Pointers to secrets (not raw values in files)
- Tied to capability/skill readiness

---

## 3. Session Storage

### Location

```
~/.openclaw/agents/{agentId}/sessions/
├── sessions.json              # Session metadata index
└── {sessionId}.jsonl          # Transcript files
└── {sessionId}-topic-{threadId}.jsonl  # Thread transcripts
```

### sessions.json Index

Maps `sessionKey` → `SessionEntry`:

```typescript
{
  "agent:atlas:dm:+15551234": {
    sessionId: "uuid",
    updatedAt: 1706976000000,
    sessionFile: "uuid.jsonl",
    
    // Token tracking
    inputTokens: 1234,
    outputTokens: 567,
    totalTokens: 1801,
    contextTokens: 50000,
    
    // Model config
    model: "claude-sonnet-4-20250514",
    modelProvider: "anthropic",
    
    // Routing
    channel: "imessage",
    lastChannel: "imessage",
    lastTo: "+15551234",
    chatType: "direct",
    
    // Compaction
    compactionCount: 2,
    memoryFlushCompactionCount: 2,
    
    // Other metadata
    spawnedBy?: string,
    skillsSnapshot?: {...}
  }
}
```

### JSONL Transcript Format

**Header (first line):**
```json
{"type": "session", "version": 9, "id": "uuid", "timestamp": "...", "cwd": "..."}
```

**Message entries:**
```json
{
  "type": "message",
  "id": "uuid",
  "parentId": "uuid",
  "timestamp": 1706976000000,
  "message": {
    "role": "user" | "assistant" | "toolResult",
    "content": [
      {"type": "text", "text": "..."},
      {"type": "toolCall", "id": "call_1", "name": "read", "arguments": {...}},
      {"type": "thinking", "text": "..."}
    ],
    "api": "anthropic-messages",
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "usage": {"input": 1234, "output": 567, ...},
    "stopReason": "stop"
  }
}
```

**Custom entries (metadata):**
```json
{"type": "custom", "customType": "model-snapshot", "data": {...}}
{"type": "custom", "customType": "cache-ttl", "data": {...}}
```

**Compaction entries:**
```json
{
  "type": "compaction",
  "timestamp": 1706976000000,
  "summary": "...",
  "firstKeptEntryId": "uuid",
  "tokensBefore": 100000,
  "tokensAfter": 15000
}
```

### Tree Structure

- Each message has unique `id` and references parent via `parentId`
- Supports branching/forking at any point
- "Leaf" is the current conversation tip

### Concurrency

- **File locking:** `sessions.json.lock` with 10s timeout
- **Atomic writes:** Write to `.tmp` then rename
- **Cache:** 45-second in-memory cache with mtime validation

### Code References

- `src/config/sessions/store.ts` — Session store operations
- `src/config/sessions/transcript.ts` — JSONL append operations
- `src/config/sessions/paths.ts` — Path resolution

### Nexus Replacement

**Agents Ledger (SQLite):**
```sql
-- Sessions table (replaces sessions.json)
CREATE TABLE sessions (
  session_key TEXT PRIMARY KEY,
  session_id TEXT UNIQUE,
  created_at INTEGER,
  updated_at INTEGER,
  -- ... all SessionEntry fields as columns
);

-- Turns table (replaces *.jsonl)
CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(session_id),
  parent_id TEXT REFERENCES turns(id),
  role TEXT,
  content TEXT,
  -- ... normalized message fields
);
```

**Benefits:**
- Queryable across all sessions
- Atomic transactions (no file corruption)
- No file sprawl
- Built-in indexes

---

## 4. Memory Index (SQLite)

### Location

`~/.openclaw/memory/{agentId}.sqlite`

### Schema

```sql
-- Metadata
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexed files tracking
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'memory',  -- 'memory' or 'sessions'
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
);

-- Chunks with embeddings
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  hash TEXT NOT NULL,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,  -- JSON-encoded float array
  updated_at INTEGER NOT NULL
);

-- FTS5 for BM25 search
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  id UNINDEXED,
  path UNINDEXED,
  source UNINDEXED,
  model UNINDEXED,
  start_line UNINDEXED,
  end_line UNINDEXED
);

-- Vector search (sqlite-vec)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[{dimensions}]
);

-- Embedding cache
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
```

### What Gets Indexed

| Source | Location | Auto-Indexed |
|--------|----------|--------------|
| `MEMORY.md` | Workspace root | ✅ Yes |
| `memory/*.md` | `memory/` directory | ✅ Yes |
| Session transcripts | Agent sessions | ⚠️ Optional (`sources: ["sessions"]`) |

### Session Content Indexed

Only `user` and `assistant` messages (not tool calls):
```typescript
// From src/memory/session-files.ts
if (message.role !== "user" && message.role !== "assistant") continue;
```

Content is redacted and formatted as:
```
User: <message>
Assistant: <response>
```

### Chunking Strategy

```typescript
const DEFAULT_CHUNKING = {
  tokens: 512,    // Target chunk size
  overlap: 64     // Overlap between chunks
};
```

Algorithm:
1. Split by markdown headers
2. If section > `tokens`, split by paragraphs
3. If paragraph > `tokens`, split by sentences
4. Maintain `overlap` tokens between chunks

### Hybrid Search

```typescript
// Merge vector + keyword results with RRF-style scoring
const merged = mergeHybridResults({
  vector: vectorResults,
  keyword: keywordResults,
  vectorWeight: 0.7,
  textWeight: 0.3
});
```

### Embedding Cache

- **Key:** `(provider, model, provider_key, hash)`
- **Eviction:** LRU by `updated_at` when exceeding `maxEntries`
- **No TTL:** Entries persist until evicted

### Nexus Replacement

**Cortex (derived layer):**

```sql
-- Episodes (coherent interaction segments)
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  start_turn_id TEXT,
  end_turn_id TEXT,
  summary TEXT,
  embedding BLOB,
  created_at INTEGER
);

-- Facets (extracted entities and metadata)
CREATE TABLE facets (
  id TEXT PRIMARY KEY,
  episode_id TEXT,
  facet_type TEXT,  -- 'entity', 'topic', 'sentiment', etc.
  value TEXT,
  confidence REAL
);

-- Embeddings (unified storage)
CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  source_type TEXT,  -- 'episode', 'turn', 'document'
  source_id TEXT,
  model TEXT,
  vector BLOB,
  created_at INTEGER
);
```

**Key differences:**
- Cortex is **automatic** — agents don't need to write to memory files
- Cortex extracts **entities and relationships**, not just text chunks
- Cortex is **derived** — can be rebuilt from Agents Ledger anytime

---

## 5. Pre-Compaction Memory Flush

### Purpose

Before auto-compaction, OpenClaw runs a silent agentic turn to let the model save durable memories. This preserves context that might otherwise be lost in summarization.

### Trigger Condition

```typescript
// From src/auto-reply/reply/memory-flush.ts
function shouldRunMemoryFlush(params: {
  entry?: Pick<SessionEntry, "totalTokens" | "compactionCount" | "memoryFlushCompactionCount">;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
}): boolean {
  const threshold = contextWindowTokens - reserveTokensFloor - softThresholdTokens;
  if (totalTokens < threshold) return false;
  
  // Don't run twice for same compaction count
  if (lastFlushAt === compactionCount) return false;
  
  return true;
}
```

### Default Prompts

**User prompt:**
```
Pre-compaction memory flush.
Store durable memories now (use memory/YYYY-MM-DD.md; create memory/ if needed).
If nothing to store, reply with NO_REPLY.
```

**System prompt:**
```
Pre-compaction memory flush turn.
The session is near auto-compaction; capture durable memories to disk.
You may reply, but usually NO_REPLY is correct.
```

### Configuration

```typescript
compaction: {
  memoryFlush: {
    enabled: true,                    // Default: true
    softThresholdTokens: 4000,        // Trigger before hard limit
    prompt: "...",                    // Custom user prompt
    systemPrompt: "..."               // Custom system prompt
  }
}
```

### Tracking

- `memoryFlushCompactionCount` in SessionEntry tracks last flush
- Prevents duplicate flushes in same compaction cycle

### Nexus Decision: DO NOT PORT

**Why:** Nexus's architecture solves this differently:
- All turns persist to Agents Ledger forever (no data loss)
- Cortex derives memory from complete System of Record
- No "live saving" required
- Memory can be regenerated when improved
- No cold start problem

This pattern is a patch for OpenClaw's fragile file-based memory. Nexus has a solid foundation.

---

## 6. Other Persistent State

### Media Cache

**Location:** `~/.openclaw/media/`

**Format:** Binary files with sanitized names

**Naming:** `{original-filename}---{uuid}.{ext}`

**TTL:** 2 minutes (configurable)

**Cleanup:** Automatic background cleanup

**Nexus:** Keep as-is (ephemeral cache)

### Exec Approvals

**Location:** `~/.openclaw/exec-approvals.json`

**Purpose:** Stores command execution approvals (e.g., "allow `npm install` in this workspace")

**Nexus:** Replace with IAM audit trail in Nexus Ledger

### Plugin State

**Location:** Per-plugin (plugin-defined)

**Format:** JSON (plugin-specific)

**Nexus:** NEX plugins can use dedicated state tables or files as needed

---

## 7. Complete Workspace Layout

```
~/.openclaw/
├── openclaw.json                    # Main config (JSON5)
├── .env                            # Optional: environment variables
│
├── credentials/                    # Provider credentials
│   ├── oauth.json                  # Legacy OAuth
│   ├── whatsapp/{accountId}/
│   │   ├── creds.json
│   │   └── creds.json.bak
│   ├── telegram/{accountId}/
│   │   └── creds.json
│   └── github-copilot.token.json
│
├── agents/                         # Per-agent state
│   └── {agentId}/
│       ├── agent/
│       │   ├── auth-profiles.json  # Auth profiles
│       │   └── auth.json           # Runtime auth cache
│       └── sessions/
│           ├── sessions.json       # Session index
│           └── {sessionId}.jsonl   # Transcripts
│
├── devices/                        # Device pairing
│   ├── pending.json
│   └── paired.json
│
├── memory/                         # Memory indexes
│   └── {agentId}.sqlite
│
├── media/                          # Media cache
│   └── {filename}---{uuid}.{ext}
│
├── logs/                           # Log files
│   └── gateway.log
│
├── skills/                         # Managed skills
│   └── {skill-name}/
│       └── SKILL.md
│
├── extensions/                     # Installed plugins
│   └── {plugin-id}/
│
├── workspace/                      # Default workspace
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── MEMORY.md
│   ├── memory/
│   │   └── YYYY-MM-DD.md
│   └── skills/
│
└── exec-approvals.json            # Command approvals
```

---

## 8. Nexus Data Model Comparison

| OpenClaw | Nexus | Notes |
|----------|-------|-------|
| `~/.openclaw/` (hidden) | `~/nexus/` (visible) | Transparency |
| `openclaw.json` (monolithic) | Split configs in `state/` | Domain separation |
| `auth-profiles.json` (per-agent) | `credentials/` vault | Unified view |
| `sessions.json` + `*.jsonl` | Agents Ledger (SQLite) | Queryable |
| `memory/{id}.sqlite` | Cortex (derived) | Automatic |
| Device pairing files | Identity Graph | Integrated |
| No audit trail | Nexus Ledger | Observable |

---

## See Also

- [`BATTLE_TESTED_PATTERNS.md`](./BATTLE_TESTED_PATTERNS.md) — Edge case handling to preserve
- [`../ledgers/upstream/UPSTREAM_SESSION_STORAGE.md`](../ledgers/upstream/UPSTREAM_SESSION_STORAGE.md) — JSONL format details
- [`../ledgers/upstream/UPSTREAM_COMPACTION.md`](../ledgers/upstream/UPSTREAM_COMPACTION.md) — Compaction deep dive
- [`../cortex/upstream/UPSTREAM_MEMORY.md`](../cortex/upstream/UPSTREAM_MEMORY.md) — Memory system details

---

*This document captures OpenClaw's complete data layer for reference during Nexus implementation.*
