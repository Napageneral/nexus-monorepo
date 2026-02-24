# Upstream Channel Reviews

**Status:** REFERENCE
**Last Updated:** 2026-02-23
**Related:** `CHANNEL_CATALOG.md`, `../ADAPTER_SYSTEM.md`, `../ADAPTER_SDK.md`

---

## Purpose

Consolidated upstream gap analysis for all channel adapters: protocol compliance, extraction difficulty, available logic, and effort estimates.

---

## Compliance Summary

| Channel | Tool | Compliance | Path to Complete | Est. Effort |
|---------|------|-----------|-----------------|-------------|
| **Discord** | TBD (`discord-cli`) | None (no standalone adapter) | Extract from OpenClaw monolith | ~50-80 hours |
| **WhatsApp** | TBD (Baileys wrapper) | None (no standalone adapter) | Extract from OpenClaw + Baileys | ~30-40 hours |
| **Slack** | TBD (`slack-cli`) | None (no standalone adapter) | Extract from OpenClaw + @slack/bolt | ~35-55 hours |
| **Gmail** | `gog` (gogcli) | Complete (info partial) | Add structured info + JSONL monitor | ~12 hours |
| **iMessage** | `eve` | Standard (info+monitor+send+backfill) | Add health, formalize accounts | ~8 hours |
| **Voice** | None | None | Specialized subsystem, not standard adapter | ~16-32 hours |
| **Twitter/X** | `bird` CLI | None (partial backfill only) | Build adapter CLI + polling monitor | ~16-28 hours |
| **Calendar** | `gog` (Google Calendar) | None (full backfill logic exists) | Build adapter CLI + polling monitor | ~12-22 hours |
| **AIX** | None (mnemonic adapters) | None (sync logic exists) | Build CLI + continuous monitor | ~20-30 hours |

---

## Discord

**Upstream:** `src/discord/` (66 files)
**Recommendation:** Option A — Port to standalone TypeScript CLI

### Protocol Compliance

| Command | Upstream Equivalent | Status |
|---------|-------------------|--------|
| `info` | — | Missing |
| `monitor` | `monitorDiscordProvider()` via `@buape/carbon` | Logic exists (emits `MsgContext`, not NexusEvent) |
| `send` | `sendMessageDiscord()` with chunking/embeds/threading | Logic exists |
| `backfill` | `readMessagesDiscord()`, `searchMessagesDiscord()` | Logic exists |
| `health` | — | Missing |
| `accounts` | `listDiscordAccountIds()`, `resolveDiscordAccount()` | Logic exists |
| `react`/`edit`/`delete`/`poll` | All implemented | Logic exists |

### Extractable Logic

**Light deps (extractable as-is):** `chunk.ts` (chunking), `send.shared.ts` (client factory), `send.messages.ts` (CRUD), `send.reactions.ts`, `monitor/threading.ts`.

**Heavy deps (need rewrite):** `auto-reply/*`, `config/config.js`, `routing/*`, `platforms/*`, `pairing/*`, `security/channel-metadata.js`.

### What Must Be Built

- CLI interface (command parser, credential resolution, JSONL output)
- NexusEvent normalization (`MsgContext` -> `NexusEvent`)
- Config abstraction (replace `loadConfig()` with Nexus credential system)

### Effort Breakdown

| Task | Effort |
|------|--------|
| Extract chunking logic | 2-4h |
| Extract send functions | 8-12h |
| Extract monitor/gateway logic | 8-12h |
| Build CLI interface | 4-8h |
| NexusEvent normalization | 4-8h |
| Config/credential abstraction | 4-8h |
| Backfill via message history | 4-8h |
| Health command | 2-4h |
| Extended: react, edit, delete, poll | 4-8h |
| **Total** | **~50-80h** |

---

## WhatsApp

**Upstream:** `src/web/` (78 files, Baileys)
**Recommendation:** Extract core Baileys logic + CLI wrapper

### Protocol Compliance

| Command | Upstream Equivalent | Status |
|---------|-------------------|--------|
| `info` | — | Missing |
| `monitor` | `monitorWebInbox()` via Baileys `messages.upsert` | Logic exists |
| `send` | `sendMessageWhatsApp()` | Logic exists |
| `backfill` | — | Missing (Baileys `syncFullHistory` is append-only, not queryable) |
| `health` | Connection state tracked | Logic exists (not exposed) |
| `accounts` | Multi-account resolution | Logic exists |
| `react`/`poll` | `sendReactionWhatsApp()`, `sendPollWhatsApp()` | Logic exists |

### Key Implementation Details

- **QR auth:** Well-implemented in `login-qr.ts` (PNG base64, pairing restart on code 515)
- **Session persistence:** `auth-store.ts` multi-file auth state with backup/restore
- **Deduplication:** In-memory cache, 20-min TTL, 5000 entries, key `${accountId}:${remoteJid}:${id}`
- **Media:** Downloads via `downloadMediaMessage()`, configurable max 50MB
- **Backfill challenge:** Baileys has no history query API; can only capture on-connect history events

### Effort Breakdown

| Task | Effort |
|------|--------|
| Extract core Baileys logic + CLI wrapper | 12-16h |
| NexusEvent normalization | 4-8h |
| Send CLI with chunking | 4-8h |
| QR auth flow in CLI | 2-4h |
| Health + accounts | 3-6h |
| React/poll CLIs | 2-4h |
| Backfill (limited, connection-based) | 4-8h |
| **Total** | **~30-40h** |

---

## Slack

**Upstream:** `src/slack/` (65 files, @slack/bolt)
**Recommendation:** Extract API layer + rewrite monitor

### Protocol Compliance

| Command | Upstream Equivalent | Status |
|---------|-------------------|--------|
| `info` | — | Missing |
| `monitor` | `monitorSlackProvider()` (Socket Mode or HTTP) | Logic exists |
| `send` | `sendMessageSlack()` with mrkdwn formatting | Logic exists |
| `backfill` | `readSlackMessages()` via `conversations.history`/`replies` | Logic exists |
| `health` | `probeSlack()` via `auth.test()` | Logic exists |
| `accounts` | Multi-account resolution | Logic exists |
| `react`/`edit`/`delete` | All via `actions.ts` | Logic exists |

### Key Implementation Details

- **Dual monitor modes:** Socket Mode (WebSocket, no public endpoint) or HTTP (webhook + signingSecret)
- **mrkdwn conversion:** `markdownToSlackMrkdwn()` — standard markdown to Slack's `*bold*`/`_italic_`/`~strike~`
- **Thread handling:** `thread_ts`, thread starter resolution (cached), reply-to modes
- **Health probe:** `auth.test()` returns bot name, team, OK, latency

### Extractable Logic

**Light deps:** `actions.ts` (API wrappers), `client.ts` (WebClient factory), `format.ts` (mrkdwn), `targets.ts`, `probe.ts`, `threading.ts`.

**Needs rewrite:** Monitor provider (deeply entangled with OpenClaw), `prepareSlackMessage()` (584 lines, heavily coupled), media handling.

### Effort Breakdown

| Task | Effort |
|------|--------|
| Extract API layer (actions, format, threading) | 4-8h |
| Build CLI interface | 4-8h |
| Rewrite monitor for NexusEvent JSONL | 8-12h |
| Send CLI with mrkdwn formatting | 4-8h |
| Backfill via `conversations.history` | 4-8h |
| Health CLI | 1-2h |
| Account management + extended commands | 4-8h |
| **Total** | **~35-55h** |

---

## Gmail

**Upstream:** `src/hooks/gmail.ts` (hooks only, no full adapter)
**Tool:** `gog` (gogcli) — already feature-complete

### Protocol Compliance

| Command | gog Equivalent | Status |
|---------|---------------|--------|
| `info` | `gog --help`, `gog auth services` | Partial (no structured AdapterInfo JSON) |
| `monitor` | `gog gmail watch serve` (Pub/Sub push + HTTP server) | Full |
| `send` | `gog gmail send` (with reply, attachments, threading) | Full |
| `backfill` | `gog gmail search`, `gog gmail history` (incremental via historyId) | Full |
| `health` | `gog auth status`, `gog auth list --check` | Partial |
| `accounts` | `gog auth` (add/list/remove/verify/aliases/service-accounts) | Full |

### What Needs Changing

- **Monitor:** Current output is webhook-based (HTTP callbacks); needs JSONL-on-stdout mode
- **Info:** Add structured `AdapterInfo` JSON output
- **Send:** May need `DeliveryResult` JSON format
- **Health:** Unify beyond auth check

### Multi-Service Note

gog covers Gmail, Calendar, Drive, Contacts, Tasks, Sheets, Chat, and more. Recommendation: gog = Gmail adapter; Calendar gets its own adapter entry also using gog; Contacts feeds Identity Graph.

### Effort Breakdown

| Task | Effort |
|------|--------|
| Structured `info` command | 1-2h |
| Bridge watch -> JSONL NexusEvent stream | 4-8h |
| DeliveryResult JSON from send | 1-2h |
| Unified health command | 1-2h |
| NexusEvent schema mapping | 2-4h |
| **Total** | **~12h** |

---

## iMessage

**Upstream:** `src/imessage/` (legacy, uses imsg CLI) + `extensions/bluebubbles/`
**Tool:** `eve` (native macOS, reads chat.db directly)

### Protocol Compliance

| Command | eve Equivalent | Status |
|---------|---------------|--------|
| `info` | — | Missing |
| `monitor` | `eve watch` (polls chat.db every 250ms, JSONL output) | Full |
| `send` | `eve send` (AppleScript: `--to`, `--chat-id`, `--contact`, `--text`, `--file`) | Full |
| `backfill` | `eve messages --format jsonl` (date/chat filters) | Full |
| `health` | — | Missing |
| `accounts` | `eve whoami` (Apple account phones/emails) | Partial |
| `react` | — | Missing (tapbacks synced but no send command) |

### What Needs Changing

- **NexusEvent format:** Current `eve watch` output is eve-specific; needs field renaming (`sender` -> `sender_id`, add `channel`, `container_kind`)
- **Missing commands:** `info` (metadata output), `health` (check chat.db access + AppleScript), `react` (send tapbacks)
- **DeliveryResult:** `eve send` currently outputs nothing on success

### Upstream Comparison

| Feature | eve | OpenClaw imsg (legacy) | OpenClaw BlueBubbles |
|---------|-----|----------------------|---------------------|
| Technology | Native chat.db + AppleScript | imsg CLI + RPC | BlueBubbles HTTP API |
| Platform | macOS only | macOS only | Cross-platform |
| Reactions | Read-only | Read-only | Full (Private API) |
| Threading | No | No | Supported |

### Effort Breakdown

| Task | Effort |
|------|--------|
| Add `--format nexus` to `eve watch` | 2-4h |
| Add `info` command | 1-2h |
| Add `health` command | 1-2h |
| Add DeliveryResult to `eve send` | 1-2h |
| Add `react` command (tapbacks) | 4-8h |
| **Total** | **~8h** |

---

## Voice/Telephony

**Upstream:** `extensions/voice-call/` (41 files, OpenClaw extension)
**Tool:** None

### Protocol Compliance

| Command | Status | Notes |
|---------|--------|-------|
| `info` | Missing | |
| `monitor` | Partial | Webhook receiver, not JSONL |
| `send` | Logic exists | Outbound call initiation + TTS |
| `backfill` | Missing | Would need Twilio API call logs |
| `health` | Missing | Could check Twilio account status |

### Key Implementation Details

- **Providers:** Twilio (primary), Plivo, Telnyx
- **Features:** Inbound/outbound calls, OpenAI Realtime STT, TTS (OpenAI + ElevenLabs), media streams, webhook security
- **Fundamental difference:** Real-time bidirectional audio stream vs discrete messages

### Adapter Fit Assessment

Voice doesn't fit the standard adapter model well. Recommendation: model as two pieces:
1. **Call event adapter** (basic) — emit call lifecycle events as NexusEvents (ring/answer/end/voicemail)
2. **Call action service** — real-time call management accessed via agent tools

### Effort: ~16-32 hours for basic call event adapter

---

## Twitter/X

**Tool:** `bird` CLI
**Source:** mnemonic `internal/adapters/bird.go`
**Upstream (OpenClaw):** N/A (Nexus-only)

### Protocol Compliance

| Command | Status | Notes |
|---------|--------|-------|
| `info` | Missing | |
| `monitor` | Missing | Need polling loop over `bird mentions` |
| `send` | Missing | Tweet posting if `bird` supports it |
| `backfill` | Partial | Fetches last 100 bookmarks/likes/mentions (no date range) |
| `accounts` | Partial | `bird whoami --plain` (single account) |

### What Mnemonic Extracts

Bookmarks, likes, mentions — each with ID, text, createdAt, author, conversationID, engagement metrics. Creates contacts for authors. Channel: `"x"`, direction: `"observed"`.

### Effort: ~16-28 hours for standard adapter

---

## Calendar

**Tool:** `gog` (Google Calendar via gogcli)
**Source:** mnemonic `internal/adapters/calendar.go`
**Upstream (OpenClaw):** N/A (Nexus-only)

### Protocol Compliance

| Command | Status | Notes |
|---------|--------|-------|
| `info` | Missing | |
| `monitor` | Missing | Need polling for new/updated events |
| `send` | Partial | gog may support event creation |
| `backfill` | Full | Month-by-month from 2004, cursor-based, resumable |
| `accounts` | Full | Multi-account via gog |

### What Mnemonic Extracts

Calendar events from all accessible calendars: ID, summary, description, location, status, start/end, organizer, attendees, HTML link. Tracks event state with change detection.

### NexusEvent Shape

```json
{
  "event_id": "calendar:calendarId:eventId",
  "content": "Team standup at 9:00 AM - Conference Room B",
  "channel": "calendar",
  "container_kind": "channel",
  "metadata": { "summary": "...", "location": "...", "start": "...", "end": "...", "attendees": [...] }
}
```

### Effort: ~12-22 hours (shares gog with Gmail)

---

## AIX (IDE Sessions)

**Source:** mnemonic `internal/adapters/aix*.go`
**Upstream (OpenClaw):** N/A (Nexus-only)

### Protocol Compliance

| Command | Status | Notes |
|---------|--------|-------|
| `info` | Missing | |
| `monitor` | Missing | All adapters are one-shot sync |
| `send` | N/A | Inbound-only (can't "send" to an IDE) |
| `backfill` | Logic exists | Incremental sync from aix.db |
| `health` | Missing | Could check aix.db accessibility |
| `accounts` | Partial | Sources: cursor, codex, claude-code, opencode |

### Three Mnemonic Adapters

1. **`aix.go`** — Full message adapter: sessions -> threads, messages -> events
2. **`aix_events.go`** — Trimmed turn pairs: clean user query + assistant response pairs for memory/embedding
3. **`aix_agents.go`** — Full-fidelity sessions: complete sessions with tool calls for Agents Ledger import

### Design Decisions

- **Single adapter with source as account:** `aix/cursor`, `aix/codex`, `aix/claude-code` (all share same schema)
- **Adapter emits NexusEvents** -> Events Ledger (standard path); Agents Ledger import handled separately by Broker
- **Inbound only** — IDE interaction happens through Broker directly

### Effort: ~20-30 hours for basic adapter

---

## Total Effort Summary

| Priority | Channels | Combined Effort |
|----------|----------|-----------------|
| **Ready now** (tool exists) | Gmail, iMessage | ~20 hours |
| **Port from OpenClaw** | Discord, Slack, WhatsApp | ~115-175 hours |
| **Build new** | Twitter, Calendar, AIX | ~48-80 hours |
| **Specialized** | Voice | ~16-32 hours |
| **Grand Total** | All 9 channels | **~200-300 hours** |

---

## Related

- `CHANNEL_CATALOG.md` — Channel capabilities, formatting, inbound/outbound patterns
- `../ADAPTER_SYSTEM.md` — Adapter protocol definition
- `../ADAPTER_SDK.md` — SDK design
- `../upstream/CHANNEL_INVENTORY.md` — Full upstream inventory
- `../upstream/OPENCLAW_INBOUND.md` — Inbound dispatch flow
- `../upstream/OPENCLAW_OUTBOUND.md` — Outbound delivery flow
