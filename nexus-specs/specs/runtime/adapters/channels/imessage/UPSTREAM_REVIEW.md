# iMessage Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** `eve` (native macOS, reads chat.db directly)  
**Upstream:** `src/imessage/` (legacy, uses imsg CLI) + `extensions/bluebubbles/` (recommended)

---

## Current Tool: eve

**Source:** `~/nexus/home/projects/eve/`  
**Technology:** Native macOS — reads `~/Library/Messages/chat.db` directly, sends via AppleScript. No BlueBubbles or third-party services. Requires Full Disk Access.

---

## Protocol Compliance

| Protocol Command | eve Equivalent | Status | Notes |
|-----------------|----------------|--------|-------|
| **`info`** | — | Missing | No adapter info command. (`eve whoami` exists but serves a different purpose — shows the Apple account identity, not adapter metadata.) |
| **`monitor`** | `eve watch` | Full | Polls `chat.db` every 250ms. Outputs JSONL: `{"event":"message","rowid":...,"text":...,"sender":...,"chat_id":...}`. |
| **`send`** | `eve send` | Full | Via AppleScript. `--to`, `--chat-id`, `--contact`, `--text`, `--file`. |
| **`backfill`** | `eve messages --format jsonl` | Full | Date filters (`--since`, `--until`), chat filters, JSONL output. Also `eve history` (deprecated alias). |
| **`health`** | — | Missing | No health check command. |
| **`accounts`** | `eve whoami` | Partial | Shows Apple account phones/emails from chat.db. Could inform account discovery but not a dedicated accounts list command. |
| **`react`** | — | Missing | Reactions are *synced* (eve stores tapbacks from chat.db) but no CLI command to *send* tapbacks. |
| **`edit`** | — | N/A | iMessage doesn't support editing. |
| **`delete`** | — | N/A | Not supported. |

### Current Compliance Level: **Standard** (info + monitor + send + backfill)

### Path to Complete: Add `health` command, formalize `accounts` output.  
### Path to Extended: Add `react` command for sending tapbacks.

---

## What Exists (Logic Available)

### Inbound / Monitor
- **`eve watch`** — Polls chat.db, outputs JSONL events with rowid, text, sender, chat_id, is_from_me, timestamp
- **`eve sync`** — Full ETL from chat.db → eve.db (handles, chats, messages, attachments, reactions, conversations). Watermark-based incremental sync.
- **Event format needs adaptation** — Current JSONL schema is eve-specific, not NexusEvent. Fields need renaming: `sender` → `sender_id`, `chat_id` → `peer_id`, add `channel: "imessage"`, add `peer_kind`, etc.

### Outbound / Send
- **`eve send`** — Full implementation via AppleScript (`osascript`). Supports:
  - `--to <phone/email>` — Direct targeting
  - `--chat-id` — Chat GUID targeting
  - `--contact <name>` — Contact resolution from eve.db
  - `--text` — Message content
  - `--file <path>` — Attachment sending
- **No chunking** — Long messages sent as-is (iMessage has ~4000 char practical limit but no hard enforcement)
- **No formatting conversion** — Plain text only (correct for iMessage)

### Backfill
- **`eve messages --format jsonl`** — Historical messages with date range filtering
- **`eve history`** — Deprecated alias, same functionality
- **Filters:** `--chat-id`, `--contact`, `--since`, `--until`, `--search`, `--limit`
- **Attachment inclusion:** `--attachments` flag includes attachment metadata
- **Idempotent:** Messages have stable rowids from chat.db

### Query Commands (Useful for Context)
- **`eve chats`** — List chats sorted by recent activity (JSON output)
- **`eve contacts`** — List/search contacts (JSON output)
- **`eve attachments`** — List attachments by chat/message

### Intelligence (Bonus)
- **`eve search`** — Semantic search using embeddings (requires GEMINI_API_KEY)
- **`eve analyze`** — Queue conversation analysis jobs
- **`eve insights`** — Query analysis results (topics, entities, emotions)
- These are Cortex-like features built into eve. May inform Cortex design.

---

## What Needs Changing

### NexusEvent Format Adaptation
Current `eve watch` output:
```json
{"event":"message","rowid":12345,"text":"Hey","is_from_me":false,"timestamp":1707235200,"sender":"+14155551234","chat_id":"+14155551234"}
```

Needed NexusEvent format:
```json
{"event_id":"imessage:12345","timestamp":1707235200000,"content":"Hey","content_type":"text","channel":"imessage","account_id":"default","sender_id":"+14155551234","peer_id":"+14155551234","peer_kind":"dm"}
```

**Gap:** Field renaming + schema alignment. Could be done via:
- A wrapper script that pipes `eve watch` and transforms the JSON
- Adding a `--format nexus` flag to eve directly
- An eve update that outputs NexusEvent natively

### Missing Commands
1. **`info`** — Need to return structured `AdapterInfo` JSON (channel, version, supports, capabilities)
2. **`health`** — Check chat.db accessibility, Full Disk Access status, AppleScript availability
3. **`react`** — Send tapbacks. Eve already parses tapback types (love, like, dislike, laugh, emphasize, question). Needs AppleScript send.

### Delivery Result
`eve send` currently outputs nothing on success. Needs to return `DeliveryResult` JSON:
```json
{"success":true,"message_ids":["imessage:12346"],"chunks_sent":1}
```

---

## What Doesn't Exist

| Feature | Status | Effort |
|---------|--------|--------|
| Structured `info` command | Not built | Low — just metadata output |
| `health` command | Not built | Low — check chat.db access + AppleScript |
| `react` command (send tapbacks) | Not built | Medium — AppleScript for tapbacks |
| NexusEvent output format | Not built | Low — field mapping |
| DeliveryResult from send | Not built | Low — add JSON output |
| Message chunking | Not needed | iMessage doesn't enforce hard limits |

---

## Upstream Comparison (OpenClaw)

OpenClaw's `src/imessage/` is **legacy** (marked in v2026.2.2). Uses `imsg` CLI with RPC. BlueBubbles (`extensions/bluebubbles/`) is now recommended.

| Feature | eve | OpenClaw imsg | OpenClaw BlueBubbles |
|---------|-----|---------------|---------------------|
| Technology | Native chat.db + AppleScript | imsg CLI + RPC | BlueBubbles HTTP API |
| Platform | macOS only | macOS only | Cross-platform (server on Mac) |
| Monitor | Polling chat.db | RPC client | Webhook/polling |
| Send | AppleScript | imsg CLI | HTTP API |
| Reactions | Read-only | Read-only | Full (Private API) |
| Threading | No | No | Supported (reply to GUID) |
| Attachments | Send via AppleScript | Send via imsg | Send via HTTP API |

**Recommendation:** Eve is solid for macOS-native use. Consider adding BlueBubbles as an alternative account type within the same imessage adapter (for users who want cross-platform access or richer features).

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Add `--format nexus` to `eve watch` | 2-4 hours | High |
| Add `info` command | 1-2 hours | High |
| Add `health` command | 1-2 hours | Medium |
| Add DeliveryResult JSON to `eve send` | 1-2 hours | High |
| Add `react` command (tapbacks) | 4-8 hours | Low |
| **Total to Complete level** | **~8 hours** | |

---

## Related
- `CHANNEL_SPEC.md` — iMessage capabilities, formatting, media
- `../../ADAPTER_SYSTEM.md` — Protocol definition
- `../../upstream/CHANNEL_INVENTORY.md` — Full upstream inventory
