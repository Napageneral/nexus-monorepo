# OpenClaw Compaction System

> **Source:** `~/nexus/home/projects/openclaw/`
> **Key Files:** `src/agents/compaction.ts`, `src/agents/pi-embedded-runner/compact.ts`, `src/agents/pi-extensions/compaction-safeguard.ts`

OpenClaw's compaction system summarizes old messages to stay within model context limits. This document captures the battle-tested logic for porting to Nexus.

---

## 1. Compaction Triggers

### When Compaction Happens

1. **Auto-compaction (context overflow):** When a session nears or exceeds the model's context window, OpenClaw triggers auto-compaction and retries the original request.

2. **Manual compaction:** User sends `/compact [optional instructions]` to force a compaction pass.

3. **Overflow recovery:** If a prompt fails with context overflow error, the system attempts auto-compaction then retries once.

### Token Counting and Thresholds

Token estimation is done via `estimateTokens()` from `@mariozechner/pi-coding-agent`:

```typescript
function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message), 0);
}
```

Context window is resolved from the model definition:

```typescript
function resolveContextWindowTokens(model?: ExtensionContext["model"]): number {
  return Math.max(1, Math.floor(model?.contextWindow ?? DEFAULT_CONTEXT_TOKENS));
}
```

**Default context tokens:** `200_000` (from `DEFAULT_CONTEXT_TOKENS`)

### Reserve Tokens Concept

Reserve tokens ensure headroom for:
- The compaction summarization call itself
- Pre-compaction memory flush turns
- Response generation after compaction

```typescript
const DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR = 20_000;

function ensurePiCompactionReserveTokens(params: {
  settingsManager: PiSettingsManagerLike;
  minReserveTokens?: number;
}): { didOverride: boolean; reserveTokens: number } {
  const minReserveTokens = params.minReserveTokens ?? DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR;
  const current = params.settingsManager.getCompactionReserveTokens();

  if (current >= minReserveTokens) {
    return { didOverride: false, reserveTokens: current };
  }

  params.settingsManager.applyOverrides({
    compaction: { reserveTokens: minReserveTokens },
  });

  return { didOverride: true, reserveTokens: minReserveTokens };
}
```

---

## 2. Compaction Process

### What Gets Summarized

The session history is split into:
- **Messages to summarize:** Older messages that will be replaced by a summary
- **Turn prefix messages:** Beginning of a split turn (if the current turn is being split)
- **Kept messages:** Recent messages retained after compaction

### The Summary Prompt (via generateSummary)

OpenClaw uses the SDK's `generateSummary()` function which:
1. Takes messages to summarize
2. Uses the same model being used for the session
3. Generates a concise summary preserving key decisions, TODOs, and context

For merging partial summaries:
```typescript
const MERGE_SUMMARIES_INSTRUCTIONS =
  "Merge these partial summaries into a single cohesive summary. Preserve decisions," +
  " TODOs, open questions, and any constraints.";
```

### Chunked Summarization (Safeguard Mode)

For very long histories, the `safeguard` mode uses **adaptive chunked summarization**:

```typescript
const BASE_CHUNK_RATIO = 0.4;   // 40% of context window per chunk
const MIN_CHUNK_RATIO = 0.15;   // Minimum 15% when messages are large
const SAFETY_MARGIN = 1.2;      // 20% buffer for token estimation inaccuracy

function computeAdaptiveChunkRatio(messages: AgentMessage[], contextWindow: number): number {
  if (messages.length === 0) return BASE_CHUNK_RATIO;

  const totalTokens = estimateMessagesTokens(messages);
  const avgTokens = totalTokens / messages.length;
  const safeAvgTokens = avgTokens * SAFETY_MARGIN;
  const avgRatio = safeAvgTokens / contextWindow;

  // If average message is > 10% of context, reduce chunk ratio
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return BASE_CHUNK_RATIO;
}
```

### Multi-Stage Summarization

```typescript
async function summarizeInStages(params: {
  messages: AgentMessage[];
  model: ExtensionContext["model"];
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
  parts?: number;
}): Promise<string>
```

Process:
1. Split messages into chunks by token share (default 2 parts)
2. Summarize each chunk independently
3. Merge partial summaries into final summary
4. Handle oversized messages gracefully (note them, skip from summarization)

### What's Kept vs. Discarded

**Kept:**
- The compaction summary (replaces all old messages)
- Recent messages after `firstKeptEntryId`
- Tool failure summaries (so the model doesn't retry failed operations)
- File operations log (read/modified files)

**Discarded:**
- Original message content before `firstKeptEntryId`
- Full tool results (replaced by summary notes)
- Intermediate thinking/reasoning blocks

### Fallback Summary

When summarization fails:
```typescript
const FALLBACK_SUMMARY =
  "Summary unavailable due to context limits. Older messages were truncated.";
```

With tool failures and file ops appended if available.

---

## 3. Compaction Entry Format

### The `compaction` Entry in JSONL

Compaction persists to the session's JSONL history file. The result type:

```typescript
type EmbeddedPiCompactResult = {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    summary: string;           // The generated summary text
    firstKeptEntryId: string;  // Entry ID where kept messages start
    tokensBefore: number;      // Token count before compaction
    tokensAfter?: number;      // Token count after (if estimated)
    details?: unknown;         // Additional metadata (file ops, etc.)
  };
};
```

### Field Meanings

| Field | Description |
|-------|-------------|
| `summary` | The LLM-generated summary of compacted messages |
| `firstKeptEntryId` | The entry ID marking where "kept" messages begin; messages before this are replaced by the summary |
| `tokensBefore` | Total token count of all messages before compaction |
| `tokensAfter` | Estimated tokens after compaction (sum of remaining message estimates) |
| `details` | Object with `{ readFiles: string[], modifiedFiles: string[] }` |

### How Context is Rebuilt After Compaction

When loading a session after compaction:
1. Read JSONL until hitting a compaction entry
2. The compaction entry's `summary` becomes the "prior context"
3. Messages from `firstKeptEntryId` onwards are the active history
4. Token counts from compaction are used for context tracking

Session store tracks compaction count:
```typescript
type SessionEntry = {
  // ... other fields
  compactionCount?: number;          // Total compactions for this session
  memoryFlushCompactionCount?: number; // Last compaction count when memory flush ran
};
```

---

## 4. Pre-Compaction Memory Flush

### Purpose

Before auto-compaction, OpenClaw runs a **silent agentic turn** to let the model save durable memories to disk. This preserves important context that might otherwise be lost in summarization.

### Trigger Conditions

```typescript
function shouldRunMemoryFlush(params: {
  entry?: Pick<SessionEntry, "totalTokens" | "compactionCount" | "memoryFlushCompactionCount">;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
}): boolean {
  const totalTokens = params.entry?.totalTokens;
  if (!totalTokens || totalTokens <= 0) return false;

  const contextWindow = Math.max(1, Math.floor(params.contextWindowTokens));
  const reserveTokens = Math.max(0, Math.floor(params.reserveTokensFloor));
  const softThreshold = Math.max(0, Math.floor(params.softThresholdTokens));
  
  // Threshold = contextWindow - reserveTokens - softThreshold
  const threshold = Math.max(0, contextWindow - reserveTokens - softThreshold);
  if (threshold <= 0) return false;
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

```typescript
const DEFAULT_MEMORY_FLUSH_SOFT_TOKENS = 4000;

const DEFAULT_MEMORY_FLUSH_PROMPT = [
  "Pre-compaction memory flush.",
  "Store durable memories now (use memory/YYYY-MM-DD.md; create memory/ if needed).",
  "If nothing to store, reply with NO_REPLY.",
].join(" ");

const DEFAULT_MEMORY_FLUSH_SYSTEM_PROMPT = [
  "Pre-compaction memory flush turn.",
  "The session is near auto-compaction; capture durable memories to disk.",
  "You may reply, but usually NO_REPLY is correct.",
].join(" ");
```

---

## 5. Plugin Hooks

### Available Hooks

```typescript
type PluginHookName =
  | "before_compaction"
  | "after_compaction"
  // ... other hooks
```

### Hook Event Types

```typescript
// Before compaction - fired before summarization begins
type PluginHookBeforeCompactionEvent = {
  messageCount: number;
  tokenCount?: number;
};

// After compaction - fired after summary is written
type PluginHookAfterCompactionEvent = {
  messageCount: number;
  tokenCount?: number;
  compactedCount: number;  // Number of messages that were compacted
};
```

### Hook Registration

Plugins can register hooks via the plugin API:

```typescript
api.on("before_compaction", (event, ctx) => {
  // event: { messageCount, tokenCount? }
  // ctx: { agentId?, sessionKey?, workspaceDir?, messageProvider? }
  console.log(`Compacting ${event.messageCount} messages`);
});

api.on("after_compaction", (event, ctx) => {
  // event: { messageCount, tokenCount?, compactedCount }
  console.log(`Compacted ${event.compactedCount} messages`);
});
```

### Hook Execution

Compaction hooks are **void hooks** (fire-and-forget):
- Executed in parallel for performance
- Errors are caught and logged (don't block compaction)
- No return value expected

```typescript
async function runBeforeCompaction(
  event: PluginHookBeforeCompactionEvent,
  ctx: PluginHookAgentContext,
): Promise<void> {
  return runVoidHook("before_compaction", event, ctx);
}
```

### Extension Hook (SDK-Level)

The SDK provides a `session_before_compact` event for extensions:

```typescript
api.on("session_before_compact", async (event, ctx) => {
  const { preparation, customInstructions, signal } = event;
  // preparation contains:
  //   - messagesToSummarize: AgentMessage[]
  //   - turnPrefixMessages: AgentMessage[]
  //   - firstKeptEntryId: string
  //   - tokensBefore: number
  //   - previousSummary?: string
  //   - fileOps: FileOperations
  //   - settings: { reserveTokens: number }
  //   - isSplitTurn: boolean
  
  // Return custom compaction result:
  return {
    compaction: {
      summary: "Custom summary...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { readFiles, modifiedFiles },
    },
  };
});
```

---

## 6. Configuration

### Compaction Settings

```typescript
type AgentCompactionConfig = {
  /** Compaction summarization mode: "default" | "safeguard" */
  mode?: AgentCompactionMode;
  
  /** Minimum reserve tokens for compaction (default: 20000, 0 disables) */
  reserveTokensFloor?: number;
  
  /** Max share of context for history during safeguard pruning (0.1–0.9, default 0.5) */
  maxHistoryShare?: number;
  
  /** Pre-compaction memory flush settings */
  memoryFlush?: AgentCompactionMemoryFlushConfig;
};

type AgentCompactionMemoryFlushConfig = {
  /** Enable the pre-compaction memory flush (default: true) */
  enabled?: boolean;
  
  /** Soft threshold tokens before compaction limit (default: 4000) */
  softThresholdTokens?: number;
  
  /** User prompt for memory flush turn */
  prompt?: string;
  
  /** System prompt appended for memory flush turn */
  systemPrompt?: string;
};
```

### Example Configuration

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "safeguard",
        reserveTokensFloor: 24000,
        maxHistoryShare: 0.5,
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 6000,
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store.",
        },
      },
    },
  },
}
```

### Per-Agent Overrides

Compaction config is part of `agents.defaults`, applying to all agents. Per-agent model overrides can affect context window resolution, which indirectly affects compaction thresholds.

### Session Store Fields

```typescript
type SessionEntry = {
  // Token tracking
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  contextTokens?: number;
  
  // Compaction tracking
  compactionCount?: number;
  memoryFlushCompactionCount?: number;
};
```

After compaction, token counts are updated:
```typescript
if (tokensAfter != null && tokensAfter > 0) {
  updates.totalTokens = tokensAfter;
  updates.inputTokens = undefined;   // Clear breakdown
  updates.outputTokens = undefined;  // Only have total estimate
}
```

---

## 7. Error Handling and Recovery

### Overflow Recovery Flow

```typescript
// In the run loop:
let overflowCompactionAttempted = false;

// On context overflow error:
if (!isCompactionFailure && !overflowCompactionAttempted) {
  log.info(`context overflow detected; attempting auto-compaction`);
  overflowCompactionAttempted = true;
  
  const compactResult = await compactEmbeddedPiSessionDirect({...});
  
  if (compactResult.compacted) {
    log.info(`auto-compaction succeeded; retrying prompt`);
    // Retry the original prompt
  } else {
    log.warn(`auto-compaction failed: ${compactResult.reason}`);
    // Return error to user
  }
}
```

### Compaction Failure Handling

If compaction itself fails with context overflow:
- The error is marked as `compaction_failure` (not retried)
- Session may be reset and a new session started
- User is notified of the failure

### Safeguard Pruning

When history exceeds `maxHistoryShare` of context:
1. Split history into chunks
2. Drop oldest chunks until within budget
3. Summarize dropped chunks separately
4. Include dropped summary in main compaction

```typescript
function pruneHistoryForContextShare(params: {
  messages: AgentMessage[];
  maxContextTokens: number;
  maxHistoryShare?: number;  // default 0.5
  parts?: number;            // default 2
}): {
  messages: AgentMessage[];           // Kept messages
  droppedMessagesList: AgentMessage[]; // Dropped messages
  droppedChunks: number;
  droppedMessages: number;
  droppedTokens: number;
  keptTokens: number;
  budgetTokens: number;
}
```

---

## 8. Nexus Porting Notes

### Core Components to Port

1. **Token estimation:** `estimateMessagesTokens()` using per-message token counting
2. **Chunk splitting:** `splitMessagesByTokenShare()` and `chunkMessagesByMaxTokens()`
3. **Multi-stage summarization:** `summarizeInStages()` with progressive fallback
4. **Reserve tokens enforcement:** Ensure headroom for compaction calls
5. **Session store tracking:** `compactionCount`, `memoryFlushCompactionCount`, token fields

### Key Behaviors to Preserve

1. **Pre-compaction memory flush:** Give the model a chance to save important context
2. **Tool failure capture:** Include failed tool summaries to prevent retry loops
3. **File operations tracking:** Log which files were read/modified in the summary
4. **Graceful degradation:** Fallback summaries when LLM calls fail
5. **Adaptive chunking:** Smaller chunks for larger messages

### Configuration Surface

```typescript
// Minimum Nexus config
interface NexusCompactionConfig {
  mode: "default" | "safeguard";
  reserveTokensFloor: number;
  maxHistoryShare: number;
  memoryFlush: {
    enabled: boolean;
    softThresholdTokens: number;
    prompt: string;
    systemPrompt: string;
  };
}
```

### JSONL Entry Format for Nexus

```typescript
interface CompactionEntry {
  type: "compaction";
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  tokensAfter?: number;
  details?: {
    readFiles?: string[];
    modifiedFiles?: string[];
    toolFailures?: Array<{
      toolName: string;
      summary: string;
    }>;
  };
}
```
