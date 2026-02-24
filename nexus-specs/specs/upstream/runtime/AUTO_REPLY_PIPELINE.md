# OpenClaw Auto-Reply Pipeline

> Documentation of OpenClaw's message dispatch and auto-reply system.
>
> **Source**: `~/nexus/home/projects/openclaw/src/auto-reply/`

---

## Overview

The auto-reply pipeline handles the complete lifecycle of inbound messages from receipt through reply delivery. It manages:

- **Inbound dispatch** - Receiving and routing messages to the reply system
- **Reply generation** - Running the agent to produce responses  
- **Reply delivery** - Serializing and sending responses with human-like timing

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│   Inbound    │────▶│  Reply Pipeline  │────▶│    Outbound    │
│   Message    │     │                  │     │   Dispatcher   │
└──────────────┘     └──────────────────┘     └────────────────┘
       │                     │                        │
       ▼                     ▼                        ▼
   Deduplication        Agent Runner           Block Streaming
   Context Finalize     Directive Parse        Human Delays
   Command Detect       Session State          Payload Normalize
```

---

## Message Dispatch Flow

### Entry Point: `dispatch.ts`

The main entry point receives inbound messages and routes them through the reply system.

| Function | Purpose |
|----------|---------|
| `dispatchInboundMessage()` | Core dispatch - finalizes context, invokes reply generator |
| `dispatchInboundMessageWithDispatcher()` | Creates dispatcher, waits for idle |
| `dispatchInboundMessageWithBufferedDispatcher()` | Adds typing indicator support |

#### `dispatchInboundMessage()`

```typescript
// src/auto-reply/dispatch.ts:17-32
async function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof getReplyFromConfig;
}): Promise<DispatchInboundResult>
```

**Flow:**
1. Finalize inbound context via `finalizeInboundContext()`
2. Invoke `dispatchReplyFromConfig()` with finalized context

---

### Core Dispatch: `dispatch-from-config.ts`

The main orchestration happens in `dispatchReplyFromConfig()`:

```
┌─────────────────────────────────────────────────────────────┐
│                  dispatchReplyFromConfig()                  │
├─────────────────────────────────────────────────────────────┤
│  1. Dedupe check (shouldSkipDuplicateInbound)               │
│  2. Audio context detection                                  │
│  3. TTS mode resolution                                      │
│  4. Hook runner for message_received                        │
│  5. Cross-provider routing resolution                       │
│  6. Fast-abort check                                         │
│  7. Reply generation (getReplyFromConfig)                   │
│  8. TTS application                                          │
│  9. Final reply dispatch                                     │
└─────────────────────────────────────────────────────────────┘
```

#### Key Steps

**1. Deduplication Check**

```typescript
// src/auto-reply/reply/dispatch-from-config.ts:143-146
if (shouldSkipDuplicateInbound(ctx)) {
  recordProcessed("skipped", { reason: "duplicate" });
  return { queuedFinal: false, counts: dispatcher.getQueuedCounts() };
}
```

**2. Cross-Provider Routing**

When `OriginatingChannel` differs from current surface, replies route back to origin:

```typescript
const shouldRouteToOriginating =
  isRoutableChannel(originatingChannel) && 
  originatingTo && 
  originatingChannel !== currentSurface;
```

**3. Reply Generation with Callbacks**

```typescript
const replyResult = await getReplyFromConfig(ctx, {
  ...params.replyOptions,
  onToolResult: (payload) => {
    // Handle tool result payloads
    dispatcher.sendToolResult(ttsPayload);
  },
  onBlockReply: (payload, context) => {
    // Handle streaming block replies
    dispatcher.sendBlockReply(ttsPayload);
  },
}, cfg);
```

---

### Deduplication: `inbound-dedupe.ts`

Prevents duplicate processing of the same message across providers.

| Component | Description |
|-----------|-------------|
| `buildInboundDedupeKey()` | Builds composite key from provider, account, session, peer, thread, messageId |
| `shouldSkipDuplicateInbound()` | Checks cache, returns true if duplicate |
| TTL | 20 minutes default |
| Max Size | 5000 entries |

```typescript
// Key format: provider|accountId|sessionKey|peerId|threadId|messageId
function buildInboundDedupeKey(ctx: MsgContext): string | null {
  const provider = normalizeProvider(ctx.OriginatingChannel ?? ctx.Provider ?? ctx.Surface);
  const messageId = ctx.MessageSid?.trim();
  // ... builds composite key
  return [provider, accountId, sessionKey, peerId, threadId, messageId]
    .filter(Boolean).join("|");
}
```

---

### Context Finalization: `inbound-context.ts`

Normalizes the raw message context into a well-formed `FinalizedMsgContext`:

```typescript
function finalizeInboundContext<T>(ctx: T): T & FinalizedMsgContext {
  // 1. Normalize text fields (newlines)
  normalized.Body = normalizeInboundTextNewlines(normalized.Body);
  
  // 2. Normalize chat type
  normalized.ChatType = normalizeChatType(normalized.ChatType);
  
  // 3. Resolve BodyForAgent and BodyForCommands
  normalized.BodyForAgent = normalizeInboundTextNewlines(bodyForAgentSource);
  normalized.BodyForCommands = normalizeInboundTextNewlines(bodyForCommandsSource);
  
  // 4. Resolve conversation label
  normalized.ConversationLabel = resolveConversationLabel(normalized);
  
  // 5. Format sender meta for groups
  normalized.Body = formatInboundBodyWithSenderMeta({ ctx: normalized, body: normalized.Body });
  
  // 6. Default-deny command authorization
  normalized.CommandAuthorized = normalized.CommandAuthorized === true;
  
  return normalized;
}
```

---

### Command Detection: `command-detection.ts`

Detects control commands in message text.

| Function | Purpose |
|----------|---------|
| `hasControlCommand()` | Checks if text contains a registered command |
| `isControlCommandMessage()` | Also checks abort triggers |
| `hasInlineCommandTokens()` | Coarse detection for `/` or `!` prefixes |
| `shouldComputeCommandAuthorized()` | Determines if auth check needed |

```typescript
function hasControlCommand(text?: string, cfg?: OpenClawConfig): boolean {
  const normalizedBody = normalizeCommandBody(trimmed);
  const commands = cfg ? listChatCommandsForConfig(cfg) : listChatCommands();
  
  for (const command of commands) {
    for (const alias of command.textAliases) {
      if (lowered === normalized) return true;
      if (command.acceptsArgs && lowered.startsWith(normalized)) {
        // Check for whitespace after command
        const nextChar = normalizedBody.charAt(normalized.length);
        if (/\s/.test(nextChar)) return true;
      }
    }
  }
  return false;
}
```

---

## Reply Generation

### Core: `get-reply.ts`

`getReplyFromConfig()` is the main reply generation function.

```
┌─────────────────────────────────────────────────────────────┐
│                    getReplyFromConfig()                      │
├─────────────────────────────────────────────────────────────┤
│  1. Resolve agent ID and skill filters                      │
│  2. Resolve default model (provider/model/aliases)          │
│  3. Ensure agent workspace                                   │
│  4. Create typing controller                                 │
│  5. Apply media understanding                                │
│  6. Apply link understanding                                 │
│  7. Initialize session state                                 │
│  8. Resolve reply directives                                 │
│  9. Handle inline actions (commands)                        │
│  10. Stage sandbox media                                     │
│  11. Run prepared reply                                      │
└─────────────────────────────────────────────────────────────┘
```

#### Key Phases

**Directive Resolution** (`resolveReplyDirectives()`):
- Parses inline directives (model, think level, queue mode)
- Resolves session-level overrides
- Validates permissions

**Inline Actions** (`handleInlineActions()`):
- Executes commands like `/status`, `/new`, `/model`
- Returns early if command produces reply

**Run Prepared Reply** (`runPreparedReply()`):
- Assembles final prompt with hints and media notes
- Resolves queue settings
- Invokes `runReplyAgent()`

---

### Agent Runner: `agent-runner.ts`

`runReplyAgent()` executes the actual LLM call and handles responses.

```typescript
async function runReplyAgent(params: {
  commandBody: string;
  followupRun: FollowupRun;
  queueKey: string;
  resolvedQueue: QueueSettings;
  // ... many more params
}): Promise<ReplyPayload | ReplyPayload[] | undefined>
```

**Responsibilities:**

| Phase | Action |
|-------|--------|
| Queue steering | Enqueue if session active and queue mode allows |
| Memory flush | Run compaction if context too large |
| Agent execution | `runAgentTurnWithFallback()` |
| Block streaming | Pipeline for real-time block delivery |
| Session reset | Handle compaction failures, role conflicts |
| Usage tracking | Persist token usage to session |
| Payload building | Construct final reply payloads |

---

### Block Streaming

Real-time streaming of LLM responses in chunks.

#### Pipeline: `block-reply-pipeline.ts`

```typescript
function createBlockReplyPipeline(params: {
  onBlockReply: (payload: ReplyPayload, options?) => Promise<void> | void;
  timeoutMs: number;
  coalescing?: BlockStreamingCoalescing;
  buffer?: BlockReplyBuffer;
}): BlockReplyPipeline
```

| Method | Purpose |
|--------|---------|
| `enqueue()` | Add payload to pipeline |
| `flush()` | Force flush buffered content |
| `stop()` | Stop pipeline, cleanup |
| `hasSentPayload()` | Check if payload already sent |

**Coalescing** (`block-streaming.ts`):

```typescript
type BlockStreamingCoalescing = {
  minChars: number;     // Min chars before flush (default: 800)
  maxChars: number;     // Max chars per chunk (default: 1200)
  idleMs: number;       // Idle timeout for flush (default: 1000ms)
  joiner: string;       // Join character ("\n\n" for paragraphs)
  flushOnEnqueue?: boolean;  // Flush on paragraph boundaries
};
```

---

### Chunking Configuration

```typescript
function resolveBlockStreamingChunking(cfg, provider?, accountId?): {
  minChars: number;      // DEFAULT_BLOCK_STREAM_MIN = 800
  maxChars: number;      // DEFAULT_BLOCK_STREAM_MAX = 1200
  breakPreference: "paragraph" | "newline" | "sentence";
  flushOnParagraph?: boolean;
}
```

---

## Reply Dispatcher

### Core: `reply-dispatcher.ts`

Serializes and delivers reply payloads with proper ordering and timing.

```typescript
type ReplyDispatcher = {
  sendToolResult: (payload: ReplyPayload) => boolean;
  sendBlockReply: (payload: ReplyPayload) => boolean;
  sendFinalReply: (payload: ReplyPayload) => boolean;
  waitForIdle: () => Promise<void>;
  getQueuedCounts: () => Record<ReplyDispatchKind, number>;
};
```

#### Dispatch Kinds

| Kind | Purpose |
|------|---------|
| `tool` | Tool execution results |
| `block` | Streaming block replies |
| `final` | Final response payloads |

#### Human-Like Delays

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

#### Enqueue Process

```typescript
const enqueue = (kind: ReplyDispatchKind, payload: ReplyPayload) => {
  // 1. Normalize payload (strip tokens, apply prefix)
  const normalized = normalizeReplyPayloadInternal(payload, options);
  if (!normalized) return false;
  
  // 2. Track counts
  queuedCounts[kind] += 1;
  pending += 1;
  
  // 3. Determine if delay needed (block replies after first)
  const shouldDelay = kind === "block" && sentFirstBlock;
  
  // 4. Chain delivery with delay
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

### Payload Normalization: `normalize-reply.ts`

Cleans and validates reply payloads before delivery.

```typescript
function normalizeReplyPayload(
  payload: ReplyPayload,
  opts: NormalizeReplyOptions = {}
): ReplyPayload | null {
  // 1. Check for empty content
  if (!trimmed && !hasMedia && !hasChannelData) {
    opts.onSkip?.("empty");
    return null;
  }
  
  // 2. Handle silent token
  if (isSilentReplyText(text, silentToken)) {
    if (!hasMedia && !hasChannelData) {
      opts.onSkip?.("silent");
      return null;
    }
    text = "";
  }
  
  // 3. Strip heartbeat tokens
  if (shouldStripHeartbeat && text?.includes(HEARTBEAT_TOKEN)) {
    const stripped = stripHeartbeatToken(text);
    if (stripped.shouldSkip && !hasMedia) {
      opts.onSkip?.("heartbeat");
      return null;
    }
    text = stripped.text;
  }
  
  // 4. Sanitize for user
  text = sanitizeUserFacingText(text);
  
  // 5. Parse LINE directives (quick_replies, buttons, etc.)
  if (hasLineDirectives(text)) {
    enrichedPayload = parseLineDirectives(enrichedPayload);
  }
  
  // 6. Apply response prefix
  if (effectivePrefix && text && !text.startsWith(effectivePrefix)) {
    text = `${effectivePrefix} ${text}`;
  }
  
  return { ...enrichedPayload, text };
}
```

#### Skip Reasons

| Reason | Trigger |
|--------|---------|
| `empty` | No text, media, or channel data |
| `silent` | Contains silent reply token |
| `heartbeat` | Only heartbeat token, no other content |

---

### Reply Routing: `route-reply.ts`

Routes replies to the originating channel for cross-provider support.

```typescript
async function routeReply(params: {
  payload: ReplyPayload;
  channel: OriginatingChannelType;
  to: string;
  sessionKey?: string;
  accountId?: string;
  threadId?: string | number;
  cfg: OpenClawConfig;
  abortSignal?: AbortSignal;
  mirror?: boolean;
}): Promise<RouteReplyResult>
```

**Process:**
1. Resolve response prefix from agent config
2. Normalize payload
3. Skip empty replies
4. Reject webchat routing (not supported for queued)
5. Normalize channel ID
6. Resolve threading (Slack thread_ts, etc.)
7. Deliver via `deliverOutboundPayloads()`

---

### Reply Threading: `reply-payloads.ts`

Handles reply-to tags and threading.

```typescript
function applyReplyTagsToPayload(
  payload: ReplyPayload,
  currentMessageId?: string
): ReplyPayload {
  // Parse [[reply_to:msgid]] tags from text
  const { cleaned, replyToId, replyToCurrent, hasTag } = extractReplyToTag(
    payload.text,
    currentMessageId
  );
  
  return {
    ...payload,
    text: cleaned,
    replyToId: replyToId ?? payload.replyToId,
    replyToTag: hasTag || payload.replyToTag,
    replyToCurrent: replyToCurrent || payload.replyToCurrent,
  };
}
```

---

## Templating and Media

### Template Processing: `templating.ts`

Simple `{{Placeholder}}` interpolation for prompts.

```typescript
function applyTemplate(str: string | undefined, ctx: TemplateContext) {
  return str.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    const value = ctx[key as keyof TemplateContext];
    return formatTemplateValue(value);
  });
}
```

#### Template Context

Key fields available for interpolation:

| Field | Description |
|-------|-------------|
| `Body` | Message body |
| `BodyForAgent` | Body with envelope/history |
| `RawBody` / `CommandBody` | Raw message without context |
| `From` / `To` | Sender/recipient |
| `SessionKey` | Session identifier |
| `SenderName` | Human sender name |
| `GroupSubject` | Group chat name |
| `Provider` / `Surface` | Channel provider |
| `Transcript` | Audio transcription |

---

### Media Notes: `media-note.ts`

Builds human-readable notes for attached media.

```typescript
function buildInboundMediaNote(ctx: MsgContext): string | undefined {
  // Skip media already handled by understanding
  const suppressed = new Set<number>();
  for (const output of ctx.MediaUnderstanding ?? []) {
    suppressed.add(output.attachmentIndex);
  }
  
  // Build note for remaining media
  // Single: "[media attached: /path/to/file.jpg (image/jpeg) | https://url]"
  // Multiple: "[media attached: 3 files]\n[media attached 1/3: ...]"
}
```

---

## Key Types

### `MsgContext`

The primary message context structure:

```typescript
type MsgContext = {
  // Body variants
  Body?: string;
  BodyForAgent?: string;
  RawBody?: string;
  CommandBody?: string;
  BodyForCommands?: string;
  
  // Routing
  From?: string;
  To?: string;
  SessionKey?: string;
  AccountId?: string;
  
  // Message IDs
  MessageSid?: string;
  MessageSidFull?: string;
  ReplyToId?: string;
  
  // Media
  MediaPath?: string;
  MediaPaths?: string[];
  MediaType?: string;
  MediaTypes?: string[];
  MediaUrl?: string;
  MediaUrls?: string[];
  
  // Provider context
  Provider?: string;
  Surface?: string;
  ChatType?: string;
  
  // Group context
  GroupSubject?: string;
  GroupChannel?: string;
  GroupMembers?: string;
  SenderName?: string;
  SenderId?: string;
  
  // Cross-provider routing
  OriginatingChannel?: OriginatingChannelType;
  OriginatingTo?: string;
};
```

### `ReplyPayload`

The reply payload structure:

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

### `GetReplyOptions`

Options for reply generation:

```typescript
type GetReplyOptions = {
  runId?: string;
  abortSignal?: AbortSignal;
  images?: ImageContent[];
  onAgentRunStart?: (runId: string) => void;
  onReplyStart?: () => Promise<void> | void;
  onTypingController?: (typing: TypingController) => void;
  isHeartbeat?: boolean;
  onPartialReply?: (payload: ReplyPayload) => Promise<void> | void;
  onReasoningStream?: (payload: ReplyPayload) => Promise<void> | void;
  onBlockReply?: (payload: ReplyPayload, context?) => Promise<void> | void;
  onToolResult?: (payload: ReplyPayload) => Promise<void> | void;
  onModelSelected?: (ctx: ModelSelectedContext) => void;
  disableBlockStreaming?: boolean;
  blockReplyTimeoutMs?: number;
  skillFilter?: string[];
  hasRepliedRef?: { value: boolean };
};
```

---

## Flow Diagrams

### Complete Message Lifecycle

```
                                  INBOUND
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────┐
│                    dispatchInboundMessage()                 │
│                                                             │
│  ┌─────────────────┐     ┌──────────────────────────────┐ │
│  │ finalizeInbound │────▶│   dispatchReplyFromConfig()  │ │
│  │    Context()    │     │                              │ │
│  └─────────────────┘     │  ┌────────────────────────┐  │ │
│                          │  │ shouldSkipDuplicate?   │  │ │
│                          │  └──────────┬─────────────┘  │ │
│                          │             │ no             │ │
│                          │             ▼                │ │
│                          │  ┌────────────────────────┐  │ │
│                          │  │ tryFastAbortFromMsg?   │  │ │
│                          │  └──────────┬─────────────┘  │ │
│                          │             │ no             │ │
│                          │             ▼                │ │
│                          │  ┌────────────────────────┐  │ │
│                          │  │  getReplyFromConfig()  │  │ │
│                          │  └──────────┬─────────────┘  │ │
│                          └─────────────│────────────────┘ │
└────────────────────────────────────────│───────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────┐
│                    getReplyFromConfig()                     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Apply Media  │  │ Apply Link   │  │ Init Session     │ │
│  │ Understanding│  │ Understanding│  │ State            │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                 │                    │          │
│         └─────────────────┴────────────────────┘          │
│                           │                               │
│                           ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │            resolveReplyDirectives()                 │  │
│  │  (parse /model, /think, queue modes, permissions)  │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                               │
│                           ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │            handleInlineActions()                    │  │
│  │  (execute /status, /new, /compact, etc.)           │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                               │
│                           ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │              runPreparedReply()                     │  │
│  └────────────────────────┬───────────────────────────┘  │
└───────────────────────────│────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                      runReplyAgent()                        │
│                                                             │
│  ┌──────────────┐     ┌───────────────────────────────┐   │
│  │ Queue Check  │────▶│ runAgentTurnWithFallback()    │   │
│  │ (steer/      │     │                               │   │
│  │  followup?)  │     │  ┌─────────────────────────┐  │   │
│  └──────────────┘     │  │ Block Reply Pipeline    │  │   │
│                       │  │ (coalesce, buffer,      │  │   │
│                       │  │  timeout, dedupe)       │  │   │
│                       │  └───────────┬─────────────┘  │   │
│                       └──────────────│────────────────┘   │
│                                      │                     │
│                                      ▼                     │
│  ┌───────────────────────────────────────────────────┐    │
│  │            buildReplyPayloads()                    │    │
│  │  (filter dupes, apply threading, build array)     │    │
│  └───────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
                        OUTBOUND
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                    ReplyDispatcher                          │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ sendTool     │  │ sendBlock     │  │ sendFinal      │  │
│  │ Result()     │  │ Reply()       │  │ Reply()        │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬───────┘  │
│         │                  │                    │          │
│         └──────────────────┴────────────────────┘          │
│                            │                               │
│                            ▼                               │
│  ┌───────────────────────────────────────────────────┐    │
│  │           normalizeReplyPayload()                  │    │
│  │  (strip tokens, sanitize, apply prefix)           │    │
│  └───────────────────────────────────────────────────┘    │
│                            │                               │
│                            ▼                               │
│  ┌───────────────────────────────────────────────────┐    │
│  │              Human Delay (block only)              │    │
│  │         (800-2500ms between block replies)        │    │
│  └───────────────────────────────────────────────────┘    │
│                            │                               │
│                            ▼                               │
│  ┌───────────────────────────────────────────────────┐    │
│  │                   deliver()                        │    │
│  └───────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
```

---

## File Index

| File | Purpose |
|------|---------|
| `dispatch.ts` | Entry point for inbound message dispatch |
| `reply/dispatch-from-config.ts` | Core dispatch orchestration |
| `reply/get-reply.ts` | Main reply generation (`getReplyFromConfig`) |
| `reply/get-reply-run.ts` | Prepared reply execution (`runPreparedReply`) |
| `reply/agent-runner.ts` | Agent execution (`runReplyAgent`) |
| `reply/reply-dispatcher.ts` | Outbound reply serialization |
| `reply/block-reply-pipeline.ts` | Block streaming pipeline |
| `reply/block-streaming.ts` | Block chunking/coalescing config |
| `reply/normalize-reply.ts` | Payload normalization |
| `reply/route-reply.ts` | Cross-provider reply routing |
| `reply/reply-payloads.ts` | Reply threading and tag handling |
| `reply/inbound-context.ts` | Context finalization |
| `reply/inbound-dedupe.ts` | Deduplication cache |
| `templating.ts` | Template interpolation |
| `media-note.ts` | Media attachment notes |
| `command-detection.ts` | Command detection utilities |
| `commands-registry.ts` | Command registry and parsing |
