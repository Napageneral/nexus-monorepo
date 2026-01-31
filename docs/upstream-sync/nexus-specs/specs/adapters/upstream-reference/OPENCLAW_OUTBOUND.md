# OpenClaw Outbound Adapter System

Reference documentation for how OpenClaw handles outbound message delivery.

**Source:** `/Users/tyler/nexus/home/projects/openclaw/`  
**Key Files:**
- `src/infra/outbound/deliver.ts` — Main delivery orchestrator
- `src/infra/outbound/outbound-send-service.ts` — Service layer
- `src/channels/plugins/types.adapters.ts` — Adapter interface definitions
- `src/auto-reply/chunk.ts` — Chunking system

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

### Delivery Flow

```
Agent Response
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

## 2. Platform-Specific Implementations

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
- No explicit character limit in code

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

---

## 3. Chunking System

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

### Chunking Logic

```typescript
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

## 4. Threading & Replies

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

---

## 5. Delivery Result

Each platform returns `OutboundDeliveryResult`:

```typescript
export type OutboundDeliveryResult = {
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

### Session Mirroring

Messages are mirrored to session transcripts for history:

```typescript
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

## 6. Error Handling

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

### Retry Logic

- Retry runners per platform (`createDiscordRetryRunner`, `createTelegramRetryRunner`)
- Configurable retry policies per account
- Network error detection for recoverable failures

---

## 7. Rate Limiting

**Not implemented in outbound code.** Platforms enforce their own limits:
- Retry logic catches rate limit errors
- No built-in throttling or rate limit queues

---

## Key Takeaways for Nexus

1. **Plugin architecture works well** — Each platform has its own adapter with common interface
2. **Chunking is complex** — Markdown-aware, paragraph-aware, platform-specific limits
3. **Threading varies by platform** — Need consistent abstraction
4. **No rate limiting** — Platforms handle it, but Nexus might want proactive limiting
5. **Session mirroring** — Important for history; Nexus writes to Agents Ledger instead
6. **Error handling** — Best effort mode useful for non-critical messages
7. **Delivery confirmation** — Returns message IDs but no delivery status callbacks
