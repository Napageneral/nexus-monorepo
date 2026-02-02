# Upstream Agent System Reference

**Status:** REFERENCE DOCUMENT  
**Upstream Version:** `80c1edc3f` (v2026.1.21)  
**Last Updated:** 2026-01-22

This document captures the complete upstream clawdbot agent system architecture — subagents, sessions, queues, proactive triggers, agent lifecycle, and compaction.

---

## 1. Subagent System

The subagent system enables spawning isolated background tasks that run independently and report results back to the main session.

### 1.1 `sessions_spawn` Tool

**Location:** `src/agents/tools/sessions-spawn-tool.ts`

#### Schema

```typescript
const SessionsSpawnToolSchema = Type.Object({
  task: Type.String(),                                    // Required: task description
  label: Type.Optional(Type.String()),                    // Optional: human-readable label
  agentId: Type.Optional(Type.String()),                  // Optional: target agent (cross-agent spawn)
  model: Type.Optional(Type.String()),                    // Optional: model override
  thinking: Type.Optional(Type.String()),                 // Optional: thinking level override
  runTimeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),  // Run timeout
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),     // Back-compat alias
  cleanup: optionalStringEnum(["delete", "keep"] as const),       // Session cleanup policy
});
```

#### Return Value

```typescript
// Success
{ status: "accepted", childSessionKey: string, runId: string, modelApplied?: boolean, warning?: string }

// Error cases
{ status: "forbidden", error: string }  // Nested spawn attempt or disallowed agentId
{ status: "error", error: string, childSessionKey?: string, runId?: string }
```

#### Tool Registration

```typescript
export function createSessionsSpawnTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  sandboxed?: boolean;
}): AnyAgentTool
```

#### Key Behaviors

1. **Child Session Key Generation:** `agent:{targetAgentId}:subagent:{uuid}`
2. **Model Override:** Applied via `sessions.patch` gateway call
3. **Thinking Override:** Normalized and validated against model capabilities
4. **Gateway Integration:** Uses `agent` method with `lane: AGENT_LANE_SUBAGENT` and `deliver: false`

### 1.2 Nested Spawn Restriction

**Location:** `sessions-spawn-tool.ts` lines 109-114

```typescript
if (typeof requesterSessionKey === "string" && isSubagentSessionKey(requesterSessionKey)) {
  return jsonResult({
    status: "forbidden",
    error: "sessions_spawn is not allowed from sub-agent sessions",
  });
}
```

**Detection Logic:** (`src/routing/session-key.ts`)
```typescript
export function isSubagentSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return false;
  if (raw.toLowerCase().startsWith("subagent:")) return true;
  const parsed = parseAgentSessionKey(raw);
  return Boolean((parsed?.rest ?? "").toLowerCase().startsWith("subagent:"));
}
```

### 1.3 Cross-Agent Spawn Allowlist

```typescript
if (targetAgentId !== requesterAgentId) {
  const allowAgents = resolveAgentConfig(cfg, requesterAgentId)?.subagents?.allowAgents ?? [];
  const allowAny = allowAgents.some((value) => value.trim() === "*");
  // ... allowlist check
  if (!allowAny && !allowSet.has(normalizedTargetId)) {
    return jsonResult({
      status: "forbidden",
      error: `agentId is not allowed for sessions_spawn (allowed: ${allowedText})`,
    });
  }
}
```

### 1.4 Subagent Registry

**Location:** `src/agents/subagent-registry.ts`

#### Type Definition

```typescript
export type SubagentRunRecord = {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  cleanup: "delete" | "keep";
  label?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: SubagentRunOutcome;
  archiveAtMs?: number;
  cleanupCompletedAt?: number;
  cleanupHandled?: boolean;
};

export type SubagentRunOutcome = {
  status: "ok" | "error" | "timeout" | "unknown";
  error?: string;
};
```

#### In-Memory Storage

```typescript
const subagentRuns = new Map<string, SubagentRunRecord>();
```

#### Key Functions

```typescript
// Register a new spawn
export function registerSubagentRun(params: {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  cleanup: "delete" | "keep";
  label?: string;
  runTimeoutSeconds?: number;
}): void

// List runs for a requester
export function listSubagentRunsForRequester(requesterSessionKey: string): SubagentRunRecord[]

// Manually release a run
export function releaseSubagentRun(runId: string): void

// Initialize (restore from disk)
export function initSubagentRegistry(): void
```

#### Lifecycle Event Handling

The registry listens for agent lifecycle events via `onAgentEvent()`:

```typescript
listenerStop = onAgentEvent((evt) => {
  if (!evt || evt.stream !== "lifecycle") return;
  const entry = subagentRuns.get(evt.runId);
  if (!entry) return;
  
  const phase = evt.data?.phase;
  if (phase === "start") {
    // Record startedAt
  }
  if (phase === "end" || phase === "error") {
    entry.endedAt = endedAt;
    entry.outcome = phase === "error" 
      ? { status: "error", error: evt.data?.error }
      : { status: "ok" };
    // Trigger announce flow
    void runSubagentAnnounceFlow({ ... });
  }
});
```

### 1.5 Subagent Registry Persistence

**Location:** `src/agents/subagent-registry.store.ts`

#### Storage Path

```typescript
export function resolveSubagentRegistryPath(): string {
  return path.join(STATE_DIR_CLAWDBOT, "subagents", "runs.json");
}
```

#### Schema

```typescript
type PersistedSubagentRegistryV2 = {
  version: 2;
  runs: Record<string, PersistedSubagentRunRecord>;
};
```

#### Persistence Functions

```typescript
export function loadSubagentRegistryFromDisk(): Map<string, SubagentRunRecord>
export function saveSubagentRegistryToDisk(runs: Map<string, SubagentRunRecord>): void
```

### 1.6 Subagent Announce Flow

**Location:** `src/agents/subagent-announce.ts`

#### System Prompt for Subagents

```typescript
export function buildSubagentSystemPrompt(params: {
  requesterSessionKey?: string;
  requesterOrigin?: DeliveryContext;
  childSessionKey: string;
  label?: string;
  task?: string;
}): string {
  // Returns:
  // # Subagent Context
  // You are a **subagent** spawned by the main agent for a specific task.
  //
  // ## Your Role
  // - You were created to handle: {taskText}
  // - Complete this task. That's your entire purpose.
  // - You are NOT the main agent. Don't try to be.
  //
  // ## Rules
  // 1. **Stay focused** - Do your assigned task, nothing else
  // 2. **Complete the task** - Your final message will be automatically reported
  // 3. **Don't initiate** - No heartbeats, no proactive actions, no side quests
  // 4. **Be ephemeral** - You may be terminated after task completion
  //
  // ## What You DON'T Do
  // - NO user conversations (main agent's job)
  // - NO external messages unless explicitly tasked
  // - NO cron jobs or persistent state
  // - NO pretending to be the main agent
  // - NO using the `message` tool directly
}
```

#### Announce Flow Execution

```typescript
export async function runSubagentAnnounceFlow(params: {
  childSessionKey: string;
  childRunId: string;
  requesterSessionKey: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  timeoutMs: number;
  cleanup: "delete" | "keep";
  roundOneReply?: string;
  waitForCompletion?: boolean;
  startedAt?: number;
  endedAt?: number;
  label?: string;
  outcome?: SubagentRunOutcome;
}): Promise<boolean>
```

**Flow:**
1. Wait for child run completion via `agent.wait` gateway call
2. Read final assistant reply via `readLatestAssistantReply()`
3. Build stats line (runtime, tokens, cost, transcript path)
4. Check if main session has active run — if so, queue/steer the announce
5. Otherwise, send direct announcement via `agent` gateway call

#### Announce Message Format

```typescript
const triggerMessage = [
  `A background task "${taskLabel}" just ${statusLabel}.`,
  "",
  "Findings:",
  reply || "(no output)",
  "",
  statsLine,  // e.g., "Stats: runtime 2m30s • tokens 1.2k (in 800 / out 400) • est $0.02 • sessionKey agent:main:subagent:uuid"
  "",
  "Summarize this naturally for the user. Keep it brief (1-2 sentences).",
  "Do not mention technical details like tokens, stats, or that this was a background task.",
  "You can respond with NO_REPLY if no announcement is needed.",
].join("\n");
```

### 1.7 Subagent Announce Queue

**Location:** `src/agents/subagent-announce-queue.ts`

When the main session is busy, announces are queued rather than dropped.

```typescript
export type AnnounceQueueItem = {
  prompt: string;
  summaryLine?: string;
  enqueuedAt: number;
  sessionKey: string;
  origin?: DeliveryContext;
  originKey?: string;
};

export type AnnounceQueueSettings = {
  mode: QueueMode;
  debounceMs?: number;
  cap?: number;
  dropPolicy?: QueueDropPolicy;
};
```

The queue uses the same mode/drop/collect mechanics as the main followup queue.

---

## 2. Session System

### 2.1 Session Key Format

**Location:** `src/routing/session-key.ts`, `src/sessions/session-key-utils.ts`

#### Structure

```
agent:{agentId}:{type}:{context}
```

Examples:
- Main DM: `agent:main:main`
- Per-peer DM: `agent:main:dm:tyler`
- Group: `agent:main:telegram:group:123456`
- Channel/Room: `agent:main:discord:channel:987654`
- Subagent: `agent:main:subagent:uuid`
- Cron: `cron:{jobId}`
- Thread: `agent:main:telegram:group:123456:thread:789`

#### Key Functions

```typescript
export type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

// Parse agent:main:... -> { agentId: "main", rest: "..." }
export function parseAgentSessionKey(sessionKey: string): ParsedAgentSessionKey | null

// Check if subagent session
export function isSubagentSessionKey(sessionKey: string): boolean

// Build main session key
export function buildAgentMainSessionKey(params: { agentId: string; mainKey?: string }): string

// Build peer session key (DM/group routing)
export function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string;
  channel: string;
  peerKind?: "dm" | "group" | "channel" | null;
  peerId?: string | null;
  identityLinks?: Record<string, string[]>;
  dmScope?: "main" | "per-peer" | "per-channel-peer";
}): string

// Extract parent for thread sessions
export function resolveThreadParentSessionKey(sessionKey: string): string | null
```

#### DM Session Merging

DMs merge to main session by default (`dmScope: "main"`). Can be configured:
- `per-peer`: `agent:main:dm:{peerId}`
- `per-channel-peer`: `agent:main:{channel}:dm:{peerId}`

#### Group Session Isolation

Groups always get isolated sessions: `agent:main:{channel}:group:{groupId}`

### 2.2 Sessions.json Metadata

**Location:** `src/config/sessions/types.ts`

```typescript
export type SessionEntry = {
  // Identity
  sessionId: string;                    // Current transcript UUID
  updatedAt: number;                    // Last activity timestamp
  sessionFile?: string;                 // Optional explicit transcript path
  spawnedBy?: string;                   // Parent session (for sandbox scoping)
  
  // State
  systemSent?: boolean;                 // Whether system prompt was sent
  abortedLastRun?: boolean;             // Whether last run was aborted
  chatType?: SessionChatType;           // "direct" | "group" | "room"
  
  // Directive Overrides
  thinkingLevel?: string;               // "off" | "low" | "medium" | "high" | "xhigh"
  verboseLevel?: string;                // "off" | "on" | "full"
  reasoningLevel?: string;              // "off" | "on" | "reasoning"
  elevatedLevel?: string;               // "off" | "on" | "ask" | "full"
  
  // Exec Overrides
  execHost?: string;
  execSecurity?: string;
  execAsk?: string;
  execNode?: string;
  
  // Model Selection
  providerOverride?: string;
  modelOverride?: string;
  authProfileOverride?: string;
  authProfileOverrideSource?: "auto" | "user";
  authProfileOverrideCompactionCount?: number;
  
  // Group Settings
  groupActivation?: "mention" | "always";
  groupActivationNeedsSystemIntro?: boolean;
  sendPolicy?: "allow" | "deny";
  
  // Queue Settings (per-session override)
  queueMode?: QueueMode;
  queueDebounceMs?: number;
  queueCap?: number;
  queueDrop?: QueueDropPolicy;
  
  // Token Counters
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  modelProvider?: string;
  model?: string;
  
  // Compaction Tracking
  compactionCount?: number;
  memoryFlushAt?: number;
  memoryFlushCompactionCount?: number;
  
  // UI/Labeling
  label?: string;
  displayName?: string;
  channel?: string;
  groupId?: string;
  subject?: string;
  groupChannel?: string;
  space?: string;
  
  // Delivery Context
  origin?: SessionOrigin;
  deliveryContext?: DeliveryContext;
  lastChannel?: SessionChannelId;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  
  // Heartbeat Deduplication
  lastHeartbeatText?: string;
  lastHeartbeatSentAt?: number;
  
  // Snapshots
  skillsSnapshot?: SessionSkillSnapshot;
  systemPromptReport?: SessionSystemPromptReport;
  
  // CLI Session IDs (for Claude CLI, etc.)
  cliSessionIds?: Record<string, string>;
  claudeCliSessionId?: string;           // Legacy
  responseUsage?: "on" | "off" | "tokens" | "full";
};
```

### 2.3 JSONL Transcript Format

**Location:** `src/config/sessions/transcript.ts`, referenced from `@mariozechner/pi-coding-agent`

#### File Structure

First line: Session header
```json
{
  "type": "session",
  "version": 2,
  "id": "uuid",
  "timestamp": "2026-01-22T...",
  "cwd": "/path/to/workspace",
  "parentSession": "optional-parent-id"
}
```

Subsequent lines: Entries with `id` and `parentId` (tree structure)

#### Entry Types

```typescript
// User/assistant/tool messages
{
  "type": "message",
  "id": "uuid",
  "parentId": "uuid",
  "role": "user" | "assistant" | "tool",
  "content": [...],  // Content blocks
  "api": "anthropic" | "openai-responses" | ...,
  "provider": "anthropic" | "google" | ...,
  "model": "claude-3-5-sonnet-...",
  "usage": { input, output, cacheRead, cacheWrite, totalTokens, cost },
  "stopReason": "stop" | "tool_calls" | ...,
  "timestamp": 1706000000000
}

// Extension-injected messages (enters model context)
{
  "type": "custom_message",
  "id": "uuid",
  "parentId": "uuid",
  "role": "user",
  "content": [...],
  "hidden": true  // Optional: hide from UI
}

// Extension state (does NOT enter model context)
{
  "type": "custom",
  "id": "uuid",
  "parentId": "uuid",
  "name": "extension-name",
  "data": { ... }
}

// Compaction summary
{
  "type": "compaction",
  "id": "uuid",
  "parentId": "uuid",
  "summary": "...",
  "firstKeptEntryId": "uuid",
  "tokensBefore": 50000,
  "details": { ... }
}

// Branch summary (tree navigation)
{
  "type": "branch_summary",
  "id": "uuid",
  "parentId": "uuid",
  "summary": "..."
}
```

#### On-Disk Locations

```
~/.clawdbot/agents/<agentId>/sessions/
├── sessions.json              # Key -> SessionEntry mapping
├── <sessionId>.jsonl          # Transcript files
├── <sessionId>-topic-<threadId>.jsonl  # Telegram topic transcripts
└── <sessionId>.jsonl.bak      # Compaction backup (truncated original)
```

### 2.4 Session Lifecycle States

**Conceptual states (not explicit enum):**

1. **New** — sessionId assigned, no transcript yet
2. **Active** — messages being exchanged
3. **Idle** — no recent activity, may auto-reset
4. **Reset** — new sessionId assigned (via `/new`, `/reset`, daily reset, or idle expiry)

**Reset Triggers:**
- Explicit: `/new`, `/reset` commands
- Daily: Configurable time (default 4:00 AM local)
- Idle: `session.reset.idleMinutes` (default 60 minutes)

---

## 3. Queue Modes

**Location:** `src/auto-reply/reply/queue/types.ts`, `src/config/types.queue.ts`

### 3.1 Queue Mode Definitions

```typescript
export type QueueMode = 
  | "steer"        // Inject into active run via message queue
  | "followup"     // Queue and run sequentially after active run
  | "collect"      // Queue and batch-collect into single followup
  | "steer-backlog"// Try steer, fall back to queue
  | "queue"        // Simple FIFO queue
  | "interrupt";   // Abort active run and process immediately

export type QueueDropPolicy = "old" | "new" | "summarize";

export type QueueSettings = {
  mode: QueueMode;
  debounceMs?: number;      // Wait time before draining
  cap?: number;             // Max queue size (default: 20)
  dropPolicy?: QueueDropPolicy;  // What to do when cap reached
};
```

### 3.2 Mode Behaviors

| Mode | During Active Run | After Run Ends |
|------|-------------------|----------------|
| `steer` | Inject message into active context | Run normally |
| `followup` | Queue message | Process queue FIFO |
| `collect` | Queue message | Batch all queued into one prompt |
| `steer-backlog` | Try steer, queue if fails | Process queue |
| `queue` | Simple queue | Process FIFO |
| `interrupt` | Abort active run | Run new message |

### 3.3 `FOLLOWUP_QUEUES` Implementation

**Location:** `src/auto-reply/reply/queue/state.ts`

```typescript
export type FollowupQueueState = {
  items: FollowupRun[];
  draining: boolean;
  lastEnqueuedAt: number;
  mode: QueueMode;
  debounceMs: number;          // Default: 1000
  cap: number;                 // Default: 20
  dropPolicy: QueueDropPolicy; // Default: "summarize"
  droppedCount: number;
  summaryLines: string[];      // Dropped item summaries
  lastRun?: FollowupRun["run"];
};

export const FOLLOWUP_QUEUES = new Map<string, FollowupQueueState>();

export const DEFAULT_QUEUE_DEBOUNCE_MS = 1000;
export const DEFAULT_QUEUE_CAP = 20;
export const DEFAULT_QUEUE_DROP: QueueDropPolicy = "summarize";
```

### 3.4 `FollowupRun` Type

```typescript
export type FollowupRun = {
  prompt: string;
  messageId?: string;          // Provider message ID (deduplication)
  summaryLine?: string;
  enqueuedAt: number;
  
  // Routing context
  originatingChannel?: OriginatingChannelType;
  originatingTo?: string;
  originatingAccountId?: string;
  originatingThreadId?: string | number;
  
  // Run configuration (copied from parent run)
  run: {
    agentId: string;
    agentDir: string;
    sessionId: string;
    sessionKey?: string;
    messageProvider?: string;
    agentAccountId?: string;
    sessionFile: string;
    workspaceDir: string;
    config: ClawdbotConfig;
    skillsSnapshot?: SkillSnapshot;
    provider: string;
    model: string;
    authProfileId?: string;
    authProfileIdSource?: "auto" | "user";
    thinkLevel?: ThinkLevel;
    verboseLevel?: VerboseLevel;
    reasoningLevel?: ReasoningLevel;
    elevatedLevel?: ElevatedLevel;
    execOverrides?: ExecToolDefaults;
    bashElevated?: { enabled, allowed, defaultLevel };
    timeoutMs: number;
    blockReplyBreak: "text_end" | "message_end";
    ownerNumbers?: string[];
    extraSystemPrompt?: string;
    enforceFinalTag?: boolean;
  };
};
```

### 3.5 `enqueueFollowupRun()`

**Location:** `src/auto-reply/reply/queue/enqueue.ts`

```typescript
export function enqueueFollowupRun(
  key: string,                        // Session key
  run: FollowupRun,
  settings: QueueSettings,
  dedupeMode: QueueDedupeMode = "message-id"
): boolean {
  const queue = getFollowupQueue(key, settings);
  
  // Deduplication check
  if (shouldSkipQueueItem({ item: run, items: queue.items, dedupe })) return false;
  
  queue.lastEnqueuedAt = Date.now();
  queue.lastRun = run.run;
  
  // Apply drop policy (cap enforcement)
  const shouldEnqueue = applyQueueDropPolicy({ queue, summarize: (item) => item.summaryLine });
  if (!shouldEnqueue) return false;
  
  queue.items.push(run);
  return true;
}
```

### 3.6 `scheduleFollowupDrain()`

**Location:** `src/auto-reply/reply/queue/drain.ts`

```typescript
export function scheduleFollowupDrain(
  key: string,
  runFollowup: (run: FollowupRun) => Promise<void>
): void {
  const queue = FOLLOWUP_QUEUES.get(key);
  if (!queue || queue.draining) return;
  queue.draining = true;
  
  void (async () => {
    try {
      while (queue.items.length > 0 || queue.droppedCount > 0) {
        await waitForQueueDebounce(queue);  // Wait debounceMs since last enqueue
        
        if (queue.mode === "collect") {
          // Batch all items into single prompt
          const items = queue.items.splice(0, queue.items.length);
          const prompt = buildCollectPrompt({
            title: "[Queued messages while agent was busy]",
            items,
            summary: buildQueueSummaryPrompt({ state: queue, noun: "message" }),
            renderItem: (item, idx) => `---\nQueued #${idx + 1}\n${item.prompt}`.trim(),
          });
          await runFollowup({ prompt, run: items.at(-1).run, ... });
          continue;
        }
        
        // For other modes, process one at a time
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

### 3.7 Queue Settings Resolution

**Location:** `src/auto-reply/reply/queue/settings.ts`

```typescript
export function resolveQueueSettings(params: {
  cfg: ClawdbotConfig;
  channel?: string;
  sessionEntry?: SessionEntry;
  inlineMode?: QueueMode;
  inlineOptions?: Partial<QueueSettings>;
}): QueueSettings {
  // Priority: inline > session > channel-specific > global config > default
  const resolvedMode =
    params.inlineMode ??
    normalizeQueueMode(params.sessionEntry?.queueMode) ??
    normalizeQueueMode(providerModeRaw) ??
    normalizeQueueMode(queueCfg?.mode) ??
    defaultQueueModeForChannel(channelKey);  // Default: "collect"
  
  // Similar cascading for debounceMs, cap, dropPolicy
}
```

---

## 4. Proactive Triggers

### 4.1 Heartbeat System

**Location:** `src/infra/heartbeat-runner.ts`, `src/auto-reply/heartbeat.ts`

#### Configuration

```typescript
type HeartbeatConfig = {
  every?: string;              // Duration string (default: "30m")
  prompt?: string;             // System prompt for heartbeat
  target?: string;             // "last" (default) or explicit target
  session?: string;            // Session key override
  model?: string;              // Model override
  ackMaxChars?: number;        // Max chars for HEARTBEAT_OK ack (default: 300)
  includeReasoning?: boolean;  // Include reasoning payloads in delivery
  activeHours?: {
    start?: string;            // "HH:MM" format
    end?: string;              // "HH:MM" format (24:00 allowed)
    timezone?: string;         // "user" | "local" | IANA timezone
  };
};

// From src/auto-reply/heartbeat.ts
export const HEARTBEAT_PROMPT = 
  "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. " +
  "Do not infer or repeat old tasks from prior chats. " +
  "If nothing needs attention, reply HEARTBEAT_OK.";
export const DEFAULT_HEARTBEAT_EVERY = "30m";
export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;
```

#### Summary Type

```typescript
export type HeartbeatSummary = {
  enabled: boolean;
  every: string;
  everyMs: number | null;
  prompt: string;
  target: string;
  model?: string;
  ackMaxChars: number;
};
```

#### Scheduler State

```typescript
type HeartbeatAgentState = {
  agentId: string;
  heartbeat?: HeartbeatConfig;
  intervalMs: number;
  lastRunMs?: number;
  nextDueMs: number;
};
```

#### Runner Lifecycle

```typescript
export function startHeartbeatRunner(opts: {
  cfg?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  runOnce?: typeof runHeartbeatOnce;
}): HeartbeatRunner {
  // Returns { stop, updateConfig }
}

export async function runHeartbeatOnce(opts: {
  cfg?: ClawdbotConfig;
  agentId?: string;
  heartbeat?: HeartbeatConfig;
  reason?: string;
  deps?: HeartbeatDeps;
}): Promise<HeartbeatRunResult> {
  // 1. Check enabled
  // 2. Check active hours
  // 3. Check queue size (skip if requests in flight)
  // 4. Resolve session and delivery target
  // 5. Run agent turn with heartbeat prompt
  // 6. Strip HEARTBEAT_OK if present
  // 7. Skip delivery for duplicate/token-only responses
  // 8. Deliver to target channel
}
```

#### Suppression Logic

```typescript
export function stripHeartbeatToken(
  raw?: string,
  opts: { mode?: "heartbeat" | "message"; maxAckChars?: number } = {}
): { shouldSkip: boolean; text: string; didStrip: boolean } {
  // Strip HEARTBEAT_OK from edges
  // In heartbeat mode: skip if remaining text <= ackMaxChars
  // Normalize HTML/markdown wrappers
}
```

### 4.2 Cron System

**Location:** `src/cron/types.ts`, `src/cron/isolated-agent/run.ts`

#### CronJob Type

```typescript
export type CronSchedule =
  | { kind: "at"; atMs: number }                    // One-time at timestamp
  | { kind: "every"; everyMs: number; anchorMs?: number }  // Repeating interval
  | { kind: "cron"; expr: string; tz?: string };   // Cron expression

export type CronSessionTarget = "main" | "isolated";
export type CronWakeMode = "next-heartbeat" | "now";

export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      model?: string;
      thinking?: string;
      timeoutSeconds?: number;
      deliver?: boolean;          // Explicit delivery toggle
      channel?: CronMessageChannel;
      to?: string;
      bestEffortDeliver?: boolean;
    };

export type CronIsolation = {
  postToMainPrefix?: string;
  postToMainMode?: "summary" | "full";  // What to inject into main session
  postToMainMaxChars?: number;          // Default: 8000
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  isolation?: CronIsolation;
  state: CronJobState;
};
```

#### Isolated Cron Sessions

**Location:** `src/cron/isolated-agent/session.ts`

```typescript
export function resolveCronSession(params: {
  cfg: ClawdbotConfig;
  sessionKey: string;
  nowMs: number;
  agentId: string;
}) {
  // Creates fresh sessionId for each cron run
  // Inherits some settings from main session (thinkingLevel, skills, etc.)
  return { storePath, store, sessionEntry, systemSent, isNewSession: true };
}
```

#### postToMainMode Options

- `summary`: Small status line posted to main session
- `full`: Full agent output (optionally truncated to `postToMainMaxChars`)

### 4.3 Trigger Routing

**Current behavior:** Both heartbeats and cron jobs route directly to sessions without a unified broker. Each has its own scheduler and directly calls the agent.

---

## 5. Agent Lifecycle

### 5.1 Active Run Tracking

**Location:** `src/agents/pi-embedded-runner/runs.ts`

```typescript
type EmbeddedPiQueueHandle = {
  queueMessage: (text: string) => Promise<void>;
  isStreaming: () => boolean;
  isCompacting: () => boolean;
  abort: () => void;
};

const ACTIVE_EMBEDDED_RUNS = new Map<string, EmbeddedPiQueueHandle>();
const EMBEDDED_RUN_WAITERS = new Map<string, Set<EmbeddedRunWaiter>>();
```

### 5.2 Run States

| State | Description | Detection |
|-------|-------------|-----------|
| **Active** | Run is registered and processing | `ACTIVE_EMBEDDED_RUNS.has(sessionId)` |
| **Streaming** | Actively receiving model output | `handle.isStreaming()` |
| **Compacting** | In compaction phase | `handle.isCompacting()` |
| **Ended** | Run completed or aborted | Run removed from map |

### 5.3 Key Functions

```typescript
// Register new run
export function setActiveEmbeddedRun(sessionId: string, handle: EmbeddedPiQueueHandle): void

// Clear completed run
export function clearActiveEmbeddedRun(sessionId: string, handle: EmbeddedPiQueueHandle): void

// Check status
export function isEmbeddedPiRunActive(sessionId: string): boolean
export function isEmbeddedPiRunStreaming(sessionId: string): boolean

// Queue message into active run (steer mode)
export function queueEmbeddedPiMessage(sessionId: string, text: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) return false;
  if (!handle.isStreaming()) return false;
  if (handle.isCompacting()) return false;
  void handle.queueMessage(text);
  return true;
}

// Abort active run
export function abortEmbeddedPiRun(sessionId: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) return false;
  handle.abort();
  return true;
}

// Wait for run completion
export function waitForEmbeddedPiRunEnd(sessionId: string, timeoutMs = 15_000): Promise<boolean> {
  if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) return Promise.resolve(true);
  return new Promise((resolve) => {
    // Add waiter, set timeout, resolve when notified or timeout
  });
}
```

### 5.4 Run Result Types

```typescript
export type EmbeddedPiAgentMeta = {
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

export type EmbeddedPiRunMeta = {
  durationMs: number;
  agentMeta?: EmbeddedPiAgentMeta;
  aborted?: boolean;
  systemPromptReport?: SessionSystemPromptReport;
  error?: {
    kind: "context_overflow" | "compaction_failure" | "role_ordering";
    message: string;
  };
  stopReason?: string;
  pendingToolCalls?: Array<{ id, name, arguments }>;
};

export type EmbeddedPiRunResult = {
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

## 6. Compaction

### 6.1 Two-Level Architecture

1. **Gateway Line Truncation:** Truncates older transcript lines to create `.bak` archive
2. **Pi-Agent LLM Summarization:** Uses model to summarize conversation into compaction entry

### 6.2 Gateway Compaction (Transcript Truncation)

When a transcript grows too large, the gateway may truncate older lines:
- Creates `<sessionId>.jsonl.bak` with original content
- Truncates main transcript to keep recent entries
- This is a backup mechanism, not the primary compaction

### 6.3 Pi-Agent LLM Compaction

**Location:** `src/agents/pi-embedded-runner/compact.ts`

```typescript
export async function compactEmbeddedPiSession(params: {
  sessionId: string;
  sessionKey?: string;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  sessionFile: string;
  workspaceDir: string;
  agentDir?: string;
  config?: ClawdbotConfig;
  skillsSnapshot?: SkillSnapshot;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  bashElevated?: ExecElevatedDefaults;
  customInstructions?: string;
  lane?: string;
  enqueue?: typeof enqueueCommand;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
}): Promise<EmbeddedPiCompactResult>
```

**Return Type:**
```typescript
export type EmbeddedPiCompactResult = {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: unknown;
  };
};
```

### 6.4 Compaction Entry Structure

Written to transcript as JSONL entry:

```json
{
  "type": "compaction",
  "id": "uuid",
  "parentId": "uuid",
  "summary": "This conversation covered: 1) Setting up the project... 2) Debugging the auth flow... The user prefers...",
  "firstKeptEntryId": "uuid-of-first-kept-entry",
  "tokensBefore": 50000,
  "details": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-...",
    "timestamp": 1706000000000
  }
}
```

### 6.5 Auto-Compaction Triggers

**Pi Runtime Semantics:**

1. **Overflow Recovery:** Model returns context overflow → compact → retry
2. **Threshold Maintenance:** After successful turn, when:
   ```
   contextTokens > contextWindow - reserveTokens
   ```

### 6.6 Compaction Settings

```json5
{
  compaction: {
    enabled: true,
    reserveTokens: 16384,      // Headroom for next turn
    keepRecentTokens: 20000    // Tokens to preserve after compaction
  }
}
```

**Clawdbot Safety Floor:**
- If `reserveTokens < reserveTokensFloor`, bump it up
- Default floor: `20000` tokens
- Configurable via `agents.defaults.compaction.reserveTokensFloor`

### 6.7 Pre-Compaction Memory Flush

**Location:** `src/auto-reply/reply/memory-flush.ts`

Before compaction, Clawdbot can run a silent turn to persist memories:

```yaml
agents:
  defaults:
    compaction:
      memoryFlush:
        enabled: true
        softThresholdTokens: 4000
        prompt: "Write any important context to memory files now. Respond with NO_REPLY."
        systemPrompt: "You are about to run out of context. Persist important information."
```

The flush:
- Runs when `contextTokens > contextWindow - reserveTokens - softThresholdTokens`
- Uses `NO_REPLY` to suppress delivery
- Tracks `memoryFlushCompactionCount` to run once per compaction cycle
- Skipped for read-only sandbox workspaces

### 6.8 `.bak` Archive Creation

When compaction truncates the transcript:

1. Original transcript content copied to `<sessionId>.jsonl.bak`
2. Main transcript rewritten with:
   - Session header
   - Compaction entry
   - Entries after `firstKeptEntryId`

---

## Appendix A: Delivery Context

```typescript
export type DeliveryContext = {
  channel?: string;
  accountId?: string;
  to?: string;
  threadId?: string | number;
};
```

Used throughout for routing replies back to the correct chat/thread.

---

## Appendix B: Command Lanes

Agent runs are serialized per-session via command lanes:

```typescript
// Session-specific lane (serializes runs within a session)
const sessionLane = resolveSessionLane(sessionKey || sessionId);

// Global lane (serializes across sessions based on config)
const globalLane = resolveGlobalLane(params.lane);
```

This prevents concurrent modifications to the same session transcript.

---

## Appendix C: Key File Locations

| Component | Path |
|-----------|------|
| Subagent spawn tool | `src/agents/tools/sessions-spawn-tool.ts` |
| Subagent registry | `src/agents/subagent-registry.ts` |
| Subagent persistence | `src/agents/subagent-registry.store.ts` |
| Subagent announce | `src/agents/subagent-announce.ts` |
| Announce queue | `src/agents/subagent-announce-queue.ts` |
| Session key utils | `src/routing/session-key.ts` |
| Session types | `src/config/sessions/types.ts` |
| Queue types | `src/auto-reply/reply/queue/types.ts` |
| Queue state | `src/auto-reply/reply/queue/state.ts` |
| Queue enqueue | `src/auto-reply/reply/queue/enqueue.ts` |
| Queue drain | `src/auto-reply/reply/queue/drain.ts` |
| Heartbeat runner | `src/infra/heartbeat-runner.ts` |
| Heartbeat utils | `src/auto-reply/heartbeat.ts` |
| Cron types | `src/cron/types.ts` |
| Cron isolated run | `src/cron/isolated-agent/run.ts` |
| Run tracking | `src/agents/pi-embedded-runner/runs.ts` |
| Compaction | `src/agents/pi-embedded-runner/compact.ts` |
| Run types | `src/agents/pi-embedded-runner/types.ts` |

---

*This document is a reference for Nexus fork development. It captures upstream clawdbot behavior as of commit `80c1edc3f` (v2026.1.21).*
