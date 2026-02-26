# Channel Catalog

**Status:** REFERENCE
**Last Updated:** 2026-02-23
**Related:** `../ADAPTER_SYSTEM.md`, `../INBOUND_INTERFACE.md`, `../OUTBOUND_INTERFACE.md`, `../sdk/OUTBOUND_TARGETING.md`, `../sdk/ADAPTER_CREDENTIALS.md`, `../adapters/BUILTIN_ADAPTERS.md`

---

## Purpose

Consolidated reference for all channel adapters: capabilities, formatting rules, inbound/outbound patterns, media support, threading, onboarding, and policy considerations.

---

## Capabilities Summary

| Channel | Text Limit | Markdown | Threads | Reactions | Polls | Buttons | Voice Notes | HTML | Status |
|---------|-----------|----------|---------|-----------|-------|---------|-------------|------|--------|
| **Discord** | 2000 | Yes (discord) | Yes | Yes | No | No | No | No | Implemented |
| **Telegram** | 4096 | No (HTML) | Yes (forums) | Yes | Yes | Yes | Yes | Yes | Implemented |
| **WhatsApp** | ~4000 | No | No | Yes | Yes (12 max) | No | Yes (PTT) | No | Implemented |
| **Slack** | 4000 | Yes (mrkdwn) | Yes | Yes | No | Yes (Block Kit) | No | No | TODO |
| **Gmail** | No limit | No | Yes (email threads) | No | No | No | No | Yes | Partial (hooks only) |
| **iMessage** | ~4000 | No | No | Yes (tapbacks) | No | No | No | No | Implemented |
| **Signal** | ~4000 | No (style ranges) | No | Yes | No | No | Yes | No | TODO |
| **LINE** | 5000 | No | No | No | No | Yes (Flex/Template) | No | No | TODO |
| **Google Chat** | 4096 | Yes (limited) | Yes | Yes | No | Yes (Cards) | No | No | Config only |
| **MS Teams** | 28000 | Yes (limited) | Yes | Yes | No | Yes (Adaptive Cards) | No | No | Config only |

---

## Discord

**Nexus Tool:** `nexus-adapter-discord`
**Upstream:** Removed (migrated to NEX adapter SDK — `extensions/discord/`)

### Capabilities

```typescript
const DISCORD_CAPABILITIES: ChannelCapabilities = {
  text_limit: 2000,
  supports_markdown: true,
  markdown_flavor: 'discord',
  supports_embeds: true,
  supports_threads: true,
  supports_reactions: true,
  supports_polls: false,
  supports_buttons: false,
  supports_voice_notes: false,
};
```

### Formatting Rules

- **Message:** 2000 chars | **Embed description:** 4096 chars | **Embed field:** 1024 chars
- Standard Markdown: `**bold**`, `*italic*`, `` `code` ``, ` ```code block``` `, `> quote`, `||spoiler||`
- Tables: convert to code blocks
- Chunking: 2000 chars, preserve code fences, first chunk gets reply reference

### Inbound

```typescript
{
  platform: 'discord',
  container_kind: message.channel.isDMBased() ? 'direct' : 'group',
  thread_id: message.channel.isThread() ? message.channel.id : undefined,
  metadata: { guild_id: message.guildId, channel_name: message.channel.name },
}
```

### Outbound

- **Text:** `rest.post(Routes.channelMessages(channelId), { body: { content, message_reference } })`
- **Embeds:** `{ embeds: [{ title, description, color: 0x5865F2, fields }] }`
- **Reactions:** `rest.put(Routes.channelMessageOwnReaction(channelId, messageId, emoji))`

### Media

Images (PNG/JPG/GIF/WebP), Video (MP4/WebM), Audio (MP3/OGG), Files (any). Size: 8MB regular, 50MB/100MB Nitro.

### Threading

Threads have their own channel ID. Use `message_reference` for replies within thread.

### Onboarding

1. **Credential:** Store bot token in `~/nexus/state/credentials/discord/<account>.json` (Keychain pointer preferred)
2. **Register:** `nexus adapter register --name discord --command "<command>"`
3. **Enable:** `nexus adapter account add discord/<account> --credential discord/<account>` then `nexus adapter enable discord/<account> --monitor`
4. **Safety defaults:** Owner DMs allowed, all group/channel messages denied unless IAM-allowlisted

### Policy Surface (IAM + Manager Integration)

The Discord adapter migration explicitly separates responsibilities:

**Adapter (I/O only):**
- Emit `NexusEvent` for every inbound message
- Implement outbound delivery mechanics (chunking, threading, embeds)
- Transport-safety filters only: self-loop prevention, dedupe by message ID

**IAM (access control):**
- `allow|deny|ask` decisions per sender
- DM from unknown sender -> `ask` (creates permission request)
- Group/channel from unknown -> `deny`

**Manager/automations (behavioral):**
- Mention gating ("only respond when @mentioned")
- Thread preferences, noise handling, quiet hours
- Reaction acknowledgements

**Pairing flow (NEX-backed):**
1. DM arrives -> adapter emits NexusEvent
2. `resolvePrincipals` can't map sender -> sender type is `unknown`
3. IAM returns `ask` -> NEX creates permission request
4. Owner approves via control plane -> identity mapping + allow grant created
5. Subsequent DMs proceed normally

Required event metadata: `guild_id`, `guild_name`, `channel_name`, `channel_type`, `thread_name`, `author_is_bot`, `mentions_bot`, `mentioned_user_ids`, `attachment_count`.

---

## Telegram

**Nexus Tool:** `nexus-adapter-telegram` (TBD)
**Upstream:** Removed (migrated to NEX adapter SDK — `extensions/telegram/`)

### Capabilities

```typescript
const TELEGRAM_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4096,
  supports_markdown: false,
  html_formatting: true,
  supports_embeds: false,
  supports_threads: true,        // Forum topics
  supports_reactions: true,
  supports_polls: true,
  supports_buttons: true,        // Inline keyboards
  supports_voice_notes: true,
};
```

### Formatting Rules

- **Message:** 4096 chars | **Caption:** 1024 chars | **Button text:** 64 chars | **Callback data:** 64 bytes
- **HTML only** (not Markdown): `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<a href>`, `<tg-spoiler>`, `<blockquote>`
- Markdown conversion: `**bold**` -> `<b>bold</b>`, `` `code` `` -> `<code>code</code>`
- Tables: convert to `<pre>` blocks
- Chunking: 4096 chars, preserve `<pre>` blocks

### Inbound

```typescript
{
  platform: 'telegram',
  container_kind: ctx.chat.type === 'private' ? 'direct' : 'group',
  thread_id: ctx.message.message_thread_id?.toString(),
  metadata: { chat_id: ctx.chat.id, chat_type: ctx.chat.type, is_forum: ctx.chat.is_forum },
}
```

Message types: `message`, `edited_message`, `callback_query`, `poll_answer`.

### Outbound

- **Text:** `bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_to_message_id, message_thread_id })`
- **Inline buttons:** `{ reply_markup: { inline_keyboard: [[{ text, callback_data }]] } }`
- **Reactions:** `bot.api.setMessageReaction(chatId, messageId, { reaction: [{ type: 'emoji', emoji }] })`
- **Edit:** `bot.api.editMessageText(chatId, messageId, newText, { parse_mode: 'HTML' })`

### Media

Images (JPG/PNG/GIF/WebP), Video (MP4 H.264), Audio (MP3/M4A), Voice (OGG Opus), Documents (any). Photos: 10MB, Docs: 50MB (bots).

### Forum Topics

Supergroups with forum topics: each topic has `message_thread_id`. General topic = thread ID 1.

### Onboarding

1. **Prerequisites:** Create bot via BotFather, obtain token
2. **Credential:** Store token in `~/nexus/state/credentials/telegram/<account>.json` (Keychain pointer)
3. **Register + enable:** Same pattern as Discord
4. **Polling vs webhook:** Default to polling for local-first (no public URL needed)
5. **Threading:** Preserve `container_id` (chat id), `thread_id` (message_thread_id), `reply_to_id`

---

## WhatsApp

**Nexus Tool:** Baileys integration (existing)
**Upstream:** Removed (migrated to NEX adapter SDK — `extensions/whatsapp/`)

### Capabilities

```typescript
const WHATSAPP_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,
  supports_markdown: false,
  supports_embeds: false,
  supports_threads: false,
  supports_reactions: true,
  supports_polls: true,          // Max 12 options
  supports_buttons: false,       // Business API only
  supports_voice_notes: true,    // PTT-style
};
```

### Formatting Rules

- **Message:** ~4000 chars (practical limit) | **Poll options:** 12 max, 100 chars each
- **Plain text only** — strip all Markdown/HTML
- Chunking: ~3500 chars (leave buffer), split at paragraph boundaries

### Inbound

```typescript
{
  platform: 'whatsapp',
  container_kind: msg.key.remoteJid.endsWith('@g.us') ? 'group' : 'direct',
  metadata: { jid: msg.key.remoteJid, participant: msg.key.participant, pushName: msg.pushName },
}
```

JID formats: Individual `12025551234@s.whatsapp.net`, Group `...@g.us`, Broadcast `status@broadcast`.

**Deduplication required:** WhatsApp sends duplicate events. Dedupe by message ID (in-memory set).

### Outbound

- **Text:** `sock.sendMessage(jid, { text })`
- **Reply:** `sock.sendMessage(jid, { text }, { quoted: quotedMessage })`
- **Poll:** `sock.sendMessage(jid, { poll: { name, values, selectableCount } })`
- **Reactions:** `sock.sendMessage(jid, { react: { text: emoji, key: messageKey } })`

### Media

Images (JPG/PNG/GIF/WebP), Video (MP4 H.264), Audio (MP3/M4A/OGG), Voice (OGG Opus + PTT flag), Documents (any). Images: 5MB, Video: 16MB, Docs: 100MB.

### Authentication

QR code login via Baileys (no API keys). Session persistence with multi-file auth state:

```typescript
const { state, saveCreds } = await useMultiFileAuthState('auth_info');
const sock = makeWASocket({ auth: state, printQRInTerminal: true });
sock.ev.on('creds.update', saveCreds);
```

### Groups

Get metadata: `sock.groupMetadata(groupJid)`. Mentions: include `mentions` array with JIDs.

---

## Slack

**Status:** TODO
**Nexus Tool:** `slack-cli` (TBD)
**Upstream:** Removed (migrated to NEX adapter SDK — `extensions/slack/`)

### Capabilities

```typescript
const SLACK_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,
  supports_markdown: true,
  markdown_flavor: 'mrkdwn',
  supports_embeds: true,          // Block Kit
  supports_threads: true,
  supports_reactions: true,
  supports_polls: false,
  supports_buttons: true,         // Block Kit buttons
  supports_voice_notes: false,
};
```

### Formatting Rules

- **Message:** 4000 chars | **Attachment text:** 3000 chars | **Blocks/message:** 50 max
- **mrkdwn** (Slack's flavor): `*bold*` (not `**`), `_italic_`, `~strikethrough~`, `<url|text>` links, `<@U123>` mentions
- Tables: convert to code blocks
- Chunking: 4000 chars, use `thread_ts` for follow-up chunks

### Inbound

```typescript
{
  platform: 'slack',
  container_kind: message.channel_type === 'im' ? 'direct' : 'group',
  thread_id: message.thread_ts,
  metadata: { team_id: message.team, channel_name: message.channel, user_id: message.user },
}
```

Socket Mode (WebSocket, no public endpoint) is the default monitor.

### Outbound

- **Text:** `client.chat.postMessage({ channel, text, thread_ts })`
- **Block Kit:** `{ blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }, { type: 'actions', elements: [{ type: 'button', ... }] }] }`
- **Reactions:** `client.reactions.add({ channel, timestamp, name: 'thumbsup' })`
- **Edit:** `client.chat.update({ channel, ts, text })`
- **Delete:** `client.chat.delete({ channel, ts })`
- **Files:** `client.files.uploadV2({ channel_id, file, filename, thread_ts })`

### Threading

Threads identified by `thread_ts` (timestamp of parent). `reply_broadcast: true` to also post to channel.

---

## Gmail

**Status:** Partial (hooks only upstream; full capability via `gog`)
**Nexus Tool:** `gog` (Gmail CLI via Google OAuth)

### Capabilities

```typescript
const GMAIL_CAPABILITIES: ChannelCapabilities = {
  text_limit: null,
  supports_markdown: false,
  supports_embeds: false,
  supports_threads: true,         // Email threads
  supports_reactions: false,
  supports_polls: false,
  supports_buttons: false,
  supports_voice_notes: false,
  supports_html: true,
  supports_attachments: true,
};
```

### Formatting Rules

- Plain text or HTML (no Markdown rendering — convert to HTML first)
- Subject line: keep under 100 chars; preserve `Re:` prefix for thread replies
- Threading: by `threadId` + `In-Reply-To` / `References` headers

### Nexus Integration (gog tool)

```bash
# Reading
gog gmail search "is:unread"
gog gmail read <message-id>
gog gmail list --max-results 10

# Sending
gog gmail send --to "user@example.com" --subject "Hello" --body "Message"
gog gmail reply <message-id> --body "Reply text"
gog gmail send --to "..." --subject "Files" --body "See attached" --attach file.pdf

# Drafts
gog gmail draft create --to "..." --subject "Draft" --body "..."
gog gmail draft list
gog gmail draft send <draft-id>

# Labels
gog gmail labels
gog gmail label add <message-id> "IMPORTANT"
```

### Inbound (Proposed)

```typescript
{
  platform: 'gmail',
  container_id: message.threadId,
  container_kind: threadParticipants(message).length > 2 ? 'group' : 'direct',
  // Email classification is per-message from current headers only.
  // Do not infer participants from prior thread messages for kind assignment.
  metadata: { message_id: message.id, from: message.from, to: message.to, subject: message.subject },
}
```

Polling strategy: check inbox every N minutes via `gog gmail search "is:unread after:YYYY/MM/DD"`. Advanced: Gmail Pub/Sub push notifications.

### Media

Any file type as attachment. Max 25MB (Gmail limit). Inline images in HTML emails.

---

## iMessage

**Nexus Tool:** `eve` (BlueBubbles integration)
**Upstream:** Removed (migrated to NEX adapter SDK — `extensions/imessage/`)

### Capabilities

```typescript
const IMESSAGE_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,
  supports_markdown: false,
  supports_embeds: false,
  supports_threads: false,
  supports_reactions: true,      // Tapbacks
  supports_polls: false,
  supports_buttons: false,
  supports_voice_notes: false,
};
```

### Formatting Rules

- **Plain text only** — strip all Markdown/HTML. Emojis work natively.
- Tables: convert to monospace text
- Chunking: ~3500 chars, each chunk = separate message bubble

### Inbound

```typescript
{
  platform: 'imessage',
  container_kind: chat.participants.length > 2 ? 'group' : 'direct',
  metadata: {
    chat_guid: chat.guid,
    handle_id: message.handle?.address,
    is_from_me: message.isFromMe,
    service: message.service,    // 'iMessage' | 'SMS'
  },
}
```

Handle formats: iMessage `email@example.com` or `+12025551234`, SMS `+12025551234`, Chat GUID `iMessage;+;chat123456`.

### Outbound

- **Text:** `bluebubbles.post('/api/v1/message/text', { chatGuid, message, method: 'private-api' })`
- **Reply:** include `selectedMessageGuid` for reply bubble
- **Tapbacks:** `bluebubbles.post('/api/v1/message/react', { chatGuid, selectedMessageGuid, reaction })` — values: `love`/`like`/`dislike`/`laugh`/`emphasize`/`question`

### Media

Images (JPG/PNG/GIF/HEIC), Video (MOV/MP4), Audio (M4A/MP3), Files (any). iMessage: 100MB, SMS/MMS: ~1MB.

### Platform Requirements

- **macOS only** with Messages.app running + iCloud signed in
- **BlueBubbles server** installed with Private API enabled (for full features: typing indicators, read receipts, tapback reactions, reply threading)
- Without Private API (AppleScript only): basic send/receive only

### Eve Adapter Plan

Eve is the **first official Nexus adapter** — embeds the Adapter SDK into the `eve` project.

**Data flow:** `chat.db (Apple) -> etl.FullSync() -> eve.db (warehouse) -> adapter queries -> NexusEvent JSONL`

Uses eve's warehouse ETL path (handles AttributedBody decoding, content normalization, handle deduplication, AddressBook name hydration, Apple timestamp conversion).

**Architecture:** `cmd/eve-adapter/main.go` inside the eve repo, imports `internal/` packages. Compiles to standalone `eve-adapter` binary.

**Protocol commands:**
- `info` — static AdapterInfo return
- `monitor` — poll cycle: `etl.FullSync()` + query warehouse for new messages (2s interval)
- `send` — AppleScript execution with `SendWithChunking` (4000 char limit)
- `backfill` — full sync + paginated warehouse query with date filter (5000 batch)
- `health` — check chat.db + eve.db accessibility
- `accounts` — single `"default"` account (iMessage is single-account per macOS user)

**Known limitations:** No platform message IDs from AppleScript send (synthetic IDs), no threaded replies via send, ~2-3s monitor latency, requires `eve sync` for first-time warehouse init.

**Estimated effort:** ~2-3 hours for working v1.

---

## Signal

**Status:** TODO
**Nexus Tool:** `signal-cli` wrapper (TBD)
**Upstream:** Removed (migrated to NEX adapter SDK — `extensions/signal/`)

### Capabilities

```typescript
const SIGNAL_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,
  supports_markdown: false,
  text_style_ranges: true,       // Bold, italic, etc. via position ranges
  supports_embeds: false,
  supports_threads: false,
  supports_reactions: true,
  supports_polls: false,
  supports_buttons: false,
  supports_voice_notes: true,
};
```

### Formatting Rules

- **Plain text with style ranges** (not Markdown): `{ text: "Hello bold world", textStyles: [{ start: 6, length: 4, style: 'BOLD' }] }`
- Styles: `BOLD`, `ITALIC`, `STRIKETHROUGH`, `MONOSPACE`, `SPOILER`
- Convert Markdown to style ranges for outbound
- Chunking: ~3500 chars, recalculate style ranges per chunk

### Inbound

SSE event stream from signal-cli daemon:

```typescript
{
  platform: 'signal',
  container_kind: envelope.dataMessage?.groupInfo ? 'group' : 'direct',
  metadata: { source: envelope.source, source_uuid: envelope.sourceUuid, group_id: envelope.dataMessage?.groupInfo?.groupId },
}
```

Message types: `dataMessage`, `syncMessage`, `receiptMessage`, `typingMessage`, `reactionMessage`.

### Outbound

- **Text:** `POST /api/v1/send/{number}` with `{ recipients, message, textStyles }`
- **Quote reply:** include `quote: { timestamp, author, message }`
- **Reactions:** `POST /api/v1/react/{number}` with `{ recipient, emoji, targetAuthor, targetTimestamp }`

### Media

Images (JPG/PNG/GIF/WebP), Video (MP4), Audio (MP3/M4A/OGG), Voice notes (OGG Opus), Files (any). Max 100MB total per message.

### Platform Requirements

- signal-cli daemon: `signal-cli -u +NUMBER daemon --http localhost:PORT`
- Registration via SMS or linking as secondary device
- SSE reconnection with exponential backoff

---

## LINE

**Status:** TODO
**Nexus Tool:** TBD
**Upstream:** Removed (migrated to NEX adapter SDK — `extensions/line/`)

### Capabilities

```typescript
const LINE_CAPABILITIES: ChannelCapabilities = {
  text_limit: 5000,
  supports_markdown: false,
  supports_embeds: true,          // Flex Messages
  supports_threads: false,
  supports_reactions: false,
  supports_buttons: true,         // Template/Flex buttons
  supports_voice_notes: false,
};
```

### Formatting Rules

- **No Markdown** — use Flex Messages for rich formatting, Template Messages for structured content
- **Flex Message JSON:** 30KB max
- **Reply token:** valid for 1 minute, can reply up to 5 messages
- Chunking: 5000 chars for text, max 5 messages per reply

### Inbound

Webhook-only (no socket/polling):

```typescript
{
  platform: 'line',
  container_kind: event.source.type === 'user' ? 'direct' : 'group',
  metadata: { user_id: event.source.userId, group_id: event.source.groupId, reply_token: event.replyToken },
}
```

Event types: `message`, `follow`, `unfollow`, `join`, `leave`, `postback`.

### Outbound

- **Reply (free):** `client.replyMessage(replyToken, messages)` — uses reply token, max 5 messages
- **Push (costs money):** `client.pushMessage(userId, messages)` — after token expiry
- **Flex Messages:** Rich card-like messages with bubbles, boxes, buttons
- **Template Messages:** Buttons, Confirm, Carousel templates
- **Rich Menus:** Persistent menu attached to chat input

### Media

Images (JPEG/PNG, 10MB), Video (MP4/M4V, 200MB/1min), Audio (M4A/MP3, 200MB/1min), Stickers (by package/sticker ID), Location (lat/long).

---

## Google Chat

**Status:** Config Only (no implementation)
**Nexus Tool:** None
**Upstream:** Registry entry + config types only

### Capabilities (Theoretical)

```typescript
const GOOGLECHAT_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4096,
  supports_markdown: true,        // Limited: *bold*, _italic_, ~strike~, `code`
  markdown_flavor: 'googlechat',
  supports_embeds: true,          // Cards
  supports_threads: true,
  supports_reactions: true,
  supports_buttons: true,         // Card buttons
  supports_voice_notes: false,
};
```

### Key Details

- **API:** Webhook (incoming) + REST API (outgoing, `spaces.messages.create`)
- **Auth:** Service account for bots, OAuth for user-context
- **Rich messages:** CardsV2 with headers, sections, widgets
- **Priority:** Phase 3 (as needed) — primarily enterprise/Workspace use

---

## Microsoft Teams

**Status:** Config Only (no implementation)
**Nexus Tool:** None
**Upstream:** Config schema only

### Capabilities (Theoretical)

```typescript
const MSTEAMS_CAPABILITIES: ChannelCapabilities = {
  text_limit: 28000,
  supports_markdown: true,        // **bold**, *italic*, ~~strike~~, `code`
  markdown_flavor: 'teams',
  supports_embeds: true,          // Adaptive Cards
  supports_threads: true,
  supports_reactions: true,
  supports_buttons: true,         // Adaptive Card actions
  supports_voice_notes: false,
};
```

### Key Details

- **API:** Microsoft Bot Framework (webhook + REST) or simple Incoming Webhooks (one-way)
- **Auth:** Azure AD / Bot Framework registration (complex)
- **Rich messages:** Adaptive Cards (JSON-based, rich layouts + actions)
- **Mentions:** Special `<at>User Name</at>` + entities array
- **Reply styles:** `thread` (same conversation) or `new` (separate message)
- **Priority:** Phase 3 (as needed) — enterprise-focused

---

## Porting Notes (Cross-Channel)

### Common Patterns

| Pattern | Discord | Telegram | WhatsApp | Slack | Gmail | iMessage |
|---------|---------|----------|----------|-------|-------|----------|
| **Chunking** | 2000 chars | 4096 chars | ~3500 chars | 4000 chars | N/A | ~3500 chars |
| **Code fence preservation** | Yes | Yes (`<pre>`) | No (plain text) | Yes | N/A | No |
| **Table conversion** | Code block | `<pre>` block | Plain text | Code block | HTML table | Plain text |
| **Reply reference** | `message_reference` | `reply_to_message_id` | `quoted` msg | `thread_ts` | `In-Reply-To` header | `selectedMessageGuid` |

### Key Upstream Files (OpenClaw)

| Channel | Monitor | Send | Outbound Adapter |
|---------|---------|------|------------------|
| Discord | `monitor/provider.ts` | `send.outbound.ts`, `chunk.ts` | `platforms/plugins/outbound/discord.ts` |
| Telegram | `bot.ts`, `bot-handlers.ts` | `send.ts` | `platforms/plugins/outbound/telegram.ts` |
| WhatsApp | `inbound/monitor.ts` | `outbound.ts` | `platforms/plugins/outbound/whatsapp.ts` |
| Slack | `monitor/provider.ts` | `send.ts`, `actions.ts` | `platforms/plugins/outbound/slack.ts` |
| Gmail | `hooks/gmail.ts` (hooks only) | N/A | N/A |
| iMessage | `monitor.ts` | `send.ts` | `platforms/plugins/outbound/imessage.ts` |

---

## Related

- `../ADAPTER_SYSTEM.md` — Adapter protocol definition
- `../sdk/ADAPTER_SDK.md` — SDK design and components
- `../sdk/ADAPTER_CREDENTIALS.md` — Credential management
- `../sdk/OUTBOUND_TARGETING.md` — Delivery targeting contract
- `../adapters/CHANNEL_DIRECTORY.md` — Channel directory population
- `UPSTREAM_CHANNEL_REVIEWS.md` — Per-platform upstream gap analysis and effort estimates
- `../../iam/ACCESS_CONTROL_SYSTEM.md` — IAM policies
- `../../iam/PAIRING_UX.md` — Permission request / pairing flow
