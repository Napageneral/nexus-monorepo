# WhatsApp Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** TBD (Baileys wrapper)  
**Upstream:** `src/web/` (78 files, full implementation)

---

## Current State

No standalone Nexus tool exists. Full implementation lives in OpenClaw using `@whiskeysockets/baileys`. Feature-complete: monitoring, sending, reactions, polls, voice notes, media, multi-account, QR auth.

---

## Protocol Compliance

| Protocol Command | Upstream Equivalent | Status | Notes |
|-----------------|---------------------|--------|-------|
| **`info`** | — | Missing | No self-describe. |
| **`monitor`** | `monitorWebInbox()` | Logic exists | Baileys `messages.upsert` events. Outputs `WebInboundMessage`, not NexusEvent. |
| **`send`** | `sendMessageWhatsApp()` | Logic exists | Text, media, voice notes. Chunking in auto-reply layer, not send function. |
| **`backfill`** | — | Missing | Baileys has `syncFullHistory` but no explicit query API. Difficult. |
| **`health`** | Connection state tracked | Logic exists | Not exposed as command. |
| **`accounts`** | `accounts.ts` | Logic exists | Multi-account resolution. Not a CLI. |
| **`react`** | `sendReactionWhatsApp()` | Logic exists | Emoji reactions. |
| **`poll`** | `sendPollWhatsApp()` | Logic exists | Max 12 options. |
| **`edit`** | — | N/A | WhatsApp doesn't support message editing. |
| **`delete`** | Baileys supports | Partial | Not exposed in OpenClaw. |

### Current Compliance Level: **None** (no standalone adapter)
### All Logic Available For: **Standard + Extended** (minus backfill)

---

## Key Implementation Details

### QR Code Login
Well-implemented in `login-qr.ts`. Generates QR via Baileys connection events, renders as PNG base64. Handles pairing restart on code 515. Adapter's `accounts add` would trigger this flow.

### Session Persistence
`auth-store.ts` manages multi-file auth state per account. Backup/restore for corrupted credentials. Reusable as-is.

### Deduplication
`inbound/dedupe.ts`: In-memory cache, 20-minute TTL, 5000 entries. Key: `${accountId}:${remoteJid}:${id}`.

### Media Handling
Downloads via Baileys `downloadMediaMessage()`. Configurable `mediaMaxMb` limit (default 50MB). Supports images, video, audio, documents, voice notes (OGG Opus with PTT flag).

### Reconnection
`reconnect.ts` has backoff policy. Monitor currently relies on caller to restart. Adapter would need integrated auto-reconnect.

---

## Extraction Difficulty

**Extractable as-is:** Baileys session management, message extraction, media download, send functions, QR auth, dedup.

**Needs rewriting:** Replace `loadConfig()` with CLI args, replace OpenClaw logging with stderr, replace media store with temp files, move chunking into send function, add JSONL output, build CLI interface.

**Backfill challenge:** Baileys doesn't have an explicit history query API. `syncFullHistory: true` captures history on connection but as "append" events, not queryable. Would need to capture these during initial connection and emit as JSONL. Mark as "limited" — can backfill what Baileys receives on connect, but can't query arbitrary date ranges.

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Extract core Baileys logic + CLI wrapper | 12-16 hours | High |
| NexusEvent normalization | 4-8 hours | High |
| Send CLI with chunking integration | 4-8 hours | High |
| QR auth flow in CLI | 2-4 hours | High |
| Health command | 1-2 hours | Medium |
| Account management CLI | 2-4 hours | Medium |
| React/poll CLI commands | 2-4 hours | Low |
| Backfill (limited, connection-based) | 4-8 hours | Low |
| **Total to Standard** | **~30-40 hours** | |

---

## Related
- `CHANNEL_SPEC.md` — WhatsApp capabilities, formatting, Baileys details
- `../../ADAPTER_SYSTEM.md` — Protocol definition
