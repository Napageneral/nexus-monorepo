# OpenClaw Channel Adapter Inventory

**Source:** `/Users/tyler/nexus/home/projects/openclaw/`  
**Last Updated:** 2026-02-04  
**Upstream Version:** v2026.2.3

---

## Summary

| Channel | Inbound | Outbound | Status | Location |
|---------|---------|----------|--------|----------|
| **Discord** | ✅ | ✅ | Full | `src/discord/` |
| **Telegram** | ✅ | ✅ | Full | `src/telegram/` |
| **WhatsApp** | ✅ | ✅ | Full | `src/web/` |
| **Slack** | ✅ | ✅ | Full | `src/slack/` |
| **Signal** | ✅ | ✅ | Full | `src/signal/` |
| **iMessage (native)** | ✅ | ✅ | Legacy | `src/imessage/` |
| **LINE** | ✅ | ✅ | Full | `src/line/` |
| **Feishu/Lark** | ✅ | ✅ | Full | `src/feishu/` |
| **Google Chat** | ✅ | ✅ | Full (ext) | `extensions/googlechat/` |
| **MS Teams** | ✅ | ✅ | Full (ext) | `extensions/msteams/` |
| **Matrix** | ✅ | ✅ | Full (ext) | `extensions/matrix/` |
| **Mattermost** | ✅ | ✅ | Full (ext) | `extensions/mattermost/` |
| **Nextcloud Talk** | ✅ | ✅ | Full (ext) | `extensions/nextcloud-talk/` |
| **Twitch** | ✅ | ✅ | Full (ext) | `extensions/twitch/` |
| **Nostr** | ✅ | ✅ | Full (ext) | `extensions/nostr/` |
| **Tlon/Urbit** | ✅ | ✅ | Full (ext) | `extensions/tlon/` |
| **Zalo OA** | ✅ | ✅ | Full (ext) | `extensions/zalo/` |
| **Zalo Personal** | ✅ | ✅ | Full (ext) | `extensions/zalouser/` |
| **Voice/Telephony** | ✅ | ✅ | Full (ext) | `extensions/voice-call/` |
| **BlueBubbles** | ✅ | ✅ | **Recommended** (ext) | `extensions/bluebubbles/` |

> **v2026.2.2 Note:** BlueBubbles is now the recommended iMessage integration. Native imsg (`src/imessage/`) is marked as legacy.

---

## Core Channels (src/)

### Discord (`src/discord/`) — 66 files

**Inbound:**
- `monitor.ts` — Main monitor export
- `monitor/provider.ts` — Provider implementation
- `monitor/message-handler.ts` — Message processing
- `monitor/listeners.ts` — Event listeners
- `monitor/allow-list.ts` — Access control
- `monitor/threading.ts` — Thread handling
- `monitor/typing.ts` — Typing indicators
- `monitor/reply-context.ts` — Reply context
- `monitor/presence-cache.ts` — Presence caching
- `monitor/native-command.ts` — Native command handling

**Outbound:**
- `send.ts` — Main send functions
- `send.messages.ts` — Message sending
- `send.channels.ts` — Channel operations
- `send.reactions.ts` — Reaction support
- `send.emojis-stickers.ts` — Emoji/sticker support
- `send.permissions.ts` — Permission handling
- `send.guild.ts` — Guild operations
- `channels/plugins/outbound/discord.ts` — Outbound adapter

**Features:**
- 2000 char limit
- Markdown support
- Embeds, threads, reactions
- Slash commands
- Guild management
- Permissions
- PluralKit support (proxied sender resolution)
- Gateway logging
- **v2026.2.1:** Thread parent binding inheritance for routing
- **v2026.2.3:** Untrusted channel metadata kept out of system prompts

---

### Telegram (`src/telegram/`) — 87 files

**Inbound:**
- `monitor.ts` — Main monitor
- `bot.ts` — Bot creation (Grammy)
- `bot-handlers.ts` — Event handlers
- `bot-message-context.ts` — Context building
- `bot-message-dispatch.ts` — Message dispatch
- `bot-updates.ts` — Update handling
- `bot-native-commands.ts` — Native commands
- `bot-access.ts` — Access control

**Outbound:**
- `send.ts` — Main send functions
- `draft-chunking.ts` — Message chunking
- `draft-stream.ts` — Streaming support
- `inline-buttons.ts` — Inline button support
- `model-buttons.ts` — Model selection buttons
- `channels/plugins/outbound/telegram.ts` — Outbound adapter

**Features:**
- 4096 char limit
- HTML formatting (not Markdown)
- 1024 char caption limit
- Inline buttons
- Forum topics
- Voice messages
- Webhooks and polling
- Proxy support
- Sticker cache
- Group migration handling
- Forward message metadata (forward_from_chat)
- **v2026.2.1:** Shared pairing store
- **v2026.2.3:** Session model overrides in inline model selection

---

### WhatsApp (`src/web/`) — 78 files

**Inbound:**
- `inbound/monitor.ts` — WhatsApp inbox monitor (Baileys)
- `inbound/extract.ts` — Message extraction
- `inbound/media.ts` — Media handling
- `inbound/access-control.ts` — Access control
- `inbound/dedupe.ts` — Deduplication
- `auto-reply/monitor.ts` — Auto-reply monitor

**Outbound:**
- `outbound.ts` — Main outbound functions
- `media.ts` — Media sending
- `channels/plugins/outbound/whatsapp.ts` — Outbound adapter

**Features:**
- ~4000 char limit
- Plain text only
- QR login (Baileys)
- Media, polls (12 options max)
- Groups, read receipts
- Voice notes (PTT)
- Auto-reconnect
- Session snapshots
- VCard support

---

### Slack (`src/slack/`) — 65 files

**Inbound:**
- `monitor.ts` — Main monitor
- `monitor/provider.ts` — Provider implementation
- `monitor/message-handler.ts` — Message handling
- `monitor/events.ts` — Event processing (channels, members, messages, pins, reactions)
- `monitor/slash.ts` — Slash command handling
- `monitor/thread-resolution.ts` — Thread resolution
- `monitor/commands.ts` — Command processing

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
- Channel migration
- User/channel resolution
- **v2026.2.1:** Hardened media fetch limits and file URL validation
- **v2026.2.2:** Access-group gating for slash commands
- **v2026.2.3:** Untrusted channel metadata kept out of system prompts

---

### Signal (`src/signal/`) — 24 files

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
- UUID-based identity

---

### iMessage (Native) (`src/imessage/`) — 17 files ⚠️ LEGACY

> **v2026.2.2:** Native imsg is now legacy. Use **BlueBubbles** (`extensions/bluebubbles/`) for new deployments.

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
- Tapback reactions
- Group mentions

---

### LINE (`src/line/`) — 34 files

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
- Markdown conversion
- Auto-reply delivery

---

### Feishu/Lark (`src/feishu/`) — 17 files

> **v2026.2.2:** Full Feishu/Lark plugin support with docs.

**Inbound:**
- `monitor.ts` — Main monitor
- `bot.ts` — Bot creation
- `access.ts` — Access control

**Outbound:**
- `send.ts` — Main send functions
- `streaming-card.ts` — Streaming card support
- `channels/plugins/outbound/feishu.ts` — Outbound adapter

**Features:**
- Bot API
- Message cards
- Streaming cards
- Media download
- Pairing store
- Probe support
- Extension wrapper: `extensions/feishu/`

---

## Extension Channels (extensions/)

### Google Chat (`extensions/googlechat/`) — 17 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `monitor.ts` — Message monitoring
- `api.ts` — Google Chat API
- `auth.ts` — Authentication
- `accounts.ts` — Account management
- `actions.ts` — Message actions
- `onboarding.ts` — Setup flow
- `runtime.ts` — Runtime management

**Features:**
- Chat API webhooks
- Google Workspace integration
- HTTP webhook endpoints
- Action support

---

### MS Teams (`extensions/msteams/`) — 61 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `monitor.ts` — Message monitoring
- `monitor-handler/` — Handler components
- `sdk.ts` — Bot Framework SDK integration
- `send.ts` — Message sending
- `outbound.ts` — Outbound adapter
- `attachments/` — File handling (download, graph, html, payload)
- `graph-*.ts` — Microsoft Graph API integration
- `file-consent.ts` — File consent cards
- `polls.ts` — Poll support

**Features:**
- Bot Framework SDK
- Microsoft Graph API
- File attachments with consent
- Polls
- Conversation store (FS/memory)
- Reply threading
- Pending upload management

---

### Matrix (`extensions/matrix/`) — 47 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `matrix/client/` — Client management (create, config, storage, runtime)
- `matrix/monitor/` — Event handling (allowlist, auto-join, events, handler, media, mentions, replies, rooms, threads)
- `matrix/send/` — Send operations (client, formatting, media, targets)
- `matrix/actions/` — Actions (client, messages, pins, reactions, room, summary)
- `onboarding.ts` — Setup flow
- `outbound.ts` — Outbound adapter
- `runtime.ts` — Runtime management
- `tool-actions.ts` — Tool action support

**Features:**
- Full Matrix protocol support
- Homeserver + user ID auth (access token or password login)
- Room management with per-room config
- Threads with replyToMode controls (off/inbound/always)
- Reactions, pins, polls
- Media handling with size caps
- Auto-join invites with allowlist support
- E2E encryption ready
- Directory live updates
- Group mentions
- DM pairing/allowlist/open/disabled policies
- Status + probe reporting for health checks

---

### Mattermost (`extensions/mattermost/`) — 19 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `mattermost/monitor.ts` — Message monitoring
- `mattermost/send.ts` — Message sending
- `mattermost/client.ts` — API client
- `mattermost/accounts.ts` — Account management
- `onboarding.ts` — Setup flow
- `normalize.ts` — Message normalization
- `group-mentions.ts` — Group mention support

**Features:**
- WebSocket events
- REST API
- Threads
- Reactions
- File attachments
- Team/channel resolution

---

### Nextcloud Talk (`extensions/nextcloud-talk/`) — 18 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `monitor.ts` — Message monitoring
- `inbound.ts` — Inbound processing
- `send.ts` — Message sending
- `accounts.ts` — Account management
- `onboarding.ts` — Setup flow
- `policy.ts` — Access policy
- `signature.ts` — Request signing

**Features:**
- Nextcloud Talk API
- Room polling
- Message formatting
- Room info resolution

---

### Twitch (`extensions/twitch/`) — 35 files

**Status:** Full implementation (extension)

**Files:**
- `plugin.ts` — Main plugin
- `twitch-client.ts` — Twitch IRC/API client
- `monitor.ts` — Chat monitoring
- `send.ts` — Message sending
- `outbound.ts` — Outbound adapter
- `actions.ts` — Chat actions
- `access-control.ts` — Moderation
- `token.ts` — OAuth token management
- `onboarding.ts` — Setup flow

**Features:**
- Twitch IRC (tmi.js)
- Helix API
- Chat commands
- Moderation actions
- OAuth authentication
- Markdown stripping

---

### Nostr (`extensions/nostr/`) — 27 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `nostr-bus.ts` — Relay connection manager
- `nostr-profile.ts` — Profile management
- `nostr-profile-import.ts` — Profile import
- `nostr-profile-http.ts` — HTTP profile fetching
- `nostr-state-store.ts` — State persistence
- `seen-tracker.ts` — Deduplication
- `runtime.ts` — Runtime management

**Features:**
- NIP-01 events
- Multiple relay support
- Profile management
- State persistence
- Event deduplication
- Metrics tracking

---

### Tlon/Urbit (`extensions/tlon/`) — 23 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `urbit/http-api.ts` — Urbit HTTP API
- `urbit/sse-client.ts` — SSE event streaming
- `urbit/send.ts` — Message sending
- `urbit/auth.ts` — Authentication
- `monitor/` — Event handling (discovery, history, processed-messages)
- `onboarding.ts` — Setup flow

**Features:**
- Urbit HTTP API
- SSE streaming
- Channel discovery
- Message history
- Target resolution

---

### Zalo OA (`extensions/zalo/`) — 21 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `monitor.ts` — Message monitoring (webhook)
- `send.ts` — Message sending
- `api.ts` — Zalo API client
- `accounts.ts` — Account management
- `actions.ts` — Message actions
- `proxy.ts` — Proxy support
- `token.ts` — Token management
- `onboarding.ts` — Setup flow
- `status-issues.ts` — Status diagnostics

**Features:**
- Zalo Official Account API
- Webhooks
- Media handling
- Token refresh
- Proxy support

---

### Zalo Personal (`extensions/zalouser/`) — 15 files

**Status:** Full implementation (extension)

**Files:**
- `channel.ts` — Channel plugin
- `monitor.ts` — Message monitoring
- `send.ts` — Message sending
- `accounts.ts` — Account management
- `onboarding.ts` — Setup flow (QR login)
- `probe.ts` — Connection probe
- `runtime.ts` — Runtime management
- `status-issues.ts` — Status diagnostics
- `tool.ts` — Agent tool integration
- `zca.ts` — zca-cli wrapper

**Features:**
- Personal Zalo account via zca-cli
- QR code login
- Multi-account support
- Friends/groups directory
- Agent tool integration
- Profile management

---

### Voice/Telephony (`extensions/voice-call/`) — 41 files

**Status:** Full implementation (extension)

**Files:**
- `manager.ts` — Call manager
- `manager/` — Manager components (context, events, lookup, outbound, state, store, timers, twiml)
- `media-stream.ts` — Audio streaming
- `providers/` — Telephony providers:
  - `twilio.ts` + `twilio/` — Twilio integration
  - `plivo.ts` — Plivo integration
  - `telnyx.ts` — Telnyx integration
  - `stt-openai-realtime.ts` — OpenAI realtime STT
  - `tts-openai.ts` — OpenAI TTS
- `webhook.ts` — Webhook handling
- `webhook-security.ts` — Request validation
- `cli.ts` — CLI interface

**Features:**
- Inbound/outbound voice calls
- Multiple providers (Twilio, Plivo, Telnyx)
- OpenAI Realtime STT
- OpenAI TTS + ElevenLabs TTS
- TwiML generation
- Media streaming
- Allowlist management
- Tunnel support (ngrok, Tailscale)
- **v2026.1.26:** TTS now uses core `messages.tts` config
- **v2026.2.2:** Hardened inbound allowlist, Telnyx publicKey requirement, token-gated Twilio media streams
- **v2026.2.3:** Webhook verification with host allowlists and proxy trust

---

### BlueBubbles (`extensions/bluebubbles/`) — 26 files ⭐ RECOMMENDED

**Status:** Recommended iMessage integration (v2026.2.2+)

> **v2026.2.2:** BlueBubbles is now the recommended iMessage integration, replacing native imsg.

**Files:**
- `channel.ts` — Channel plugin
- `monitor.ts` — Message monitoring
- `send.ts` — Message sending
- `reactions.ts` — Tapback support
- `attachments.ts` — Media handling
- `actions.ts` — Message actions
- `chat.ts` — Chat management
- `accounts.ts` — Account management
- `onboarding.ts` — Setup flow
- `probe.ts` — Connection probe

**Features:**
- BlueBubbles server integration
- iMessage via HTTP API
- Tapback reactions
- Media attachments
- Chat targeting
- Cross-platform (not macOS-only like native imsg)

---

## Plugin System

**Location:** `src/channels/plugins/`

| Plugin Type | Channels |
|-------------|----------|
| `outbound/` | discord, telegram, slack, signal, imessage, whatsapp, feishu |
| `onboarding/` | discord, telegram, slack, signal, imessage, whatsapp |
| `actions/` | discord, signal, telegram, slack |
| `normalize/` | discord, feishu, imessage, signal, slack, telegram, whatsapp |
| `status-issues/` | bluebubbles, discord, telegram, whatsapp |
| `agent-tools/` | whatsapp-login |

---

## Channel Registry

The core registry (`src/channels/registry.ts`) defines these chat channels:

```typescript
export const CHAT_CHANNEL_ORDER = [
  "telegram",
  "whatsapp",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;
```

Extension channels register via `openclaw.plugin.json` and are loaded dynamically.

---

## Porting to Nexus

### Phase 1 (Core)
- Discord → discord-cli tool
- Telegram → telegram-cli tool
- WhatsApp → existing Baileys integration
- iMessage → **BlueBubbles** (recommended) or eve tool (legacy)

### Phase 2 (Extended)
- Signal → signal-cli wrapper
- Slack → slack-cli tool
- Email → gog tool (Gmail)
- Feishu/Lark → feishu-cli tool

### Phase 3 (Extensions)
- Matrix → matrix-nio or SDK wrapper
- MS Teams → Bot Framework adapter
- Mattermost → REST/WebSocket client
- Twitch → tmi.js wrapper

### Phase 4 (Specialized)
- Voice/Telephony → Twilio/Plivo integration
- LINE → LINE SDK
- Google Chat → Chat API
- Nostr → nostr-tools wrapper
- Nextcloud Talk → REST client

### Not Currently Planned
- Tlon/Urbit (niche)
- Zalo OA & Zalo Personal (regional, Vietnam-focused)

---

## Recent Upstream Changes (v2026.1.30 → v2026.2.3)

### v2026.2.3
- **Cron:** Announce delivery mode, ISO 8601 `schedule.at`, one-shot job deletion
- **Telegram:** Session model overrides in inline model selection, forward_from_chat metadata
- **Voice Call:** Hardened webhook verification with host allowlists and proxy trust
- **Security:** Untrusted channel metadata kept out of system prompts (Slack/Discord)

### v2026.2.2
- **BlueBubbles:** Promoted as recommended iMessage integration
- **iMessage (native):** Marked as legacy
- **Feishu/Lark:** Full plugin support with docs
- **Web UI:** Agents dashboard for managing agents, tools, skills, models, channels, cron
- **Memory:** QMD backend for workspace memory
- **Security:** Access-group gating for Slack slash commands, hardened voice-call allowlists

### v2026.2.1
- **Discord:** Thread parent binding inheritance for routing, PluralKit proxied sender resolution
- **Telegram:** Shared pairing store, download timeouts
- **Gateway:** Timestamps in agent messages, TLS 1.3 minimum
- **Slack:** Hardened media fetch limits and file URL validation
- **Security:** SSRF protections for remote media fetches

### v2026.1.31
- Version alignment release (no channel changes)
