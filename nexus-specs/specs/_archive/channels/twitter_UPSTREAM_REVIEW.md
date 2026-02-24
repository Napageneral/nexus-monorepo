# X/Twitter Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** `bird` CLI  
**Upstream (OpenClaw):** N/A — Nexus-only channel  
**Source:** mnemonic `internal/adapters/bird.go`

---

## Current State

`bird` CLI exists and handles X/Twitter interactions. Mnemonic has an adapter that uses `bird` to sync bookmarks, likes, and mentions. Pull-based (CLI invocation), not push-based.

---

## Protocol Compliance

| Protocol Command | Current Equivalent | Status | Notes |
|-----------------|-------------------|--------|-------|
| **`info`** | — | Missing | No self-describe. |
| **`monitor`** | — | Missing | No continuous monitoring. Would need polling loop over `bird mentions`. |
| **`send`** | — | Missing | No tweet posting in adapter. `bird` CLI may support it. |
| **`backfill`** | `Sync()` | Partial | Fetches last 100 bookmarks/likes/mentions. No date range filtering. |
| **`health`** | — | Missing | No health check. |
| **`accounts`** | `bird whoami --plain` | Partial | Returns username. Single account only. |
| **`react`** | — | N/A | "Like" could be modeled as react but semantically different. |

### Current Compliance Level: **None** (no standalone adapter)
### Available Logic: Partial backfill only

---

## What Mnemonic Extracts

- **Bookmarks:** Saved tweets
- **Likes:** Liked tweets
- **Mentions:** Tweets mentioning the user
- Each tweet: ID, text, createdAt, author (username/name), conversationID, engagement metrics
- Creates contacts for tweet authors
- Channel: `"x"`, direction: `"observed"`
- One-shot sync, fetches last 100 per type

---

## What Needs to Be Built

### Monitor
Poll-based — `bird mentions --json` every 30-60s, diff against last seen, emit new tweets as NexusEvent JSONL. Challenge: rate limits on X API, no push notifications.

### Backfill
Extend current sync: add date filtering, JSONL output. Current limitation: `bird` CLI may only support `-n <count>`, not date ranges.

### Send
If `bird` supports tweet posting (`bird tweet "message"`), wrap as send command. Enables tweeting, replying, quote tweets.

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Build adapter CLI with info/accounts | 4-8 hours | Medium |
| Monitor via polling loop | 4-8 hours | Medium |
| Backfill (extend current sync → JSONL) | 4-8 hours | Medium |
| Send (tweet posting, if bird supports it) | 2-4 hours | Low |
| **Total to Standard** | **~16-28 hours** | |

---

## Related
- `../../ADAPTER_SYSTEM.md` — Protocol definition
- mnemonic `internal/adapters/bird.go` — Current implementation
