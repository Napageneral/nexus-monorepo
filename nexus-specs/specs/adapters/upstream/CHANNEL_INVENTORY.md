# OpenClaw Channel Adapter Inventory

**Source:** `/Users/tyler/nexus/home/projects/openclaw/src/`  
**Last Updated:** 2026-01-30

---

## Summary

| Channel | Inbound | Outbound | Status | Location |
|---------|---------|----------|--------|----------|
| **Discord** | ✅ | ✅ | Full | `src/discord/` |
| **Telegram** | ✅ | ✅ | Full | `src/telegram/` |
| **WhatsApp** | ✅ | ✅ | Full | `src/web/` |
| **Slack** | ✅ | ✅ | Full | `src/slack/` |
| **Signal** | ✅ | ✅ | Full | `src/signal/` |
| **iMessage** | ✅ | ✅ | Full | `src/imessage/` |
| **LINE** | ✅ | ✅ | Full | `src/line/` |
| **Google Chat** | ❌ | ❌ | Config only | Registry |
| **MS Teams** | ❌ | ❌ | Config only | Config types |
| **Email/Gmail** | ❌ | ❌ | Hooks only | `src/hooks/gmail.ts` |
| **Matrix** | ❌ | ❌ | Not found | — |
| **SMS/Twilio** | ❌ | ❌ | Not found | — |

---

## Full Implementations

### Discord (`src/discord/`)

**Inbound:**
- `monitor.ts` — Main monitor export
- `monitor/provider.ts` — Provider implementation
- `monitor/message-handler.ts` — Message processing
- `monitor/listeners.ts` — Event listeners
- `monitor/allow-list.ts` — Access control
- `monitor/threading.ts` — Thread handling
- `monitor/typing.ts` — Typing indicators

**Outbound:**
- `send.ts` — Main send functions
- `send.messages.ts` — Message sending
- `send.channels.ts` — Channel operations
- `send.reactions.ts` — Reaction support
- `send.emojis-stickers.ts` — Emoji/sticker support
- `channels/plugins/outbound/discord.ts` — Outbound adapter

**Features:**
- 2000 char limit
- Markdown support
- Embeds, threads, reactions
- Slash commands
- Guild management
- Permissions

---

### Telegram (`src/telegram/`)

**Inbound:**
- `monitor.ts` — Main monitor
- `bot.ts` — Bot creation (Grammy)
- `bot-handlers.ts` — Event handlers
- `bot-message-context.ts` — Context building
- `bot-message-dispatch.ts` — Message dispatch
- `bot-updates.ts` — Update handling

**Outbound:**
- `send.ts` — Main send functions
- `channels/plugins/outbound/telegram.ts` — Outbound adapter

**Features:**
- 4096 char limit
- HTML formatting (not Markdown)
- 1024 char caption limit
- Inline buttons
- Forum topics
- Voice messages
- Webhooks and polling

---

### WhatsApp (`src/web/`)

**Inbound:**
- `inbound/monitor.ts` — WhatsApp inbox monitor (Baileys)
- `inbound/extract.ts` — Message extraction
- `inbound/media.ts` — Media handling
- `inbound/access-control.ts` — Access control
- `inbound/dedupe.ts` — Deduplication
- `auto-reply/monitor.ts` — Auto-reply monitor

**Outbound:**
- `outbound.ts` — Main outbound functions
- `channels/plugins/outbound/whatsapp.ts` — Outbound adapter

**Features:**
- ~4000 char limit
- Plain text only
- QR login (Baileys)
- Media, polls (12 options max)
- Groups, read receipts
- Voice notes (PTT)

---

### Slack (`src/slack/`)

**Inbound:**
- `monitor.ts` — Main monitor
- `monitor/provider.ts` — Provider implementation
- `monitor/message-handler.ts` — Message handling
- `monitor/events.ts` — Event processing
- `monitor/slash.ts` — Slash command handling
- `monitor/threading.ts` — Thread resolution

**Outbound:**
- `send.ts` — Main send functions
- `actions.ts` — Action API (edit, delete, react, pin)
- `channels/plugins/outbound/slack.ts` — Outbound adapter

**Features:**
- Socket Mode
- Threads
- Reactions, pins
- Slash commands
- Inline buttons

---

### Signal (`src/signal/`)

**Inbound:**
- `monitor.ts` — Main monitor
- `monitor/event-handler.ts` — Event handling
- `daemon.ts` — signal-cli daemon management
- `sse-reconnect.ts` — SSE reconnection logic

**Outbound:**
- `send.ts` — Main send functions
- `send-reactions.ts` — Reaction support
- `channels/plugins/outbound/signal.ts` — Outbound adapter

**Features:**
- ~4000 char limit
- signal-cli daemon
- SSE events
- Reactions
- Groups
- Voice notes
- Text style ranges

---

### iMessage (`src/imessage/`)

**Inbound:**
- `monitor.ts` — Main monitor
- `monitor/monitor-provider.ts` — Provider implementation
- `monitor/deliver.ts` — Message delivery
- `monitor/runtime.ts` — Runtime management

**Outbound:**
- `send.ts` — Main send functions
- `channels/plugins/outbound/imessage.ts` — Outbound adapter

**Features:**
- ~4000 char limit
- Plain text
- macOS only
- BlueBubbles integration
- Tapback reactions
- Group mentions

---

### LINE (`src/line/`)

**Inbound:**
- `monitor.ts` — Main monitor (webhook-based)
- `bot.ts` — Bot creation
- `bot-handlers.ts` — Webhook event handlers
- `bot-message-context.ts` — Context building
- `webhook.ts` — Webhook server
- `http-registry.ts` — HTTP route registration

**Outbound:**
- `send.ts` — Main send functions
- `reply-chunks.ts` — Chunked replies
- `flex-templates.ts` — Flex Message templates
- `template-messages.ts` — Template messages
- `rich-menu.ts` — Rich Menu operations

**Features:**
- Webhooks
- Flex Messages
- Rich Menus
- Templates
- Quick replies

**Note:** Not in main channel registry but has full implementation.

---

## Partial/Config Only

### Google Chat

- Registry entry in `src/channels/registry.ts`
- Config types in `config/types.googlechat.ts`
- Webhook path config (`/googlechat`)
- No implementation files found
- Likely gateway plugin-based

### MS Teams

- Config schema in `config/types.msteams.ts`
- Webhook config, reply styles
- Team/channel configs
- No implementation files found

---

## Plugin System

**Location:** `src/channels/plugins/`

| Plugin Type | Channels |
|-------------|----------|
| `outbound/` | discord, telegram, slack, signal, imessage, whatsapp |
| `onboarding/` | All channels |
| `actions/` | discord, signal, telegram |
| `normalize/` | discord, imessage, signal, slack, telegram, whatsapp |

---

## Porting to Nexus

### Phase 1 (Core)
- Discord → discord-cli tool
- Telegram → telegram-cli tool
- WhatsApp → existing Baileys integration
- iMessage → eve tool

### Phase 2 (Extended)
- Signal → signal-cli wrapper
- Slack → slack-cli tool
- Email → gog tool (Gmail)

### Phase 3 (As Needed)
- LINE
- Google Chat
- MS Teams

### Not Porting
- Matrix (not implemented upstream)
- SMS/Twilio (not implemented upstream)
