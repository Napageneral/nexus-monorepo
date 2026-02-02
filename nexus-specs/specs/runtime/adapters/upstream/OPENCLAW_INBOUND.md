# OpenClaw Inbound Adapter System

Reference documentation for how OpenClaw handles inbound message reception.

**Source:** `/Users/tyler/nexus/home/projects/openclaw/`  
**Key Files:**
- `src/auto-reply/dispatch.ts` — Common dispatch
- `src/auto-reply/reply/inbound-context.ts` — Context normalization
- `src/routing/resolve-route.ts` — Agent routing
- Platform-specific monitors (see below)

---

## 1. Architecture Overview

Each platform has its own monitor/listener that receives raw events and normalizes them.

```
Platform API (Discord, Telegram, etc.)
     │
     ▼
Platform Monitor (listener/webhook/polling)
     │
     ├─→ Extract raw message data
     │
     ├─→ Access control checks (allowlist, pairing, group policy)
     │
     ├─→ Debouncing (batch rapid messages)
     │
     ├─→ Normalize to MsgContext
     │
     ├─→ resolveAgentRoute() — determine which agent/session
     │
     └─→ dispatchInboundMessage() — send to agent
```

---

## 2. Common Interface: MsgContext

All platforms normalize to this structure:

```typescript
type MsgContext = {
  // Message content
  Body?: string;              // Formatted body with envelope
  BodyForAgent?: string;      // Agent prompt body
  RawBody?: string;           // Raw message text
  CommandBody?: string;       // For command detection
  
  // Sender info
  From?: string;              // Sender identifier (e.g., "discord:user:123")
  SenderName?: string;
  SenderId?: string;
  
  // Destination
  To?: string;                // Destination (e.g., "discord:channel:456")
  
  // Session/routing
  SessionKey?: string;        // Agent session key
  AccountId?: string;         // Multi-account support
  ChatType?: string;          // "direct" | "group" | "channel"
  
  // Platform info
  Provider?: string;          // "discord", "telegram", etc.
  Surface?: string;           // Provider surface
  MessageSid?: string;        // Platform message ID
  
  // Media
  MediaPath?: string;
  MediaType?: string;
  
  // Metadata
  Timestamp?: number;
  ConversationLabel?: string; // Human-readable label
  CommandAuthorized?: boolean;
  
  // Originating context (for replies)
  OriginatingChannel?: string;
  OriginatingTo?: string;
  OriginatingReplyToId?: string;
  OriginatingThreadId?: string;
}
```

### Envelope Format

Each platform builds an envelope for context:

```
[Discord] #channel-name User: message
[Telegram] Group Name User: message
[iMessage] Sender Name: message
[Signal] Group Name Sender: message
```

---

## 3. Platform-Specific Monitors

### Discord

**Entry:** `src/discord/monitor/listeners.ts`

- Uses `@buape/carbon` library with `MessageCreateListener`
- Flow: Gateway events → `createDiscordMessageHandler()` → `preflightDiscordMessage()` → `processDiscordMessage()`

**Features:**
- Thread handling and auto-threading
- Guild/channel allowlists
- Mention detection
- Reaction handling

**Extracted fields:**
- `message.content`, `author.id`, `channelId`, `guildId`
- Attachments, thread info, mentions

### Telegram

**Entry:** `src/telegram/monitor.ts`

- Uses `grammy` bot framework
- Flow: Grammy bot → `createTelegramBot()` → `registerTelegramHandlers()` → `createTelegramMessageProcessor()`

**Features:**
- Webhook and polling modes
- Forum topic support (`messageThreadId`)
- Reactions and native commands

**Extracted fields:**
- `message.text`, `chat.id`, `from.id`, `message_thread_id`
- Media, forum topics

### iMessage

**Entry:** `src/imessage/monitor/monitor-provider.ts`

- Uses custom RPC client wrapping `imsg` CLI
- Flow: RPC client → `createIMessageRpcClient()` → message handler → normalization

**Features:**
- Remote host support (SSH)
- Chat GUID resolution
- Group vs DM detection

**Extracted fields:**
- `message.text`, `sender`, `chat_id`, `chat_guid`

### Signal

**Entry:** `src/signal/monitor/event-handler.ts`

- Uses Signal daemon SSE events
- Flow: SSE events → `event.event === "receive"` → parse envelope → handler

**Features:**
- Reaction notifications
- Read receipts
- Pairing flow

**Extracted fields:**
- `envelope.dataMessage.message`, `envelope.sourceName`, `groupInfo`

### WhatsApp (Baileys)

**Entry:** `src/web/inbound/monitor.ts`

- Uses `@whiskeysockets/baileys` WebSocket
- Flow: Baileys socket → `messages.upsert` event → extract → `WebInboundMessage`

**Features:**
- Media download
- Read receipts
- Group metadata caching

**Extracted fields:**
- `msg.message`, `remoteJid`, `participant`, `pushName`

---

## 4. Routing

**Function:** `resolveAgentRoute()` in `src/routing/resolve-route.ts`

```typescript
resolveAgentRoute({
  cfg: OpenClawConfig,
  channel: "discord" | "telegram" | "signal" | "imessage",
  accountId: string,
  peer: { kind: "dm" | "group" | "channel", id: string },
  guildId?: string,  // Discord-specific
  teamId?: string,   // Slack-specific
})
```

### Routing Priority

1. **Peer binding** — exact peer match
2. **Guild binding** — Discord guild match
3. **Team binding** — Slack team match
4. **Account binding** — account-level match
5. **Channel binding** — wildcard account (`*`)
6. **Default agent** — fallback

### Session Key Format

```
agent:{agentId}:{channel}:{accountId}:{peerKind}:{peerId}
```

Example: `agent:main:discord:bot123:dm:user456`

### DM Scoping Modes

| Mode | Behavior |
|------|----------|
| `main` | All DMs collapse to single session |
| `per-peer` | Separate session per peer |
| `per-channel-peer` | Per channel + peer |
| `per-account-channel-peer` | Full isolation |

---

## 5. Dispatch

**Function:** `dispatchInboundMessage()` in `src/auto-reply/dispatch.ts`

```
finalizeInboundContext()
     │
     ├─→ Normalize text fields
     ├─→ Resolve ChatType
     ├─→ Build BodyForAgent
     ├─→ Format sender metadata
     │
     ▼
dispatchReplyFromConfig()
     │
     ├─→ Create typing indicators
     ├─→ Create reply dispatcher
     ├─→ Route to agent
     │
     ▼
Agent receives MsgContext
```

---

## 6. Relationship to Outbound

**Currently separate but sharing infrastructure:**

| Component | Inbound | Outbound |
|-----------|---------|----------|
| Platform files | `src/{platform}/monitor*.ts` | `src/{platform}/send.ts` |
| Entry point | Monitor/listener | `deliverOutboundPayloads()` |
| Normalization | `MsgContext` | `OutboundPayload` |
| Routing | `resolveAgentRoute()` | Uses `OriginatingChannel`/`OriginatingTo` |

**Shared between both:**
- `src/channels/session.ts` — Session recording
- `src/routing/resolve-route.ts` — Routing logic
- `src/auto-reply/reply/reply-dispatcher.ts` — Reply dispatching
- `src/channels/typing.ts` — Typing indicators
- `src/channels/ack-reactions.ts` — Acknowledgment reactions

---

## 7. Key Takeaways for Nexus

1. **Normalization is essential** — All platforms map to common `MsgContext`
2. **Routing is flexible** — Bindings allow per-peer, per-guild, per-account routing
3. **Session key encodes context** — Contains agent, channel, account, peer info
4. **DM scoping is configurable** — Can collapse or isolate DM sessions
5. **Shared infrastructure** — Inbound and outbound share routing/session code
6. **Envelope format** — Provides context to agent about message source
