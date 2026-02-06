# Calendar Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** `gog` (Google Calendar via gogcli)  
**Upstream (OpenClaw):** N/A — Nexus-only channel  
**Source:** mnemonic `internal/adapters/calendar.go`

---

## Current State

`gog` has full Google Calendar API access. Mnemonic has an adapter that syncs calendar events using `gog calendar` commands. Pull-based with cursor-based backfill (month-by-month from 2004).

---

## Protocol Compliance

| Protocol Command | Current Equivalent | Status | Notes |
|-----------------|-------------------|--------|-------|
| **`info`** | — | Missing | No self-describe. |
| **`monitor`** | — | Missing | No continuous monitoring. Would need polling for new/updated events. |
| **`send`** | `gog calendar` (create events) | Partial | gog may support event creation. Not wired as adapter send. |
| **`backfill`** | `Sync()` with cursor | Full | Month-by-month from 2004. Cursor-based, resumable. |
| **`health`** | `gog auth status` | Partial | Auth check only. |
| **`accounts`** | `gog auth` | Full | Multi-account via gog. |

### Current Compliance Level: **None** (no standalone adapter)
### Available Logic: Full backfill, partial accounts/health

---

## What Mnemonic Extracts

- Calendar events from all accessible calendars per Google account
- Fields: ID, summary, description, location, status, start/end times, organizer, attendees, HTML link
- Creates contacts for organizer and attendees (high confidence 0.9)
- Tracks event state (confirmed/cancelled) with change detection
- Tags: `calendar_id:{calendarID}`
- Channel: `"calendar"`, content type: `["calendar_event"]`
- Emits bus events on create/update

---

## What Needs to Be Built

### Monitor
Poll `gog calendar events` for recent window (e.g., last 5 min changes → 1 year ahead) every 1-5 minutes. Emit new/changed events as NexusEvent JSONL. Google Calendar API supports webhooks (push notifications) but gog CLI may not expose them directly.

### Backfill
Convert existing cursor-based Sync to JSONL output. Logic is already solid — month-by-month pagination, resumable cursor.

### NexusEvent Format
Calendar events as NexusEvents:
```json
{
  "event_id": "calendar:calendarId:eventId",
  "timestamp": 1707235200000,
  "content": "Team standup at 9:00 AM - Conference Room B",
  "content_type": "text",
  "channel": "calendar",
  "account_id": "tnapathy@gmail.com",
  "sender_id": "organizer@example.com",
  "peer_id": "calendar:primary",
  "peer_kind": "channel",
  "metadata": {
    "summary": "Team standup",
    "location": "Conference Room B",
    "start": "2026-02-06T09:00:00-06:00",
    "end": "2026-02-06T09:30:00-06:00",
    "status": "confirmed",
    "attendees": ["tyler@example.com", "casey@example.com"]
  }
}
```

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Build adapter CLI with info/accounts | 2-4 hours | Medium |
| Monitor via polling loop | 4-8 hours | Medium |
| Backfill (convert Sync → JSONL) | 4-8 hours | Medium |
| Health command | 1-2 hours | Low |
| **Total to Complete** | **~12-22 hours** | |

Note: Calendar shares gog with Gmail. The adapter binary could be gog itself with a `--channel calendar` mode, or a thin wrapper that invokes gog.

---

## Related
- `../gmail/UPSTREAM_REVIEW.md` — Gmail also uses gog
- `../../ADAPTER_SYSTEM.md` — Protocol definition
- mnemonic `internal/adapters/calendar.go` — Current implementation
