# Eve Adapter Implementation Plan

**Status:** READY TO IMPLEMENT  
**Last Updated:** 2026-02-06

---

## What We're Doing

Building the **first official Nexus adapter** by embedding the Adapter SDK into the `eve` project. Eve already has a full ETL pipeline for iMessage — it reads from Apple's `chat.db`, normalizes content, resolves contacts via AddressBook, builds conversations, and writes to a processed warehouse database (`eve.db`). We're wiring that processed data through the SDK to produce an adapter binary that speaks the Nexus adapter protocol.

This serves as the proof-of-concept for the entire adapter system: if eve-adapter works cleanly, the SDK design is validated and we can confidently build adapters for every other channel.

---

## Why Eve First

1. **Simplest adapter** — Single account, no credentials, no auth tokens, no network APIs.
2. **You own it** — No fork needed, can modify freely.
3. **Go** — Same language as the SDK, direct package import.
4. **Proven ETL pipeline** — `etl.FullSync()` handles all the hard stuff: AttributedBody decoding, content cleaning, handle normalization, AddressBook name resolution, incremental watermarks, conversation building.
5. **All capabilities exist** — Sync (monitor/backfill), send (AppleScript), whoami (accounts). We're restructuring, not building from scratch.

---

## Data Flow

The adapter uses eve's **warehouse path** — the battle-tested ETL pipeline:

```
chat.db (Apple) → etl.FullSync() → eve.db (warehouse) → adapter queries → NexusEvent JSONL
```

**Why not read chat.db directly?** The direct path has known problems. The warehouse ETL handles all the edge cases: AttributedBody decoding, content normalization, handle deduplication, AddressBook name hydration, Apple timestamp conversion, incremental watermarks, and more. We use the processed data.

**Why not the Comms sync?** The `imessage/sync.go` Comms path was newer but had issues: dead code (no callers), no AddressBook hydration, double-query for membership events, buggy reaction participants, no watermark persistence. It has been removed from the codebase.

---

## Architecture

```
eve/
├── cmd/
│   ├── eve/main.go              # Existing CLI (UNCHANGED)
│   └── eve-adapter/main.go      # NEW — Adapter binary
├── imessage/                     # Public package — chat.db access
│   ├── chatdb.go                 # ChatDB, GetMessages, GetHandles, etc.
│   └── types.go                  # Message, Chat, Handle types
├── internal/
│   ├── config/                   # Config loading (EveDBPath, etc.)
│   ├── etl/                      # ETL pipeline — FullSync, watermarks
│   │   ├── sync.go               # FullSync() orchestrator
│   │   ├── handles.go            # SyncHandles, AddressBook hydration
│   │   ├── messages.go           # SyncMessages, content cleaning
│   │   ├── reactions.go          # SyncReactions
│   │   ├── attachments.go        # SyncAttachments
│   │   ├── conversations.go      # BuildConversations
│   │   ├── membership.go         # SyncMembershipEvents
│   │   ├── watermark.go          # GetWatermark, SetWatermark
│   │   └── content.go            # DecodeAttributedBody, CleanMessageContent
│   └── ...
└── go.mod                        # ADD: adapter-sdk-go dependency
```

**Key insight:** The adapter lives in `cmd/eve-adapter/` inside the eve repo, so it CAN import `internal/` packages. This gives it full access to the warehouse ETL pipeline and config. Eve's existing CLI stays untouched.

The adapter binary compiles to `eve-adapter` and exposes the standard Nexus protocol:

```
eve-adapter info
eve-adapter monitor --account default
eve-adapter send --account default --to "+14155551234" --text "Hello"
eve-adapter backfill --account default --since 2024-01-01
eve-adapter health --account default
eve-adapter accounts list
```

---

## Dependency Changes

### go.mod additions

```go
require (
    github.com/nexus-project/adapter-sdk-go v0.0.0
)

// For local development until SDK is published:
replace github.com/nexus-project/adapter-sdk-go => ../../nexus-adapter-sdks/nexus-adapter-sdk-go
```

The SDK has **zero external dependencies** (stdlib only), so this adds no transitive deps. Eve's existing `go-sqlite3` dependency (CGo) handles all DB access.

### Build

```bash
cd eve
go build -o eve-adapter ./cmd/eve-adapter/
```

CGo is required (for go-sqlite3) — default on macOS.

---

## Handler Implementations

### `info` — Adapter Identity

Static return. No logic needed.

```go
func eveInfo() *nexadapter.AdapterInfo {
    return &nexadapter.AdapterInfo{
        Channel: "imessage",
        Name:    "eve",
        Version: "1.0.0",
        Supports: []nexadapter.Capability{
            nexadapter.CapMonitor,
            nexadapter.CapSend,
            nexadapter.CapBackfill,
            nexadapter.CapHealth,
        },
        MultiAccount: false,
        ChannelCapabilities: nexadapter.ChannelCapabilities{
            TextLimit:          4000,
            SupportsMarkdown:   false,
            SupportsTables:     false,
            SupportsCodeBlocks: false,
            SupportsEmbeds:     false,
            SupportsThreads:    false,
            SupportsReactions:  true,  // Tapback
            SupportsPolls:      false,
            SupportsButtons:    false,
            SupportsEdit:       false,
            SupportsDelete:     false,
            SupportsMedia:      true,
            SupportsVoiceNotes: true,
            SupportsStreamingEdit: false,
        },
    }
}
```

---

### `monitor` — Live Message Streaming

**Strategy:** Periodically trigger `etl.FullSync()` to pull new data from chat.db into the warehouse, then query the warehouse for new messages since the last seen ID.

**Data flow:**

```
each poll cycle:
  1. etl.FullSync(chatDB, warehouseDB, watermark) → syncs chat.db → eve.db
  2. Query: SELECT * FROM messages WHERE id > lastSeenID ORDER BY id
  3. Convert each warehouse message → NexusEvent
  4. Emit via emit(event)
  5. Update lastSeenID
```

**Implementation approach:**

1. Load config via `config.Load()` to get `EveDBPath`
2. Open chat.db via `etl.OpenChatDB()` (same as `eve sync` does)
3. Open warehouse DB (`eve.db`) for read/write
4. Read current watermark via `etl.GetWatermark(warehouseDB, "chatdb", "message_rowid")`
5. Poll loop (every 2 seconds):
   a. Call `etl.FullSync(chatDB, warehouseDB, watermark)` — incremental, only new messages
   b. Update watermark via `etl.SetWatermark()` with new `MaxMessageRowID`
   c. Query warehouse for messages with `id > lastSeenMessageID`
   d. Convert each to NexusEvent and emit
   e. Update lastSeenMessageID

**Poll interval:** 2 seconds. The sync itself is fast for incremental updates (only processes new messages since watermark). This is less aggressive than `eve watch` (250ms) but appropriate for NEX — we're doing a full ETL sync each cycle, not just a raw SQL poll.

**Why 2s not 500ms:** Each poll triggers `etl.FullSync()` which does handle resolution, contact matching, content cleaning, etc. This is heavier than a raw chat.db query. 2 seconds balances responsiveness with efficiency.

**Contact/handle resolution is already done:** The warehouse's `messages` table has `sender_id` as a foreign key to `contacts`, where names are already resolved via AddressBook hydration. No handle maps needed in the adapter.

---

### `send` — Message Delivery

**Strategy:** Replicate eve's AppleScript execution inline. The logic is ~15 lines. This is unchanged from the direct path — sending doesn't involve the warehouse.

**AppleScript for text:**

```applescript
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "<recipient>" of targetService
    send "<text>" to targetBuddy
end tell
```

**AppleScript for text + attachment:**

```applescript
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "<recipient>" of targetService
    send "<text>" to targetBuddy
    send POSIX file "<filepath>" to targetBuddy
end tell
```

Executed via `exec.CommandContext(ctx, "osascript", "-e", script)`.

**Chunking:** Uses `SendWithChunking` with a 4000 char limit:

```go
func eveSend(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
    return nexadapter.SendWithChunking(req.Text, 4000, func(chunk string) (string, error) {
        err := sendAppleScript(ctx, req.To, chunk, req.Media)
        if err != nil {
            return "", err
        }
        return fmt.Sprintf("imessage:sent:%d", time.Now().UnixNano()), nil
    }), nil
}
```

**Note:** AppleScript-based sending doesn't return a platform message ID. We generate synthetic IDs. This is a known limitation of iMessage's AppleScript API.

**Security:** All user input is escaped before interpolation into AppleScript strings (`\` → `\\`, `"` → `\"`).

---

### `backfill` — Historical Events

**Strategy:** Trigger a full sync to ensure the warehouse is up to date, then query the warehouse for messages since the `--since` date.

**Data flow:**

```
1. etl.FullSync(chatDB, warehouseDB, 0)  // full sync if needed, or incremental
2. Query: SELECT * FROM messages WHERE timestamp >= ? ORDER BY id
3. Convert each → NexusEvent → emit JSONL
4. Exit 0 when exhausted
```

**Date filtering is trivial:** The warehouse `messages` table has a proper `timestamp` column (already converted from Apple nanoseconds). A simple `WHERE timestamp >= ?` does the job. No need to convert dates to Apple timestamps or estimate ROWIDs.

**Pagination:** The warehouse query naturally supports LIMIT/OFFSET or cursor-based pagination:

```sql
SELECT m.id, m.content, m.timestamp, m.is_from_me, m.guid, m.service_name,
       m.reply_to_guid, m.chat_id, c.name as sender_name, ch.chat_identifier,
       ch.is_group
FROM messages m
LEFT JOIN contacts c ON m.sender_id = c.id
LEFT JOIN chats ch ON m.chat_id = ch.id
WHERE m.timestamp >= ?
ORDER BY m.id
LIMIT 5000
```

Process in batches of 5000, advancing the cursor after each batch. Memory-safe for any history size.

**Idempotency:** NEX's Events Ledger has `UNIQUE(source, source_id)`. The `event_id` (`imessage:{GUID}`) is deterministic, so re-running backfill is safe.

---

### `health` — Connection Status

**Strategy:** Check both chat.db and eve.db are accessible. Report last message timestamp from the warehouse.

```go
func eveHealth(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
    cfg := config.Load()

    // Check chat.db
    chatDBPath := etl.GetChatDBPath()
    chatDB, err := etl.OpenChatDB(chatDBPath)
    if err != nil {
        return &nexadapter.AdapterHealth{
            Connected: false, Account: "default",
            Error: fmt.Sprintf("cannot open chat.db: %v", err),
        }, nil
    }
    chatDB.Close()

    // Check warehouse
    warehouseDB, err := sql.Open("sqlite3", cfg.EveDBPath+"?mode=ro")
    if err != nil {
        return &nexadapter.AdapterHealth{
            Connected: false, Account: "default",
            Error: fmt.Sprintf("cannot open eve.db: %v", err),
        }, nil
    }
    defer warehouseDB.Close()

    // Get latest message timestamp
    var lastTimestamp time.Time
    warehouseDB.QueryRow("SELECT MAX(timestamp) FROM messages").Scan(&lastTimestamp)

    return &nexadapter.AdapterHealth{
        Connected:   true,
        Account:     "default",
        LastEventAt: lastTimestamp.UnixMilli(),
        Details: map[string]any{
            "chat_db_path":    chatDBPath,
            "warehouse_path":  cfg.EveDBPath,
        },
    }, nil
}
```

---

### `accounts` — Account Discovery

**Strategy:** Single account for iMessage. Use macOS `id -F` for display name.

```go
func eveAccounts(ctx context.Context) ([]nexadapter.AdapterAccount, error) {
    return []nexadapter.AdapterAccount{
        {
            ID:          "default",
            DisplayName: getFullName(), // exec("id", "-F")
            Status:      "active",
        },
    }, nil
}
```

---

## NexusEvent Mapping

### Warehouse `messages` → `NexusEvent`

The warehouse has already done the heavy lifting — content is cleaned, senders are resolved to contact IDs with real names, timestamps are converted. The adapter query joins the relevant tables:

```sql
SELECT m.id, m.content, m.timestamp, m.is_from_me, m.guid,
       m.service_name, m.reply_to_guid, m.chat_id,
       c.name as sender_name,
       ci.identifier as sender_identifier,
       ch.chat_identifier, ch.is_group, ch.chat_name
FROM messages m
LEFT JOIN contacts c ON m.sender_id = c.id
LEFT JOIN contact_identifiers ci ON c.id = ci.contact_id
LEFT JOIN chats ch ON m.chat_id = ch.id
WHERE m.id > ?
ORDER BY m.id
```

| Warehouse column | NexusEvent field | Notes |
|-----------------|-----------------|-------|
| `m.guid` | `event_id` | `"imessage:" + guid` |
| `m.timestamp` | `timestamp` | Already a proper timestamp, convert to Unix ms |
| `m.content` | `content` | Already cleaned (AttributedBody decoded, non-printable stripped) |
| — | `content_type` | `"text"` default |
| — | `channel` | `"imessage"` (constant) |
| — | `account_id` | `"default"` (constant) |
| `ci.identifier` | `sender_id` | Phone or email from contact_identifiers |
| `c.name` | `sender_name` | Real name from AddressBook hydration |
| `ch.chat_identifier` | `peer_id` | Chat identifier string |
| `ch.is_group` | `peer_kind` | `true` → `"group"`, `false` → `"dm"` |
| `m.reply_to_guid` | `reply_to_id` | `"imessage:" + reply_to_guid` if non-null |
| `m.is_from_me` | `metadata.is_from_me` | Boolean |
| `m.chat_id` | `metadata.chat_id` | Integer |
| `m.service_name` | `metadata.service` | `"iMessage"` or `"SMS"` |

**Key advantage over direct path:** `sender_name` is available because the warehouse runs AddressBook hydration. The adapter gets real names for free.

### Conversion Function

```go
func convertWarehouseMessage(row WarehouseMessage) nexadapter.NexusEvent {
    peerKind := "dm"
    if row.IsGroup {
        peerKind = "group"
    }

    b := nexadapter.NewEvent("imessage", "imessage:"+row.GUID).
        WithTimestampUnixMs(row.Timestamp.UnixMilli()).
        WithContent(row.Content).
        WithSender(row.SenderIdentifier, row.SenderName).
        WithPeer(row.ChatIdentifier, peerKind).
        WithAccount("default").
        WithMetadata("is_from_me", row.IsFromMe).
        WithMetadata("chat_id", row.ChatID).
        WithMetadata("service", row.ServiceName)

    if row.ReplyToGUID != "" {
        b.WithReplyTo("imessage:" + row.ReplyToGUID)
    }

    return b.Build()
}
```

Much simpler than the direct path version — no handle maps, no chat style lookups, no Apple timestamp conversion. The warehouse did all that work already.

---

## Full File: `cmd/eve-adapter/main.go`

The complete adapter is a single file. Estimated ~200 lines:

```
main()                          ~10 lines  — Wire handlers into nexadapter.Run()
eveInfo()                       ~30 lines  — Return static AdapterInfo
eveMonitor()                    ~50 lines  — Sync + query warehouse loop
eveSend()                       ~30 lines  — AppleScript execution + chunking
eveBackfill()                   ~35 lines  — Sync + paginated warehouse query
eveHealth()                     ~20 lines  — Check chat.db + eve.db
eveAccounts()                   ~10 lines  — Single default account
convertWarehouseMessage()       ~25 lines  — Warehouse row → NexusEvent
helpers (escaping)              ~10 lines  — AppleScript escaping
```

---

## Testing Plan

### 1. `eve-adapter info`

```bash
eve-adapter info | jq .
```

**Expected:** Valid AdapterInfo JSON with channel "imessage", supports ["monitor", "send", "backfill", "health"].

### 2. `eve-adapter monitor --account default`

```bash
eve-adapter monitor --account default
# Send yourself a test message via Messages.app
# Should see NexusEvent JSONL appear on stdout within ~2 seconds
```

**Expected:** JSONL events with valid `event_id`, `timestamp`, `content`, `sender_id`, `sender_name`, `peer_id`, `peer_kind`.

**Verify:**
- New messages appear within ~2-3s of being sent (sync + query cycle)
- `sender_name` contains real names (from AddressBook), not just phone numbers
- `is_from_me` metadata correctly reflects direction
- Group messages have `peer_kind: "group"`
- DMs have `peer_kind: "dm"`
- Content is clean (no U+FFFC, no null bytes)

### 3. `eve-adapter send --account default --to "+1XXXXXXXXXX" --text "Hello from Nexus"`

**Expected:** DeliveryResult JSON with `success: true`. Message appears in Messages.app.

### 4. `eve-adapter backfill --account default --since 2026-02-01`

```bash
eve-adapter backfill --account default --since 2026-02-01 | head -20
```

**Expected:** JSONL stream of historical messages since Feb 1. Process exits 0 when done.

**Verify:**
- No messages before the since date
- `event_id` is deterministic (same GUID → same event_id)
- Re-running produces identical output (idempotent)
- Handles large histories without OOM (batched queries)

### 5. `eve-adapter health --account default`

**Expected:** `{ "connected": true, "account": "default", "last_event_at": <recent_ms> }`

### 6. `eve-adapter accounts list`

**Expected:** `[{ "id": "default", "display_name": "Tyler Brandt", "status": "active" }]`

---

## Known Limitations

### No Platform Message IDs from Send

AppleScript-based sending doesn't return the platform message ID. We generate synthetic IDs (`imessage:sent:<nanosecond_timestamp>`). Not a blocker — iMessage doesn't expose this to any API.

### No Threaded Replies via Send

iMessage supports reply-to but AppleScript can't target a specific message. Send always creates a new message in the conversation.

### Monitor Latency

Monitor has ~2-3s latency (sync cycle + query) vs `eve watch`'s 250ms direct polling. Acceptable for NEX — the pipeline adds its own latency anyway.

### Single Account

iMessage is inherently single-account per macOS user. The adapter always reports one `"default"` account. This is correct behavior, not a limitation.

### Requires `eve.db` Setup

The adapter depends on the warehouse database existing. First-time users need to run `eve sync` at least once to initialize the warehouse before the adapter can monitor. After that, the adapter handles incremental syncing itself.

---

## Future Enhancements

| Enhancement | What | When |
|-------------|------|------|
| **Reactions** | Query warehouse `reactions` table, emit as NexusEvent with `content_type: "reaction"` | After basic adapter works |
| **Attachments** | Query warehouse `attachments` table, include in NexusEvent.attachments | After basic adapter works |
| **Group Actions** | Query warehouse `membership_events` table, emit as NexusEvent | Low priority |
| **Auto-init** | Run initial full sync if warehouse doesn't exist yet | Polish |

---

## Implementation Order

1. **Scaffold** — Create `cmd/eve-adapter/main.go`, add SDK dependency to go.mod
2. **Info + Health + Accounts** — Simplest handlers, validates SDK wiring works
3. **Convert function** — Warehouse row → NexusEvent mapping
4. **Monitor** — Sync + query loop with warehouse watermarks
5. **Send** — AppleScript execution with chunking
6. **Backfill** — Sync + paginated warehouse query with date filter
7. **Test end-to-end** — All 6 commands verified

**Estimated effort:** ~2-3 hours for a working v1.

---

## Related

- `../../ADAPTER_SYSTEM.md` — Adapter protocol spec
- `../../ADAPTER_SDK.md` — SDK design and components
- `UPSTREAM_REVIEW.md` — Gap analysis of eve against adapter protocol
- `CHANNEL_SPEC.md` — iMessage channel capabilities
- SDK source: `~/nexus/home/projects/nexus/nexus-adapter-sdks/nexus-adapter-sdk-go/`
- Eve source: `~/nexus/home/projects/eve/`

---

*Eve becomes the first official Nexus adapter. The pattern: embed SDK into existing tool, use the processed warehouse data, expose as standard protocol.*
