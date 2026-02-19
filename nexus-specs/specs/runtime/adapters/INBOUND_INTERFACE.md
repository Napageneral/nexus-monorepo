# Inbound Adapter Interface

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-18

---

## Overview

Inbound adapters receive messages from external platforms and normalize them to `NexusEvent`. They are external tools that emit events.

---

## Interface

```typescript
interface InboundAdapter {
  // Identity
  platform: string;              // "discord", "telegram", "imessage", etc.
  
  // Lifecycle
  start(config: AdapterConfig): Promise<void>;
  stop(): Promise<void>;
  isConnected(): boolean;
  
  // Event emission
  onEvent(callback: (event: NexusEvent) => void): void;
  
  // Optional: Health
  healthCheck?(): Promise<HealthStatus>;
}

interface AdapterConfig {
  account_id: string;            // Which account to monitor
  credentials?: CredentialRef;   // How to auth
  filters?: EventFilter[];       // Optional event filtering
}

interface HealthStatus {
  connected: boolean;
  last_event_at?: number;
  error?: string;
}
```

---

## NexusEvent Schema

The normalized event format all adapters emit:

```typescript
interface NexusEvent {
  // Identity
  event_id: string;              // "{platform}:{source_id}"
  timestamp: number;             // Unix ms
  
  // Content
  content: string;
  content_type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'reaction';
  attachments?: Attachment[];
  
  // Routing context
  platform: string;              // Platform name
  account_id: string;            // Which bot account received
  sender_id: string;             // Platform-specific sender ID
  sender_name?: string;          // Display name if available
  container_id: string;          // Chat/channel/DM container ID
  container_kind: 'dm' | 'group' | 'channel' | 'direct';
  thread_id?: string;            // For threaded conversations
  reply_to_id?: string;          // If replying to a message
  
  // Platform metadata (varies by channel)
  metadata?: Record<string, unknown>;
}

interface Attachment {
  id: string;
  filename: string;
  content_type: string;          // MIME type
  size_bytes?: number;
  url?: string;                  // Remote URL
  path?: string;                 // Local path (if downloaded)
}
```

---

## Implementation Patterns

### Pattern 1: CLI Tool (Recommended)

Tool emits JSON lines on stdout:

```bash
# Tool monitors and emits events
eve monitor --account default --format jsonl

# Output (one JSON per line):
{"event_id":"imessage:abc123","timestamp":1706600000000,"content":"Hello",...}
{"event_id":"imessage:def456","timestamp":1706600001000,"content":"World",...}
```

Nexus reads stdout and processes events.

### Pattern 2: Daemon with RPC

Tool runs as daemon, Nexus connects via socket:

```bash
# Start daemon
discord-cli daemon --socket /tmp/discord.sock

# Nexus connects and receives events
```

### Pattern 3: HTTP Webhook

Tool runs HTTP server, platforms send webhooks:

```bash
# Tool handles webhooks, emits to Nexus via callback
telegram-bot serve --port 8080 --callback http://localhost:9000/events
```

---

## Normalization Examples

### Discord

```typescript
// Raw Discord message
const discordMsg = {
  id: "1234567890",
  content: "Hello world",
  author: { id: "user123", username: "alice" },
  channel_id: "chan456",
  space_id: "guild789",
};

// Normalized NexusEvent
const event: NexusEvent = {
  event_id: "discord:1234567890",
  timestamp: Date.now(),
  content: "Hello world",
  content_type: "text",
  platform: "discord",
  account_id: "bot-account-1",
  sender_id: "user123",
  sender_name: "alice",
  container_id: "chan456",
  container_kind: "group",  // or "dm" if DM container
  metadata: {
    space_id: "guild789",
  },
};
```

### iMessage

```typescript
// Raw iMessage (from eve)
const imsg = {
  guid: "abc-def-123",
  text: "Hey there",
  sender: "+14155551234",
  chat_id: "+14155551234",
  is_group: false,
};

// Normalized NexusEvent
const event: NexusEvent = {
  event_id: "imessage:abc-def-123",
  timestamp: Date.now(),
  content: "Hey there",
  content_type: "text",
  platform: "imessage",
  account_id: "default",
  sender_id: "+14155551234",
  container_id: "+14155551234",
  container_kind: "dm",
};
```

---

## Event Filtering

Adapters can optionally filter events before emission:

```typescript
interface EventFilter {
  type: 'include' | 'exclude';
  field: 'sender_id' | 'container_id' | 'content_type';
  pattern: string | RegExp;
}
```

Example: Only DMs from specific users:
```typescript
filters: [
  { type: 'include', field: 'container_kind', pattern: 'dm' },
  { type: 'include', field: 'sender_id', pattern: /^\+1415/ },
]
```

---

## Integration with Nexus

### Pipeline Entry

```typescript
// Adapter emits event
adapter.onEvent(async (event: NexusEvent) => {
  // Create NexusRequest
  const request = createNexusRequest(event);
  
  // Run through pipeline: ACL → Hooks → Broker
  await pipeline.process(request);
});
```

### NexusRequest Creation

```typescript
function createNexusRequest(event: NexusEvent): NexusRequest {
  return {
    request_id: uuid(),
    event_id: event.event_id,
    timestamp: event.timestamp,
    
    event: {
      content: event.content,
      content_type: event.content_type,
      attachments: event.attachments,
    },
    
    delivery: {
      platform: event.platform,
      account_id: event.account_id,
      container_id: event.container_id,
      container_kind: event.container_kind,
      thread_id: event.thread_id,
      reply_to_id: event.reply_to_id,
      capabilities: getPlatformCapabilities(event.platform),
    },
    
    pipeline: [{ stage: 'adapter_inbound', timestamp: Date.now() }],
  };
}
```

---

## Existing Adapters

| Tool | Platform | Status | Notes |
|------|----------|--------|-------|
| `eve` | iMessage | ✅ | macOS only |
| `gog` | Gmail | ✅ | Via Google API |
| `aix` | AI sessions | ✅ | Cursor/IDE |

### To Port from Upstream

| Platform | Upstream | Target Tool |
|----------|----------|-------------|
| Discord | `src/discord/monitor.ts` | `discord-cli` |
| Telegram | `src/telegram/monitor.ts` | `telegram-bot` |
| WhatsApp | `src/web/inbound/` | Baileys wrapper |
| Signal | `src/signal/monitor.ts` | signal-cli wrapper |
| Slack | `src/slack/monitor.ts` | `slack-cli` |

---

## Related

- `OUTBOUND_INTERFACE.md` — Delivery interface
- `ADAPTER_INTERFACES.md` — Combined overview
- `channels/{channel}.md` — Per-channel specs
