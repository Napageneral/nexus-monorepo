# Events Ledger Schema

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02

---

## Overview

The Events Ledger is the permanent, append-only record of all events that flow through Nexus. Every message, email, reaction, and system event becomes a row in this ledger.

---

## Schema

```sql
CREATE TABLE events (
    -- Primary key (deterministic)
    id TEXT PRIMARY KEY,              -- "{source}:{source_id}"
    
    -- Source identification
    source TEXT NOT NULL,             -- 'imessage', 'gmail', 'discord', etc.
    source_id TEXT NOT NULL,          -- Original ID from source platform
    
    -- Classification
    type TEXT NOT NULL,               -- 'message', 'email', 'reaction', etc.
    thread_id TEXT,                   -- Thread/conversation grouping
    
    -- Content
    content TEXT NOT NULL,            -- Normalized text content
    content_type TEXT NOT NULL DEFAULT 'text',  -- 'text' or 'html'
    attachments TEXT,                 -- JSON array of Attachment objects
    
    -- Participants
    from_channel TEXT NOT NULL,       -- Channel type of sender
    from_identifier TEXT NOT NULL,    -- Sender identifier on that channel
    to_recipients TEXT,               -- JSON array of ParticipantRef objects
    
    -- Timing
    timestamp INTEGER NOT NULL,       -- Unix milliseconds
    received_at INTEGER NOT NULL,     -- When Nexus received it
    
    -- Source-specific extras
    metadata TEXT,                    -- JSON object for platform-specific data
    
    -- Indexes
    UNIQUE(source, source_id)
);

-- Performance indexes
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_source ON events(source);
CREATE INDEX idx_events_thread ON events(thread_id);
CREATE INDEX idx_events_from ON events(from_channel, from_identifier);
CREATE INDEX idx_events_type ON events(type);
```

---

## Event Types

| Type | Description | Example Sources |
|------|-------------|-----------------|
| `message` | Text message | iMessage, Discord, Telegram, WhatsApp |
| `email` | Email message | Gmail, IMAP |
| `reaction` | Emoji reaction | iMessage, Discord, Slack |
| `edit` | Message edit | Discord, Slack, Telegram |
| `delete` | Message deletion | Discord, Slack |
| `typing` | Typing indicator | iMessage, Discord |
| `presence` | Online/offline status | Discord, Slack |
| `webhook` | External webhook | Stripe, GitHub, etc. |
| `timer` | Scheduled tick | Internal timers |
| `system` | System event | Nexus internal |

---

## Participant Reference

```typescript
interface ParticipantRef {
    channel: string;      // 'imessage', 'discord', 'gmail', etc.
    identifier: string;   // '+15551234567', 'user#1234', 'alice@example.com'
}
```

---

## Attachment Schema

```typescript
interface Attachment {
    id: string;           // Unique attachment ID
    type: string;         // MIME type
    filename?: string;    // Original filename
    size?: number;        // Size in bytes
    url?: string;         // URL if externally hosted
    local_path?: string;  // Path if stored locally
    metadata?: object;    // Type-specific metadata (dimensions, duration, etc.)
}
```

---

## Example Events

### iMessage

```json
{
    "id": "imessage:p:+15551234567/1234567890",
    "source": "imessage",
    "source_id": "p:+15551234567/1234567890",
    "type": "message",
    "thread_id": "+15551234567",
    "content": "Hey, what's the 2FA code from Amazon?",
    "content_type": "text",
    "from_channel": "imessage",
    "from_identifier": "+15551234567",
    "timestamp": 1706889600000,
    "received_at": 1706889600123,
    "metadata": {
        "is_from_me": false,
        "has_dd_results": false
    }
}
```

### Gmail

```json
{
    "id": "gmail:msg:18d1234567890abc",
    "source": "gmail",
    "source_id": "msg:18d1234567890abc",
    "type": "email",
    "thread_id": "thread:18d1234567890000",
    "content": "Your Amazon order has shipped...",
    "content_type": "html",
    "from_channel": "gmail",
    "from_identifier": "orders@amazon.com",
    "to_recipients": "[{\"channel\": \"gmail\", \"identifier\": \"me@example.com\"}]",
    "timestamp": 1706889500000,
    "received_at": 1706889600456,
    "metadata": {
        "subject": "Your order has shipped",
        "labels": ["INBOX", "CATEGORY_UPDATES"]
    }
}
```

### Agent Response

```json
{
    "id": "nexus:turn:01HQXYZ123",
    "source": "nexus",
    "source_id": "turn:01HQXYZ123",
    "type": "message",
    "thread_id": "+15551234567",
    "content": "The 2FA code from Amazon is 847291. It expires in 8 minutes.",
    "content_type": "text",
    "from_channel": "nexus",
    "from_identifier": "persona:atlas",
    "to_recipients": "[{\"channel\": \"imessage\", \"identifier\": \"+15551234567\"}]",
    "timestamp": 1706889601000,
    "received_at": 1706889601000,
    "metadata": {
        "turn_id": "01HQXYZ123",
        "persona": "atlas",
        "in_reply_to": "imessage:p:+15551234567/1234567890"
    }
}
```

---

## Invariants

1. **Deterministic IDs** — Same event always produces same ID
2. **Append-only** — Events are never updated or deleted
3. **Idempotent inserts** — Re-inserting same event is a no-op
4. **Normalized content** — Platform-specific formatting stripped
5. **Timestamp ordering** — Events ordered by source timestamp, not receive time

---

## Related Documents

- `README.md` — System of Record overview
- `../nex/INTERFACES.md` — NormalizedEvent interface contract
- `../adapters/` — Adapter specifications per platform
