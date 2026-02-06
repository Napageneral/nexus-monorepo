# OpenClaw Streaming Architecture — Upstream Analysis

> **Purpose:** Document OpenClaw's streaming approach and how it informs NEX streaming design.  
> **Source:** Gateway server, block streaming pipeline, reply dispatcher  
> **Last Updated:** 2026-02-04

---

## Overview

OpenClaw implements streaming at two levels:

1. **Gateway Level** — WebSocket event broadcasting to connected clients
2. **Reply Level** — Block streaming for real-time response delivery

NEX inherits and formalizes these patterns through the `StreamingContext` and adapter outbound interfaces.

---

## Gateway Streaming Architecture

### WebSocket Event System

The Gateway server broadcasts events to connected clients via WebSocket:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Gateway Broadcasting                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Agent generates response                                        │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │   Broadcaster   │                                             │
│  │                 │                                             │
│  │  broadcast(     │                                             │
│  │    event,       │                                             │
│  │    payload,     │                                             │
│  │    opts         │                                             │
│  │  )              │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ├──────────────────────────────────────────┐           │
│           │                                          │           │
│           ▼                                          ▼           │
│  ┌─────────────────┐                       ┌─────────────────┐  │
│  │  CLI Client     │                       │  Control UI     │  │
│  │  (WebSocket)    │                       │  (WebSocket)    │  │
│  └─────────────────┘                       └─────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Frame Types

```typescript
// Event frame (pushed to clients)
type EventFrame = {
  type: "event";
  event: string;        // Event name
  payload?: unknown;    // Event data
  seq?: number;         // Sequence number for ordering
  stateVersion?: {      // State versioning
    presence?: number;
    health?: number;
  };
};
```

### Gateway Events

| Event | Description | Payload |
|-------|-------------|---------|
| `agent` | Agent streaming events | deltas, tool calls |
| `chat` | Chat message events | message content |
| `presence` | Client presence updates | connected clients |
| `tick` | Periodic heartbeat | timestamp |
| `health` | Health snapshot updates | system health |
| `shutdown` | Server shutdown notification | - |

### Broadcast Function

```typescript
type BroadcastFn = (
  event: string,
  payload: unknown,
  opts?: {
    dropIfSlow?: boolean;   // Drop for slow consumers
    stateVersion?: {
      presence?: number;
      health?: number;
    };
  }
) => void;
```

**Key behaviors:**
- Events sent to all connected clients
- Slow consumers can be dropped (backpressure)
- State versioning enables incremental updates
- Sequence numbers for ordering

---

## Block Streaming Pipeline

### Overview

OpenClaw streams responses in "blocks" — chunks of text that accumulate before sending:

```
Agent Output
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│                   Block Reply Pipeline                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Token arrives    →  Buffer accumulates  →  Flush when ready │
│                                                               │
│  Coalescing rules:                                            │
│    • minChars: 800   (wait for this many)                     │
│    • maxChars: 1200  (flush when exceeded)                    │
│    • idleMs: 1000    (flush if no tokens for 1s)              │
│    • paragraph break triggers flush                           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
ReplyDispatcher
     │
     ▼
Channel Delivery
```

### Block Streaming Configuration

```typescript
type BlockStreamingCoalescing = {
  minChars: number;     // Min chars before flush (default: 800)
  maxChars: number;     // Max chars per chunk (default: 1200)
  idleMs: number;       // Idle timeout for flush (default: 1000ms)
  joiner: string;       // Join character ("\n\n" for paragraphs)
  flushOnEnqueue?: boolean;  // Flush on paragraph boundaries
};
```

### Chunking Configuration

```typescript
function resolveBlockStreamingChunking(cfg, provider?, accountId?): {
  minChars: number;      // DEFAULT_BLOCK_STREAM_MIN = 800
  maxChars: number;      // DEFAULT_BLOCK_STREAM_MAX = 1200
  breakPreference: "paragraph" | "newline" | "sentence";
  flushOnParagraph?: boolean;
}
```

### Pipeline Interface

```typescript
function createBlockReplyPipeline(params: {
  onBlockReply: (payload: ReplyPayload, options?) => Promise<void> | void;
  timeoutMs: number;
  coalescing?: BlockStreamingCoalescing;
  buffer?: BlockReplyBuffer;
}): BlockReplyPipeline;

interface BlockReplyPipeline {
  enqueue(payload: ReplyPayload): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
  hasSentPayload(): boolean;
}
```

---

## Reply Dispatcher Streaming

### Human-Like Delays

Between block deliveries, OpenClaw adds random delays to feel more natural:

```typescript
const DEFAULT_HUMAN_DELAY_MIN_MS = 800;
const DEFAULT_HUMAN_DELAY_MAX_MS = 2500;

function getHumanDelay(config: HumanDelayConfig | undefined): number {
  const mode = config?.mode ?? "off";
  if (mode === "off") return 0;
  
  const min = mode === "custom" ? config?.minMs : DEFAULT_HUMAN_DELAY_MIN_MS;
  const max = mode === "custom" ? config?.maxMs : DEFAULT_HUMAN_DELAY_MAX_MS;
  
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

### Dispatch Kinds

| Kind | Purpose | Delay? |
|------|---------|--------|
| `tool` | Tool execution results | No |
| `block` | Streaming block replies | Yes (after first) |
| `final` | Final response payloads | No |

### Enqueue Flow

```typescript
const enqueue = (kind: ReplyDispatchKind, payload: ReplyPayload) => {
  // 1. Normalize payload
  const normalized = normalizeReplyPayloadInternal(payload, options);
  if (!normalized) return false;
  
  // 2. Determine if delay needed
  const shouldDelay = kind === "block" && sentFirstBlock;
  
  // 3. Chain delivery with delay
  sendChain = sendChain.then(async () => {
    if (shouldDelay) {
      const delayMs = getHumanDelay(options.humanDelay);
      if (delayMs > 0) await sleep(delayMs);
    }
    await options.deliver(normalized, { kind });
  });
  
  return true;
};
```

---

## Client Subscription Model

### Connection Handshake

Clients connect and receive initial snapshot:

```typescript
type HelloOk = {
  type: "hello-ok";
  protocol: number;
  server: { version, commit, host, connId };
  features: {
    methods: string[];  // Available RPC methods
    events: string[];   // Subscribable events
  };
  snapshot: Snapshot;   // Initial state
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
};
```

### Snapshot Schema

```typescript
type Snapshot = {
  presence: PresenceEntry[];
  health: HealthSummary | null;
  stateVersion: {
    presence: number;
    health: number;
  };
  uptimeMs: number;
  sessionDefaults?: {
    defaultAgentId: string;
    mainKey: string;
    mainSessionKey: string;
  };
};
```

### State Versioning

Clients track state versions for incremental updates:

```typescript
// Client receives event with stateVersion
{
  type: "event",
  event: "health",
  payload: { ... },
  stateVersion: { health: 42 }
}

// Client only applies if version > last seen
if (event.stateVersion.health > clientState.healthVersion) {
  applyHealthUpdate(event.payload);
  clientState.healthVersion = event.stateVersion.health;
}
```

---

## Channel-Specific Streaming

### Streaming Modes by Channel

| Channel | Mode | Typing | Details |
|---------|------|--------|---------|
| **Discord** | Accumulate | ✅ | Send final message at end |
| **Telegram** | Draft edit | ✅ | Edit message as tokens arrive |
| **WhatsApp** | Accumulate | ✅ | No edit API, send final |
| **iMessage** | Accumulate | ❌ | No typing indicator |
| **Signal** | Accumulate | ✅ | Send final at end |
| **Slack** | Draft edit | ✅ | Edit message as tokens |

### Accumulate Mode

```
Tokens arrive    →    Buffer locally    →    Send final message
     ↓                     ↓                       ↓
[tok1][tok2]...      "tok1tok2..."          Full message sent
     ↓
Typing indicator fires periodically
```

### Draft Edit Mode

```
First token    →    Send draft message    →    Edit as tokens arrive
     ↓                    ↓                          ↓
  [tok1]             msg_id: 123               Edit msg_id: 123
                                               with new content
```

---

## Typing Indicator System

### Typing Signaler Interface

```typescript
interface TypingSignaler {
  signalRunStart(): Promise<void>;      // Agent starts
  signalMessageStart(): Promise<void>;  // Assistant message begins
  signalTextDelta(text?: string): Promise<void>;  // Token received
  signalToolStart(): Promise<void>;     // Tool execution begins
  signalReasoningDelta(): Promise<void>; // Reasoning update
}
```

### Trigger Points

| Trigger | When Fired |
|---------|------------|
| Run start | Agent execution begins |
| Message start | Assistant starts responding |
| Text delta | Each token received |
| Tool start | Tool execution begins |
| Reasoning delta | Reasoning model thinking |

---

## NEX Streaming Design

### StreamingContext

NEX formalizes streaming through `StreamingContext`:

```typescript
interface StreamingContext {
  // Delivery target
  channel: string;
  peer_id: string;
  thread_id?: string;
  reply_to_id?: string;
  
  // Adapter
  outAdapter: OutboundAdapter;
  
  // Callbacks
  onPartial: (text: string, mediaUrls?: string[]) => Promise<void>;
  onTyping: () => Promise<void>;
  onToolStart: (toolName: string) => Promise<void>;
  
  // Typing signaler
  typingSignaler: TypingSignaler;
  
  // Config
  streamingEnabled: boolean;
  draftMode: boolean;
}
```

### NEX Streaming Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              NEX STREAMING FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  NEX Pipeline (sync)                    Agent Execution (streaming)             │
│  ─────────────────                      ────────────────────────────            │
│                                                                                  │
│  ┌─────────────────┐                                                            │
│  │ 1-4. STAGES     │                                                            │
│  │ (receive,       │                                                            │
│  │  identity,      │                                                            │
│  │  access,        │                                                            │
│  │  triggers)      │                                                            │
│  └────────┬────────┘                                                            │
│           │                                                                     │
│           ▼                                                                     │
│  ┌─────────────────┐                                                            │
│  │ 5. ASSEMBLE     │─────────────────────┐                                      │
│  │    CONTEXT      │                     │                                      │
│  └────────┬────────┘                     │ StreamingContext                     │
│           │                              │  - delivery target                   │
│           │                              │  - out-adapter                       │
│           │                              │  - typing signaler                   │
│           ▼                              │                                      │
│  ┌─────────────────┐                     │                                      │
│  │ 6. RUN AGENT    │◄────────────────────┘                                      │
│  │    (streaming)  │                                                            │
│  │                 │    ┌───────────────────────────────────────────────────┐  │
│  │                 │    │                                                   │  │
│  │   NEX waits     │    │   Agent generates token                          │  │
│  │   for complete  │    │       ↓                                           │  │
│  │                 │    │   Broker receives onTextDelta(token)              │  │
│  │                 │    │       ↓                                           │  │
│  │                 │    │   Broker calls adapter.onPartial(text)            │  │
│  │                 │    │       ↓                                           │  │
│  │                 │    │   Adapter updates platform                        │  │
│  │                 │    │                                                   │  │
│  │                 │    └───────────────────────────────────────────────────┘  │
│  │                 │                          │                                 │
│  │◄────────────────┼──────────────────────────┘ response                       │
│  └────────┬────────┘                                                            │
│           │                                                                     │
│           ▼                                                                     │
│  ┌─────────────────┐                                                            │
│  │ 7-8. DELIVER,   │                                                            │
│  │      FINALIZE   │                                                            │
│  └─────────────────┘                                                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Streaming Callbacks

### Callback Interface

```typescript
interface AgentStreamingCallbacks {
  // Text streaming
  onTextDelta?: (delta: string) => Promise<void>;
  onTextStart?: () => Promise<void>;
  onTextEnd?: (fullText: string) => Promise<void>;
  
  // Partial reply (accumulated text)
  onPartialReply?: (payload: { text: string; mediaUrls?: string[] }) => Promise<void>;
  
  // Reasoning (for reasoning models)
  onReasoningStream?: (payload: { text: string }) => Promise<void>;
  
  // Tools
  onToolStart?: (toolName: string, params: unknown) => Promise<void>;
  onToolEnd?: (toolName: string, result: unknown) => Promise<void>;
  
  // Message lifecycle
  onAssistantMessageStart?: () => Promise<void>;
  onAssistantMessageEnd?: () => Promise<void>;
}
```

### Broker Wiring

```typescript
const callbacks: AgentStreamingCallbacks = {
  onAssistantMessageStart: async () => {
    await streamingContext.typingSignaler.signalMessageStart();
  },
  
  onTextDelta: async (delta) => {
    accumulatedText += delta;
    await streamingContext.typingSignaler.signalTextDelta(delta);
    
    if (streamingContext.streamingEnabled) {
      await streamingContext.onPartial(accumulatedText);
    }
  },
  
  onToolStart: async (toolName) => {
    await streamingContext.typingSignaler.signalToolStart();
  },
};
```

---

## Key Design Decisions

### 1. Streaming Bypasses Pipeline

**OpenClaw:** Streaming happens directly between Agent ↔ Broker ↔ Adapter, not through dispatch chain.

**NEX:** Same pattern — `runAgent()` handles streaming directly. NEX provides context but doesn't intercept the stream.

**Rationale:** Intercepting streaming would add latency. Final response is captured for persistence.

### 2. Block Coalescing

**OpenClaw:** Accumulates tokens until minChars reached or timeout, then flushes.

**NEX:** Should adopt same pattern with configurable thresholds.

**Benefits:**
- Fewer API calls to messaging platforms
- More natural reading experience
- Reduced rate limit pressure

### 3. Human-Like Delays

**OpenClaw:** 800-2500ms random delay between block sends.

**NEX:** Make this configurable per-channel/per-agent.

**Consideration:** Some use cases want maximum speed; others want natural feel.

### 4. Typing Indicators

**OpenClaw:** Fire at multiple points (run start, message start, token received, tool start).

**NEX:** Preserve this pattern — good UX signal that agent is working.

---

## Configuration Patterns

### Per-Channel Config

```yaml
adapters:
  telegram:
    streaming:
      enabled: true
      mode: draft_edit
      typing_interval_ms: 3000
  
  discord:
    streaming:
      enabled: true
      mode: accumulate
      typing_interval_ms: 5000
  
  imessage:
    streaming:
      enabled: false
```

### Per-Request Override

```typescript
// Plugin can disable streaming for specific requests
nexusRequest.hooks.context.disable_streaming = true;
```

---

## Error Handling

### Streaming Errors

```typescript
try {
  await streamingContext.onPartial(text);
} catch (error) {
  console.error('Streaming update failed:', error);
  // Disable streaming, continue accumulating
  streamingContext.streamingEnabled = false;
}
```

### Agent Errors Mid-Stream

```typescript
try {
  const response = await broker.execute(nexusRequest, streamingContext);
} catch (error) {
  if (streamingContext.sentMessageIds.length > 0) {
    // Sent partial messages, send error
    await outAdapter.sendMessage(target, "Sorry, I encountered an error.");
  }
  throw error;
}
```

---

## Recommendations for NEX

### 1. Adopt Block Streaming Pipeline

OpenClaw's coalescing logic is well-designed:
- Buffer tokens until threshold
- Flush on timeout or paragraph break
- Configurable min/max chars

### 2. Support Both Streaming Modes

- **Accumulate:** Buffer locally, send final (most channels)
- **Draft edit:** Send/edit in real-time (Telegram, Slack)

### 3. Make Human Delays Configurable

```yaml
streaming:
  human_delay:
    mode: "on"  # off, on, custom
    min_ms: 800
    max_ms: 2500
```

### 4. Preserve Typing Signaler Pattern

Multiple trigger points provide good UX feedback.

### 5. Keep Streaming Outside Pipeline Interception

Streaming bypasses stage hooks for performance. Final response is what gets traced/persisted.

---

## Related Documents

- `README.md` — Overview and mapping
- `DISPATCH_FLOW.md` — Where streaming fits in dispatch
- `../STREAMING.md` — NEX streaming specification
- `../../upstream/GATEWAY_SERVER.md` — Gateway broadcast details
