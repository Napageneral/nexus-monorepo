# OpenClaw Outbound Adapter System

Reference documentation for how OpenClaw handles outbound message delivery.

**Source:** `/Users/tyler/nexus/home/projects/openclaw/`  
**Key Files:**
- `src/infra/outbound/deliver.ts` — Main delivery orchestrator
- `src/auto-reply/reply/reply-dispatcher.ts` — Reply serialization
- `src/auto-reply/reply/normalize-reply.ts` — Payload normalization
- `src/auto-reply/chunk.ts` — Chunking system
- `src/channels/plugins/outbound/*.ts` — Per-channel adapters

---

## 1. Architecture Overview

OpenClaw uses a **plugin-based adapter system**. Each platform implements a `ChannelOutboundAdapter`:

```typescript
export type ChannelOutboundAdapter = {
  deliveryMode: "direct" | "gateway" | "hybrid";
  chunker?: ((text: string, limit: number) => string[]) | null;
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendPayload?: (ctx: ChannelOutboundPayloadContext) => Promise<OutboundDeliveryResult>;
  sendPoll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>;
}
```

### End-to-End Delivery Flow

```
Agent Response (ReplyPayload)
     │
     ▼
ReplyDispatcher
     │
     ├─→ normalizeReplyPayload()
     │   • Strip tokens (HEARTBEAT, SILENT)
     │   • Sanitize user-facing text
     │   • Apply response prefix
     │   • Parse LINE directives
     │
     ├─→ Human delay (block replies only)
     │   • 800-2500ms between chunks
     │
     └─→ deliver()
          │
          ▼
deliverOutboundPayloads()
     │
     ├─→ loadChannelOutboundAdapter(channel)
     │
     ├─→ Create ChannelHandler with:
     │   • sendText (platform-specific)
     │   • sendMedia (platform-specific)
     │   • chunker (if needed)
     │
     ├─→ Process payloads:
     │   • Text → chunk if needed → sendText()
     │   • Media → download/process → sendMedia()
     │
     └─→ Return OutboundDeliveryResult[]
```

### Delivery Modes

| Mode | Description |
|------|-------------|
| `direct` | Calls platform API directly |
| `gateway` | Routes through HTTP gateway (`callGateway()`) |
| `hybrid` | Supports both paths |

---

## 2. Reply Dispatcher

**File:** `src/auto-reply/reply/reply-dispatcher.ts`

The `ReplyDispatcher` serializes and delivers reply payloads with proper ordering and timing.

### Interface

```typescript
type ReplyDispatcher = {
  sendToolResult: (payload: ReplyPayload) => boolean;
  sendBlockReply: (payload: ReplyPayload) => boolean;
  sendFinalReply: (payload: ReplyPayload) => boolean;
  waitForIdle: () => Promise<void>;
  getQueuedCounts: () => Record<ReplyDispatchKind, number>;
};
```

### Dispatch Kinds

| Kind | Purpose | Timing |
|------|---------|--------|
| `tool` | Tool execution results | Immediate |
| `block` | Streaming block replies | Human delay after first |
| `final` | Final response payloads | After all blocks |

### Human-Like Delays

```typescript
// reply-dispatcher.ts:22-39
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

**Behavior:**
- First block reply: no delay
- Subsequent block replies: random 800-2500ms delay
- Tool results and final replies: no delay

### Enqueue Process

```typescript
// reply-dispatcher.ts:112-153
const enqueue = (kind: ReplyDispatchKind, payload: ReplyPayload) => {
  // 1. Normalize payload (strip tokens, apply prefix)
  const normalized = normalizeReplyPayloadInternal(payload, options);
  if (!normalized) return false;
  
  // 2. Track counts
  queuedCounts[kind] += 1;
  pending += 1;
  
  // 3. Determine if delay needed (block replies after first)
  const shouldDelay = kind === "block" && sentFirstBlock;
  if (kind === "block") sentFirstBlock = true;
  
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

### Dispatcher with Typing

The `createReplyDispatcherWithTyping()` wrapper integrates typing indicators:

```typescript
// reply-dispatcher.ts:164-190
function createReplyDispatcherWithTyping(
  options: ReplyDispatcherWithTypingOptions,
): ReplyDispatcherWithTypingResult {
  let typingController: TypingController | undefined;
  const dispatcher = createReplyDispatcher({
    ...dispatcherOptions,
    onIdle: () => {
      typingController?.markDispatchIdle();
      onIdle?.();
    },
  });

  return {
    dispatcher,
    replyOptions: {
      onReplyStart,
      onTypingController: (typing) => {
        typingController = typing;
      },
    },
    markDispatchIdle: () => {
      typingController?.markDispatchIdle();
    },
  };
}
```

---

## 3. Payload Normalization

**File:** `src/auto-reply/reply/normalize-reply.ts`

Cleans and validates reply payloads before delivery.

### Process

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

### Skip Reasons

| Reason | Trigger |
|--------|---------|
| `empty` | No text, media, or channel data |
| `silent` | Contains silent reply token |
| `heartbeat` | Only heartbeat token, no other content |

---

## 4. Main Delivery Orchestration

**File:** `src/infra/outbound/deliver.ts`

### `deliverOutboundPayloads()`

The main entry point for outbound delivery:

```typescript
// deliver.ts
async function deliverOutboundPayloads(params: {
  cfg: OpenClawConfig;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  payloads: ReplyPayload[];
  replyToId?: string | null;
  threadId?: string | number | null;
  deps?: OutboundSendDeps;
  gifPlayback?: boolean;
  abortSignal?: AbortSignal;
  bestEffort?: boolean;
  onError?: (err: unknown, payload: NormalizedOutboundPayload) => void;
  onPayload?: (payload: NormalizedOutboundPayload) => void;
  mirror?: { sessionKey: string; agentId?: string; text?: string; mediaUrls?: string[] };
}): Promise<OutboundDeliveryResult[]>
```

**Key behaviors:**
1. Creates a channel handler via `loadChannelOutboundAdapter()`
2. Resolves chunking limits per channel
3. Normalizes payloads (extracts MEDIA directives, merges media URLs)
4. For Signal: applies markdown-to-styled-text conversion
5. Sends text chunks respecting channel limits
6. Handles media attachments with captions
7. Optionally mirrors to session transcript

### Delivery Result

```typescript
type OutboundDeliveryResult = {
  channel: Exclude<OutboundChannel, "none">;
  messageId: string;
  chatId?: string;
  channelId?: string;
  roomId?: string;
  conversationId?: string;
  timestamp?: number;
  toJid?: string;
  pollId?: string;
  meta?: Record<string, unknown>;
};
```

### Target Resolution

**File:** `src/infra/outbound/target-resolver.ts`

Converts human-friendly identifiers to channel-specific IDs:

```typescript
type ResolvedMessagingTarget = {
  to: string;
  kind: TargetResolveKind;  // "user" | "group" | "channel"
  display?: string;
  source: "normalized" | "directory";
};

async function resolveMessagingTarget(params: {
  cfg: OpenClawConfig;
  channel: ChannelId;
  input: string;
  accountId?: string | null;
  preferredKind?: TargetResolveKind;
  resolveAmbiguous?: "error" | "best" | "first";
}): Promise<ResolveMessagingTargetResult>
```

**Resolution strategies:**
1. Direct ID detection (prefixes like `channel:`, `user:`, `@`, `#`)
2. Directory lookup (cached with 30-minute TTL)
3. Live directory fetch on cache miss
4. Ambiguity resolution (error, best-ranked, or first match)

---

## 5. Chunking System

**File:** `src/auto-reply/chunk.ts`

### Chunking Modes

| Mode | Behavior |
|------|----------|
| `"length"` (default) | Splits only when exceeding `textChunkLimit` |
| `"newline"` | Paragraph-aware, splits on blank lines first |

### Chunking Functions

| Function | Description |
|----------|-------------|
| `chunkText()` | Basic length-based with smart breakpoints |
| `chunkMarkdownText()` | Markdown-aware, preserves code fences |
| `chunkByParagraph()` | Paragraph-boundary splitting |
| `chunkByNewline()` | Line-based splitting |

### Platform Limits

| Platform | Limit |
|----------|-------|
| Discord | 2000 |
| Telegram | 4000 (max 4096) |
| WhatsApp | 4000 |
| Signal | 4000 |
| iMessage | 4000 |
| Slack | 4000 |

### Chunking Logic

```typescript
// In deliverOutboundPayloads
const sendTextChunks = async (text: string) => {
  if (!handler.chunker || textLimit === undefined) {
    results.push(await handler.sendText(text));
    return;
  }
  
  if (chunkMode === "newline") {
    const mode = handler.chunkerMode ?? "text";
    const blockChunks = mode === "markdown"
      ? chunkMarkdownTextWithMode(text, textLimit, "newline")
      : chunkByParagraph(text, textLimit);

    for (const blockChunk of blockChunks) {
      const chunks = handler.chunker(blockChunk, textLimit);
      for (const chunk of chunks) {
        results.push(await handler.sendText(chunk));
      }
    }
    return;
  }
  
  const chunks = handler.chunker(text, textLimit);
  for (const chunk of chunks) {
    results.push(await handler.sendText(chunk));
  }
};
```

---

## 6. Platform-Specific Implementations

### Discord

**File:** `src/discord/send.ts`, `src/discord/send.shared.ts`

| Setting | Value |
|---------|-------|
| Char limit | 2000 (`DISCORD_TEXT_LIMIT`) |
| Formatting | Markdown, tables converted |
| Chunking | `chunkDiscordTextWithMode()` |
| Threading | `message_reference` with `message_id` |
| Embeds | Supported via `embeds` array |

**Key behavior:**
- First chunk gets reply reference; subsequent chunks don't
- Markdown tables converted via `convertMarkdownTables()`
- Supports embeds array in message body
- Link embeds suppressed with `<>` wrapper

```typescript
const messageReference = replyTo 
  ? { message_id: replyTo, fail_if_not_exists: false } 
  : undefined;

const chunks = chunkDiscordTextWithMode(text, {
  maxChars: DISCORD_TEXT_LIMIT,
  maxLines: maxLinesPerMessage,
  chunkMode,
});
```

---

### Telegram

**File:** `src/telegram/send.ts`

| Setting | Value |
|---------|-------|
| Char limit | 4096 (default 4000) |
| Formatting | HTML (Markdown → HTML conversion) |
| Caption limit | 1024 chars |
| Threading | `messageThreadId` for forums, `reply_to_message_id` for replies |

**Key behavior:**
- Uses HTML parse mode, NOT MarkdownV2
- Falls back to plain text if HTML parsing fails
- Long captions split via `splitTelegramCaption()` (1024 char limit)
- Supports forum topics via `messageThreadId`

```typescript
const { caption, followUpText } = splitTelegramCaption(text);
const htmlCaption = caption ? renderHtmlText(caption) : undefined;
// If text exceeds caption limit, send media then text separately
const needsSeparateText = Boolean(followUpText);
```

---

### WhatsApp

**File:** `src/web/outbound.ts`

| Setting | Value |
|---------|-------|
| Char limit | 4000 (default) |
| Formatting | Plain text, tables converted |
| Media | Images, videos, audio (opus for voice notes) |
| API | Baileys via `active.sendMessage()` |

**Key behavior:**
- GIF playback configurable via `gifPlayback` option
- Special handling for opus codec (voice notes)
- No markdown rendering — plain text only
- Polls supported (12 options max)

---

### iMessage

**File:** `src/imessage/send.ts`

| Setting | Value |
|---------|-------|
| Char limit | 4000 (default) |
| Formatting | Markdown tables converted |
| Media | Downloads locally, sends via `imsg` CLI |

**Key behavior:**
- Supports: `chat_id`, `chat_guid`, `chat_identifier`, or handle-based targeting
- Service/region configurable per account
- Tapback reactions supported

---

### Signal

**File:** `src/signal/send.ts`

| Setting | Value |
|---------|-------|
| Char limit | 4000 (default) |
| Formatting | `markdownToSignalTextChunks()` with style ranges |
| Media limit | Configurable `mediaMaxMb` per account |

**Key behavior:**
- Preserves text formatting via `SignalTextStyleRange[]`
- Table mode configurable (code vs plain)
- Style ranges for bold, italic, etc.

---

### Slack

**File:** `src/slack/send.ts`, `src/slack/actions.ts`

| Setting | Value |
|---------|-------|
| Char limit | 4000 |
| Formatting | mrkdwn (Slack's markdown variant) |
| Threading | Based on `replyToMode` setting |

**Key behavior:**
- Supports thread replies, reactions, pins
- Action API for edit, delete, react, pin
- Inline buttons and modals supported

---

## 7. Threading & Replies

**File:** `src/infra/outbound/outbound-session.ts`

### Thread Resolution

The system resolves threading via:
- `replyToId`: Message ID to reply to
- `threadId`: Explicit thread/topic ID
- Session context: Last thread ID from session metadata

```typescript
const threadId = normalizeThreadId(params.threadId ?? params.replyToId);
const threadKeys = resolveThreadSessionKeys({
  baseSessionKey,
  threadId,
});
```

### Platform-Specific Threading

| Platform | Reply Mechanism | Thread Mechanism |
|----------|-----------------|------------------|
| Discord | `message_reference.message_id` | Thread channel ID |
| Telegram | `reply_to_message_id` | `messageThreadId` for forums |
| Slack | Based on `replyToMode` | Thread ID from `replyToId` |
| WhatsApp | Quoted message | N/A |
| Signal | N/A | N/A |
| iMessage | N/A | N/A |

### Reply Tags

**File:** `src/auto-reply/reply/reply-payloads.ts`

Handles `[[reply_to:msgid]]` tags from agent output:

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

## 8. Reply Routing (Cross-Provider)

**File:** `src/auto-reply/reply/route-reply.ts`

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

## 9. Session Mirroring

Messages are mirrored to session transcripts for history:

```typescript
// In deliverOutboundPayloads
if (params.mirror && results.length > 0) {
  const mirrorText = resolveMirroredTranscriptText({
    text: params.mirror.text,
    mediaUrls: params.mirror.mediaUrls,
  });
  if (mirrorText) {
    await appendAssistantMessageToSessionTranscript({
      agentId: params.mirror.agentId,
      sessionKey: params.mirror.sessionKey,
      text: mirrorText,
    });
  }
}
```

---

## 10. Error Handling

### Best Effort Mode

```typescript
} catch (err) {
  if (!params.bestEffort) throw err;
  params.onError?.(err, payloadSummary);
}
```

### Platform-Specific Errors

| Platform | Error Handling |
|----------|----------------|
| Discord | `DiscordSendError` with `kind` ("dm-blocked", "missing-permissions") |
| Telegram | Falls back to plain text on HTML parse errors |
| WhatsApp | Reconnect on socket errors |
| Signal | Retry on daemon connection failures |

### Retry Logic

- Retry runners per platform (`createDiscordRetryRunner`, `createTelegramRetryRunner`)
- Configurable retry policies per account
- Network error detection for recoverable failures

---

## 11. Rate Limiting

**Not implemented in outbound code.** Platforms enforce their own limits:
- Retry logic catches rate limit errors
- No built-in throttling or rate limit queues
- Some platforms (Discord) return `retry_after` hints

---

## 12. Complete Outbound Flow Diagram

```
                            Agent Response
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
└────────────────────────────│────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                deliverOutboundPayloads()                    │
│                                                             │
│  ┌───────────────────────────────────────────────────┐    │
│  │         loadChannelOutboundAdapter(channel)        │    │
│  └───────────────────────────────────────────────────┘    │
│                            │                               │
│                            ▼                               │
│  ┌───────────────────────────────────────────────────┐    │
│  │         Resolve chunking config per channel        │    │
│  │  • textChunkLimit (2000-4096)                      │    │
│  │  • chunkMode (length vs newline)                   │    │
│  │  • chunkerMode (text vs markdown)                  │    │
│  └───────────────────────────────────────────────────┘    │
│                            │                               │
│                            ▼                               │
│  ┌───────────────────────────────────────────────────┐    │
│  │           Normalize & chunk payloads               │    │
│  │  • Extract MEDIA: directives                       │    │
│  │  • Apply platform formatting                       │    │
│  │  • Split at paragraph/length boundaries           │    │
│  └───────────────────────────────────────────────────┘    │
│                            │                               │
│                            ▼                               │
│  ┌───────────────────────────────────────────────────┐    │
│  │           Platform-specific sendText/sendMedia     │    │
│  │  • Discord: REST API                               │    │
│  │  • Telegram: Bot API (HTML)                        │    │
│  │  • WhatsApp: Baileys socket                        │    │
│  │  • Signal: signal-cli daemon                       │    │
│  │  • iMessage: imsg CLI                              │    │
│  └───────────────────────────────────────────────────┘    │
│                            │                               │
│                            ▼                               │
│  ┌───────────────────────────────────────────────────┐    │
│  │              Session mirroring (optional)          │    │
│  └───────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
                             │
                             ▼
                   OutboundDeliveryResult[]
```

---

## 13. Key Takeaways for Nexus

1. **Plugin architecture works well** — Each platform has its own adapter with common interface
2. **Chunking is complex** — Markdown-aware, paragraph-aware, platform-specific limits
3. **Threading varies by platform** — Need consistent abstraction
4. **No rate limiting** — Platforms handle it, but Nexus might want proactive limiting
5. **Session mirroring** — Important for history; Nexus writes to Agents Ledger instead
6. **Error handling** — Best effort mode useful for non-critical messages
7. **Delivery confirmation** — Returns message IDs but no delivery status callbacks
8. **Human delays** — Makes responses feel natural, configurable per agent
9. **Reply dispatcher is serialized** — Preserves tool → block → final ordering

---

## Related Documents- `OPENCLAW_INBOUND.md` — Inbound reception patterns
- `STREAMING_OUTPUT.md` — Block streaming and coalescing details
- `CHANNEL_INVENTORY.md` — All channel implementations
- `../OUTBOUND_INTERFACE.md` — Nexus outbound interface spec
