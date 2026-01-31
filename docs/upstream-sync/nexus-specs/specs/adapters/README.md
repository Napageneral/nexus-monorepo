# Adapters Spec

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-01-30

---

## Overview

Adapters are the boundary between Nexus and external platforms. Each channel (Discord, Telegram, iMessage, etc.) needs both:

1. **Inbound**: Receive messages from platform → normalize → store in Events Ledger
2. **Outbound**: Take agent response → format for platform → deliver

This folder proposes **unified channel adapters** that handle both directions.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `README.md` | This file | Architecture overview |
| `OUT_ADAPTER_SYSTEM.md` | ✅ Done | Outbound adapters, message tool, formatting, tool hooks |
| `IN_ADAPTER_SYSTEM.md` | ✅ Done | Inbound adapters, normalization, pipeline |
| `upstream-reference/OPENCLAW_INBOUND.md` | ✅ Done | OpenClaw inbound patterns |
| `upstream-reference/OPENCLAW_OUTBOUND.md` | ✅ Done | OpenClaw outbound patterns |

**Start with `OUT_ADAPTER_SYSTEM.md`** — it covers message tool, formatting guides, tool hooks, and per-channel implementations.

---

## Architecture: Unified Channel Adapters

### The Problem

Currently (in OpenClaw), each channel has:
- `src/{channel}/monitor*.ts` — Inbound
- `src/{channel}/send.ts` — Outbound

They share routing/session code but are separate. This leads to:
- Platform limits defined in multiple places
- Formatting rules spread across files
- Harder to add new channels

### The Proposal: One Adapter Per Channel

```typescript
interface ChannelAdapter {
  // Identity
  channel: string;  // "discord", "telegram", "imessage", etc.
  
  // Platform capabilities (single source of truth)
  capabilities: {
    textLimit: number;           // Discord: 2000, Telegram: 4096
    captionLimit?: number;       // Telegram: 1024
    supportsMarkdown: boolean;
    supportsEmbeds: boolean;
    supportsThreads: boolean;
    supportsReactions: boolean;
    supportsPTT: boolean;        // Push-to-talk audio
    supportsPolls: boolean;
  };
  
  // ─────────────────────────────────────────────────────────
  // INBOUND: Platform → Nexus
  // ─────────────────────────────────────────────────────────
  
  // Start listening for messages
  startMonitor(config: AdapterConfig): void;
  stopMonitor(): void;
  
  // Normalize platform event to Nexus event
  normalizeEvent(rawEvent: unknown): NexusEvent;
  
  // ─────────────────────────────────────────────────────────
  // OUTBOUND: Nexus → Platform
  // ─────────────────────────────────────────────────────────
  
  // Format content for this platform
  formatMessage(content: string, options?: FormatOptions): PlatformMessage;
  
  // Chunk long messages
  chunkMessage(content: string): string[];
  
  // Send message to platform
  sendMessage(target: DeliveryTarget, message: PlatformMessage): Promise<DeliveryResult>;
  
  // Send media
  sendMedia(target: DeliveryTarget, media: MediaPayload): Promise<DeliveryResult>;
}
```

### Benefits

1. **Single source of truth** — Platform limits, formatting rules in one place
2. **Easier to add channels** — Implement one interface
3. **Consistent behavior** — Inbound normalization matches outbound expectations
4. **Agent-friendly** — Capabilities exposed for context assembly

---

## Event Flow with Unified Adapters

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         CHANNEL ADAPTER (per platform)                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          INBOUND PATH                                │   │
│  │                                                                      │   │
│  │  Platform API (webhook/websocket/polling)                           │   │
│  │       │                                                              │   │
│  │       ▼                                                              │   │
│  │  startMonitor() ─► rawEvent ─► normalizeEvent() ─► NexusEvent       │   │
│  │                                                            │         │   │
│  │                                                            ▼         │   │
│  │                                              Events Ledger (persist)  │   │
│  │                                                            │         │   │
│  │                                                            ▼         │   │
│  │                                                    ACL → Hooks → Broker │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          OUTBOUND PATH                               │   │
│  │                                                                      │   │
│  │  Broker (agent response with delivery context)                      │   │
│  │       │                                                              │   │
│  │       ▼                                                              │   │
│  │  formatMessage() ─► chunkMessage() ─► sendMessage() ─► Platform API │   │
│  │       │                                                    │         │   │
│  │       ▼                                                    ▼         │   │
│  │  Events Ledger (record outbound)               Delivery Result       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## How Agents Interface with Adapters

### Upstream Pattern (OpenClaw)

OpenClaw has **two paths** for agent responses:

1. **Automatic routing**: Agent returns text → extracted → delivered to originating channel
2. **Explicit `message` tool**: Agent calls `message` tool for proactive sends, cross-channel, polls, etc.

```typescript
// Automatic: agent just returns text
return "Here's your answer...";

// Explicit: agent uses message tool
message({
  action: "send",
  channel: "discord",
  to: "channel:123456",
  message: "Proactive notification!"
});
```

### Channel Context to Agent

OpenClaw provides context via:
1. `runtimeInfo.channel` in system prompt
2. `currentChannelId`/`currentChannelProvider` in tool options
3. Messaging guidance in system prompt

### Formatting Guidance

OpenClaw relies on:
1. `toolResultFormat` (markdown vs plain) based on channel capabilities
2. System prompt instructions
3. No dedicated formatting subagent

---

## Nexus Approach

### 1. NexusRequest: The Data Bus

All context flows through a `NexusRequest` object that accumulates through the pipeline.

**See:** `../core/NEXUS_REQUEST.md` for full schema.

```
Adapter creates NexusRequest
  → ACL adds principal, permissions, session
  → Hooks add fired_hooks, context
  → Broker adds agent_id, turn_id
  → Agent adds response
  → Delivery adds message_ids
  → Ledger persists complete trace
```

The adapter creates the initial request with delivery context:

```typescript
request.delivery = {
  channel: 'discord',
  account_id: 'bot123',
  thread_id: message.thread_id,
  reply_to_id: message.id,
  peer_id: message.channel_id,
  peer_kind: 'dm',
  capabilities: DISCORD_CAPABILITIES,
};
```

### 2. Agent Sees Channel

The agent receives channel info in its context:

```typescript
// In agent's system prompt or context
{
  delivery: {
    channel: "discord",
    thread_id: "thread_123",
    reply_to_id: "msg_456",
    capabilities: {
      textLimit: 2000,
      supportsEmbeds: true,
      supportsThreads: true
    }
  }
}
```

### 3. Formatting via Tool Hooks (On-Demand)

Instead of bloating the system prompt with formatting guidance, we use **tool hooks**:

```typescript
// When agent calls message tool, hook intercepts
async function beforeMessageTool(event, request) {
  const channel = request.delivery.channel;
  
  // Load channel-specific formatting skill
  const guide = await loadSkill(`channel-format-${channel}`);
  
  // Inject guidance into tool context
  return {
    params: {
      ...event.params,
      _formatting_guidance: guide.summary,
    },
  };
}
```

**Benefits:**
- System prompt stays static (cacheable)
- Guidance provided on-demand when needed
- Rich skill docs without bloating every turn

**Note:** Tool hooks exist in pi-agent but aren't currently invoked. We need to wrap tools with hook invocation.

### 4. Message Tool for Explicit Sends

Adopt OpenClaw's `message` tool pattern:

```typescript
// For proactive sends, cross-channel, polls, reactions
message({
  action: "send",      // or "react", "poll", "delete"
  channel: "telegram",
  to: "chat:12345",
  message: "Proactive notification!",
  reply_to?: string,
  thread_id?: string
});
```

### 5. Events Recorded in Ledger

Both inbound and outbound events go to Events Ledger:
- Inbound: `channel:discord`, `direction:received`
- Outbound: `channel:discord`, `direction:sent`

This provides full audit trail and enables hooks on outbound events.

---

## Platform-Specific Adoption from OpenClaw

We adopt OpenClaw's formatting rules per platform:

### Discord
- 2000 char limit
- Markdown tables converted
- Embeds supported
- First chunk gets reply reference

### Telegram
- 4096 char limit (default 4000)
- HTML formatting (Markdown → HTML)
- 1024 char caption limit
- Forum topics via `messageThreadId`

### WhatsApp
- ~4000 char limit
- Plain text (tables converted)
- Opus codec for voice notes
- GIF playback configurable

### iMessage
- ~4000 char limit
- Markdown tables converted
- Media via `imsg` CLI

### Signal
- ~4000 char limit
- Style ranges preserved
- Media size limits

---

## Chunking Strategy (from OpenClaw)

```typescript
interface ChunkOptions {
  mode: "length" | "newline";  // newline = paragraph-aware
  preserveCodeBlocks: boolean;
  preserveMarkdown: boolean;
}

// Chunking functions
chunkText(text, limit);           // Basic length-based
chunkMarkdownText(text, limit);   // Markdown-aware
chunkByParagraph(text, limit);    // Paragraph boundaries
```

---

## Open Questions

1. **Should we have a formatting subagent?**
   - Main agent writes content
   - Formatter subagent adapts to platform
   - Adds latency but improves quality

2. **How explicit should channel context be?**
   - Full capabilities object in context?
   - Just channel name and let agent figure it out?
   - System prompt guidance only?

3. **Multi-platform responses?**
   - Can an agent respond to multiple channels at once?
   - Different formatting per channel?

---

## Next Steps

1. Define `ChannelAdapter` interface precisely
2. Map OpenClaw's existing adapters to this interface
3. Spec the `message` tool for Nexus
4. Define how delivery context flows through broker

---

*See `upstream-reference/` for detailed OpenClaw patterns.*
