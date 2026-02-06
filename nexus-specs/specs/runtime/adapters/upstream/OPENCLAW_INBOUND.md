# OpenClaw Inbound Adapter System

Reference documentation for how OpenClaw handles inbound message reception and dispatch.

**Source:** `/Users/tyler/nexus/home/projects/openclaw/`  
**Key Files:**
- `src/auto-reply/dispatch.ts` — Entry point for message dispatch
- `src/auto-reply/reply/dispatch-from-config.ts` — Core dispatch orchestration
- `src/auto-reply/reply/inbound-context.ts` — Context normalization
- `src/auto-reply/reply/inbound-dedupe.ts` — Deduplication cache
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

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Platform Monitor** | Receives raw events, extracts message data |
| **Access Control** | Allowlists, mention gating, command gating |
| **Normalizer** | Converts to `MsgContext` with envelope |
| **Router** | Resolves agent and session key |
| **Dispatcher** | Invokes reply pipeline |

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
  BodyForCommands?: string;   // Normalized for command matching
  
  // Sender info
  From?: string;              // Sender identifier (e.g., "discord:user:123")
  SenderName?: string;        // Display name
  SenderId?: string;          // Platform-specific ID
  SenderUsername?: string;    // @username
  SenderE164?: string;        // Phone number (E.164 format)
  
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
  MediaPaths?: string[];
  MediaType?: string;
  MediaTypes?: string[];
  MediaUrl?: string;
  MediaUrls?: string[];
  
  // Metadata
  Timestamp?: number;
  ConversationLabel?: string; // Human-readable label
  CommandAuthorized?: boolean;
  
  // Group context
  GroupSubject?: string;
  GroupChannel?: string;
  GroupMembers?: string;
  
  // Originating context (for cross-provider replies)
  OriginatingChannel?: OriginatingChannelType;
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

### Nexus Mapping

| MsgContext Field | NexusEvent Field |
|------------------|------------------|
| `Provider` | `channel` |
| `SenderId` | `sender_id` |
| `SenderName` | `sender_name` |
| `To` | `peer_id` |
| `ChatType` | `peer_kind` |
| `SessionKey` | Used by broker routing |
| `MessageSid` | Part of `event_id` |
| `RawBody` | `content` |

---

## 3. Message Dispatch Flow

### Entry Point: `dispatch.ts`

The main entry point receives inbound messages and routes them through the reply system.

**File:** `src/auto-reply/dispatch.ts`

```typescript
// dispatch.ts:17-32
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

| Function | Purpose |
|----------|---------|
| `dispatchInboundMessage()` | Core dispatch - finalizes context, invokes reply generator |
| `dispatchInboundMessageWithDispatcher()` | Creates dispatcher, waits for idle |
| `dispatchInboundMessageWithBufferedDispatcher()` | Adds typing indicator support |

---

### Core Dispatch: `dispatch-from-config.ts`

**File:** `src/auto-reply/reply/dispatch-from-config.ts`

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
// dispatch-from-config.ts:143-146
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

**File:** `src/auto-reply/reply/inbound-dedupe.ts`

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

**File:** `src/auto-reply/reply/inbound-context.ts`

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

**File:** `src/auto-reply/command-detection.ts`

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

## 4. Platform-Specific Monitors

### Discord

**Entry:** `src/discord/monitor/listeners.ts`

- Uses `@buape/carbon` library with `MessageCreateListener`
- Flow: Gateway events → `createDiscordMessageHandler()` → `preflightDiscordMessage()` → `processDiscordMessage()`

**Features:**
- Thread handling and auto-threading
- Guild/channel allowlists
- Mention detection (`wasMentioned`)
- Reaction handling
- Slash command support

**Extracted fields:**
- `message.content`, `author.id`, `channelId`, `guildId`
- Attachments, thread info, mentions

**Key files:**
| File | Purpose |
|------|---------|
| `monitor.ts` | Main monitor export |
| `monitor/provider.ts` | Provider implementation |
| `monitor/message-handler.ts` | Message processing |
| `monitor/listeners.ts` | Event listeners |
| `monitor/allow-list.ts` | Access control |
| `monitor/threading.ts` | Thread handling |

---

### Telegram

**Entry:** `src/telegram/monitor.ts`

- Uses `grammy` bot framework
- Flow: Grammy bot → `createTelegramBot()` → `registerTelegramHandlers()` → `createTelegramMessageProcessor()`

**Features:**
- Webhook and polling modes
- Forum topic support (`messageThreadId`)
- Reactions and native commands
- Bot username-based mention detection

**Extracted fields:**
- `message.text`, `chat.id`, `from.id`, `message_thread_id`
- Media, forum topics

**Key files:**
| File | Purpose |
|------|---------|
| `monitor.ts` | Main monitor |
| `bot.ts` | Bot creation (Grammy) |
| `bot-handlers.ts` | Event handlers |
| `bot-message-context.ts` | Context building |
| `bot-message-dispatch.ts` | Message dispatch |

---

### iMessage

**Entry:** `src/imessage/monitor/monitor-provider.ts`

- Uses custom RPC client wrapping `imsg` CLI
- Flow: RPC client → `createIMessageRpcClient()` → message handler → normalization

**Features:**
- Remote host support (SSH)
- Chat GUID resolution
- Group vs DM detection
- BlueBubbles integration

**Extracted fields:**
- `message.text`, `sender`, `chat_id`, `chat_guid`

**Key files:**
| File | Purpose |
|------|---------|
| `monitor.ts` | Main monitor |
| `monitor/monitor-provider.ts` | Provider implementation |
| `monitor/deliver.ts` | Message delivery |
| `monitor/runtime.ts` | Runtime management |

---

### Signal

**Entry:** `src/signal/monitor/event-handler.ts`

- Uses Signal daemon SSE events
- Flow: SSE events → `event.event === "receive"` → parse envelope → handler

**Features:**
- Reaction notifications
- Read receipts
- Pairing flow
- Group metadata

**Extracted fields:**
- `envelope.dataMessage.message`, `envelope.sourceName`, `groupInfo`

**Key files:**
| File | Purpose |
|------|---------|
| `monitor.ts` | Main monitor |
| `monitor/event-handler.ts` | Event handling |
| `daemon.ts` | signal-cli daemon management |
| `sse-reconnect.ts` | SSE reconnection logic |

---

### WhatsApp (Baileys)

**Entry:** `src/web/inbound/monitor.ts`

- Uses `@whiskeysockets/baileys` WebSocket
- Flow: Baileys socket → `messages.upsert` event → extract → `WebInboundMessage`

**Features:**
- Media download
- Read receipts
- Group metadata caching
- QR code login

**Extracted fields:**
- `msg.message`, `remoteJid`, `participant`, `pushName`

**Key files:**
| File | Purpose |
|------|---------|
| `inbound/monitor.ts` | WhatsApp inbox monitor |
| `inbound/extract.ts` | Message extraction |
| `inbound/media.ts` | Media handling |
| `inbound/access-control.ts` | Access control |
| `inbound/dedupe.ts` | Deduplication |

---

### Slack

**Entry:** `src/slack/monitor.ts`

- Uses Slack Bolt with Socket Mode
- Flow: Bolt app → event handlers → `processSlackMessage()`

**Features:**
- Socket Mode (no webhooks needed)
- Thread handling
- Slash command support
- Reactions and pins

**Key files:**
| File | Purpose |
|------|---------|
| `monitor.ts` | Main monitor |
| `monitor/provider.ts` | Provider implementation |
| `monitor/message-handler.ts` | Message handling |
| `monitor/events.ts` | Event processing |
| `monitor/slash.ts` | Slash command handling |
| `monitor/threading.ts` | Thread resolution |

---

## 5. Routing

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
2. **Parent peer binding** — thread to channel inheritance
3. **Guild binding** — Discord guild match
4. **Team binding** — Slack team match
5. **Account binding** — account-level match
6. **Channel binding** — wildcard account (`*`)
7. **Default agent** — fallback

### Session Key Format

```
agent:{agentId}:{channel}:{accountId}:{peerKind}:{peerId}
```

Examples:
- `agent:main:main` — main session
- `agent:main:dm:+14155551234` — per-peer DM
- `agent:main:discord:bot123:dm:user456` — per-account DM
- `agent:main:telegram:group:12345678` — group session

### DM Scoping Modes

| Mode | Behavior |
|------|----------|
| `main` | All DMs collapse to single session |
| `per-peer` | Separate session per peer |
| `per-channel-peer` | Per channel + peer |
| `per-account-channel-peer` | Full isolation |

---

## 6. Reply Generation

**File:** `src/auto-reply/reply/get-reply.ts`

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

### Key Phases

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

## 7. Complete Message Lifecycle

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
                      runReplyAgent()
                            │
                            ▼
                      Block Streaming
                            │
                            ▼
                      ReplyDispatcher
                            │
                            ▼
                        OUTBOUND
```

---

## 8. Relationship to Outbound

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

## 9. Key Takeaways for Nexus

1. **Normalization is essential** — All platforms map to common `MsgContext` → Nexus uses `NexusEvent`
2. **Routing is flexible** — Bindings allow per-peer, per-guild, per-account routing
3. **Session key encodes context** — Contains agent, channel, account, peer info
4. **DM scoping is configurable** — Can collapse or isolate DM sessions
5. **Shared infrastructure** — Inbound and outbound share routing/session code
6. **Envelope format** — Provides context to agent about message source
7. **Deduplication is critical** — 20-minute TTL, 5000 entry cache prevents duplicates

---

## Related Documents- `OPENCLAW_OUTBOUND.md` — Outbound delivery patterns
- `STREAMING_OUTPUT.md` — Block streaming and coalescing
- `CHANNEL_INVENTORY.md` — All channel implementations
- `../INBOUND_INTERFACE.md` — Nexus inbound interface spec
