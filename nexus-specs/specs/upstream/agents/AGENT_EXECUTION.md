# Agent Execution Reference

**Status:** REFERENCE DOCUMENT  
**Source:** OpenClaw (`src/agents/pi-embedded-runner/`, `src/agents/`)  
**Last Updated:** 2026-02-04

---

## Overview

This document covers OpenClaw's agent execution system:
- pi-embedded-runner flow
- Lane-based queueing for serialization
- Failover and retry logic
- Streaming subscription callbacks
- Tool execution and policies

For context assembly before execution, see `CONTEXT_ASSEMBLY.md`.

---

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        runEmbeddedPiAgent()                                   │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │ 1. QUEUE MANAGEMENT                                                  │     │
│  │    → Acquire session lane lock                                       │     │
│  │    → Acquire global lane lock (rate limiting)                        │     │
│  └────────────────────────────────────────┬────────────────────────────┘     │
│                                           ↓                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │ 2. MODEL RESOLUTION                                                  │     │
│  │    → Resolve provider/model from config or session override          │     │
│  │    → Select auth profile                                             │     │
│  │    → Check model capabilities (thinking, vision, etc.)               │     │
│  └────────────────────────────────────────┬────────────────────────────┘     │
│                                           ↓                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │ 3. CONTEXT WINDOW GUARD                                              │     │
│  │    → Check estimated context size                                    │     │
│  │    → Pre-compaction if approaching limit                             │     │
│  └────────────────────────────────────────┬────────────────────────────┘     │
│                                           ↓                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │ 4. RETRY LOOP WITH FAILOVER                                          │     │
│  │    → runEmbeddedAttempt()                                            │     │
│  │    → On auth error: rotate profile, retry                            │     │
│  │    → On rate limit: cooldown, try next profile                       │     │
│  │    → On context overflow: compact, retry                             │     │
│  │    → On thinking unsupported: lower level, retry                     │     │
│  └────────────────────────────────────────┬────────────────────────────┘     │
│                                           ↓                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │ 5. RESULT ASSEMBLY                                                   │     │
│  │    → Collect payloads from streaming                                 │     │
│  │    → Update session usage counters                                   │     │
│  │    → Return EmbeddedPiRunResult                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Run Parameters

```typescript
// src/agents/pi-embedded-runner/run/params.ts

type RunEmbeddedPiAgentParams = {
  // Session identification
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  
  // Message context
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  
  // Group context (for tool policies)
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  
  // Sender context
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  
  // Workspace
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  
  // Input
  prompt: string;
  images?: ImageContent[];
  skillsSnapshot?: SkillSnapshot;
  
  // Model selection
  provider?: string;
  model?: string;
  authProfileId?: string;
  authProfileIdSource?: "auto" | "user";
  
  // Behavior
  thinkLevel?: ThinkLevel;
  verboseLevel?: VerboseLevel;
  reasoningLevel?: ReasoningLevel;
  toolResultFormat?: ToolResultFormat;
  disableTools?: boolean;
  
  // Execution controls
  timeoutMs: number;
  runId: string;
  abortSignal?: AbortSignal;
  
  // Streaming callbacks
  onPartialReply?: (payload: ReplyPayload) => void;
  onBlockReply?: (payload: ReplyPayload) => void;
  onReasoningStream?: (payload: ReplyPayload) => void;
  onToolResult?: (payload: ReplyPayload) => void;
  onAgentEvent?: (evt: AgentEvent) => void;
};
```

---

## Lane-Based Queueing

### Purpose

Lanes provide two levels of serialization:

1. **Session Lane** — Ensures one run per session (prevents transcript corruption)
2. **Global Lane** — Rate limits overall LLM calls (prevents API throttling)

### Implementation

```typescript
// Execution is double-enqueued:
return enqueueSession(sessionLane, () =>
  enqueueGlobal(globalLane, async () => {
    // ... agent execution
  })
);
```

### Lane Resolution

```typescript
// Session-specific lane
function resolveSessionLane(sessionKey: string): string {
  return `session:${sessionKey}`;
}

// Global lane (can be provider-specific)
function resolveGlobalLane(lane?: string): string {
  return lane ?? "default";
}
```

### Lane Behavior

| Lane Type | Concurrency | Purpose |
|-----------|-------------|---------|
| Session | 1 | Serialize per-session operations |
| Global | Configurable | Rate limit across all sessions |

---

## Active Run Tracking

### State Map

```typescript
// src/agents/pi-embedded-runner/runs.ts

type EmbeddedPiQueueHandle = {
  queueMessage: (text: string) => Promise<void>;
  isStreaming: () => boolean;
  isCompacting: () => boolean;
  abort: () => void;
};

const ACTIVE_EMBEDDED_RUNS = new Map<string, EmbeddedPiQueueHandle>();
const EMBEDDED_RUN_WAITERS = new Map<string, Set<EmbeddedRunWaiter>>();
```

### Run States

| State | Description | Detection |
|-------|-------------|-----------|
| **Active** | Run is registered and processing | `ACTIVE_EMBEDDED_RUNS.has(sessionId)` |
| **Streaming** | Actively receiving model output | `handle.isStreaming()` |
| **Compacting** | In compaction phase | `handle.isCompacting()` |
| **Ended** | Run completed or aborted | Run removed from map |

### Key Functions

```typescript
// Register new run
function setActiveEmbeddedRun(sessionId: string, handle: EmbeddedPiQueueHandle): void;

// Clear completed run
function clearActiveEmbeddedRun(sessionId: string, handle: EmbeddedPiQueueHandle): void;

// Check status
function isEmbeddedPiRunActive(sessionId: string): boolean;
function isEmbeddedPiRunStreaming(sessionId: string): boolean;

// Queue message into active run (steer mode)
function queueEmbeddedPiMessage(sessionId: string, text: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) return false;
  if (!handle.isStreaming()) return false;
  if (handle.isCompacting()) return false;
  void handle.queueMessage(text);
  return true;
}

// Abort active run
function abortEmbeddedPiRun(sessionId: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) return false;
  handle.abort();
  return true;
}

// Wait for run completion
function waitForEmbeddedPiRunEnd(sessionId: string, timeoutMs = 15_000): Promise<boolean> {
  if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) return Promise.resolve(true);
  // Add waiter, set timeout, resolve when notified
}
```

---

## Failover and Retry Logic

### Failure Classification

```typescript
type FailoverReason = 
  | "auth"         // Authentication failure
  | "format"       // Request format error
  | "rate_limit"   // Rate limited
  | "billing"      // Billing/quota issue
  | "timeout"      // Request timeout
  | "unknown";
```

### Failover Flow

```
Error Occurs
    ↓
Classify Error
    ↓
┌─────────────────────────────────────────────────┐
│ auth / rate_limit / billing                      │
│   → Mark profile in cooldown                     │
│   → Select next profile                          │
│   → Retry with new profile                       │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ thinking_unsupported                             │
│   → Lower thinking level                         │
│   → Retry with reduced level                     │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ context_overflow                                 │
│   → Trigger compaction                           │
│   → Retry with compacted context                 │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ All profiles exhausted                           │
│   → Throw FailoverError                          │
│   → Try model fallback if configured             │
└─────────────────────────────────────────────────┘
```

### Auth Profile Rotation

```typescript
// src/agents/auth-profiles/order.ts

function resolveAuthProfileOrder(params: {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  provider: string;
  preferredProfile?: string;
}): string[] {
  // Priority:
  // 1. User-specified preferred profile
  // 2. Stored order override (per-agent)
  // 3. Config-defined order
  // 4. Round-robin by type (OAuth > Token > API Key)
  // 5. Skip profiles in cooldown (append at end sorted by cooldown expiry)
}
```

### Cooldown Management

```typescript
type ProfileUsageStats = {
  lastUsed?: number;
  cooldownUntil?: number;
  disabledUntil?: number;
  disabledReason?: AuthProfileFailureReason;
  errorCount?: number;
  failureCounts?: Partial<Record<AuthProfileFailureReason, number>>;
};
```

---

## Run Attempt

### Core Function

```typescript
// src/agents/pi-embedded-runner/run/attempt.ts

async function runEmbeddedAttempt(params: {
  // All RunEmbeddedPiAgentParams plus:
  attemptNumber: number;
  compactionHappened: boolean;
}): Promise<AttemptResult>;
```

### Attempt Flow

```
runEmbeddedAttempt()
    ↓
1. Resolve sandbox context (if enabled)
    ↓
2. Load skills snapshot
    ↓
3. Build bootstrap context files
    ↓
4. Create tools (with policies applied)
    ↓
5. Build system prompt
    ↓
6. Set up session manager
    ↓
7. Execute LLM prompt
    ↓
8. Process response
    ↓
Return AttemptResult
```

---

## Streaming Subscriptions

### Subscription Setup

```typescript
// src/agents/pi-embedded-subscribe.ts

type SubscribeEmbeddedPiSessionParams = {
  session: AgentSession;
  runId: string;
  verboseLevel?: VerboseLevel;
  reasoningMode?: "off" | "on" | "stream";
  toolResultFormat?: "markdown" | "plain";
  
  // Callbacks
  onPartialReply?: (payload: ReplyPayload) => void;
  onBlockReply?: (payload: ReplyPayload) => void;
  onReasoningStream?: (payload: ReplyPayload) => void;
  onToolResult?: (payload: ReplyPayload) => void;
  onAgentEvent?: (evt: AgentEvent) => void;
  
  blockReplyBreak?: "text_end" | "message_end";
  blockReplyChunking?: BlockReplyChunking;
};

function subscribeEmbeddedPiSession(params: SubscribeEmbeddedPiSessionParams): {
  assistantTexts: string[];
  toolMetas: Array<{ toolName: string; meta?: string }>;
  unsubscribe: () => void;
  waitForCompactionRetry: () => Promise<void>;
  isCompacting: () => boolean;
  didSendViaMessagingTool: () => boolean;
  getMessagingToolSentTexts: () => string[];
  getMessagingToolSentTargets: () => MessagingToolSend[];
  getLastToolError: () => string | undefined;
};
```

### Callback Types

| Callback | When Called | Purpose |
|----------|-------------|---------|
| `onPartialReply` | Each token received | Real-time streaming display |
| `onBlockReply` | Chunk boundary (paragraph, etc.) | Block-by-block delivery |
| `onReasoningStream` | Thinking/reasoning output | Show agent's reasoning |
| `onToolResult` | Tool execution complete | Display tool outputs |
| `onAgentEvent` | Lifecycle events | Track run phases |

### Block Chunking

```typescript
type BlockReplyChunking = {
  mode: "soft" | "hard";
  softChunkChars?: number;      // Target chunk size
  hardChunkChars?: number;      // Maximum chunk size
  paragraphPreference?: boolean; // Break at paragraphs
};
```

---

## Lifecycle Events

```typescript
// src/agents/pi-embedded-subscribe.handlers.lifecycle.ts

// Agent lifecycle
{ stream: "lifecycle", data: { phase: "start", startedAt: number } }
{ stream: "lifecycle", data: { phase: "end", endedAt: number } }

// Compaction lifecycle
{ stream: "compaction", data: { phase: "start" } }
{ stream: "compaction", data: { phase: "end", willRetry: boolean } }
```

---

## Tool Execution

### Tool Creation

```typescript
// src/agents/pi-tools.ts

function createOpenClawCodingTools(options?: {
  exec?: ExecToolDefaults;
  sandbox?: SandboxContext | null;
  sessionKey?: string;
  config?: OpenClawConfig;
  modelProvider?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
  // ... channel context, group context, etc.
}): AnyAgentTool[];
```

### Tool Creation Flow

```
1. Start with base coding tools (read, write, edit)
    ↓
2. Add exec/process tools
    ↓
3. Add sandboxed variants if sandbox enabled
    ↓
4. Add OpenClaw-specific tools (messaging, sessions, web, etc.)
    ↓
5. Add channel-specific tools
    ↓
6. Apply tool policies (filter by allow/deny)
    ↓
7. Normalize tool schemas
    ↓
8. Wrap with hooks and abort signal
```

### Tool Policies

```typescript
// src/agents/pi-tools.policy.ts

type SandboxToolPolicy = {
  allow?: string[];
  deny?: string[];
};

// Policy evaluation order (later can restrict, never expand):
// 1. Profile policy (tools.profile)
// 2. Provider-specific profile (tools.byProvider.*.profile)
// 3. Global policy (tools.allow/deny)
// 4. Provider-specific policy (tools.byProvider.*.allow/deny)
// 5. Agent policy (agents.*.tools.allow/deny)
// 6. Agent provider policy (agents.*.tools.byProvider.*)
// 7. Group policy (channel-specific group restrictions)
// 8. Sandbox policy (sandbox.tools.allow/deny)
// 9. Subagent policy (default restrictions for spawned agents)
```

### Subagent Tool Restrictions

```typescript
const DEFAULT_SUBAGENT_TOOL_DENY = [
  "sessions_list", "sessions_history", "sessions_send", "sessions_spawn",
  "gateway", "agents_list",
  "whatsapp_login",
  "session_status", "cron",
  "memory_search", "memory_get",
];
```

### Pattern Matching

```typescript
// Supports wildcards
{ allow: ["web_*"] }     // Allow all web tools
{ deny: ["*"] }          // Deny all
{ allow: ["exec"] }      // Also allows apply_patch (implicit)
```

---

## Run Result

```typescript
// src/agents/pi-embedded-runner/types.ts

type EmbeddedPiAgentMeta = {
  sessionId: string;
  provider: string;
  model: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
};

type EmbeddedPiRunMeta = {
  durationMs: number;
  agentMeta?: EmbeddedPiAgentMeta;
  aborted?: boolean;
  systemPromptReport?: SessionSystemPromptReport;
  error?: {
    kind: "context_overflow" | "compaction_failure" | "role_ordering" | "image_size";
    message: string;
  };
  stopReason?: string;
  pendingToolCalls?: Array<{ id: string; name: string; arguments: string }>;
};

type EmbeddedPiRunResult = {
  payloads?: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    replyToId?: string;
    isError?: boolean;
  }>;
  meta: EmbeddedPiRunMeta;
  didSendViaMessagingTool?: boolean;
  messagingToolSentTexts?: string[];
  messagingToolSentTargets?: MessagingToolSend[];
};
```

---

## Queue Mode Handling

### During Agent Run

When a new message arrives for a busy session:

```typescript
async function handleIncomingMessage(
  sessionKey: string, 
  message: Message,
  queueSettings: QueueSettings
): Promise<void> {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  
  if (!handle) {
    // Session idle - start new run
    await startNewRun(sessionKey, message);
    return;
  }
  
  switch (queueSettings.mode) {
    case "steer":
      // Inject into active run
      if (handle.isStreaming() && !handle.isCompacting()) {
        await handle.queueMessage(message.text);
      } else {
        enqueueFollowupRun(sessionKey, message, queueSettings);
      }
      break;
      
    case "followup":
    case "collect":
    case "queue":
      // Queue for later
      enqueueFollowupRun(sessionKey, message, queueSettings);
      break;
      
    case "steer-backlog":
      // Try steer, fall back to queue
      if (handle.isStreaming() && !handle.isCompacting()) {
        await handle.queueMessage(message.text);
      } else {
        enqueueFollowupRun(sessionKey, message, queueSettings);
      }
      break;
      
    case "interrupt":
      // Abort and start new run
      handle.abort();
      await startNewRun(sessionKey, message);
      break;
  }
}
```

### Queue Drain

After a run completes, the queue is drained:

```typescript
// src/auto-reply/reply/queue/drain.ts

function scheduleFollowupDrain(
  key: string,
  runFollowup: (run: FollowupRun) => Promise<void>
): void {
  const queue = FOLLOWUP_QUEUES.get(key);
  if (!queue || queue.draining) return;
  queue.draining = true;
  
  void (async () => {
    try {
      while (queue.items.length > 0 || queue.droppedCount > 0) {
        await waitForQueueDebounce(queue);
        
        if (queue.mode === "collect") {
          // Batch all items into single prompt
          const items = queue.items.splice(0);
          const prompt = buildCollectPrompt({ items, ... });
          await runFollowup({ prompt, run: items.at(-1).run });
          continue;
        }
        
        // Process one at a time
        const next = queue.items.shift();
        if (!next) break;
        await runFollowup(next);
      }
    } finally {
      queue.draining = false;
      if (queue.items.length === 0 && queue.droppedCount === 0) {
        FOLLOWUP_QUEUES.delete(key);
      }
    }
  })();
}
```

---

## Nexus Mapping

| OpenClaw | Nexus Broker |
|----------|--------------|
| `runEmbeddedPiAgent()` | Broker agent execution |
| Session lanes | Session processing lock |
| Global lanes | Rate limiting layer |
| `ACTIVE_EMBEDDED_RUNS` | Active run tracking in Broker |
| `FOLLOWUP_QUEUES` | Queue table in SQLite |
| Auth profile rotation | Auth profile rotation (same) |
| Streaming callbacks | Streaming bridge to NEX |

### Key Differences

1. **Queue persistence** — Nexus uses SQLite; OpenClaw uses in-memory Maps
2. **Event storage** — Nexus writes to Events Ledger; OpenClaw is stateless
3. **Turn storage** — Nexus writes to Agents Ledger; OpenClaw writes JSONL
4. **Context injection** — Nexus adds Cortex-derived context

---

## Key Files

| File | Purpose |
|------|---------|
| `src/agents/pi-embedded-runner/run.ts` | Main entry point |
| `src/agents/pi-embedded-runner/run/attempt.ts` | Single attempt logic |
| `src/agents/pi-embedded-runner/run/params.ts` | Parameter types |
| `src/agents/pi-embedded-runner/runs.ts` | Active run tracking |
| `src/agents/pi-embedded-runner/types.ts` | Result types |
| `src/agents/pi-embedded-subscribe.ts` | Streaming subscriptions |
| `src/agents/pi-tools.ts` | Tool creation |
| `src/agents/pi-tools.policy.ts` | Tool policies |
| `src/agents/auth-profiles/` | Auth profile management |
| `src/auto-reply/reply/queue/` | Queue management |

---

*This document covers OpenClaw agent execution for Nexus Broker reference.*
