# OpenClaw Streaming Output System

Reference documentation for how OpenClaw streams LLM responses with block chunking, coalescing, and human-like delivery timing.

**Source:** `/Users/tyler/nexus/home/projects/openclaw/`  
**Key Files:**
- `src/auto-reply/reply/block-reply-pipeline.ts` — Block streaming pipeline
- `src/auto-reply/reply/block-streaming.ts` — Coalescing configuration
- `src/auto-reply/reply/block-reply-coalescer.ts` — Text coalescing logic
- `src/auto-reply/reply/reply-dispatcher.ts` — Human delay timing

---

## 1. Overview

OpenClaw streams LLM responses in real-time, sending chunks to users as they're generated rather than waiting for the complete response.

### Why Streaming?

| Benefit | Description |
|---------|-------------|
| **Perceived speed** | Users see content immediately |
| **Long response handling** | Can show progress on lengthy replies |
| **Natural conversation** | Mimics human typing patterns |
| **Error recovery** | Partial content delivered even if LLM fails |

### Streaming Layers

```
LLM Response Stream
      │
      ▼
┌─────────────────┐
│ Block Pipeline  │  ← Receives text blocks from LLM
│ (deduplication) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Coalescer     │  ← Buffers small chunks, flushes on boundaries
│ (min/max chars) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Reply Dispatcher│  ← Adds human delays between chunks
│ (timing)        │
└────────┬────────┘
         │
         ▼
Platform Delivery
```

---

## 2. Block Reply Pipeline

**File:** `src/auto-reply/reply/block-reply-pipeline.ts`

The pipeline manages streaming block replies with deduplication and ordering.

### Interface

```typescript
type BlockReplyPipeline = {
  enqueue: (payload: ReplyPayload) => void;
  flush: (options?: { force?: boolean }) => Promise<void>;
  stop: () => void;
  hasBuffered: () => boolean;
  didStream: () => boolean;
  isAborted: () => boolean;
  hasSentPayload: (payload: ReplyPayload) => boolean;
};
```

### Pipeline Creation

```typescript
// block-reply-pipeline.ts:72-81
function createBlockReplyPipeline(params: {
  onBlockReply: (
    payload: ReplyPayload,
    options?: { abortSignal?: AbortSignal; timeoutMs?: number },
  ) => Promise<void> | void;
  timeoutMs: number;
  coalescing?: BlockStreamingCoalescing;
  buffer?: BlockReplyBuffer;
}): BlockReplyPipeline
```

### Deduplication

The pipeline tracks sent payloads to prevent duplicates:

```typescript
// block-reply-pipeline.ts:37-49
function createBlockReplyPayloadKey(payload: ReplyPayload): string {
  const text = payload.text?.trim() ?? "";
  const mediaList = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];
  return JSON.stringify({
    text,
    mediaList,
    replyToId: payload.replyToId ?? null,
  });
}
```

Key sets tracked:
- `sentKeys` — Already delivered
- `pendingKeys` — Currently being delivered
- `seenKeys` — Ever seen (for dedupe)
- `bufferedKeys` — In coalescer buffer

### Timeout Handling

If delivery times out, the pipeline aborts to preserve ordering:

```typescript
// block-reply-pipeline.ts:109-141
const timeoutError = new Error(`block reply delivery timed out after ${timeoutMs}ms`);
const abortController = new AbortController();

sendChain = sendChain
  .then(async () => {
    if (aborted) return false;
    await withTimeout(
      onBlockReply(payload, {
        abortSignal: abortController.signal,
        timeoutMs,
      }) ?? Promise.resolve(),
      timeoutMs,
      timeoutError,
    );
    return true;
  })
  .catch((err) => {
    if (err === timeoutError) {
      abortController.abort();
      aborted = true;
      logVerbose(
        `block reply delivery timed out; skipping remaining block replies`
      );
    }
  });
```

### Media Handling

Media payloads bypass coalescing and flush the buffer:

```typescript
// block-reply-pipeline.ts:195-206
const enqueue = (payload: ReplyPayload) => {
  if (aborted) return;
  
  const hasMedia = Boolean(payload.mediaUrl) || (payload.mediaUrls?.length ?? 0) > 0;
  if (hasMedia) {
    void coalescer?.flush({ force: true });
    sendPayload(payload);
    return;
  }
  
  if (coalescer) {
    coalescer.enqueue(payload);
    return;
  }
  
  sendPayload(payload);
};
```

---

## 3. Coalescing Configuration

**File:** `src/auto-reply/reply/block-streaming.ts`

Coalescing prevents sending too many small messages by buffering until thresholds are met.

### Configuration Type

```typescript
// block-streaming.ts:52-59
type BlockStreamingCoalescing = {
  minChars: number;     // Min chars before flush (default: 800)
  maxChars: number;     // Max chars per chunk (default: 1200)
  idleMs: number;       // Idle timeout for flush (default: 1000ms)
  joiner: string;       // Join character ("\n\n" for paragraphs)
  flushOnEnqueue?: boolean;  // Flush on paragraph boundaries
};
```

### Default Values

```typescript
// block-streaming.ts:12-14
const DEFAULT_BLOCK_STREAM_MIN = 800;
const DEFAULT_BLOCK_STREAM_MAX = 1200;
const DEFAULT_BLOCK_STREAM_COALESCE_IDLE_MS = 1000;
```

### Resolution Logic

```typescript
// block-streaming.ts:104-165
function resolveBlockStreamingCoalescing(
  cfg: OpenClawConfig | undefined,
  provider?: string,
  accountId?: string | null,
  chunking?: { minChars: number; maxChars: number; breakPreference: string },
  opts?: { chunkMode?: "length" | "newline" },
): BlockStreamingCoalescing | undefined {
  // 1. Get channel-specific defaults from dock
  const providerDefaults = providerId
    ? getChannelDock(providerId)?.streaming?.blockStreamingCoalesceDefaults
    : undefined;
  
  // 2. Get provider config (per-channel, per-account)
  const providerCfg = resolveProviderBlockStreamingCoalesce({
    cfg, providerKey, accountId,
  });
  
  // 3. Fall back to agent defaults
  const coalesceCfg = providerCfg ?? cfg?.agents?.defaults?.blockStreamingCoalesce;
  
  // 4. Resolve final values
  const minChars = Math.min(minRequested, maxChars);
  const idleMs = coalesceCfg?.idleMs ?? providerDefaults?.idleMs ?? 1000;
  
  // 5. Determine joiner based on break preference
  const joiner = preference === "sentence" ? " " 
               : preference === "newline" ? "\n" 
               : "\n\n";
  
  return { minChars, maxChars, idleMs, joiner, flushOnEnqueue };
}
```

### Break Preferences

| Preference | Joiner | Behavior |
|------------|--------|----------|
| `paragraph` | `\n\n` | Flush on double newlines |
| `newline` | `\n` | Flush on single newlines |
| `sentence` | ` ` | Flush on sentence boundaries |

### Flush on Paragraph Mode

When `chunkMode="newline"` is configured, the coalescer flushes eagerly on `\n\n` boundaries:

```typescript
// block-streaming.ts:100-101
// flushOnEnqueue: When true, flush buffer on each enqueue (paragraph-boundary flush)
flushOnEnqueue: chunkMode === "newline",
```

---

## 4. Coalescer Implementation

**File:** `src/auto-reply/reply/block-reply-coalescer.ts`

The coalescer buffers text and flushes based on character limits and idle time.

### Coalescer Interface

```typescript
type BlockReplyCoalescer = {
  enqueue: (payload: ReplyPayload) => void;
  flush: (options?: { force?: boolean }) => Promise<void>;
  stop: () => void;
  hasBuffered: () => boolean;
};
```

### Flush Conditions

The coalescer flushes when any of these conditions are met:

1. **Buffer exceeds `maxChars`** — Immediate flush
2. **Buffer >= `minChars` and idle for `idleMs`** — Timeout flush
3. **Paragraph boundary** (if `flushOnEnqueue`) — Eager flush on `\n\n`
4. **Explicit `flush({ force: true })`** — Manual flush (e.g., before media)
5. **Pipeline stop** — Final flush on completion

### Buffering Logic

```
Incoming text blocks
      │
      ▼
┌─────────────────────────────────────┐
│            Coalescer                │
│                                     │
│  buffer: "Hello, this is..."        │
│  chars: 342                         │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Check: chars >= maxChars?  │   │
│  │  Yes → Flush immediately    │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Check: chars >= minChars?  │   │
│  │  Yes → Start idle timer     │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Idle timer fires (1000ms)  │   │
│  │  → Flush buffer             │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Example Flow

```
Time    Event                           Buffer State
────────────────────────────────────────────────────────
0ms     Receive "Hello"                 "Hello" (5 chars)
10ms    Receive ", how are you?"        "Hello, how are you?" (19 chars)
50ms    Receive " I wanted to..."       Buffer grows (200 chars)
100ms   Receive paragraph...            Buffer at 800 chars, start timer
1100ms  Idle timer fires                FLUSH → Send 800 chars
1100ms  Receive more text               New buffer starts
1200ms  Receive "[[media:img.jpg]]"     Force flush → Send buffer
1200ms  Media payload sent separately
```

---

## 5. Human-Like Delays

**File:** `src/auto-reply/reply/reply-dispatcher.ts`

The reply dispatcher adds random delays between block replies to simulate natural typing.

### Delay Configuration

```typescript
// reply-dispatcher.ts:22-24
const DEFAULT_HUMAN_DELAY_MIN_MS = 800;
const DEFAULT_HUMAN_DELAY_MAX_MS = 2500;
```

### Delay Modes

| Mode | Behavior |
|------|----------|
| `"off"` | No delays (default) |
| `"on"` | Random 800-2500ms delays |
| `"custom"` | User-specified min/max |

### Delay Logic

```typescript
// reply-dispatcher.ts:26-39
function getHumanDelay(config: HumanDelayConfig | undefined): number {
  const mode = config?.mode ?? "off";
  if (mode === "off") return 0;
  
  const min = mode === "custom" 
    ? (config?.minMs ?? DEFAULT_HUMAN_DELAY_MIN_MS) 
    : DEFAULT_HUMAN_DELAY_MIN_MS;
  const max = mode === "custom" 
    ? (config?.maxMs ?? DEFAULT_HUMAN_DELAY_MAX_MS) 
    : DEFAULT_HUMAN_DELAY_MAX_MS;
  
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

### When Delays Apply

| Dispatch Kind | First Message | Subsequent |
|---------------|---------------|------------|
| `tool` | No delay | No delay |
| `block` | No delay | Human delay |
| `final` | No delay | No delay |

```typescript
// reply-dispatcher.ts:127-129
// Determine if we should add human-like delay (only for block replies after the first)
const shouldDelay = kind === "block" && sentFirstBlock;
if (kind === "block") sentFirstBlock = true;
```

---

## 6. Dispatch Flow Types

### Reply Payload

```typescript
type ReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  replyToId?: string;
  replyToTag?: boolean;
  replyToCurrent?: boolean;
  audioAsVoice?: boolean;
  isError?: boolean;
  channelData?: Record<string, unknown>;
};
```

### Dispatch Kinds

```typescript
type ReplyDispatchKind = "tool" | "block" | "final";
```

| Kind | Source | Example |
|------|--------|---------|
| `tool` | Tool execution result | "Searched for 'weather austin'" |
| `block` | Streaming LLM output | Paragraph of response text |
| `final` | Complete response | Final message after streaming |

---

## 7. Integration with Agent Runner

**File:** `src/auto-reply/reply/agent-runner.ts`

The agent runner creates and uses the block pipeline.

### Pipeline Setup

```typescript
// In runReplyAgent()
const blockPipeline = createBlockReplyPipeline({
  onBlockReply: (payload, options) => {
    // Send to dispatcher with TTS if enabled
    dispatcher.sendBlockReply(ttsPayload);
  },
  timeoutMs: blockReplyTimeoutMs,
  coalescing: resolveBlockStreamingCoalescing(cfg, provider, accountId),
  buffer: createAudioAsVoiceBuffer({
    isAudioPayload: (p) => Boolean(p.mediaUrl?.endsWith('.opus')),
  }),
});
```

### Block Reply Callbacks

The agent session emits blocks via callbacks:

```typescript
// Passed to agent session
onBlockReply: (payload: ReplyPayload, context?: { isComplete?: boolean }) => {
  blockPipeline.enqueue(payload);
},

onToolResult: (payload: ReplyPayload) => {
  dispatcher.sendToolResult(payload);
},
```

### Final Flush

After agent completes, the pipeline is flushed:

```typescript
// After agent turn completes
await blockPipeline.flush();
blockPipeline.stop();

// Build final payloads from any remaining content
const finalPayloads = buildReplyPayloads(/* ... */);
for (const payload of finalPayloads) {
  dispatcher.sendFinalReply(payload);
}
```

---

## 8. Complete Streaming Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          LLM Session                                 │
│                                                                     │
│  Token stream: "Hello" → ", how" → " are" → " you?" → "\n\n" → ... │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Block Reply Pipeline                             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Receive block payloads from agent session                   │   │
│  │  • Check for duplicates (sentKeys, pendingKeys)              │   │
│  │  • Handle media specially (force flush, send immediately)   │   │
│  └────────────────────────────────┬────────────────────────────┘   │
│                                   │                                 │
│                                   ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Coalescer                                                    │   │
│  │  • Buffer text until minChars (800)                          │   │
│  │  • Flush when maxChars (1200) or idle (1000ms)              │   │
│  │  • Join chunks with "\n\n" (paragraph mode)                  │   │
│  └────────────────────────────────┬────────────────────────────┘   │
│                                   │                                 │
│                                   ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Send to dispatcher (serialized chain)                       │   │
│  └────────────────────────────────┬────────────────────────────┘   │
└───────────────────────────────────│─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Reply Dispatcher                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Normalize payload                                            │   │
│  │  • Strip HEARTBEAT_OK, SILENT tokens                         │   │
│  │  • Apply response prefix                                      │   │
│  │  • Sanitize text                                              │   │
│  └────────────────────────────────┬────────────────────────────┘   │
│                                   │                                 │
│                                   ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Human delay (block replies after first)                      │   │
│  │  • Random 800-2500ms                                          │   │
│  │  • Skip for tool results and final                            │   │
│  └────────────────────────────────┬────────────────────────────┘   │
│                                   │                                 │
│                                   ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  deliver()                                                    │   │
│  └────────────────────────────────┬────────────────────────────┘   │
└───────────────────────────────────│─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    deliverOutboundPayloads()                         │
│                                                                     │
│  • Load channel adapter                                             │
│  • Apply platform formatting                                        │
│  • Chunk for platform limits (2000-4096 chars)                     │
│  • Send via platform API                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Configuration Examples

### Agent Defaults

```yaml
agents:
  defaults:
    blockStreamingChunk:
      minChars: 800
      maxChars: 1200
      breakPreference: paragraph  # or "newline" or "sentence"
    
    blockStreamingCoalesce:
      minChars: 800
      maxChars: 1200
      idleMs: 1000
```

### Per-Channel Override

```yaml
discord:
  blockStreamingCoalesce:
    minChars: 400    # Smaller chunks for Discord
    maxChars: 800
    idleMs: 500

telegram:
  blockStreamingCoalesce:
    minChars: 1000   # Larger chunks for Telegram
    maxChars: 2000
    idleMs: 1500
```

### Per-Account Override

```yaml
discord:
  accounts:
    bot-main:
      blockStreamingCoalesce:
        minChars: 600
        maxChars: 1000
```

### Human Delay Config

```yaml
agents:
  defaults:
    humanDelay:
      mode: "on"        # "off" | "on" | "custom"
      # For custom mode:
      # minMs: 500
      # maxMs: 1500
```

---

## 10. Mapping to Nexus

### Conceptual Mapping

| OpenClaw | Nexus Equivalent |
|----------|------------------|
| Block pipeline | Streaming response handler |
| Coalescer | Optional — may buffer at broker level |
| Human delays | Configurable per agent/channel |
| Reply dispatcher | Outbound adapter queue |

### Simplification Opportunities

1. **Single streaming layer** — Nexus may not need separate pipeline + coalescer
2. **Tool-level streaming** — Stream per tool rather than per block
3. **Adapter-managed timing** — Let outbound adapters handle delays
4. **Simpler deduplication** — Message IDs from adapters

### Recommended Nexus Approach

```typescript
// Simplified streaming for Nexus
interface StreamingConfig {
  enabled: boolean;
  coalesce: {
    min_chars: number;      // 800
    max_chars: number;      // 1200
    idle_ms: number;        // 1000
  };
  human_delay: {
    enabled: boolean;
    min_ms: number;         // 800
    max_ms: number;         // 2500
  };
}

// Per-channel defaults
const CHANNEL_STREAMING_DEFAULTS: Record<string, Partial<StreamingConfig>> = {
  discord: { coalesce: { min_chars: 400, max_chars: 800 } },
  telegram: { coalesce: { min_chars: 1000, max_chars: 2000 } },
  // ... others use defaults
};
```

---

## 11. Key Takeaways for Nexus

1. **Streaming improves UX** — Users see content faster
2. **Coalescing prevents spam** — Buffer small chunks to reasonable sizes
3. **Deduplication is critical** — Track sent content to prevent duplicates
4. **Human delays feel natural** — Random 800-2500ms between chunks
5. **Media bypasses coalescing** — Flush buffer before media, send immediately
6. **Timeout handling** — Abort streaming if delivery hangs to preserve order
7. **Per-channel tuning** — Different platforms benefit from different chunk sizes
8. **Three-layer approach** — Pipeline → Coalescer → Dispatcher

---

## Related Documents

- `OPENCLAW_OUTBOUND.md` — Overall outbound delivery system
- `OPENCLAW_INBOUND.md` — Inbound message handling
- `../OUTBOUND_INTERFACE.md` — Nexus outbound interface spec
