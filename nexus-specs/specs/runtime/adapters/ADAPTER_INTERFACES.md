# Adapter Interface Definitions

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-01-30

---

## Overview

Adapters connect Nexus to external platforms. We define two interfaces:

1. **Inbound Adapter** — Receives messages from platform, normalizes to `NexusEvent`
2. **Outbound Adapter** — Delivers responses to platform with formatting

A single tool (like `eve` for iMessage or `gog` for Gmail) can implement one or both interfaces.

**Detailed specs:**
- `INBOUND_INTERFACE.md` — Full inbound interface definition
- `OUTBOUND_INTERFACE.md` — Full outbound interface definition

---

## Design Principles

### 1. External Tools

Adapters are external binaries/tools that meet the interface. They can be:
- CLI tools (`eve`, `gog`, `discord-cli`)
- Daemons with RPC
- HTTP services

### 2. Modular

Inbound and outbound are separate interfaces. One tool can implement both, or use different tools for each direction.

### 3. Upstream Compatibility

Port formatting/chunking logic from OpenClaw into tools, encapsulating platform-specific behavior.

---

## Inbound Adapter Interface

Receives messages from a platform and emits normalized events.

```typescript
interface InboundAdapter {
  // Identity
  channel: string;           // "discord", "telegram", "imessage", etc.
  
  // Lifecycle
  start(config: AdapterConfig): Promise<void>;
  stop(): Promise<void>;
  isConnected(): boolean;
  
  // Event emission
  onEvent(callback: (event: NexusEvent) => void): void;
}
```

### NexusEvent Schema

What the adapter emits:

```typescript
interface NexusEvent {
  // Identity
  event_id: string;              // "{channel}:{source_id}"
  timestamp: number;             // Unix ms
  
  // Content
  content: string;
  content_type: 'text' | 'image' | 'audio' | 'video' | 'file';
  attachments?: Attachment[];
  
  // Routing
  channel: string;
  account_id: string;            // Which bot account received
  sender_id: string;
  sender_name?: string;
  peer_id: string;               // Chat/channel/user ID
  peer_kind: 'dm' | 'group' | 'channel';
  thread_id?: string;
  reply_to_id?: string;
  
  // Platform metadata
  metadata?: Record<string, any>;
}

interface Attachment {
  id: string;
  filename: string;
  url?: string;
  path?: string;
  content_type: string;
  size_bytes?: number;
}
```

### Example: iMessage (eve)

```bash
# eve emits events as JSON lines
eve monitor --account default --format jsonl

# Output:
{"event_id":"imessage:abc123","timestamp":1706600000000,"content":"Hello","channel":"imessage",...}
```

---

## Outbound Adapter Interface

Delivers messages to a platform with appropriate formatting. Supports two delivery modes: direct `send` for complete messages, and `stream` for real-time token delivery.

```typescript
interface OutboundAdapter {
  // Identity
  channel: string;
  
  // Declared capabilities
  supports: AdapterCapability[];     // Includes 'stream' if streaming supported
  
  // Capabilities (for agent context)
  capabilities: ChannelCapabilities;
  
  // Formatting (platform-specific)
  formatText(content: string): string;
  chunkText(content: string): string[];
  
  // Delivery (complete messages)
  sendText(target: DeliveryTarget, text: string): Promise<DeliveryResult>;
  sendMedia(target: DeliveryTarget, media: MediaPayload): Promise<DeliveryResult>;
  
  // Streaming delivery (real-time tokens) — only if supports includes 'stream'
  // Managed as a long-running process by NEX. See ADAPTER_SYSTEM.md for protocol.
  
  // Platform-specific actions (optional)
  react?(target: MessageTarget, emoji: string): Promise<void>;
  createPoll?(target: DeliveryTarget, poll: PollPayload): Promise<PollResult>;
}
```

### ChannelCapabilities

What the channel supports:

```typescript
interface ChannelCapabilities {
  // Text limits
  text_limit: number;            // Max chars per message
  caption_limit?: number;        // Max chars for media caption
  
  // Formatting
  supports_markdown: boolean;
  markdown_flavor?: 'standard' | 'discord' | 'telegram_html' | 'slack';
  
  // Features
  supports_embeds: boolean;
  supports_threads: boolean;
  supports_reactions: boolean;
  supports_polls: boolean;
  supports_buttons: boolean;
  supports_ptt: boolean;         // Push-to-talk audio
  
  // Streaming (informational — actual support declared via 'stream' in adapter supports)
  supports_streaming_edit: boolean;   // Can pseudo-stream by editing messages
}
```

### DeliveryTarget

Where to send:

```typescript
interface DeliveryTarget {
  channel: string;
  account_id: string;
  to: string;                    // "user:ID", "channel:ID", "chat:ID"
  thread_id?: string;
  reply_to_id?: string;
}
```

### DeliveryResult

What happened:

```typescript
interface DeliveryResult {
  success: boolean;
  message_ids: string[];         // Platform message IDs
  chunks_sent: number;
  error?: string;
}
```

### Example: iMessage (eve)

```bash
# Send via eve
eve send --chat-id "+1234567890" --text "Hello from Nexus"

# With chunking handled by eve
eve send --chat-id "+1234567890" --text "$(cat long_message.txt)" --chunk
```

### Streaming Types

Types for the bidirectional `stream` protocol (JSONL on stdin/stdout):

```typescript
// NEX → Adapter (stdin)
type StreamEvent =
  | { type: 'stream_start'; runId: string; sessionLabel: string; target: DeliveryTarget }
  | { type: 'token'; text: string }
  | { type: 'tool_status'; toolName: string; toolCallId: string; status: 'started' | 'completed' | 'failed'; summary?: string }
  | { type: 'reasoning'; text: string }
  | { type: 'stream_end'; runId: string; final?: boolean }
  | { type: 'stream_error'; error: string; partial: boolean };

// Adapter → NEX (stdout)
type AdapterStreamStatus =
  | { type: 'message_created'; messageId: string }
  | { type: 'message_updated'; messageId: string; chars: number }
  | { type: 'message_sent'; messageId: string; final: boolean }
  | { type: 'delivery_complete'; messageIds: string[] }
  | { type: 'delivery_error'; error: string };
```

See `broker/STREAMING.md` for the full streaming architecture and `ADAPTER_SYSTEM.md` for the `stream` command protocol.

---

## Unified Adapter (Optional)

A tool can implement both interfaces:

```typescript
interface ChannelAdapter extends InboundAdapter, OutboundAdapter {
  channel: string;
  capabilities: ChannelCapabilities;
}
```

### Examples

| Tool | Inbound | Outbound | Channel |
|------|---------|----------|---------|
| `eve` | ✅ | ✅ | iMessage |
| `gog` | ✅ | ✅ | Gmail |
| `discord-cli` | ✅ | ✅ | Discord |
| `telegram-bot` | ✅ | ✅ | Telegram |
| `aix` | ✅ | ❌ | AI sessions |

---

## Message Tool

Agents use the `message` tool for explicit sends. The tool delegates to outbound adapters.

```typescript
interface MessageToolParams {
  action: 'send' | 'react' | 'poll' | 'delete' | 'pin';
  
  // For send
  message?: string;
  to?: string;                   // Target (defaults to reply)
  channel?: string;              // Channel (defaults to current)
  
  // Threading
  thread_id?: string;
  reply_to_id?: string;
  
  // Reactions
  message_id?: string;
  emoji?: string;
  
  // Polls
  poll_question?: string;
  poll_options?: string[];
  
  // Platform features
  buttons?: Button[][];          // Telegram/Slack
  card?: object;                 // Teams/Slack
}
```

The message tool:
1. Resolves target channel and adapter
2. Calls adapter's `formatText()` and `chunkText()`
3. Calls adapter's `sendText()` or other action
4. Returns delivery result

---

## Formatting Guidance

### Current State

Agents receive channel context via `NexusRequest.delivery.capabilities`.

### Challenge

How does the agent know detailed formatting rules (Telegram HTML syntax, Discord embed structure)?

### Options

1. **System prompt** — Include formatting guide (breaks caching)
2. **Tool hook** — Inject guidance when message tool called (requires implementation)
3. **Skill loading** — Agent loads skill for channel before formatting

**See:** `upstream/TOOL_HOOK_MECHANISM.md` for details.

---

## Error Handling

### Retry Logic

```typescript
interface RetryConfig {
  max_retries: number;           // Default: 3
  backoff_ms: number;            // Default: 1000
  backoff_multiplier: number;    // Default: 2
}
```

### Best Effort Mode

For non-critical messages, continue on failure:

```typescript
interface DeliveryOptions {
  best_effort?: boolean;         // Don't throw on failure
  on_error?: (error: Error) => void;
}
```

### Error Types

```typescript
type DeliveryError = 
  | { type: 'rate_limited'; retry_after_ms: number }
  | { type: 'permission_denied'; reason: string }
  | { type: 'not_found'; target: string }
  | { type: 'network'; message: string }
  | { type: 'unknown'; message: string };
```

---

## Media Handling

Each channel has different media capabilities. See `channels/{channel}.md` for details.

### Common Interface

```typescript
interface MediaPayload {
  type: 'image' | 'video' | 'audio' | 'file';
  source: string;                // URL or file path
  filename?: string;
  caption?: string;
  
  // Platform-specific
  as_voice_note?: boolean;       // WhatsApp/Telegram PTT
  as_gif?: boolean;              // Play as GIF
}
```

---

## Integration with NexusRequest

### Inbound

Adapter creates initial `NexusRequest`:

```typescript
function createNexusRequest(event: NexusEvent): NexusRequest {
  return {
    request_id: uuid(),
    event_id: event.event_id,
    timestamp: event.timestamp,
    event: { content: event.content, ... },
    delivery: {
      channel: event.channel,
      account_id: event.account_id,
      peer_id: event.peer_id,
      capabilities: getCapabilities(event.channel),
      ...
    },
    pipeline: [{ stage: 'adapter', timestamp: Date.now() }],
  };
}
```

### Outbound

Broker uses `NexusRequest.delivery` to route to correct adapter:

```typescript
async function deliverResponse(request: NexusRequest, content: string) {
  const adapter = getOutboundAdapter(request.delivery.channel);
  return adapter.sendText({
    channel: request.delivery.channel,
    account_id: request.delivery.account_id,
    to: request.delivery.peer_id,
    thread_id: request.delivery.thread_id,
    reply_to_id: request.delivery.reply_to_id,
  }, content);
}
```

---

## Related Specs

- `upstream/CHANNEL_INVENTORY.md` — All upstream channels
- `upstream/TOOL_HOOK_MECHANISM.md` — Hook investigation
- `channels/{channel}.md` — Per-channel details
- `../nex/NEXUS_REQUEST.md` — Request object
