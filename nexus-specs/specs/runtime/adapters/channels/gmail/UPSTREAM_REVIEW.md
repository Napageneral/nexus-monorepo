# Gmail Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** `gog` (gogcli — full Google API CLI)  
**Upstream:** `src/hooks/gmail.ts` (hooks only, no full adapter)

---

## Current Tool: gog (gogcli)

**Source:** `~/nexus/home/projects/gogcli/`  
**Install:** Homebrew (`steipete/tap/gogcli`)  
**Technology:** Google APIs via OAuth. Multi-service: Gmail, Calendar, Drive, Contacts, Tasks, Sheets, Docs, Slides, Chat, Keep, Classroom, Groups.

---

## Protocol Compliance

| Protocol Command | gog Equivalent | Status | Notes |
|-----------------|----------------|--------|-------|
| **`info`** | `gog --help`, `gog auth services` | Partial | No structured `AdapterInfo` JSON. Service list available. |
| **`monitor`** | `gog gmail watch serve` | Full | Pub/Sub push via Google Cloud. Webhook HTTP server. History ID tracking for incremental. |
| **`send`** | `gog gmail send` | Full | Send, reply, reply-all, attachments, send-as aliases, HTML/plain text, proper threading headers. |
| **`backfill`** | `gog gmail search`, `gog gmail history` | Full | Gmail query syntax, incremental history via historyId, message/thread retrieval. |
| **`health`** | `gog auth status`, `gog auth list --check` | Partial | Auth/token validation. No API health check. |
| **`accounts`** | `gog auth` | Full | Add, list, remove, verify, aliases, service accounts, multi-account with `--account` flag. |
| **`react`** | — | N/A | Email doesn't support reactions. |
| **`edit`** | — | N/A | Email doesn't support editing sent messages. |

### Current Compliance Level: **Complete** (info partial, everything else present)

### Path to Full Complete: Add structured `info` command with `AdapterInfo` JSON output.

---

## What Exists (Logic Available)

### Inbound / Monitor
- **`gog gmail watch start`** — Set up Gmail Pub/Sub push notifications
  - `--topic <pubsub-topic>` — Google Cloud Pub/Sub topic
  - `--label <label>` — Filter by label (repeatable)
- **`gog gmail watch serve`** — Run HTTP server receiving Pub/Sub push events
  - OIDC JWT verification (production) or shared token (dev)
  - Webhook forwarding to downstream URLs
  - `--include-body`, `--max-bytes` for content control
  - History ID tracking for incremental sync
- **`gog gmail watch status`** — Show current watch state
- **`gog gmail watch renew`** — Renew watch (Gmail watches expire every 7 days)
- **`gog gmail watch stop`** — Stop watch
- **State persistence:** `~/.config/gogcli/state/gmail-watch/<account>.json`

**Gap:** Output is webhook-based (HTTP callbacks), not JSONL on stdout. Needs a mode that emits NexusEvent JSONL instead of/in addition to forwarding webhooks.

### Outbound / Send
- **`gog gmail send`** — Full email sending:
  - `--to`, `--cc`, `--bcc` recipients
  - `--subject` — Subject line
  - `--body` — Plain text body
  - `--body-html` — HTML body
  - `--body-file` — Read body from file
  - `--reply-to-message-id`, `--thread-id` — Threading
  - `--reply-all` — Auto-populate recipients
  - `--from` — Send-as verified alias
  - `--attach <file>` — Attachments (repeatable)
  - `--track` — Open tracking
  - Automatic multipart MIME when both text and HTML provided
  - Proper RFC 5322 headers (In-Reply-To, References) for threading

### Backfill
- **`gog gmail search <query>`** — Search threads using Gmail query syntax
  - `newer_than:7d`, `is:unread`, `from:user@example.com`, `has:attachment`
  - `--max N` — Limit results
  - `--page <token>` — Pagination
- **`gog gmail messages search <query>`** — Search individual messages
  - `--include-body` — Include message body
- **`gog gmail thread get <threadId>`** — Full thread with all messages
- **`gog gmail get <messageId>`** — Single message (full/metadata/raw)
- **`gog gmail history --since <historyId>`** — Incremental history
  - `--max N` — Limit
  - Efficient delta sync using Gmail historyId
- **Output formats:** `--json`, `--plain`, human-readable tables

### Account Management
- **`gog auth add <email>`** — OAuth flow, stores refresh token
- **`gog auth list [--check]`** — List accounts, optionally validate tokens
- **`gog auth remove <email>`** — Remove account
- **`gog auth status`** — Current auth state
- **`gog auth services`** — Available Google services and OAuth scopes
- **`gog auth credentials <path>`** — Store OAuth client credentials
- **`gog auth service-account set`** — Google Workspace service accounts
- **`gog auth alias set/list`** — Account aliases for quick switching
- **Multi-account:** Native support via `--account <email|alias>` or `GOG_ACCOUNT` env

### Drafts
- **`gog gmail drafts create`** — Create draft
- **`gog gmail drafts update`** — Update draft
- **`gog gmail drafts send`** — Send draft
- **`gog gmail drafts list`** — List drafts
- **`gog gmail drafts delete`** — Delete draft

### Labels & Settings
- **`gog gmail labels list/get/create/modify`** — Label management
- **`gog gmail batch delete/modify`** — Bulk operations
- **`gog gmail settings`** — Filters, delegates, forwarding, send-as, vacation

---

## What Needs Changing

### NexusEvent Output from Monitor
Current: `gog gmail watch serve` runs an HTTP server that receives Pub/Sub pushes and forwards them as webhooks.

Needed: A mode that emits NexusEvent JSONL on stdout when new emails arrive.

**Options:**
1. Add `--format jsonl` to `gog gmail watch serve` that writes to stdout instead of forwarding
2. Create a wrapper that calls `gog gmail history --since <lastHistoryId>` on each push notification and converts to NexusEvent
3. Add a new `gog gmail monitor` command that combines watch + history into a JSONL stream

### Structured Info Command
Need: `gog info --adapter gmail` returns:
```json
{
  "channel": "gmail",
  "name": "Gmail via gog",
  "version": "1.x.x",
  "supports": ["monitor", "send", "backfill", "health", "accounts"],
  "credential_service": "google",
  "multi_account": true,
  "channel_capabilities": { "text_limit": null, "supports_markdown": false, "supports_html": true, ... }
}
```

### DeliveryResult from Send
`gog gmail send` likely returns a message ID but may not be in DeliveryResult format. Need:
```json
{"success":true,"message_ids":["gmail:msg:abc123"],"chunks_sent":1}
```

### Health Command
Need unified health beyond auth:
```json
{"connected":true,"account":"tnapathy@gmail.com","last_event_at":1707235200000}
```

---

## What Doesn't Exist

| Feature | Status | Effort |
|---------|--------|--------|
| Structured `info` command | Not built | Low |
| JSONL event stream from monitor | Not built | Medium — needs watch → JSONL bridge |
| DeliveryResult JSON from send | May exist partially | Low |
| Unified health command | Not built (auth exists) | Low |
| Chunking | Not needed | Email has no practical char limit |
| Formatting conversion | Partial | gog handles HTML/plain multipart natively |

---

## Multi-Service Consideration

gog covers far more than Gmail. Other Google services that could become adapters:

| Service | gog Support | Nexus Adapter? | Notes |
|---------|-------------|----------------|-------|
| **Gmail** | Full | Yes — primary | Core communication channel |
| **Calendar** | Full | Yes — separate adapter | Events as NexusEvents, mnemonic already has `calendar.go` |
| **Contacts** | Full | Partial | Identity Graph integration, not really an adapter |
| **Drive** | Full | Maybe | File events? Low priority. |
| **Tasks** | Full | Maybe | Task events? Low priority. |
| **Chat (Workspace)** | Full | Yes — separate channel | Google Chat is a distinct messaging platform |

**Recommendation:** gog becomes the Gmail adapter. Calendar gets its own adapter entry that also uses gog. Contacts integration feeds the Identity Graph, not the adapter system.

---

## Upstream Comparison (OpenClaw)

OpenClaw has **hooks only** for Gmail (`src/hooks/gmail.ts`). No full adapter. This means:
- No monitor implementation to port
- No outbound implementation to port
- gog is entirely Nexus-original — no upstream reference needed

This is the cleanest adapter story: gog already does everything, just needs protocol compliance wrappers.

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Add structured `info` command | 1-2 hours | High |
| Bridge watch → JSONL NexusEvent stream | 4-8 hours | High |
| Add DeliveryResult JSON to send | 1-2 hours | High |
| Add unified health command | 1-2 hours | Medium |
| NexusEvent schema mapping for email events | 2-4 hours | High |
| **Total to full Complete level** | **~12 hours** | |

---

## Related
- `CHANNEL_SPEC.md` — Gmail capabilities, formatting, email specifics
- `../../ADAPTER_SYSTEM.md` — Protocol definition
- `../calendar/` — Calendar adapter (also uses gog)
