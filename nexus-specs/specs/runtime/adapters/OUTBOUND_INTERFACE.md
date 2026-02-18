# Outbound Adapter Interface

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-18

---

## Overview

Outbound adapters deliver responses to external platforms. They handle formatting, chunking, and platform-specific delivery.

---

## Interface

```typescript
interface OutboundAdapter {
  // Identity
  channel: string;               // "discord", "telegram", "imessage", etc.
  
  // Capabilities
  capabilities: ChannelCapabilities;
  
  // Formatting
  formatText(content: string): string;
  chunkText(content: string): string[];
  
  // Delivery
  sendText(target: DeliveryTarget, text: string): Promise<DeliveryResult>;
  sendMedia(target: DeliveryTarget, media: MediaPayload): Promise<DeliveryResult>;
  
  // Platform-specific (optional)
  react?(target: MessageTarget, emoji: string): Promise<void>;
  createPoll?(target: DeliveryTarget, poll: PollPayload): Promise<PollResult>;
  deleteMessage?(target: MessageTarget): Promise<void>;
  editMessage?(target: MessageTarget, newContent: string): Promise<void>;
}
```

---

## Channel Capabilities

What the channel supports (for agent context):

```typescript
interface ChannelCapabilities {
  // Text limits
  text_limit: number;                    // Max chars per message
  caption_limit?: number;                // Max chars for media caption
  
  // Formatting
  supports_markdown: boolean;
  markdown_flavor?: 'standard' | 'discord' | 'telegram_html' | 'slack_mrkdwn';
  supports_tables: boolean;              // Render or must convert?
  supports_code_blocks: boolean;
  
  // Features
  supports_embeds: boolean;
  supports_threads: boolean;
  supports_reactions: boolean;
  supports_polls: boolean;
  supports_buttons: boolean;
  supports_edit: boolean;
  supports_delete: boolean;
  supports_media: boolean;
  supports_voice_notes: boolean;          // Native "voice note" / PTT-style messages

  // Behavioral
  supports_streaming_edit: boolean;       // Can "stream" by editing message
}
```

**Note:** Some older docs/channel specs use `supports_ptt`. Treat that as a deprecated alias of `supports_voice_notes`.

### Capabilities by Channel

| Channel | Limit | Markdown | Threads | Reactions | Polls |
|---------|-------|----------|---------|-----------|-------|
| Discord | 2000 | ✅ | ✅ | ✅ | ❌ |
| Telegram | 4096 | HTML | ✅ | ✅ | ✅ |
| WhatsApp | ~4000 | ❌ | ❌ | ✅ | ✅ |
| iMessage | ~4000 | ❌ | ❌ | Tapback | ❌ |
| Signal | ~4000 | Ranges | ❌ | ✅ | ❌ |
| Slack | 4000 | mrkdwn | ✅ | ✅ | ❌ |

---

## Delivery Target

Where to send:

```typescript
interface DeliveryTarget {
  channel: string;               // Platform
  account_id: string;            // Which bot account to use
  to: string;                    // Target identifier
  thread_id?: string;            // For threaded replies
  reply_to_id?: string;          // Reply to specific message
}
```

### Target Formats

| Channel | Format | Examples |
|---------|--------|----------|
| Discord | `channel:{id}` or `user:{id}` | `channel:123456789` |
| Telegram | `chat:{id}` | `chat:-1001234567` |
| WhatsApp | `{phone}` or `{group_jid}` | `+14155551234` |
| iMessage | `{phone}` or `{email}` | `+14155551234` |
| Slack | `channel:{id}` or `user:{id}` | `channel:C1234567` |

---

## Delivery Result

What happened:

```typescript
interface DeliveryResult {
  success: boolean;
  message_ids: string[];         // Platform message IDs (one per chunk)
  chunks_sent: number;
  total_chars?: number;          // Optional metrics field
  error?: DeliveryError;
}

interface DeliveryError {
  // Machine-readable classification used by NEX retry/backoff policy.
  type: 'rate_limited' | 'permission_denied' | 'not_found' | 'content_rejected' | 'network' | 'unknown';

  // Human-readable message for logs/diagnostics.
  message: string;

  // Policy signal to NEX: whether a retry is appropriate.
  retry: boolean;

  // Optional: rate limit backoff.
  retry_after_ms?: number;

  // Optional: structured channel-specific debugging (never required).
  details?: Record<string, unknown>;
}
```

---

## Formatting

### formatText()

Converts content to channel-appropriate format:

```typescript
// Discord: Keep markdown, convert tables to code
formatText(md: string): string {
  return convertTablesToCodeBlocks(md);
}

// Telegram: Convert markdown to HTML
formatText(md: string): string {
  return markdownToTelegramHtml(md);
}

// WhatsApp: Strip markdown
formatText(md: string): string {
  return stripMarkdown(md);
}
```

### chunkText()

Splits long content respecting limits:

```typescript
interface ChunkOptions {
  max_length: number;            // Channel limit
  preserve_code_blocks: boolean; // Don't split mid-fence
  preserve_paragraphs: boolean;  // Prefer paragraph breaks
}

// Returns array of chunks
chunkText(content: string, options?: ChunkOptions): string[]
```

### Chunking Rules

1. **Prefer natural breaks:** paragraphs, sentences, words
2. **Preserve code blocks:** Don't split mid-fence. If a single fenced code block exceeds the limit, split by closing and reopening the fence between chunks.
3. **First chunk gets reply:** Only first chunk uses `reply_to_id`
4. **Add continuations:** Optional "..." at end/start

---

## Media Handling

```typescript
interface MediaPayload {
  type: 'image' | 'video' | 'audio' | 'file';
  source: string;                // URL or file path
  filename?: string;
  caption?: string;
  
  // Platform-specific
  as_voice_note?: boolean;       // WhatsApp/Signal PTT
  as_gif?: boolean;              // Play as GIF
  spoiler?: boolean;             // Discord spoiler
}
```

### Size Limits

| Channel | Image | Video | Audio | File |
|---------|-------|-------|-------|------|
| Discord | 8MB | 8MB | 8MB | 8MB (50MB Nitro) |
| Telegram | 10MB | 50MB | 50MB | 50MB |
| WhatsApp | 16MB | 16MB | 16MB | 100MB |
| iMessage | ~100MB | ~100MB | ~100MB | ~100MB |

---

## Message Tool Integration

Agents use the `message` tool which delegates to outbound adapters:

```typescript
interface MessageToolParams {
  action: 'send' | 'react' | 'poll' | 'delete' | 'edit';
  
  // Send
  message?: string;
  to?: string;                   // Defaults to reply
  channel?: string;              // Defaults to current
  
  // Threading
  thread_id?: string;
  reply_to_id?: string;
  
  // Reactions
  message_id?: string;
  emoji?: string;
  
  // Polls (where supported)
  poll_question?: string;
  poll_options?: string[];
}
```

### Message Tool Flow

```typescript
async function executeMessageTool(params: MessageToolParams, ctx: ToolContext) {
  const channel = params.channel || ctx.delivery.channel;
  const adapter = getOutboundAdapter(channel);
  
  if (params.action === 'send') {
    // Format for channel
    const formatted = adapter.formatText(params.message);
    const chunks = adapter.chunkText(formatted);
    
    // Deliver
    const target: DeliveryTarget = {
      channel,
      account_id: ctx.delivery.account_id,
      to: params.to || ctx.delivery.peer_id,
      thread_id: params.thread_id || ctx.delivery.thread_id,
      reply_to_id: params.reply_to_id || ctx.delivery.reply_to_id,
    };
    
    return adapter.sendText(target, formatted);
  }
  
  // ... other actions
}
```

---

## Formatting Guidance Injection

### Challenge

How does the agent know channel-specific formatting rules?

### Approach: Channel Context in NexusRequest

The `NexusRequest.delivery.capabilities` tells the agent what's supported.

### Per-Tool Guidance

For detailed guidance (Telegram HTML syntax, Discord embed structure), use one of:

1. **before_agent_start hook** — Inject into turn context
2. **Tool hook** — Inject when message tool is called (requires extension)
3. **Skill loading** — Agent loads formatting skill

See `upstream/TOOL_HOOK_MECHANISM.md` for implementation details.

---

## Implementation Patterns

### Pattern 1: CLI Tool

```bash
# Send text
eve send --chat-id "+14155551234" --text "Hello"

# Send with chunking
eve send --chat-id "+14155551234" --text "$(cat long.txt)" --chunk

# React
eve react --message-id "abc123" --emoji "👍"
```

### Pattern 2: Library

```typescript
import { iMessageAdapter } from './adapters/imessage';

await iMessageAdapter.sendText({
  channel: 'imessage',
  account_id: 'default',
  to: '+14155551234',
}, 'Hello from Nexus');
```

---

## Integration with NexusRequest

### Using Delivery Context

```typescript
async function deliverResponse(request: NexusRequest, content: string) {
  const { delivery } = request;
  const adapter = getOutboundAdapter(delivery.channel);
  
  const result = await adapter.sendText({
    channel: delivery.channel,
    account_id: delivery.account_id,
    to: delivery.peer_id,
    thread_id: delivery.thread_id,
    reply_to_id: delivery.reply_to_id,
  }, content);
  
  // Update request with delivery result
  request.delivery_result = result;
  request.pipeline.push({ stage: 'adapter_outbound', timestamp: Date.now() });
  
  return result;
}
```

---

## Error Handling

### Retry Logic

```typescript
interface RetryConfig {
  max_retries: number;           // Default: 3
  base_delay_ms: number;         // Default: 1000
  backoff_multiplier: number;    // Default: 2
  max_delay_ms: number;          // Default: 30000
}

async function sendWithRetry(
  adapter: OutboundAdapter,
  target: DeliveryTarget,
  text: string,
  config: RetryConfig = DEFAULT_RETRY,
): Promise<DeliveryResult> {
  let lastError: DeliveryError;
  
  for (let attempt = 0; attempt < config.max_retries; attempt++) {
    const result = await adapter.sendText(target, text);
    
    if (result.success) return result;
    
    lastError = result.error;
    
    // Don't retry permission errors
    if (lastError.type === 'permission_denied') throw lastError;
    
    // Respect rate limits
    const delay = lastError.type === 'rate_limited'
      ? lastError.retry_after_ms
      : Math.min(config.base_delay_ms * Math.pow(config.backoff_multiplier, attempt), config.max_delay_ms);
    
    await sleep(delay);
  }
  
  return { success: false, message_ids: [], chunks_sent: 0, error: lastError };
}
```

---

## Existing Adapters

| Tool | Channel | Status | Notes |
|------|---------|--------|-------|
| `eve` | iMessage | ✅ | macOS only |
| `gog` | Gmail | ✅ | Via Google API |

### To Port from Upstream

| Channel | Upstream | Target Tool |
|---------|----------|-------------|
| Discord | `src/discord/send.ts` | `discord-cli` |
| Telegram | `src/telegram/send.ts` | `telegram-bot` |
| WhatsApp | `src/web/outbound.ts` | Baileys wrapper |
| Signal | `src/signal/send.ts` | signal-cli wrapper |
| Slack | `src/slack/send.ts` | `slack-cli` |

---

## Related

- `INBOUND_INTERFACE.md` — Event receiving interface
- `ADAPTER_INTERFACES.md` — Combined overview
- `channels/{channel}.md` — Per-channel specs
- `upstream/TOOL_HOOK_MECHANISM.md` — Hook details
