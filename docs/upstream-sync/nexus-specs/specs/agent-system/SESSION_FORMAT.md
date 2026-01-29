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

---

## Two Persistence Layers

Clawdbot/Nexus persists sessions in two layers:

### Layer 1: Session Store (`sessions.json`)

**Purpose:** Metadata index (small, mutable, safe to edit)

```json
{
  "agent:main:main": {
    "sessionId": "abc123",
    "updatedAt": 1705838400000,
    "compactionCount": 3,
    "lastChannel": "telegram",
    "inputTokens": 50000,
    ...
  }
}
```

**Tracks:** Current sessionId, token counts, toggles, last activity, origin

**Does NOT contain:** Messages (those are in transcripts)

### Layer 2: Transcript (`{sessionId}.jsonl`)

**Purpose:** Append-only conversation log (source of truth for content)

- Contains ALL messages (never deleted)
- Contains compaction summaries (persisted `compaction` entries)
- Tree structure (entries have `id` + `parentId`)
- **Immutable:** Old entries are never removed, only new ones appended

### Key Insight

After compaction:
- `sessions.json`: `compactionCount` increments
- `{id}.jsonl`: Gets a `compaction` entry appended, old messages STAY in file

---

## Channel-to-Session Routing

### Session Key Format

Session keys determine conversation isolation:

| Pattern | Example | Behavior |
|---------|---------|----------|
| DMs (all channels) | `agent:main:main` | **SHARED** — Discord, iMessage, WhatsApp DMs merge into ONE session |
| Groups | `agent:main:telegram:group:-123` | **ISOLATED** — each group is separate |
| Channels/Rooms | `agent:main:discord:channel:456` | **ISOLATED** — each channel is separate |
| Threads | `agent:main:discord:channel:456:thread:789` | **ISOLATED** — each thread is separate |
| Cron | `cron:<job.id>` | Separate session per job |
| Webhook | `hook:<uuid>` | Separate unless overridden |

### Key Insight: DMs Merge Across Channels

When you DM your bot from Discord, iMessage, AND WhatsApp → **same session**.
The agent sees one continuous conversation across all DM channels.

```
You → Discord DM    → sessionKey: "agent:main:main" → sessionId: "abc123"
You → iMessage      → sessionKey: "agent:main:main" → sessionId: "abc123"  (SAME!)
You → WhatsApp DM   → sessionKey: "agent:main:main" → sessionId: "abc123"  (SAME!)
```

**Groups are isolated.** Each group chat is a separate conversation context.

### Reference

See upstream: `docs/reference/session-management-compaction.md`

---

## JSONL Entry Types

| Type | Purpose | Enters LLM Context? |
|------|---------|---------------------|
| `session` | File header (id, cwd, timestamp, version) | No (metadata) |
| `message` | User/assistant/toolResult | Yes |
| `custom_message` | Extension-injected | Yes (can hide from UI) |
| `custom` | Extension state | **No** |
| `compaction` | **Persisted summary** | **Yes** (replaces older messages in context) |
| `branch_summary` | Tree branch summary | Yes |

### Compaction Entry Structure

```json
{
  "type": "compaction",
  "summary": "User discussed project X, key decisions were...",
  "firstKeptEntryId": "msg-400",
  "tokensBefore": 100000
}
```

**Critical:** The summary IS persisted. This enables:
- Full history reconstruction (all messages + compaction markers)
- Forking from any point (you know what was summarized)
- aix/mnemonic can trace the complete conversation

---

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
- aix/mnemonic handles search externally
- LLM summaries written inline to JSONL

---

## Rich Metadata Requirements (Lessons from Cursor/AIX)

Based on comprehensive analysis of Cursor's storage format, Nexus sessions should capture equivalent richness to enable:
- Full fidelity archival in AIX/Mnemonic
- Smart forking with relevant context retrieval
- Subagent tracking and replay
- Tool call analysis

### Message-Level Metadata (JSONL entries)

Beyond basic pi-coding-agent fields, Nexus should capture:

```typescript
interface NexusMessageEntry {
  // Standard pi-coding-agent fields
  type: 'user' | 'assistant';
  timestamp: string;
  sessionId: string;
  uuid: string;
  message: {
    role: 'user' | 'assistant';
    content: ContentBlock[];
    model?: string;
  };
  
  // Extended fields (Cursor parity)
  parentId?: string;              // Previous message for tree structure
  checkpointId?: string;          // Fork point identifier
  
  // Context at time of message
  context?: {
    fileSelections?: FileSelection[];    // Files in context
    folderSelections?: string[];
    mentions?: Mention[];
    recentLocations?: LocationRef[];
  };
  
  // For assistant messages
  isAgentic?: boolean;            // Was this in agentic mode?
  isPlanExecution?: boolean;      // Part of a plan execution?
  
  // Tool tracking
  toolCalls?: ToolCall[];         // Tools invoked in this message
  toolResult?: ToolResult;        // If this is a tool result message
  
  // Token tracking (per-message)
  tokenCount?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  
  // Rules/prompts active
  activeRules?: string[];         // Which AGENTS.md/rules were active
}

interface ToolCall {
  id: string;                     // Unique tool call ID
  name: string;                   // Tool name (e.g., "Shell", "Read", "task_v2")
  params: Record<string, any>;    // Tool parameters
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;                   // Tool result (when available)
  
  // For subagent dispatch (task_v2)
  childSessionId?: string;        // Links to spawned subagent session
}
```

### Session-Level Metadata (sessions.json)

Extended SessionEntry for full context:

```typescript
interface NexusSessionEntry {
  // Standard fields (upstream)
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  compactionCount?: number;
  model?: string;
  modelProvider?: string;
  origin?: SessionOrigin;
  queueMode?: QueueMode;
  systemPromptReport?: SystemPromptReport;
  skillsSnapshot?: SkillsSnapshot;
  
  // Extended fields (Cursor parity)
  project?: string;               // Project/workspace path
  isAgentic?: boolean;            // Session-level agentic mode
  
  // Subagent tracking
  parentSessionId?: string;       // If this is a subagent
  parentMessageId?: string;       // Message that dispatched this subagent
  toolCallId?: string;            // Tool call that created this subagent
  taskDescription?: string;       // What the subagent was asked to do
  taskStatus?: 'pending' | 'running' | 'completed' | 'failed';
  isSubagent?: boolean;
  
  // Context limits
  contextTokenLimit?: number;     // Max context size
  contextTokensUsed?: number;     // Current usage
  
  // Fork tracking
  forkedFromSessionId?: string;   // If forked from another session
  forkedFromTurnId?: string;      // Specific turn forked from
  hasChildren?: boolean;          // Has this session been forked?
}
```

### Turn Tracking

Turns should be computable from the JSONL but can also be tracked explicitly:

```typescript
interface TurnMarker {
  type: 'turn';
  id: string;                     // Turn ID = final assistant message UUID
  parentTurnId?: string;          // Previous turn
  queryMessageIds: string[];      // Input message UUIDs
  responseMessageId: string;      // Assistant response UUID
  timestamp: number;
  toolCallCount: number;
  model?: string;
}
```

### Subagent Session Format

When a Nexus agent dispatches a subagent (worker agent), the child session should:

1. **Be a separate JSONL file** (or embedded in parent, configurable)
2. **Link back to parent** via `parentSessionId`, `parentMessageId`, `toolCallId`
3. **Have its own turns** tracked independently
4. **Return result** to parent via tool result message

```jsonl
{"type":"session","id":"child-abc","timestamp":"...","parentSessionId":"parent-xyz","parentMessageId":"msg-123","toolCallId":"task_abc"}
{"type":"user","timestamp":"...","sessionId":"child-abc","uuid":"child-msg-1","message":{"role":"user","content":[{"type":"text","text":"Explore the codebase..."}]}}
{"type":"assistant","timestamp":"...","sessionId":"child-abc","uuid":"child-msg-2","message":{"role":"assistant","content":[...]}}
```

---

## AIX/Mnemonic Integration

### How Nexus Sessions Flow to Mnemonic

```
Nexus Agent System
       │
       ▼
~/nexus/state/sessions/{id}.jsonl
       │
       ▼ (aix sync --source nexus)
       │
      AIX (full fidelity capture)
       │
       ├─► aix-events adapter → Mnemonic Events Ledger
       │   (trimmed turns: user message + final response)
       │
       └─► aix-agents adapter → Mnemonic Agents Ledger
           (full sessions, messages, turns, tool_calls)
```

### Field Mapping: Nexus → AIX → Mnemonic

| Nexus Session Field | AIX sessions | Mnemonic agent_sessions |
|---------------------|--------------|-------------------------|
| sessionId | id | id |
| model | model | model |
| project | project | project |
| parentSessionId | parent_session_id | parent_session_id |
| parentMessageId | parent_message_id | parent_message_id |
| toolCallId | tool_call_id | tool_call_id |
| taskDescription | task_description | task_description |
| taskStatus | task_status | task_status |
| isSubagent | is_subagent | is_subagent |
| contextTokenLimit | context_token_limit | context_token_limit |
| contextTokensUsed | context_tokens_used | context_tokens_used |
| isAgentic | is_agentic | is_agentic |

| Nexus Message Field | AIX messages | Mnemonic agent_messages |
|---------------------|--------------|-------------------------|
| uuid | id | id |
| sessionId | session_id | session_id |
| message.role | role | role |
| message.content | content | content |
| timestamp | timestamp | timestamp |
| checkpointId | checkpoint_id | checkpoint_id |
| isAgentic | is_agentic | is_agentic |
| isPlanExecution | is_plan_execution | is_plan_execution |
| context | context_json | context_json |
| activeRules | cursor_rules_json | cursor_rules_json |

| Nexus ToolCall | AIX tool_calls | Mnemonic agent_tool_calls |
|----------------|----------------|---------------------------|
| id | id | id |
| name | tool_name | tool_name |
| params | params_json | params_json |
| result | result_json | result_json |
| status | status | status |
| childSessionId | child_session_id | child_session_id |

---

## Implementation Checklist

### For Nexus Fork (Branding Script)
- [ ] Change state root: `~/.clawdbot/` → `~/nexus/state/`
- [ ] Sessions path becomes: `~/nexus/state/sessions/{id}.jsonl`
- [ ] Sessions metadata: `~/nexus/state/sessions/sessions.json`
- [ ] Verify compaction creates `.bak` archives
- [ ] All SessionEntry metadata (origin, tokens, model) works unchanged

### For Nexus Agent System (Extended Metadata)
- [ ] Add `parentId` to message entries for tree structure
- [ ] Add `checkpointId` for fork tracking
- [ ] Add `context` object with file selections, mentions
- [ ] Add `toolCalls` array to assistant messages
- [ ] Add `isAgentic`, `isPlanExecution` flags
- [ ] Add `tokenCount` per message
- [ ] Add `activeRules` tracking
- [ ] Extend SessionEntry with subagent fields
- [ ] Extend SessionEntry with context limits
- [ ] Implement turn markers (optional but recommended)

### For AIX (COMPLETE)
- [x] Create `pi_agent.go` - unified adapter for pi-coding-agent format
- [x] Add `NewClawdbotParser()` - points to `~/.clawdbot/sessions/`
- [x] Add `NewNexusParser()` - points to `~/nexus/state/sessions/`
- [x] Parse JSONL transcripts (same as claude_code.go)
- [x] Read `sessions.json` for rich metadata (origin, tokens, model)
- [x] Scan and parse `.bak.*` files for compaction history (via `WithBackups(true)`)
- [x] Add tests for both sources (`pi_agent_test.go`)
- [x] Wire into sync command (`aix sync --source clawdbot` / `aix sync --source nexus`)
- [ ] Parse extended Nexus metadata (context, toolCalls, subagent fields)
- [ ] Pipe to Mnemonic via adapters

### For Mnemonic
- [ ] Rename cortex → mnemonic
- [ ] Add Agents ledger tables
- [ ] Implement aix-events adapter (trimmed turns)
- [ ] Implement aix-agents adapter (full fidelity)
- [ ] Unified session search across all sources (cursor, codex, nexus, clawdbot)
- [ ] Timeline view showing all agent activity
- [ ] Token usage analytics from SessionEntry data
- [ ] Origin-based filtering (show only telegram sessions, etc.)
- [ ] Smart forking with context retrieval

---

## File References

**Upstream Clawdbot:**
- `src/gateway/server-methods/sessions.ts` - Gateway compaction RPC (line-based)
- `src/agents/pi-embedded-runner/compact.ts` - Pi-agent compaction (LLM-based)
- `src/config/sessions/types.ts` - SessionEntry schema (the rich metadata)
- `src/config/types.agent-defaults.ts` - AgentCompactionConfig
- `src/gateway/session-utils.fs.ts` - `archiveFileOnDisk()` function

**AIX Files:**
- `internal/sync/cursor_db.go` - Cursor parser (rich metadata extraction reference)
- `internal/sync/pi_agent.go` - Pi-coding-agent adapter (clawdbot/nexus)
- `internal/models/session.go` - Session/Message models
- `internal/db/schema.sql` - Full schema with turns, tool_calls
- `docs/AIX_FULL_INGESTION_SPEC.md` - Complete ingestion specification
- `docs/AIX_MNEMONIC_PIPELINE.md` - How AIX feeds into Mnemonic

**Mnemonic Files:**
- `docs/MNEMONIC_ARCHITECTURE.md` - Unified memory system architecture
- `internal/adapters/aix.go` - Current AIX adapter (to be split into aix-events, aix-agents)
- `internal/db/schema.sql` - Core + Events + Agents ledger schemas

**Nexus Specs:**
- `specs/agent-system/ONTOLOGY.md` - Turn, Thread, Session definitions
- `specs/agent-system/SESSION_FORMAT.md` - This document

---

## Summary: The Full Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Nexus Agent System                          │
│                                                                 │
│  Cursor  ──┐                                                    │
│  Codex   ──┼──► AIX (capture) ──► Mnemonic (memory)            │
│  Nexus   ──┤         │                   │                      │
│  Clawdbot──┘         │                   ├─► Events Ledger      │
│                      │                   │   (trimmed turns)    │
│              Full fidelity               │                      │
│              sessions, msgs,             └─► Agents Ledger      │
│              turns, tool_calls               (full fidelity)    │
│                                                                 │
│  Nexus sessions stored in:                                      │
│  ~/nexus/state/sessions/{id}.jsonl                             │
│                                                                 │
│  With rich metadata matching Cursor's depth:                    │
│  - Message context (files, mentions, rules)                     │
│  - Tool calls with params/results                               │
│  - Subagent dispatch tracking                                   │
│  - Turn boundaries                                              │
│  - Checkpoint/fork support                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** By capturing the same richness as Cursor in Nexus sessions, we enable:
1. Unified search across ALL agent sources in Mnemonic
2. Smart forking with context from any past conversation
3. Full replay/analysis of any session
4. Subagent relationship tracking

---

*This document defines the session format for Nexus agent system. See ONTOLOGY.md for the underlying data model and MNEMONIC_ARCHITECTURE.md for how sessions flow into the unified memory system.*
