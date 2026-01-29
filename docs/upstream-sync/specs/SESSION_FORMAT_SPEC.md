# Session Format & Compaction Specification

**Status:** SPEC COMPLETE  
**Covers:** WI-5 (Session Format + aix Compatibility) and WI-6 (Compaction Differences)

---

## Executive Summary

**Key Finding:** Upstream clawdbot and Nexus use the **same underlying JSONL format** (from `@mariozechner/pi-coding-agent`). The only difference is path layout.

**Decision:** 
- Use upstream's session format unchanged (`{id}.jsonl`)
- Store in `~/nexus/state/sessions/` (simplified from per-agent dirs)
- Keep all upstream's rich metadata (origin, tokens, model, etc.)
- Create aix adapters for both clawdbot and nexus sources

---

## Format Comparison

### JSONL Transcript Format (IDENTICAL)

Both use pi-coding-agent's `SessionManager`:

```jsonl
{"type":"session","version":"...","id":"abc123","timestamp":"2026-01-21T12:00:00Z","cwd":"/path"}
{"type":"user","timestamp":"...","sessionId":"abc123","uuid":"msg-1","message":{"role":"user","content":[...]}}
{"type":"assistant","timestamp":"...","sessionId":"abc123","uuid":"msg-2","message":{"role":"assistant","content":[...],"model":"claude-4-sonnet"}}
```

### Path Layout

| Aspect | Upstream Clawdbot | Nexus |
|--------|-------------------|-------|
| **State root** | `~/.clawdbot/` | `~/nexus/state/` |
| **Sessions dir** | `~/.clawdbot/sessions/` | `~/nexus/state/sessions/` |
| **Transcript file** | `{sessionId}.jsonl` | `{sessionId}.jsonl` |
| **Metadata store** | `sessions.json` | `sessions.json` |

**Note:** Simplified from per-agent directories. Same flat structure as upstream, just different root path.

### SessionEntry Metadata (sessions.json)

```typescript
// Both use this structure (upstream has more fields)
type SessionEntry = {
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  
  // Token tracking
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  compactionCount?: number;
  
  // Model info
  model?: string;
  modelProvider?: string;
  
  // Rich origin metadata (very useful for aix!)
  origin?: {
    provider: string;      // "telegram", "whatsapp", etc.
    surface: string;       // "dm", "group", etc.
    chatType: string;
    from?: string;
    to?: string;
    accountId?: string;
    threadId?: string;
  };
  
  // Queue modes (upstream feature)
  queueMode?: "steer" | "followup" | "collect" | "steer-backlog" | "queue" | "interrupt";
  
  // Detailed system prompt breakdown
  systemPromptReport?: SessionSystemPromptReport;
  
  // Skills snapshot at session start
  skillsSnapshot?: {...};
};
```

---

## Compaction Architecture

### Two Levels of Compaction

#### 1. Gateway `sessions.compact` (Line-Based Truncation)

Called via RPC when transcript file exceeds a threshold:

```typescript
// sessions.ts line 346
"sessions.compact": async ({ params, respond }) => {
  const maxLines = params.maxLines ?? 400;
  
  // Archive original file BEFORE truncating
  const archived = archiveFileOnDisk(filePath, "bak");
  // Result: {sessionId}.jsonl.bak.2026-01-21T12-00-00.000Z
  
  // Keep only last N lines
  const keptLines = lines.slice(-maxLines);
  fs.writeFileSync(filePath, keptLines.join("\n") + "\n");
  
  // Clear token counts (will be recalculated)
  delete entry.inputTokens;
  delete entry.outputTokens;
  delete entry.totalTokens;
}
```

**Raw history preserved:** Yes - original file renamed with `.bak.{timestamp}`

#### 2. Pi-Agent `session.compact()` (LLM-Based Summarization)

Called when context window approaches limit:

```typescript
// compact.ts
const result = await session.compact(customInstructions);
// Returns:
// - summary: LLM-generated summary of compacted messages
// - firstKeptEntryId: UUID of first message kept in context
// - tokensBefore: token count before compaction
// - details: additional metadata
```

**What happens to JSONL:** Pi-agent writes a new "summary" message to the transcript, containing the LLM-generated summary. Old messages remain in the file but are excluded from future context.

**Raw history preserved:** Yes - all messages stay in the JSONL file

### Compaction Config (Upstream)

```typescript
// types.agent-defaults.ts
type AgentCompactionConfig = {
  mode?: "default" | "safeguard";
  minReserveTokens?: number;
  memoryFlush?: {
    enabled?: boolean;        // Pre-compaction memory flush
    triggerTokensRemaining?: number;
  };
};
```

---

## aix Integration Strategy

### Current aix Schema (Already Supports This)

```sql
-- sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,              -- sessionId
  source TEXT NOT NULL,             -- 'cursor', 'claude-code', 'clawdbot', 'nexus'
  project TEXT,
  model TEXT,
  created_at INTEGER,
  message_count INTEGER,
  summary TEXT,
  raw_json TEXT
);

-- messages table (all messages preserved)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT,
  sequence INTEGER,
  timestamp INTEGER
);
```

### Required aix Adapters

#### 1. `clawdbot.go` (New)

```go
func DefaultClawdbotPath() string {
    home, _ := os.UserHomeDir()
    return filepath.Join(home, ".clawdbot", "sessions")
}

// Parsing logic: identical to claude_code.go
// - Same JSONL format (pi-coding-agent)
// - Same event types (session, user, assistant)
// - Extract session metadata from sessions.json for rich origin data
```

#### 2. `nexus.go` (New)

```go
func DefaultNexusPath() string {
    home, _ := os.UserHomeDir()
    return filepath.Join(home, "nexus", "state", "sessions")
}

// Nearly identical to clawdbot.go - just different base path
// Could be a single adapter with configurable path
```

#### Unified Adapter Option

Since formats are identical, consider a single `pi_agent.go` adapter:

```go
type PiAgentParser struct {
    basePath    string
    source      string  // "clawdbot", "nexus", etc.
    exportPath  string
}

func NewClawdbotParser() *PiAgentParser {
    return &PiAgentParser{
        basePath: filepath.Join(os.UserHomeDir(), ".clawdbot", "sessions"),
        source:   "clawdbot",
    }
}

func NewNexusParser() *PiAgentParser {
    return &PiAgentParser{
        basePath: filepath.Join(os.UserHomeDir(), "nexus", "state", "sessions"),
        source:   "nexus",
    }
}
```

### Bonus: Ingest `.bak` Files for Full History

```go
// Also scan for compaction archives
backupPattern := filepath.Join(sessionsDir, "*.jsonl.bak.*")
backups, _ := filepath.Glob(backupPattern)
for _, backup := range backups {
    // Parse and merge into session history
    // Mark messages with archive_source field
}
```

---

## Decision: Keep or Diverge?

### What Nexus Changes (Path Only)

1. **Visible state directory** - `~/nexus/state/` vs hidden `~/.clawdbot/`
   - **Keep:** User preference for transparency, front-and-center workspace

2. **Simplified session path** - `~/nexus/state/sessions/{id}.jsonl`
   - Same flat structure as upstream (no per-agent subdirs)
   - Minimal branding script change needed

### What Upstream Has (Keep All)

1. **Rich origin metadata** in SessionEntry ✓
   - `origin.provider`, `origin.surface`, `origin.accountId`, etc.
   - Essential for aix to know where sessions came from

2. **Queue modes** (steer, followup, collect) ✓
   - Already present in upstream

3. **System prompt report** ✓
   - Useful for debugging/analysis

4. **Token tracking** ✓
   - `inputTokens`, `outputTokens`, `contextTokens`, `compactionCount`

### Final Decision

**Near-zero divergence:**
1. Change only the root path (`~/.clawdbot/` → `~/nexus/state/`)
2. Keep upstream's `sessions/{id}.jsonl` structure unchanged
3. Keep all upstream metadata (SessionEntry schema)
4. Keep upstream's compaction logic unchanged
5. Create aix adapters for both sources

**No custom archives/summary.md:**
- Upstream's `.bak.{timestamp}` archives preserve full history
- aix/cortex handles search externally
- LLM summaries written inline to JSONL

---

## Implementation Checklist

### For Nexus Fork (Branding Script)
- [ ] Change state root: `~/.clawdbot/` → `~/nexus/state/`
- [ ] Sessions path becomes: `~/nexus/state/sessions/{id}.jsonl`
- [ ] Sessions metadata: `~/nexus/state/sessions/sessions.json`
- [ ] Verify compaction creates `.bak` archives
- [ ] All SessionEntry metadata (origin, tokens, model) works unchanged

### For aix (COMPLETE)
- [x] Create `pi_agent.go` - unified adapter for pi-coding-agent format
- [x] Add `NewClawdbotParser()` - points to `~/.clawdbot/sessions/`
- [x] Add `NewNexusParser()` - points to `~/nexus/state/sessions/`
- [x] Parse JSONL transcripts (same as claude_code.go)
- [x] Read `sessions.json` for rich metadata (origin, tokens, model)
- [x] Scan and parse `.bak.*` files for compaction history (via `WithBackups(true)`)
- [x] Add tests for both sources (`pi_agent_test.go`)
- [x] Wire into sync command (`aix sync --source clawdbot` / `aix sync --source nexus`)
- [ ] Pipe to cortex via aix's existing infrastructure (future)

### For Cortex (Future)
- [ ] Unified session search across all sources (cursor, claude-code, clawdbot, nexus)
- [ ] Timeline view showing all agent activity
- [ ] Token usage analytics from SessionEntry data
- [ ] Origin-based filtering (show only telegram sessions, etc.)

---

## File References

**Upstream Clawdbot:**
- `src/gateway/server-methods/sessions.ts` - Gateway compaction RPC (line-based)
- `src/agents/pi-embedded-runner/compact.ts` - Pi-agent compaction (LLM-based)
- `src/config/sessions/types.ts` - SessionEntry schema (the rich metadata)
- `src/config/types.agent-defaults.ts` - AgentCompactionConfig
- `src/gateway/session-utils.fs.ts` - `archiveFileOnDisk()` function

**aix (Template Files):**
- `internal/sync/claude_code.go` - Reference adapter (pi-coding-agent JSONL parser)
- `internal/sync/cursor.go` - Rich metadata extraction example
- `internal/models/session.go` - Session/Message models
- `internal/db/schema.sql` - Database schema

**New aix Files (Created):**
- `internal/sync/pi_agent.go` - Unified pi-coding-agent adapter
  - `NewClawdbotParser()` / `NewNexusParser()` constructors
  - `WithBackups(true)` to include compaction archives
  - Parses JSONL transcripts + `sessions.json` metadata
- `internal/sync/pi_agent_test.go` - Comprehensive tests
- `cmd/aix/main.go` - Added `clawdbot` and `nexus` sources to sync command
