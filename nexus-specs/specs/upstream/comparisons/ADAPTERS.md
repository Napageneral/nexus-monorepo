# Adapters Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## The Fundamental Difference

**OpenClaw:** Channels are integrated into the codebase — adding a channel means adding to the monorepo.

**Nexus:** Adapters are external tools — adding a channel means publishing a standalone binary that meets the interface.

---

## Summary

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| Model | Integrated channels | External tools |
| Location | `src/{channel}/`, `extensions/{channel}/` | Any binary on `$PATH` |
| Coupling | Tight (gateway lifecycle) | Loose (interface contract) |
| Adding channels | Modify codebase | Publish standalone tool |
| Channel count | 19+ | Interface-based (unlimited) |
| Maintenance | Core team | Anyone |

---

## OpenClaw: Integrated Channels

### Architecture

Channels live inside the OpenClaw codebase:

```
openclaw/
├── src/
│   ├── discord/          # 66 files
│   ├── telegram/         # 87 files
│   ├── web/              # WhatsApp (78 files)
│   ├── slack/            # 65 files
│   ├── signal/           # 24 files
│   ├── imessage/         # 17 files (legacy)
│   ├── line/             # 34 files
│   └── feishu/           # 17 files
└── extensions/
    ├── googlechat/       # 17 files
    ├── msteams/          # 61 files
    ├── matrix/           # 47 files
    ├── mattermost/       # 19 files
    ├── nextcloud-talk/   # 18 files
    ├── twitch/           # 35 files
    ├── nostr/            # 27 files
    ├── tlon/             # 23 files
    ├── zalo/             # 21 files
    ├── zalouser/         # 15 files
    ├── voice-call/       # 41 files
    └── bluebubbles/      # 26 files (recommended iMessage)
```

**Reference:** `specs/runtime/adapters/upstream/CHANNEL_INVENTORY.md`

### Lifecycle

Channels are part of the gateway process:

```typescript
// Gateway startup
await startChannel('discord', discordConfig);
await startChannel('telegram', telegramConfig);
await startChannel('whatsapp', whatsappConfig);
// ...

// All channels share gateway lifecycle
// If gateway restarts, all channels restart
```

### Plugin System

Channels register via a plugin system:

```typescript
// src/channels/registry.ts
export const CHAT_CHANNEL_ORDER = [
  "telegram", "whatsapp", "discord", "googlechat",
  "slack", "signal", "imessage",
] as const;

// Extension channels register via openclaw.plugin.json
```

Each channel implements common patterns:
- `monitor.ts` — Inbound event handling
- `send.ts` — Outbound delivery
- `outbound.ts` — Outbound adapter plugin

### Characteristics

| Property | Value |
|----------|-------|
| Adding a channel | Modify codebase, submit PR |
| Build/release | Tied to OpenClaw release cycle |
| Dependencies | Shared with gateway |
| Configuration | In monolithic `config.json` |
| Debugging | Inside gateway process |
| Maintainer | Core team |

---

## Nexus: External Tool Model

### Architecture

Adapters are standalone tools that meet defined interfaces:

```
$PATH/
├── eve           # iMessage adapter
├── gog           # Gmail adapter
├── discord-cli   # Discord adapter (TBD)
├── telegram-bot  # Telegram adapter (TBD)
└── ...           # Any tool meeting the interface
```

Tools can come from anywhere:
- Core Nexus tools
- Third-party packages
- User-built binaries
- Wrappers around existing CLIs

**Reference:** `specs/runtime/adapters/` for interface specs

### Loose Coupling

Adapters are decoupled from NEX:

```bash
# NEX doesn't know adapter internals
# It just reads events and sends commands

# Inbound: adapter emits JSONL events
eve monitor --format jsonl | nex ingest

# Outbound: NEX calls adapter CLI
eve send --chat-id "+1234567890" --text "Hello"
```

### Characteristics

| Property | Value |
|----------|-------|
| Adding a channel | Publish binary, meet interface |
| Build/release | Independent of Nexus |
| Dependencies | Self-contained |
| Configuration | Adapter's own config + Nexus credentials |
| Debugging | Separate process |
| Maintainer | Anyone |

---

## The Interface Contract

Nexus defines two interfaces. Any tool implementing them is a valid adapter.

### Inbound Interface

Adapters emit normalized events as JSONL:

```bash
# Tool monitors and emits events
eve monitor --account default --format jsonl

# Output (one JSON per line):
{"event_id":"imessage:abc123","timestamp":1706600000000,"content":"Hello",...}
```

**NexusEvent schema:**

```typescript
interface NexusEvent {
  event_id: string;              // "{channel}:{source_id}"
  timestamp: number;             // Unix ms
  content: string;
  content_type: 'text' | 'image' | 'audio' | 'video' | 'file';
  attachments?: Attachment[];
  
  channel: string;               // Platform name
  account_id: string;            // Which account received
  sender_id: string;
  sender_name?: string;
  peer_id: string;               // Chat/channel/user ID
  peer_kind: 'dm' | 'group' | 'channel';
  thread_id?: string;
  reply_to_id?: string;
  
  metadata?: Record<string, unknown>;
}
```

### Outbound Interface

Adapters expose CLI commands for delivery:

```bash
# Send text
eve send --chat-id "+1234567890" --text "Hello from Nexus"

# Send with chunking
eve send --chat-id "+1234567890" --text "$(cat long.txt)" --chunk

# React
eve react --message-id "abc123" --emoji "👍"
```

**Channel capabilities:**

```typescript
interface ChannelCapabilities {
  text_limit: number;            // Max chars per message
  caption_limit?: number;
  supports_markdown: boolean;
  markdown_flavor?: 'standard' | 'discord' | 'telegram_html' | 'slack_mrkdwn';
  supports_threads: boolean;
  supports_reactions: boolean;
  supports_polls: boolean;
  // ...
}
```

---

## Why This Matters

### 1. External Tools = Easier to Create

**OpenClaw:** Adding a channel requires:
- Understanding the codebase structure
- Implementing monitor, send, outbound plugins
- Integrating with gateway lifecycle
- Submitting PR, waiting for review/release

**Nexus:** Adding an adapter requires:
- Binary that emits JSONL (inbound)
- Binary that accepts send commands (outbound)
- Publish anywhere

### 2. Community Can Contribute

Anyone can publish an adapter:
- Package manager (npm, pip, brew)
- GitHub release
- Direct download

No gatekeeper. No PR review. No core team bandwidth needed.

### 3. NEX Doesn't Know Internals

NEX treats all adapters the same:
- Read JSONL events from stdin/socket
- Call CLI for outbound
- Use capabilities for agent context

Platform-specific complexity is encapsulated in the adapter.

### 4. Swappable Implementations

Standardized interface means multiple implementations:

| Channel | Implementation A | Implementation B |
|---------|------------------|------------------|
| iMessage | `eve` (native) | BlueBubbles wrapper |
| Discord | `discord-cli` | discord.py wrapper |
| Telegram | `telegram-bot` | Telethon wrapper |

Choose the right tool for your setup.

### 5. Separation of Concerns

| Responsibility | Owner |
|----------------|-------|
| Platform API integration | Adapter |
| Message formatting/chunking | Adapter |
| Credential management | Adapter + Nexus |
| Event normalization | Adapter |
| Access control | NEX (IAM) |
| Agent orchestration | NEX |
| Session management | NEX |

Adapters handle platform complexity. NEX handles orchestration.

---

## How to Create a New Adapter

### Minimal Inbound Adapter

```bash
#!/bin/bash
# my-adapter monitor --format jsonl

while read -r line; do
  # Transform platform event to NexusEvent
  echo '{"event_id":"myplatform:123","content":"Hello",...}'
done
```

### Minimal Outbound Adapter

```bash
#!/bin/bash
# my-adapter send --chat-id "$1" --text "$2"

curl -X POST "https://api.myplatform.com/send" \
  -d "chat_id=$1" \
  -d "text=$2"
```

### Full Implementation

1. **Implement inbound:** Emit `NexusEvent` JSONL on stdout
2. **Implement outbound:** Accept CLI args, return delivery result
3. **Expose capabilities:** `my-adapter capabilities` returns JSON
4. **Handle formatting:** `my-adapter format` converts markdown
5. **Handle chunking:** `my-adapter chunk` splits long messages
6. **Package:** Distribute as binary

---

## What OpenClaw Channels Become

### Core Channels → Nexus Tools

| OpenClaw | Nexus | Status |
|----------|-------|--------|
| `src/discord/` | `discord-cli` | TBD |
| `src/telegram/` | `telegram-bot` | TBD |
| `src/web/` (WhatsApp) | Baileys wrapper | TBD |
| `src/imessage/` | `eve` | ✅ Exists |
| `src/signal/` | signal-cli wrapper | TBD |
| `src/slack/` | `slack-cli` | TBD |
| `src/line/` | `line-cli` | TBD |
| `src/feishu/` | `feishu-cli` | TBD |

### Extension Channels → Community Tools

| OpenClaw Extension | Notes |
|--------------------|-------|
| `extensions/googlechat/` | Google Chat API wrapper |
| `extensions/msteams/` | Bot Framework adapter |
| `extensions/matrix/` | matrix-nio wrapper |
| `extensions/mattermost/` | REST/WebSocket client |
| `extensions/twitch/` | tmi.js wrapper |
| `extensions/nostr/` | nostr-tools wrapper |
| `extensions/bluebubbles/` | BlueBubbles HTTP client |
| `extensions/voice-call/` | Twilio/Plivo integration |

### What to Port

Formatting and chunking logic from OpenClaw should be ported into adapter tools:
- `draft-chunking.ts` patterns → adapter's `chunk` command
- `formatText()` logic → adapter's `format` command
- Platform-specific quirks → encapsulated in adapter

---

## Comparison: Adding Discord Support

### OpenClaw Way

1. Create `src/discord/` directory
2. Implement `monitor.ts` (800+ lines)
3. Implement `send.ts`, `send.messages.ts`, etc.
4. Implement outbound plugin
5. Register in `channels/registry.ts`
6. Add to `config.json` schema
7. Submit PR
8. Wait for review and release
9. Users update OpenClaw

### Nexus Way

1. Create `discord-cli` binary
2. Implement: `discord-cli monitor --format jsonl`
3. Implement: `discord-cli send --channel-id X --text Y`
4. Implement: `discord-cli capabilities`
5. Publish to npm/brew/GitHub
6. Users install: `npm install -g discord-cli`
7. Configure credentials in Nexus
8. Done

---

## Related Specs

- `specs/runtime/adapters/ADAPTER_INTERFACES.md` — Interface definitions
- `specs/runtime/adapters/INBOUND_INTERFACE.md` — Inbound details
- `specs/runtime/adapters/OUTBOUND_INTERFACE.md` — Outbound details
- `specs/runtime/adapters/upstream/CHANNEL_INVENTORY.md` — All OpenClaw channels
- `specs/runtime/adapters/channels/` — Per-channel specs

---

*Nexus bets that decoupled adapters scale better than integrated channels. The interface contract enables an ecosystem where anyone can contribute — no gatekeepers, no core team bottleneck.*
