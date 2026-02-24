# OpenClaw Session Storage (JSONL System)

This document captures how OpenClaw stores session data — the JSONL file format, `sessions.json` index, and transcript structure. Nexus's Agents Ledger replaces this system with SQLite.

---

## Storage Layout

```
~/.openclaw/agents/<agentId>/sessions/
├── sessions.json           # Index: sessionKey → SessionEntry
├── <sessionId>.jsonl       # Transcript files
├── <sessionId>-topic-<threadId>.jsonl  # Thread-specific transcripts
└── *.bak-*                 # Backup files from repairs
```

**Path Resolution:**

```typescript:36:49:~/nexus/home/projects/openclaw/src/config/sessions/paths.ts
export function resolveSessionTranscriptPath(
  sessionId: string,
  agentId?: string,
  topicId?: string | number,
): string {
  const safeTopicId =
    typeof topicId === "string"
      ? encodeURIComponent(topicId)
      : typeof topicId === "number"
        ? String(topicId)
        : undefined;
  const fileName =
    safeTopicId !== undefined ? `${sessionId}-topic-${safeTopicId}.jsonl` : `${sessionId}.jsonl`;
  return path.join(resolveAgentSessionsDir(agentId), fileName);
}
```

---

## sessions.json Index

The index file maps session keys to session metadata. It's a JSON object where keys are session identifiers and values are `SessionEntry` objects.

### SessionEntry Fields

```typescript:25:96:~/nexus/home/projects/openclaw/src/config/sessions/types.ts
export type SessionEntry = {
  // Core identifiers
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  
  // Session state
  systemSent?: boolean;
  abortedLastRun?: boolean;
  compactionCount?: number;
  
  // Token tracking
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  
  // Model configuration
  modelProvider?: string;
  model?: string;
  modelOverride?: string;
  providerOverride?: string;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  
  // Routing & delivery
  channel?: string;
  lastChannel?: SessionChannelId;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  deliveryContext?: DeliveryContext;
  
  // Group/chat metadata
  chatType?: SessionChatType;  // "direct" | "group" | "channel"
  groupId?: string;
  subject?: string;
  groupChannel?: string;
  space?: string;
  displayName?: string;
  label?: string;
  origin?: SessionOrigin;
  
  // Queue configuration
  queueMode?: "steer" | "followup" | "collect" | "queue" | "interrupt" | ...;
  queueDebounceMs?: number;
  queueCap?: number;
  queueDrop?: "old" | "new" | "summarize";
  
  // TTS and response
  ttsAuto?: TtsAutoMode;
  responseUsage?: "on" | "off" | "tokens" | "full";
  sendPolicy?: "allow" | "deny";
  
  // Memory flush tracking
  memoryFlushAt?: number;
  memoryFlushCompactionCount?: number;
  
  // Spawned session tracking
  spawnedBy?: string;
  
  // Heartbeat deduplication
  lastHeartbeatText?: string;
  lastHeartbeatSentAt?: number;
  
  // Skills snapshot
  skillsSnapshot?: SessionSkillSnapshot;
  systemPromptReport?: SessionSystemPromptReport;
};
```

### Session Key Format

Session keys follow patterns based on scope and origin:

- **DM sessions:** `agent:<agentId>:<channel>:dm:<senderId>`
- **Group sessions:** `agent:<agentId>:<channel>:group:<groupId>`
- **Thread sessions:** `agent:<agentId>:<channel>:thread:<threadId>`
- **Main session:** `agent:<agentId>:main`

---

## JSONL Transcript Format

Each `.jsonl` file contains one JSON object per line. The first line is always a session header.

### Session Header (First Line)

```typescript
{
  "type": "session",
  "version": 9,  // CURRENT_SESSION_VERSION
  "id": "<uuid>",
  "timestamp": "2026-02-04T10:30:00.000Z",
  "cwd": "/Users/tyler/workspace",
  "parentSession": "/path/to/parent.jsonl"  // optional, for branched sessions
}
```

**Header creation:**

```typescript:68:76:~/nexus/home/projects/openclaw/src/config/sessions/transcript.ts
  const header = {
    type: "session",
    version: CURRENT_SESSION_VERSION,
    id: params.sessionId,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  };
  await fs.promises.writeFile(params.sessionFile, `${JSON.stringify(header)}\n`, "utf-8");
```

### Entry Types

#### 1. Message Entry (`type: "message"`)

The primary entry type for conversation turns:

```typescript
{
  "type": "message",
  "id": "<uuid>",           // unique message ID
  "parentId": "<uuid>",     // parent in conversation tree (for branching)
  "timestamp": 1706976000000,
  "message": {
    "role": "user" | "assistant" | "toolResult",
    "content": [
      { "type": "text", "text": "..." },
      { "type": "toolCall", "id": "call_1", "name": "read", "arguments": {...} },
      { "type": "toolUse", "id": "use_1", "name": "write", "input": {...} },
      { "type": "thinking", "text": "..." }
    ],
    "api": "openai-responses" | "anthropic-messages",
    "provider": "anthropic" | "openai" | "google" | ...,
    "model": "claude-sonnet-4-20250514",
    "stopReason": "stop" | "error" | "tool_use",
    "usage": {
      "input": 1234,
      "output": 567,
      "cacheRead": 0,
      "cacheWrite": 0,
      "totalTokens": 1801,
      "cost": {
        "input": 0.003,
        "output": 0.007,
        "cacheRead": 0,
        "cacheWrite": 0,
        "total": 0.01
      }
    }
  }
}
```

**Content block types:**
- `text` — Plain text content
- `toolCall` / `toolUse` — Tool invocations with `id`, `name`, `arguments`/`input`
- `thinking` — Model reasoning (extended thinking)
- `image` — Image content with base64 or URL

**Role values:**
- `user` — Human input
- `assistant` — Model response
- `toolResult` — Tool execution result (paired with toolCall by `toolCallId`)

#### 2. Custom Entry (`type: "custom"`)

For metadata and internal state:

```typescript
{
  "type": "custom",
  "customType": "model-snapshot" | "cache-ttl" | "google-turn-ordering-bootstrap",
  "data": { ... }
}
```

**Common customTypes:**

```typescript:1:4:~/nexus/home/projects/openclaw/src/agents/pi-embedded-runner/cache-ttl.ts
type CustomEntryLike = { type?: unknown; customType?: unknown; data?: unknown };

export const CACHE_TTL_CUSTOM_TYPE = "openclaw.cache-ttl";
```

```typescript:230:232:~/nexus/home/projects/openclaw/src/agents/pi-embedded-runner/google.ts
type CustomEntryLike = { type?: unknown; customType?: unknown; data?: unknown };
// MODEL_SNAPSHOT_CUSTOM_TYPE = "model-snapshot"
// GOOGLE_TURN_ORDERING_CUSTOM_TYPE = "google-turn-ordering-bootstrap"
```

#### 3. Compaction Entry

When sessions are compacted to reduce context size:

```typescript
{
  "type": "compaction",
  "timestamp": 1706976000000,
  "summary": "...",  // Summarized context
  "compactedCount": 42,
  "tokensBefore": 100000,
  "tokensAfter": 15000
}
```

#### 4. Branch Summary

For branched sessions:

```typescript
{
  "type": "branch_summary",
  "parentSession": "/path/to/parent.jsonl",
  "branchPoint": "<parentId>",
  "summary": "..."
}
```

---

## Tree Structure

Transcripts support branching via `id` and `parentId` fields:

- Each message has a unique `id`
- Messages reference their parent via `parentId`
- The "leaf" is the current conversation tip
- Branching creates new conversation paths from any point

**Branch operations:**

```typescript:744:756:~/nexus/home/projects/openclaw/src/agents/pi-embedded-runner/run/attempt.ts
        // Repair orphaned trailing user messages so new prompts don't violate role ordering.
        const leafEntry = sessionManager.getLeafEntry();
        if (leafEntry?.type === "message" && leafEntry.message.role === "user") {
          if (leafEntry.parentId) {
            sessionManager.branch(leafEntry.parentId);
          } else {
            sessionManager.resetLeaf();
          }
          // ...
        }
```

**Creating branched sessions:**

```typescript:55:92:~/nexus/home/projects/openclaw/src/auto-reply/reply/session.ts
function forkSessionFromParent(params: {
  parentEntry: SessionEntry;
}): { sessionId: string; sessionFile: string } | null {
  const parentSessionFile = resolveSessionFilePath(
    params.parentEntry.sessionId,
    params.parentEntry,
  );
  // ...
  const manager = SessionManager.open(parentSessionFile);
  const leafId = manager.getLeafId();
  if (leafId) {
    const sessionFile = manager.createBranchedSession(leafId) ?? manager.getSessionFile();
    const sessionId = manager.getSessionId();
    if (sessionFile && sessionId) {
      return { sessionId, sessionFile };
    }
  }
  // Fallback: create new session with parentSession reference
  const header = {
    type: "session",
    version: CURRENT_SESSION_VERSION,
    id: sessionId,
    timestamp,
    cwd: manager.getCwd(),
    parentSession: parentSessionFile,
  };
  // ...
}
```

---

## Session Store Operations

### Loading

```typescript:109:175:~/nexus/home/projects/openclaw/src/config/sessions/store.ts
export function loadSessionStore(
  storePath: string,
  opts: LoadSessionStoreOptions = {},
): Record<string, SessionEntry> {
  // Check cache first if enabled
  if (!opts.skipCache && isSessionStoreCacheEnabled()) {
    const cached = SESSION_STORE_CACHE.get(storePath);
    if (cached && isSessionStoreCacheValid(cached)) {
      const currentMtimeMs = getFileMtimeMs(storePath);
      if (currentMtimeMs === cached.mtimeMs) {
        return structuredClone(cached.store);
      }
      invalidateSessionStoreCache(storePath);
    }
  }

  // Load from disk
  let store: Record<string, SessionEntry> = {};
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON5.parse(raw);
    if (isSessionStoreRecord(parsed)) {
      store = parsed;
    }
  } catch {
    // ignore missing/invalid store; recreated on demand
  }
  // ...
}
```

### Saving (Atomic Write)

```typescript:189:255:~/nexus/home/projects/openclaw/src/config/sessions/store.ts
async function saveSessionStoreUnlocked(
  storePath: string,
  store: Record<string, SessionEntry>,
): Promise<void> {
  invalidateSessionStoreCache(storePath);
  normalizeSessionStore(store);
  
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const json = JSON.stringify(store, null, 2);

  // Atomic rename on Unix
  const tmp = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(tmp, json, { mode: 0o600, encoding: "utf-8" });
    await fs.promises.rename(tmp, storePath);
    await fs.promises.chmod(storePath, 0o600);
  } finally {
    await fs.promises.rm(tmp, { force: true });
  }
}
```

### Locking

File-based locking prevents concurrent writes:

```typescript:285:355:~/nexus/home/projects/openclaw/src/config/sessions/store.ts
async function withSessionStoreLock<T>(
  storePath: string,
  fn: () => Promise<T>,
  opts: SessionStoreLockOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 25;
  const staleMs = opts.staleMs ?? 30_000;
  const lockPath = `${storePath}.lock`;
  
  // Exclusive lock file creation
  while (true) {
    try {
      const handle = await fs.promises.open(lockPath, "wx");
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
        "utf-8",
      );
      await handle.close();
      break;
    } catch (err) {
      // Handle EEXIST, stale lock eviction, timeout
      // ...
    }
  }

  try {
    return await fn();
  } finally {
    await fs.promises.unlink(lockPath).catch(() => undefined);
  }
}
```

---

## Session File Repair

Malformed JSONL files are repaired by dropping invalid lines:

```typescript:18:109:~/nexus/home/projects/openclaw/src/agents/session-file-repair.ts
export async function repairSessionFileIfNeeded(params: {
  sessionFile: string;
  warn?: (message: string) => void;
}): Promise<RepairReport> {
  let content: string;
  try {
    content = await fs.readFile(sessionFile, "utf-8");
  } catch (err) {
    // Handle missing file
  }

  const lines = content.split(/\r?\n/);
  const entries: unknown[] = [];
  let droppedLines = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      entries.push(entry);
    } catch {
      droppedLines += 1;
    }
  }

  // Validate session header
  if (!isSessionHeader(entries[0])) {
    return { repaired: false, droppedLines, reason: "invalid session header" };
  }

  if (droppedLines === 0) {
    return { repaired: false, droppedLines: 0 };
  }

  // Write repaired file with backup
  const cleaned = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  const backupPath = `${sessionFile}.bak-${process.pid}-${Date.now()}`;
  // Atomic write...
}
```

### Transcript Repair (Tool Result Pairing)

Ensures tool calls have matching tool results:

```typescript:166:305:~/nexus/home/projects/openclaw/src/agents/session-transcript-repair.ts
export function repairToolUseResultPairing(messages: AgentMessage[]): ToolUseRepairReport {
  // Anthropic rejects transcripts where assistant tool calls are not
  // immediately followed by matching tool results.
  // - Move matching toolResult messages directly after their assistant toolCall turn
  // - Insert synthetic error toolResults for missing ids
  // - Drop duplicate toolResults for the same id
  // ...
}
```

---

## Appending Messages

Messages are appended via SessionManager:

```typescript:111:134:~/nexus/home/projects/openclaw/src/config/sessions/transcript.ts
  const sessionManager = SessionManager.open(sessionFile);
  sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: mirrorText }],
    api: "openai-responses",
    provider: "openclaw",
    model: "delivery-mirror",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  });
```

---

## Caching

Session store uses in-memory caching with TTL:

```typescript:20:29:~/nexus/home/projects/openclaw/src/config/sessions/store.ts
type SessionStoreCacheEntry = {
  store: Record<string, SessionEntry>;
  loadedAt: number;
  storePath: string;
  mtimeMs?: number;
};

const SESSION_STORE_CACHE = new Map<string, SessionStoreCacheEntry>();
const DEFAULT_SESSION_STORE_TTL_MS = 45_000; // 45 seconds
```

Cache is invalidated on:
- File mtime change
- TTL expiration
- Any write operation

---

## What Nexus Replaces

| OpenClaw Pattern | Nexus Replacement |
|------------------|-------------------|
| `sessions.json` index | SQLite `sessions` table in Agents Ledger |
| `*.jsonl` transcript files | SQLite `turns` + `messages` tables |
| File-based locking | SQLite transactions |
| In-memory cache + mtime checks | SQLite query layer |
| Branching via parentId in JSONL | Foreign keys + tree queries |
| Custom entries inline | Separate metadata tables |
| File sprawl (one file per session) | Single database file |

**Benefits of SQLite:**
- Atomic transactions (no corruption risk)
- Structured queries across all sessions
- No file proliferation
- Built-in indexing for fast lookups
- Easier backup/restore

---

*Source: `~/nexus/home/projects/openclaw/src/config/sessions/`*
