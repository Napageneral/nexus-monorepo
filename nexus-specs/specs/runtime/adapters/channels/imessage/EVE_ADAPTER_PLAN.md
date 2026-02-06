# Eve Adapter Implementation Plan

**Status:** READY TO IMPLEMENT  
**Last Updated:** 2026-02-06

---

## What We're Doing

Building the **first official Nexus adapter** by embedding the Adapter SDK into the `eve` project. Eve already has all the platform-specific logic for iMessage (reading chat.db, sending via AppleScript, polling for new messages). We're wiring that existing logic through the SDK to produce an adapter binary that speaks the Nexus adapter protocol.

This serves as the proof-of-concept for the entire adapter system: if eve-adapter works cleanly, the SDK design is validated and we can confidently build adapters for every other channel.

---

## Why Eve First

1. **Simplest adapter** — Single account, no credentials, no auth tokens, no network APIs.
2. **You own it** — No fork needed, can modify freely.
3. **Go** — Same language as the SDK, direct package import.
4. **Public package** — `github.com/Napageneral/eve/imessage` is importable. Core logic is accessible without touching the monolith `cmd/eve/main.go`.
5. **All capabilities exist** — Watch (monitor), send, messages (backfill), whoami (accounts) are all implemented. We're restructuring, not building from scratch.

---

## Architecture

```
eve/
├── cmd/
│   ├── eve/main.go              # Existing CLI (UNCHANGED)
│   └── eve-adapter/main.go      # NEW — Adapter binary, single file
├── imessage/                     # Existing public package (UNCHANGED)
│   ├── chatdb.go                 # ChatDB, GetMessages, GetHandles, etc.
│   ├── types.go                  # Message, Chat, Handle, Attachment, etc.
│   ├── content.go                # Content normalization
│   └── sync.go                   # Sync (not used by adapter)
├── internal/                     # Existing internal packages (UNCHANGED)
└── go.mod                        # ADD: adapter-sdk-go dependency
```

**Key principle:** We don't touch eve's existing code. The adapter is a new `cmd/` entry point that imports the public `imessage` package and the SDK. Eve's existing CLI (`eve watch`, `eve send`, etc.) continues to work exactly as before.

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
replace github.com/nexus-project/adapter-sdk-go => ../../nexus-adapter-sdk-go
```

The SDK has **zero external dependencies** (stdlib only), so this adds no transitive deps. The `imessage` package's dependency on `go-sqlite3` (CGo) is already in eve's go.mod.

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

**Strategy:** Custom monitor function (not PollMonitor). Eve's optimal cursor is `ROWID` (int64), not `time.Time`. A custom function is cleaner than forcing the time-based PollMonitor.

**Data flow:**

```
chat.db → GetMessages(sinceRowID) → resolve handles → convert to NexusEvent → emit JSONL
```

**Implementation approach:**

1. Open chat.db via `imessage.OpenChatDB()`
2. Load handle map via `imessage.GetHandles()` → `map[int64]string` (ROWID → phone/email)
3. Load chat map via `imessage.GetChats()` → `map[int64]Chat` (ROWID → Chat for style/group detection)
4. Get initial cursor via `imessage.GetMaxMessageRowID()` (start from now, not history)
5. Poll loop: every 500ms, call `imessage.GetMessages(lastRowID)`
6. For each message, convert to NexusEvent using handle/chat maps
7. Emit via `emit(event)`
8. Update lastRowID

**Why not use PollMonitor:** The SDK's `PollMonitor` uses `time.Time` cursors. Eve uses `ROWID` (monotonically increasing int64). Converting between them adds complexity with no benefit. A custom monitor function is ~30 lines.

**Handle/Chat resolution:**

The `imessage.GetMessages()` function returns `Message` structs with `HandleID sql.NullInt64` (foreign key) and `ChatID int64`. We need the actual handle string (phone/email) and chat metadata (group vs DM). Solution:

```go
// Built once at monitor start, refreshed periodically
handles, _ := chatDB.GetHandles()
handleMap := make(map[int64]string) // ROWID → "+15551234567"
for _, h := range handles {
    handleMap[h.ROWID] = h.ID
}

chats, _ := chatDB.GetChats()
chatMap := make(map[int64]imessage.Chat) // ROWID → Chat
for _, c := range chats {
    chatMap[c.ROWID] = c
}
```

These maps should be refreshed periodically (new contacts/chats appear) — say every 60 seconds. Not every poll cycle.

**Poll interval:** 500ms (faster than eve watch's default 250ms is unnecessary for NEX; slower reduces DB load while still being responsive enough for chat).

---

### `send` — Message Delivery

**Strategy:** Replicate eve's AppleScript execution inline. The logic is ~15 lines.

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

**Input mapping:**

| SendRequest field | Usage |
|------------------|-------|
| `Target` | Recipient phone or email (e.g., `+14155551234`) |
| `Text` | Message body |
| `Media` | File path for attachment (optional) |
| `ThreadID` | Ignored (iMessage doesn't support threads) |
| `ReplyTo` | Ignored for now (tapback reply is different from text reply) |

**Chunking:** iMessage has a ~4000 char soft limit but doesn't hard-reject longer messages (they get split by the OS). We'll use `SendWithChunking` with a 4000 char limit for clean splitting:

```go
func eveSend(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
    return nexadapter.SendWithChunking(req.Text, 4000, func(chunk string) (string, error) {
        err := sendAppleScript(ctx, req.Target, chunk, req.Media)
        if err != nil {
            return "", err
        }
        // iMessage doesn't return message IDs from AppleScript
        // Generate a synthetic one
        return fmt.Sprintf("imessage:sent:%d", time.Now().UnixNano()), nil
    }), nil
}
```

**Note:** AppleScript-based sending doesn't return a platform message ID. We generate a synthetic one. This is a known limitation of iMessage's AppleScript API.

**Security:** All user input is escaped before interpolation into AppleScript strings. The `escapeAppleScript()` function replaces `\` with `\\` and `"` with `\"`.

---

### `backfill` — Historical Events

**Strategy:** Use `imessage.GetMessages(0)` to get all messages from the beginning, convert each to NexusEvent, filter by the `--since` date.

**Data flow:**

```
chat.db → GetMessages(0) → filter by date → convert to NexusEvent → emit JSONL → exit 0
```

**Date filtering:** The `--since` flag is an ISO date. We convert to Apple nanosecond timestamp and could use a SQL WHERE clause. However, `imessage.GetMessages()` only takes a ROWID parameter, not a date.

**Approach:**

1. Find the approximate starting ROWID for the since date:
   ```sql
   SELECT COALESCE(MIN(ROWID), 0) FROM message 
   WHERE date >= ?  -- Apple nanosecond timestamp
   ```
2. Call `chatDB.GetMessages(startRowID - 1)` to get all messages from that point
3. Convert each to NexusEvent and emit
4. Exit 0 when exhausted

This is efficient — we don't scan messages we don't need.

**Pagination:** For very large backlogs (100K+ messages), we should paginate to avoid loading everything into memory at once. Process in batches of 5000 ROWIDs:

```go
batchSize := int64(5000)
cursor := startRowID - 1
for {
    msgs, err := chatDB.GetMessages(cursor)
    // ... but GetMessages doesn't have a LIMIT ...
}
```

**Issue:** `imessage.GetMessages(sinceRowID)` returns ALL messages after the ROWID with no LIMIT. For backfill of large histories, this could be millions of rows.

**Solution:** Either:
- a) Add a `GetMessagesBatch(sinceRowID, limit)` to the `imessage` package (requires modifying eve, but small change)
- b) Use a custom SQL query for backfill that adds `LIMIT 5000`
- c) Accept the memory hit for v1 (chat.db is typically <500K messages)

**Recommendation:** Option (c) for v1 prototype, option (a) for production. Most chat.db files are manageable in memory. Note this as a future optimization.

**Idempotency:** NEX's Events Ledger has `UNIQUE(source, source_id)`. The `event_id` (`imessage:{GUID}`) is deterministic, so re-running backfill is safe — duplicates are ignored.

---

### `health` — Connection Status

**Strategy:** Check if chat.db exists and is readable. Report last message timestamp.

```go
func eveHealth(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
    path := imessage.GetChatDBPath()
    chatDB, err := imessage.OpenChatDB(path)
    if err != nil {
        return &nexadapter.AdapterHealth{
            Connected: false,
            Account:   "default",
            Error:     fmt.Sprintf("cannot open chat.db: %v", err),
        }, nil
    }
    defer chatDB.Close()

    maxRowID, err := chatDB.GetMaxMessageRowID()
    // Could also query latest message timestamp for last_event_at

    return &nexadapter.AdapterHealth{
        Connected:   true,
        Account:     "default",
        LastEventAt: lastEventTimestamp, // Unix ms of most recent message
        Details: map[string]any{
            "chat_db_path": path,
            "max_rowid":    maxRowID,
        },
    }, nil
}
```

---

### `accounts` — Account Discovery

**Strategy:** Replicate `whoami` logic. Single account for iMessage.

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

iMessage is inherently single-account (tied to the macOS login), so this always returns one account.

---

## NexusEvent Mapping

### eve `Message` → `NexusEvent`

| eve Message field | NexusEvent field | Transformation |
|-------------------|-----------------|----------------|
| `GUID` | `event_id` | `"imessage:" + GUID` |
| `Date` | `timestamp` | Apple nanoseconds → Unix ms: `AppleEpoch.Add(Duration(Date)).UnixMilli()` |
| `Text` (or `AttributedBody` decoded) | `content` | Use Text if present, fall back to decoding AttributedBody |
| — | `content_type` | `"text"` (or `"image"`/`"file"` if attachment-only) |
| — | `channel` | `"imessage"` (constant) |
| — | `account_id` | `"default"` (constant) |
| `HandleID` → handle map | `sender_id` | Look up `handleMap[HandleID]` → `"+15551234567"` or `"tyler@icloud.com"` |
| — | `sender_name` | `""` (iMessage doesn't provide display names in chat.db — name resolution happens in NEX's Identity Graph) |
| `ChatIdentifier` | `peer_id` | Direct: `"chat123456"` or `"+15551234567"` |
| Chat.Style | `peer_kind` | `Style == 43` → `"group"`, else → `"dm"` |
| `ReplyToGUID` | `reply_to_id` | `"imessage:" + ReplyToGUID` if non-null |
| — | `thread_id` | `""` (iMessage doesn't have threads) |
| `IsFromMe` | `metadata.is_from_me` | Boolean |
| `ChatID` | `metadata.chat_id` | Integer |
| `ServiceName` | `metadata.service` | `"iMessage"` or `"SMS"` |
| `ROWID` | `metadata.rowid` | Integer (useful for debugging) |

### Apple Timestamp Conversion

Eve's `imessage` package provides `AppleEpoch` and `AppleTimestampToUnix()`. For Unix milliseconds:

```go
func appleNanosToUnixMs(appleNanos int64) int64 {
    t := imessage.AppleEpoch.Add(time.Duration(appleNanos) * time.Nanosecond)
    return t.UnixMilli()
}
```

### Content Resolution

Eve's `Message.Text` can be null (sql.NullString) when the message uses `AttributedBody` (rich text, emoji, link previews). Eve's `content.go` has decoding logic. The adapter should:

1. Use `Text.String` if `Text.Valid`
2. Fall back to decoding `AttributedBody` if Text is null
3. Use `""` if both are empty (attachment-only message)

### IsFromMe Handling

Messages where `IsFromMe == true` are outgoing messages from the user. For monitoring:
- **Include them** — NEX needs to see outbound messages for context (the Events Ledger records everything).
- Set `sender_id` to the user's own handle (from whoami/accounts).

For backfill:
- Same — include all messages regardless of direction.

---

## Conversion Function

The core of the adapter — one function that converts an `imessage.Message` to a `nexadapter.NexusEvent`:

```go
func convertMessage(
    msg imessage.Message,
    handleMap map[int64]string,
    chatMap map[int64]imessage.Chat,
    selfHandles []string, // from whoami: ["+17072876731", "tnapathy@gmail.com"]
) nexadapter.NexusEvent {
    // Resolve sender
    senderID := ""
    if msg.IsFromMe && len(selfHandles) > 0 {
        senderID = selfHandles[0]
    } else if msg.HandleID.Valid {
        senderID = handleMap[msg.HandleID.Int64]
    }

    // Resolve peer kind from chat style
    peerKind := "dm"
    if chat, ok := chatMap[msg.ChatID]; ok {
        if chat.Style == 43 {
            peerKind = "group"
        }
    }

    // Resolve content
    content := ""
    if msg.Text.Valid {
        content = msg.Text.String
    }
    // TODO: AttributedBody fallback

    // Build event
    return nexadapter.NewEvent("imessage", "imessage:"+msg.GUID).
        WithTimestampUnixMs(appleNanosToUnixMs(msg.Date)).
        WithContent(content).
        WithSender(senderID, "").
        WithPeer(msg.ChatIdentifier, peerKind).
        WithAccount("default").
        WithReplyTo(nullStringToEventID(msg.ReplyToGUID)).
        WithMetadata("rowid", msg.ROWID).
        WithMetadata("is_from_me", msg.IsFromMe).
        WithMetadata("chat_id", msg.ChatID).
        WithMetadata("service", nullStringVal(msg.ServiceName)).
        Build()
}
```

---

## Full File: `cmd/eve-adapter/main.go`

The complete adapter is a single file. Estimated ~250 lines:

```
main()                          ~10 lines  — Wire handlers into nexadapter.Run()
eveInfo()                       ~30 lines  — Return static AdapterInfo
eveMonitor()                    ~60 lines  — Poll loop with ROWID cursor
eveSend()                       ~30 lines  — AppleScript execution + chunking
eveBackfill()                   ~40 lines  — Paginated history emission
eveHealth()                     ~20 lines  — chat.db accessibility check
eveAccounts()                   ~10 lines  — Single default account
convertMessage()                ~40 lines  — Message → NexusEvent mapping
helpers (timestamp, escaping)   ~20 lines  — Apple time conversion, AppleScript escaping
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
# Should see NexusEvent JSONL appear on stdout
```

**Expected:** JSONL events with valid `event_id`, `timestamp`, `content`, `sender_id`, `peer_id`, `peer_kind`.

**Verify:**
- New messages appear within ~500ms of being sent
- `is_from_me` metadata correctly reflects direction
- Group messages have `peer_kind: "group"`
- DMs have `peer_kind: "dm"`
- `sender_id` is a real phone number or email

### 3. `eve-adapter send --account default --to "+1XXXXXXXXXX" --text "Hello from Nexus"`

**Expected:** DeliveryResult JSON with `success: true`. Message appears in Messages.app.

**Verify:**
- Message actually arrives
- Long messages get chunked correctly (test with >4000 chars)
- Special characters (quotes, backslashes, emoji) are escaped properly

### 4. `eve-adapter backfill --account default --since 2026-02-01`

```bash
eve-adapter backfill --account default --since 2026-02-01 | head -20
```

**Expected:** JSONL stream of historical messages since Feb 1. Process exits 0 when done.

**Verify:**
- No messages before the since date
- `event_id` is deterministic (same GUID → same event_id)
- Re-running produces identical output (idempotent)

### 5. `eve-adapter health --account default`

**Expected:** `{ "connected": true, "account": "default", "last_event_at": <recent_ms> }`

### 6. `eve-adapter accounts list`

**Expected:** `[{ "id": "default", "display_name": "Tyler Brandt", "status": "active" }]`

### 7. Integration Test: NEX Pipeline Simulation

```bash
# Simulate what NEX does: read JSONL from monitor, validate each event
eve-adapter monitor --account default | while read line; do
    echo "$line" | jq -e '.event_id and .timestamp and .channel == "imessage"'
done
```

---

## Known Limitations

### No Platform Message IDs from Send

AppleScript-based sending doesn't return the platform message ID. We generate synthetic IDs (`imessage:sent:<nanosecond_timestamp>`). This means:
- NEX can't correlate outbound events with specific sent messages
- Not a blocker — iMessage doesn't expose this to any API

### No Threaded Replies via Send

iMessage supports reply-to (tapback and inline reply) but AppleScript can't target a specific message for reply. Send always creates a new message in the conversation.

### AttributedBody Decoding

Some messages have null `Text` and use `AttributedBody` (binary plist with NSAttributedString). Eve's `content.go` has decoding logic but it's not in the public `imessage` package. For v1, these messages will have empty `content`. Can be addressed by:
- Moving content decoding into the `imessage` package, or
- Importing the internal package (not possible without modification)

### Backfill Memory

`GetMessages(sinceROWID)` loads all matching messages at once. For very large backlogs this could use significant memory. Mitigation: add `GetMessagesBatch(sinceRowID, limit)` to the `imessage` package later.

### Single Account

iMessage is inherently single-account per macOS user. The adapter always reports one `"default"` account. This is correct behavior, not a limitation to fix.

---

## Future Enhancements

| Enhancement | What | When |
|-------------|------|------|
| **Reactions** | Emit tapback events as NexusEvent with `content_type: "reaction"` | After basic adapter works |
| **Attachments** | Include attachment metadata in NexusEvent.attachments | After basic adapter works |
| **AttributedBody** | Decode rich text content when Text is null | After basic adapter works |
| **Group Actions** | Emit join/leave events as NexusEvent | Low priority |
| **Batched Backfill** | Add LIMIT to GetMessages for memory-safe pagination | If needed |
| **Contact Names** | Resolve sender phone/email → display name via Contacts.framework | After Identity Graph works |

---

## Implementation Order

1. **Scaffold** — Create `cmd/eve-adapter/main.go`, add SDK dependency to go.mod
2. **Info + Health + Accounts** — Simplest handlers, validates SDK wiring works
3. **Convert function** — Message → NexusEvent mapping (core logic)
4. **Monitor** — Poll loop with ROWID cursor, emit NexusEvents
5. **Send** — AppleScript execution with chunking
6. **Backfill** — Historical emission with date filtering
7. **Test end-to-end** — All 6 commands verified

**Estimated effort:** ~2-3 hours for a working v1.

---

## Related

- `../../ADAPTER_SYSTEM.md` — Adapter protocol spec
- `../../ADAPTER_SDK.md` — SDK design and components
- `UPSTREAM_REVIEW.md` — Gap analysis of eve against adapter protocol
- `CHANNEL_SPEC.md` — iMessage channel capabilities
- SDK source: `~/nexus/home/projects/nexus/nexus-adapter-sdk-go/`
- Eve source: `~/nexus/home/projects/eve/`

---

*Eve becomes the first official Nexus adapter. The pattern established here — embed SDK, wire existing logic, new binary entry point — is the template for every Go adapter that follows.*
