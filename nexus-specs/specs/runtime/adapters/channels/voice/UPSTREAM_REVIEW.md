# Voice/Telephony Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** None  
**Upstream:** `extensions/voice-call/` (41 files, full OpenClaw extension)

---

## Current State

OpenClaw has a full voice/telephony extension supporting Twilio, Plivo, and Telnyx. It handles inbound/outbound calls, TTS streaming, media streams, and webhook verification. This is an OpenClaw plugin, not a mnemonic adapter — it's focused on real-time call management, not event ingestion.

---

## Protocol Compliance

| Protocol Command | Current Equivalent | Status | Notes |
|-----------------|-------------------|--------|-------|
| **`info`** | — | Missing | No self-describe. |
| **`monitor`** | Webhook receiver | Partial | Receives inbound call webhooks. Not JSONL output. |
| **`send`** | Outbound call initiation | Logic exists | Can initiate calls, send TTS. |
| **`backfill`** | — | Missing | Would need Twilio API call log retrieval. |
| **`health`** | — | Missing | Could check Twilio account status. |
| **`accounts`** | Provider config | Partial | Multiple providers/accounts configured. |

### Current Compliance Level: **None** (no standalone adapter)

---

## Key Implementation Details

### Providers
- **Twilio:** Primary. TwiML generation, media streams, inbound/outbound.
- **Plivo:** Alternative provider.
- **Telnyx:** Alternative with publicKey requirements (v2026.2.2+).

### Features
- Inbound/outbound voice calls
- OpenAI Realtime STT (speech-to-text)
- OpenAI TTS + ElevenLabs TTS
- Media stream handling
- Webhook security (host allowlists, proxy trust — v2026.2.3)
- Call state management, timers

### Architecture
Plugin model — registers webhook endpoints, manages call lifecycle. Very different from messaging adapters. Calls are real-time bidirectional streams, not message events.

---

## Adapter Fit Assessment

Voice is fundamentally different from messaging channels:
- **Real-time bidirectional audio stream** vs discrete messages
- **Call lifecycle** (ringing → connected → ended) vs message send/receive
- **No backfill** in the traditional sense (call logs exist but calls can't be replayed)
- **"Send"** means initiating a call or sending TTS during a call, not sending a text message

**Recommendation:** Voice may be better as a **specialized subsystem** rather than a standard adapter. It could emit call events (incoming call, call ended, transcribed speech) as NexusEvents, but the real-time audio handling doesn't fit the JSONL-on-stdout model.

**Alternative:** Model it as two pieces:
1. **Call event adapter** (Basic) — Emits call lifecycle events as NexusEvents (ring, answer, end, voicemail)
2. **Call action service** — Real-time call management accessed via agent tools, not the adapter protocol

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Call event adapter (lifecycle events → JSONL) | 8-16 hours | Low |
| Call log backfill from Twilio API | 4-8 hours | Low |
| Wrap outbound call initiation as send | 4-8 hours | Low |
| **Total to Basic** | **~16-32 hours** | |

Note: Full voice integration (real-time TTS/STT, media streams) is a separate effort beyond the adapter protocol.

---

## Related
- `../../ADAPTER_SYSTEM.md` — Protocol definition
- `../../upstream/CHANNEL_INVENTORY.md` — OpenClaw extension details
